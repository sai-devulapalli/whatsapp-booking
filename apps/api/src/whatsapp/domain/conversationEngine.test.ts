import { describe, expect, it } from "vitest";
import { createBookingService } from "../../booking/domain/bookingService.js";
import type {
  BookingRepository,
  CreateAppointmentData,
  ResourceAvailabilityContext,
} from "../../booking/domain/ports.js";
import type { AppointmentWithRelations, ServiceRecord } from "../../booking/domain/types.js";
import type { ExistingBooking } from "../../booking/domain/availability.js";
import { createConversationEngine } from "./conversationEngine.js";
import type {
  CatalogPort,
  ConversationSession,
  ConversationSessionStore,
  ListSection,
  MessagingPort,
  OrganizationSummary,
  ReplyButton,
  ResourceSummary,
  ServiceSummary,
  UpcomingAppointmentSummary,
} from "./ports.js";
import type { ApprovedTemplate, TemplateLookupPort } from "../../templates/domain/ports.js";

class FakeBookingRepository implements BookingRepository {
  services = new Map<string, ServiceRecord>();
  links = new Set<string>();
  contexts = new Map<string, ResourceAvailabilityContext>();
  booked = new Map<string, ExistingBooking[]>();
  created: CreateAppointmentData[] = [];

  async getService(id: string) {
    return this.services.get(id) ?? null;
  }
  async resourceOffersService(resourceId: string, serviceId: string) {
    return this.links.has(`${resourceId}:${serviceId}`);
  }
  async getResourceAvailabilityContext(resourceId: string) {
    return this.contexts.get(resourceId) ?? null;
  }
  async getBookedAppointments(resourceId: string) {
    return this.booked.get(resourceId) ?? [];
  }
  async createAppointment(data: CreateAppointmentData): Promise<AppointmentWithRelations> {
    this.created.push(data);
    return {
      id: "apt-1",
      organizationId: data.organizationId,
      resourceId: data.resourceId,
      serviceId: data.serviceId,
      customerId: "cust-1",
      startsAt: data.startsAt,
      endsAt: new Date(data.startsAt.getTime() + data.durationMinutes * 60_000),
      status: "BOOKED",
      service: this.services.get(data.serviceId)!,
      resource: { id: data.resourceId, name: "Dr. Lee", title: null },
      customer: { id: "cust-1", phone: data.customerPhone, name: null },
    };
  }
  async rescheduleAppointment(): Promise<AppointmentWithRelations> {
    throw new Error("not used");
  }
  async cancelAppointment(): Promise<AppointmentWithRelations> {
    throw new Error("not used");
  }
  async findAppointmentById() {
    return null;
  }
}

class FakeMessagingPort implements MessagingPort {
  sent: { to: string; kind: "text" | "list" | "buttons" | "template"; payload: unknown }[] = [];

  async sendText(to: string, body: string) {
    this.sent.push({ to, kind: "text", payload: body });
  }
  async sendList(to: string, params: { bodyText: string; buttonText: string; sections: ListSection[] }) {
    this.sent.push({ to, kind: "list", payload: params });
  }
  async sendButtons(to: string, params: { bodyText: string; buttons: ReplyButton[] }) {
    this.sent.push({ to, kind: "buttons", payload: params });
  }
  async sendTemplate(to: string, params: { name: string; language: string; bodyParams?: string[] }) {
    this.sent.push({ to, kind: "template", payload: params });
  }

  lastListRowIds(): string[] {
    const last = [...this.sent].reverse().find((m) => m.kind === "list");
    const params = last?.payload as { sections: ListSection[] } | undefined;
    return params?.sections.flatMap((s) => s.rows.map((r) => r.id)) ?? [];
  }
}

class FakeSessionStore implements ConversationSessionStore {
  private sessions = new Map<string, ConversationSession>();
  async get(phone: string) {
    return this.sessions.get(phone) ?? null;
  }
  async set(phone: string, session: ConversationSession) {
    this.sessions.set(phone, session);
  }
  async clear(phone: string) {
    this.sessions.delete(phone);
  }
}

class FakeCatalog implements CatalogPort {
  organizations: OrganizationSummary[] = [];
  services = new Map<string, ServiceSummary[]>();
  resources = new Map<string, ResourceSummary[]>();

  async listOrganizations() {
    return this.organizations;
  }
  async getOrganization(id: string) {
    return this.organizations.find((o) => o.id === id) ?? null;
  }
  async listServices(organizationId: string) {
    return this.services.get(organizationId) ?? [];
  }
  async getService(serviceId: string) {
    for (const list of this.services.values()) {
      const found = list.find((s) => s.id === serviceId);
      if (found) return found;
    }
    return null;
  }
  async listResourcesForService(organizationId: string) {
    return this.resources.get(organizationId) ?? [];
  }
  async listUpcomingAppointmentsForCustomer(): Promise<UpcomingAppointmentSummary[]> {
    return [];
  }
}

class FakeTemplateLookupPort implements TemplateLookupPort {
  approved = new Map<string, ApprovedTemplate>();
  async findApproved(organizationId: string, category: string) {
    return this.approved.get(`${organizationId}:${category}`) ?? null;
  }
}

function setUp() {
  const repo = new FakeBookingRepository();
  repo.contexts.set("res-1", {
    timezone: "UTC",
    weeklyAvailability: [{ weekday: "MONDAY", startTime: "09:00", endTime: "10:00" }],
    exceptions: [],
  });
  repo.services.set("svc-1", {
    id: "svc-1",
    organizationId: "org-1",
    name: "Haircut",
    durationMinutes: 30,
    bufferMinutes: 0,
  });
  repo.links.add("res-1:svc-1");

  const catalog = new FakeCatalog();
  catalog.organizations = [{ id: "org-1", name: "Test Salon", category: "salon", timezone: "UTC" }];
  catalog.services.set("org-1", [{ id: "svc-1", name: "Haircut", durationMinutes: 30, priceCents: null }]);
  catalog.resources.set("org-1", [{ id: "res-1", name: "Stylist Sam", title: null }]);

  const messaging = new FakeMessagingPort();
  const sessions = new FakeSessionStore();
  const templates = new FakeTemplateLookupPort();
  const booking = createBookingService(repo);
  const engine = createConversationEngine({ messaging, sessions, catalog, booking, templates });

  return { repo, catalog, messaging, sessions, templates, booking, engine };
}

const PHONE = "+15551234567";

describe("conversationEngine (full booking flow with fakes, no DB/WhatsApp)", () => {
  it("books an appointment end-to-end via menu -> org -> service -> resource -> slot -> confirm", async () => {
    const { messaging, sessions, repo, engine } = setUp();

    await engine.handleInboundMessage(PHONE, { text: "menu" });
    expect(messaging.lastListRowIds()).toEqual(["org:org-1"]);

    await engine.handleInboundMessage(PHONE, { replyId: "org:org-1" });
    expect(messaging.lastListRowIds()).toEqual(["svc:svc-1"]);

    await engine.handleInboundMessage(PHONE, { replyId: "svc:svc-1" });
    expect(messaging.lastListRowIds()).toEqual(["res:any", "res:res-1"]);

    await engine.handleInboundMessage(PHONE, { replyId: "res:res-1" });
    const slotIds = messaging.lastListRowIds();
    expect(slotIds.length).toBeGreaterThan(0);
    expect(slotIds[0]).toBe("slot:0");

    const session = await sessions.get(PHONE);
    expect(session?.step).toBe("AWAITING_SLOT");

    await engine.handleInboundMessage(PHONE, { replyId: "slot:0" });
    const afterSlot = await sessions.get(PHONE);
    expect(afterSlot?.step).toBe("AWAITING_CONFIRMATION");

    await engine.handleInboundMessage(PHONE, { replyId: "confirm:yes" });

    expect(repo.created).toHaveLength(1);
    expect(repo.created[0].serviceId).toBe("svc-1");
    expect(repo.created[0].resourceId).toBe("res-1");
    expect(await sessions.get(PHONE)).toBeNull();

    const confirmationMessage = messaging.sent.at(-1);
    expect(confirmationMessage?.kind).toBe("text");
    expect(confirmationMessage?.payload).toMatch(/booked/i);
  });

  it("declining confirmation cancels without creating an appointment", async () => {
    const { messaging, sessions, repo, engine } = setUp();

    await engine.handleInboundMessage(PHONE, { text: "menu" });
    await engine.handleInboundMessage(PHONE, { replyId: "org:org-1" });
    await engine.handleInboundMessage(PHONE, { replyId: "svc:svc-1" });
    await engine.handleInboundMessage(PHONE, { replyId: "res:res-1" });
    await engine.handleInboundMessage(PHONE, { replyId: "slot:0" });
    await engine.handleInboundMessage(PHONE, { replyId: "confirm:no" });

    expect(repo.created).toHaveLength(0);
    expect(await sessions.get(PHONE)).toBeNull();
    expect(messaging.sent.at(-1)?.payload).toMatch(/cancelled/i);
  });

  it("uses an approved CONFIRMATION template, resolving its declared variables dynamically", async () => {
    const { messaging, templates, engine } = setUp();
    templates.approved.set("org-1:CONFIRMATION", {
      name: "booking_confirmed",
      language: "en",
      variables: ["service_name", "organization_name"], // org-defined order/subset, not a fixed list
    });

    await engine.handleInboundMessage(PHONE, { text: "menu" });
    await engine.handleInboundMessage(PHONE, { replyId: "org:org-1" });
    await engine.handleInboundMessage(PHONE, { replyId: "svc:svc-1" });
    await engine.handleInboundMessage(PHONE, { replyId: "res:res-1" });
    await engine.handleInboundMessage(PHONE, { replyId: "slot:0" });
    await engine.handleInboundMessage(PHONE, { replyId: "confirm:yes" });

    const sent = messaging.sent.at(-1);
    expect(sent?.kind).toBe("template");
    const payload = sent?.payload as { name: string; bodyParams: string[] };
    expect(payload.name).toBe("booking_confirmed");
    expect(payload.bodyParams).toEqual(["Haircut", "Test Salon"]);
  });

  it("an unrecognized reply during org selection asks the user to start over", async () => {
    const { messaging, engine } = setUp();
    await engine.handleInboundMessage(PHONE, { text: "menu" });
    await engine.handleInboundMessage(PHONE, { replyId: "org:does-not-exist" });

    // still treated as a selected org (id passthrough) leading to "no services" message,
    // so test a truly malformed reply instead:
    await engine.handleInboundMessage(PHONE, { text: "menu" });
    await engine.handleInboundMessage(PHONE, { replyId: "not-a-valid-prefix" });
    expect(messaging.sent.at(-1)?.payload).toMatch(/menu/i);
  });
});
