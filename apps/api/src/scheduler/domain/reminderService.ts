import { DateTime } from "luxon";
import type { MessagingPort } from "../../whatsapp/domain/ports.js";
import type { TemplateLookupPort } from "../../templates/domain/ports.js";
import { resolveTemplateParams } from "../../templates/domain/variables.js";
import type { ReminderKind, ReminderRepository } from "./ports.js";

export interface ReminderSweepResult {
  checked: number;
  sent: number;
}

/** Use case: "notify customers whose appointment reminder is due." Depends only
 * on ports (persistence, template lookup, outbound WhatsApp) — no Prisma, no
 * BullMQ, no Meta Cloud API imports here. */
export function createReminderService(deps: {
  repo: ReminderRepository;
  templates: TemplateLookupPort;
  messaging: MessagingPort;
}) {
  async function sendDueReminders(kind: ReminderKind, now: Date = new Date()): Promise<ReminderSweepResult> {
    const candidates = await deps.repo.findAppointmentsNeedingReminder(kind, now);
    let sent = 0;

    for (const candidate of candidates) {
      try {
        const template = await deps.templates.findApproved(candidate.organizationId, "REMINDER");
        const label = DateTime.fromJSDate(candidate.startsAt)
          .setZone(candidate.timezone)
          .toFormat("EEE d MMM, HH:mm");

        if (template) {
          const context = {
            customer_name: candidate.customerName ?? "there",
            service_name: candidate.serviceName,
            resource_name: candidate.resourceName,
            organization_name: candidate.organizationName,
            appointment_time: label,
          };
          await deps.messaging.sendTemplate(candidate.customerPhone, {
            name: template.name,
            language: template.language,
            bodyParams: resolveTemplateParams(template.variables, context),
          });
        } else {
          // Fallback for organizations that haven't had a REMINDER template approved yet.
          // Only reliably deliverable within an active 24h customer-service window.
          await deps.messaging.sendText(
            candidate.customerPhone,
            `Reminder: you have ${candidate.serviceName} with ${candidate.resourceName} on ${label}.`,
          );
        }

        await deps.repo.markReminderSent(candidate.appointmentId, kind);
        sent++;
      } catch (err) {
        // One candidate's delivery failure shouldn't block the rest of the sweep;
        // it stays unmarked so the next sweep retries it.
        console.error(`Failed to send ${kind} reminder for appointment ${candidate.appointmentId}:`, err);
      }
    }

    return { checked: candidates.length, sent };
  }

  return { sendDueReminders };
}

export type ReminderService = ReturnType<typeof createReminderService>;
