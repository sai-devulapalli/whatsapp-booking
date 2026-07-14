import { DateTime } from "luxon";
import type { BookingService } from "../../booking/domain/bookingService.js";
import { BookingConflictError, NotFoundError, ValidationError } from "../../booking/domain/errors.js";
import type { AppointmentWithRelations } from "../../booking/domain/types.js";
import type { TemplateLookupPort } from "../../templates/domain/ports.js";
import { resolveTemplateParams } from "../../templates/domain/variables.js";
import type {
  CatalogPort,
  ConversationSession,
  ConversationSessionStore,
  MessagingPort,
} from "./ports.js";

const MAX_LIST_ROWS = 10;
const SLOT_SEARCH_DAYS = 7;

export interface InboundMessage {
  text?: string;
  replyId?: string;
}

export interface ConversationEngineDeps {
  messaging: MessagingPort;
  sessions: ConversationSessionStore;
  catalog: CatalogPort;
  booking: BookingService;
  templates: TemplateLookupPort;
}

/**
 * The WhatsApp booking chat flow's use case. Depends only on ports
 * (MessagingPort, ConversationSessionStore, CatalogPort, TemplateLookupPort)
 * and the existing booking application core (BookingService) — no Meta Cloud
 * API, no Redis, no Prisma imports here.
 */
export function createConversationEngine(deps: ConversationEngineDeps) {
  const { messaging, sessions, catalog, booking, templates } = deps;

  async function handleInboundMessage(from: string, input: InboundMessage): Promise<void> {
    const normalized = input.text?.trim().toLowerCase();

    if (normalized === "menu" || normalized === "hi" || normalized === "hello" || normalized === "start over") {
      await sessions.clear(from);
      return showMainMenu(from);
    }
    if (normalized === "my appointments" || normalized === "appointments") {
      return showMyAppointments(from);
    }

    const session = await sessions.get(from);
    if (!session) return showMainMenu(from);

    switch (session.step) {
      case "AWAITING_ORG":
        return onOrgSelected(from, input.replyId);
      case "AWAITING_SERVICE":
        return onServiceSelected(from, session, input.replyId);
      case "AWAITING_RESOURCE":
        return onResourceSelected(from, session, input.replyId);
      case "AWAITING_SLOT":
        return onSlotSelected(from, session, input.replyId);
      case "AWAITING_CONFIRMATION":
        return onConfirmation(from, session, input.replyId ?? normalized);
      case "AWAITING_MANAGE_SELECTION":
        return onManageSelection(from, input.replyId);
      case "AWAITING_MANAGE_ACTION":
        return onManageAction(from, session, input.replyId);
      default:
        return showMainMenu(from);
    }
  }

  async function showMainMenu(from: string): Promise<void> {
    const organizations = await catalog.listOrganizations();
    if (organizations.length === 0) {
      await messaging.sendText(from, "There are no organizations available to book with yet.");
      return;
    }

    const truncated = organizations.length > MAX_LIST_ROWS;
    const rows = organizations.slice(0, MAX_LIST_ROWS).map((org) => ({
      id: `org:${org.id}`,
      title: org.name.slice(0, 24),
      description: org.category.slice(0, 72),
    }));

    await messaging.sendList(from, {
      bodyText:
        "Welcome! Which organization would you like to book with?" +
        (truncated ? `\n(showing the first ${MAX_LIST_ROWS} of ${organizations.length})` : ""),
      buttonText: "Choose organization",
      sections: [{ rows }],
    });
    await sessions.set(from, { step: "AWAITING_ORG" });
  }

  async function showMyAppointments(from: string): Promise<void> {
    const appointments = await catalog.listUpcomingAppointmentsForCustomer(from);
    if (appointments.length === 0) {
      await messaging.sendText(from, "You have no upcoming appointments. Send \"menu\" to book one.");
      return;
    }

    const truncated = appointments.length > MAX_LIST_ROWS;
    const rows = appointments.slice(0, MAX_LIST_ROWS).map((apt) => ({
      id: `manage:${apt.id}`,
      title: `${apt.serviceName}`.slice(0, 24),
      description: `${apt.organizationName} · ${apt.resourceName} · ${DateTime.fromJSDate(apt.startsAt).toFormat("MMM d, HH:mm")}`.slice(
        0,
        72,
      ),
    }));

    await messaging.sendList(from, {
      bodyText:
        "Here are your upcoming appointments. Select one to reschedule or cancel it." +
        (truncated ? `\n(showing the next ${MAX_LIST_ROWS} of ${appointments.length})` : ""),
      buttonText: "View appointment",
      sections: [{ rows }],
    });
    await sessions.set(from, { step: "AWAITING_MANAGE_SELECTION" });
  }

  async function onManageSelection(from: string, replyId?: string): Promise<void> {
    const appointmentId = stripPrefix(replyId, "manage:");
    if (!appointmentId) return invalidSelection(from);

    const appointment = await booking.findAppointmentById(appointmentId);
    if (!appointment) return invalidSelection(from);

    const label = DateTime.fromJSDate(appointment.startsAt).toFormat("EEE d MMM, HH:mm");
    await messaging.sendButtons(from, {
      bodyText: `${appointment.service.name} with ${appointment.resource.name} at ${label}. What would you like to do?`,
      buttons: [
        { id: "action:reschedule", title: "Reschedule" },
        { id: "action:cancel", title: "Cancel" },
      ],
    });

    await sessions.set(from, {
      step: "AWAITING_MANAGE_ACTION",
      appointmentId,
      resourceId: appointment.resourceId,
      serviceId: appointment.serviceId,
    });
  }

  async function onOrgSelected(from: string, replyId?: string): Promise<void> {
    const organizationId = stripPrefix(replyId, "org:");
    if (!organizationId) return invalidSelection(from);

    const services = await catalog.listServices(organizationId);
    if (services.length === 0) {
      await messaging.sendText(from, "That organization doesn't have any bookable services yet.");
      return showMainMenu(from);
    }

    const truncated = services.length > MAX_LIST_ROWS;
    const rows = services.slice(0, MAX_LIST_ROWS).map((svc) => ({
      id: `svc:${svc.id}`,
      title: svc.name.slice(0, 24),
      description: `${svc.durationMinutes} min${svc.priceCents != null ? ` · $${(svc.priceCents / 100).toFixed(2)}` : ""}`,
    }));

    await messaging.sendList(from, {
      bodyText: "Which service would you like?" + (truncated ? `\n(showing the first ${MAX_LIST_ROWS})` : ""),
      buttonText: "Choose service",
      sections: [{ rows }],
    });
    await sessions.set(from, { step: "AWAITING_SERVICE", organizationId });
  }

  async function onServiceSelected(
    from: string,
    session: Extract<ConversationSession, { step: "AWAITING_SERVICE" }>,
    replyId?: string,
  ): Promise<void> {
    const serviceId = stripPrefix(replyId, "svc:");
    if (!serviceId) return invalidSelection(from);

    const resources = await catalog.listResourcesForService(session.organizationId, serviceId);
    if (resources.length === 0) {
      await messaging.sendText(from, "No one currently offers that service.");
      return showMainMenu(from);
    }

    const rows = [
      { id: "res:any", title: "Any available", description: "Book with whoever is free first" },
      ...resources.slice(0, MAX_LIST_ROWS - 1).map((r) => ({
        id: `res:${r.id}`,
        title: r.name.slice(0, 24),
        description: r.title?.slice(0, 72),
      })),
    ];

    await messaging.sendList(from, {
      bodyText: "Who would you like to book with?",
      buttonText: "Choose",
      sections: [{ rows }],
    });
    await sessions.set(from, {
      step: "AWAITING_RESOURCE",
      organizationId: session.organizationId,
      serviceId,
    });
  }

  async function onResourceSelected(
    from: string,
    session: Extract<ConversationSession, { step: "AWAITING_RESOURCE" }>,
    replyId?: string,
  ): Promise<void> {
    const selection = stripPrefix(replyId, "res:");
    if (!selection) return invalidSelection(from);

    let resourceId = selection;
    if (selection === "any") {
      const resources = await catalog.listResourcesForService(session.organizationId, session.serviceId);
      const withOpenSlots = await findFirstResourceWithSlots(resources.map((r) => r.id), session.serviceId);
      if (!withOpenSlots) {
        await messaging.sendText(from, "No upcoming availability found for that service. Try again later.");
        return showMainMenu(from);
      }
      resourceId = withOpenSlots;
    }

    return presentSlots(from, {
      organizationId: session.organizationId,
      serviceId: session.serviceId,
      resourceId,
    });
  }

  async function findFirstResourceWithSlots(resourceIds: string[], serviceId: string): Promise<string | null> {
    const { fromDate, toDate } = slotSearchRange();
    for (const resourceId of resourceIds) {
      const slots = await booking.listAvailableSlots({ resourceId, serviceId, fromDate, toDate });
      if (slots.length > 0) return resourceId;
    }
    return null;
  }

  function slotSearchRange(now: Date = new Date()) {
    const from = DateTime.fromJSDate(now);
    return {
      fromDate: from.toISODate()!,
      toDate: from.plus({ days: SLOT_SEARCH_DAYS }).toISODate()!,
    };
  }

  async function presentSlots(
    from: string,
    partial: { organizationId: string; serviceId: string; resourceId: string },
    rescheduleAppointmentId?: string,
  ): Promise<void> {
    const { fromDate, toDate } = slotSearchRange();
    const slots = await booking.listAvailableSlots({
      resourceId: partial.resourceId,
      serviceId: partial.serviceId,
      fromDate,
      toDate,
    });

    if (slots.length === 0) {
      await messaging.sendText(from, "No upcoming availability found. Try a different provider or service.");
      return showMainMenu(from);
    }

    const organization = await catalog.getOrganization(partial.organizationId);
    const zone = organization?.timezone ?? "UTC";
    const truncated = slots.length > MAX_LIST_ROWS;
    const shown = slots.slice(0, MAX_LIST_ROWS);

    const rows = shown.map((slot, index) => ({
      id: `slot:${index}`,
      title: DateTime.fromJSDate(slot.startsAt).setZone(zone).toFormat("EEE d, HH:mm"),
    }));

    await messaging.sendList(from, {
      bodyText:
        "Here are the next available times:" +
        (truncated ? `\n(showing the first ${MAX_LIST_ROWS} of ${slots.length})` : ""),
      buttonText: "Choose a time",
      sections: [{ rows }],
    });

    await sessions.set(from, {
      step: "AWAITING_SLOT",
      organizationId: partial.organizationId,
      serviceId: partial.serviceId,
      resourceId: partial.resourceId,
      slots: shown.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
      rescheduleAppointmentId,
    });
  }

  async function onSlotSelected(
    from: string,
    session: Extract<ConversationSession, { step: "AWAITING_SLOT" }>,
    replyId?: string,
  ): Promise<void> {
    const indexStr = stripPrefix(replyId, "slot:");
    const index = indexStr ? Number(indexStr) : NaN;
    const slot = Number.isInteger(index) ? session.slots[index] : undefined;
    if (!slot) return invalidSelection(from);

    const organization = await catalog.getOrganization(session.organizationId);
    const service = await catalog.getService(session.serviceId);
    const zone = organization?.timezone ?? "UTC";
    const label = DateTime.fromISO(slot.startsAt).setZone(zone).toFormat("EEEE d MMM, HH:mm");

    await messaging.sendButtons(from, {
      bodyText: `Confirm booking ${service?.name ?? "this service"} at ${label}?`,
      buttons: [
        { id: "confirm:yes", title: "Confirm" },
        { id: "confirm:no", title: "Cancel" },
      ],
    });

    await sessions.set(from, {
      step: "AWAITING_CONFIRMATION",
      organizationId: session.organizationId,
      serviceId: session.serviceId,
      resourceId: session.resourceId,
      startsAt: slot.startsAt,
      rescheduleAppointmentId: session.rescheduleAppointmentId,
    });
  }

  /** Sends the org's approved template for `category` if one exists, resolving
   * its declared variables from this appointment's real data — whatever names
   * the org gave them, not a hardcoded parameter list. Falls back to plain text. */
  async function sendCategorizedMessage(
    from: string,
    organizationId: string,
    category: "CONFIRMATION" | "CANCELLATION",
    appointment: Pick<AppointmentWithRelations, "startsAt" | "service" | "resource" | "customer">,
    fallbackText: string,
  ): Promise<void> {
    const template = await templates.findApproved(organizationId, category);
    if (!template) {
      await messaging.sendText(from, fallbackText);
      return;
    }

    const organization = await catalog.getOrganization(organizationId);
    const label = DateTime.fromJSDate(appointment.startsAt)
      .setZone(organization?.timezone ?? "UTC")
      .toFormat("EEEE d MMM, HH:mm");
    const context = {
      customer_name: appointment.customer.name ?? "there",
      service_name: appointment.service.name,
      resource_name: appointment.resource.name,
      organization_name: organization?.name ?? "",
      appointment_time: label,
    };

    await messaging.sendTemplate(from, {
      name: template.name,
      language: template.language,
      bodyParams: resolveTemplateParams(template.variables, context),
    });
  }

  async function onConfirmation(
    from: string,
    session: Extract<ConversationSession, { step: "AWAITING_CONFIRMATION" }>,
    reply?: string,
  ): Promise<void> {
    if (reply !== "confirm:yes" && reply !== "yes") {
      await sessions.clear(from);
      await messaging.sendText(from, "No problem, booking cancelled. Send \"menu\" to start over.");
      return;
    }

    try {
      if (session.rescheduleAppointmentId) {
        const appointment = await booking.rescheduleAppointment(
          session.rescheduleAppointmentId,
          new Date(session.startsAt),
        );
        await sendCategorizedMessage(
          from,
          session.organizationId,
          "CONFIRMATION",
          appointment,
          "Your appointment has been rescheduled. See you then!",
        );
      } else {
        const appointment = await booking.createAppointment({
          organizationId: session.organizationId,
          resourceId: session.resourceId,
          serviceId: session.serviceId,
          customerPhone: from,
          startsAt: new Date(session.startsAt),
        });
        await sendCategorizedMessage(
          from,
          session.organizationId,
          "CONFIRMATION",
          appointment,
          "You're booked! We'll send a reminder before your appointment.",
        );
      }
    } catch (err) {
      if (err instanceof BookingConflictError) {
        await messaging.sendText(from, "Sorry, that slot was just taken. Let's find another time.");
      } else if (err instanceof NotFoundError || err instanceof ValidationError) {
        await messaging.sendText(from, `Couldn't complete that booking: ${err.message}`);
      } else {
        await messaging.sendText(from, "Something went wrong booking that appointment. Please try again.");
        throw err;
      }
    } finally {
      await sessions.clear(from);
    }
  }

  async function onManageAction(
    from: string,
    session: Extract<ConversationSession, { step: "AWAITING_MANAGE_ACTION" }>,
    replyId?: string,
  ): Promise<void> {
    if (replyId === "action:cancel") {
      const appointment = await booking.cancelAppointment(session.appointmentId);
      await sessions.clear(from);
      await sendCategorizedMessage(
        from,
        appointment.organizationId,
        "CANCELLATION",
        appointment,
        "Your appointment has been cancelled.",
      );
      return;
    }
    if (replyId === "action:reschedule") {
      const appointment = await booking.findAppointmentById(session.appointmentId);
      if (!appointment) return invalidSelection(from);
      return presentSlots(
        from,
        {
          organizationId: appointment.organizationId,
          serviceId: session.serviceId,
          resourceId: session.resourceId,
        },
        session.appointmentId,
      );
    }
    return invalidSelection(from);
  }

  async function invalidSelection(from: string): Promise<void> {
    await messaging.sendText(from, "Sorry, I didn't understand that. Send \"menu\" to start over.");
  }

  return { handleInboundMessage, showMainMenu };
}

export type ConversationEngine = ReturnType<typeof createConversationEngine>;

function stripPrefix(value: string | undefined, prefix: string): string | null {
  if (!value || !value.startsWith(prefix)) return null;
  return value.slice(prefix.length);
}
