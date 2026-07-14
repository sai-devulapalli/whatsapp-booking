import { describe, expect, it } from "vitest";
import { createReminderService } from "./reminderService.js";
import type { ReminderCandidate, ReminderKind, ReminderRepository } from "./ports.js";
import type { ApprovedTemplate, TemplateLookupPort } from "../../templates/domain/ports.js";
import type { ListSection, MessagingPort, ReplyButton } from "../../whatsapp/domain/ports.js";

class FakeReminderRepository implements ReminderRepository {
  candidates: Record<ReminderKind, ReminderCandidate[]> = { "24h": [], "1h": [] };
  marked: { appointmentId: string; kind: ReminderKind }[] = [];

  async findAppointmentsNeedingReminder(kind: ReminderKind) {
    return this.candidates[kind];
  }
  async markReminderSent(appointmentId: string, kind: ReminderKind) {
    this.marked.push({ appointmentId, kind });
  }
}

class FakeTemplateLookupPort implements TemplateLookupPort {
  approvedTemplates = new Map<string, ApprovedTemplate>();
  async findApproved(organizationId: string) {
    return this.approvedTemplates.get(organizationId) ?? null;
  }
}

class FakeMessagingPort implements MessagingPort {
  sent: { to: string; kind: string; payload: unknown }[] = [];
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
}

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    appointmentId: "apt-1",
    organizationId: "org-1",
    organizationName: "Test Org",
    customerPhone: "+15551234567",
    customerName: "Casey",
    serviceName: "Haircut",
    resourceName: "Sam",
    startsAt: new Date("2024-01-01T09:00:00Z"),
    timezone: "UTC",
    ...overrides,
  };
}

describe("reminderService", () => {
  it("sends a plain text fallback and marks the reminder sent when no approved template exists", async () => {
    const repo = new FakeReminderRepository();
    repo.candidates["24h"] = [candidate()];
    const templates = new FakeTemplateLookupPort();
    const messaging = new FakeMessagingPort();
    const service = createReminderService({ repo, templates, messaging });

    const result = await service.sendDueReminders("24h");

    expect(result).toEqual({ checked: 1, sent: 1 });
    expect(messaging.sent).toHaveLength(1);
    expect(messaging.sent[0].kind).toBe("text");
    expect(repo.marked).toEqual([{ appointmentId: "apt-1", kind: "24h" }]);
  });

  it("uses the organization's approved template, resolving its declared variables dynamically", async () => {
    const repo = new FakeReminderRepository();
    repo.candidates["1h"] = [candidate({ appointmentId: "apt-2" })];
    const templates = new FakeTemplateLookupPort();
    templates.approvedTemplates.set("org-1", {
      name: "appointment_reminder",
      language: "en",
      variables: ["service_name", "customer_name"], // deliberately reordered/subset
    });
    const messaging = new FakeMessagingPort();
    const service = createReminderService({ repo, templates, messaging });

    await service.sendDueReminders("1h");

    expect(messaging.sent[0].kind).toBe("template");
    const payload = messaging.sent[0].payload as { bodyParams: string[] };
    expect(payload.bodyParams).toEqual(["Haircut", "Casey"]);
    expect(repo.marked).toEqual([{ appointmentId: "apt-2", kind: "1h" }]);
  });

  it("leaves unrecognized variable names blank instead of failing", async () => {
    const repo = new FakeReminderRepository();
    repo.candidates["1h"] = [candidate()];
    const templates = new FakeTemplateLookupPort();
    templates.approvedTemplates.set("org-1", {
      name: "custom_template",
      language: "en",
      variables: ["customer_name", "some_unknown_variable"],
    });
    const messaging = new FakeMessagingPort();
    const service = createReminderService({ repo, templates, messaging });

    await service.sendDueReminders("1h");

    const payload = messaging.sent[0].payload as { bodyParams: string[] };
    expect(payload.bodyParams).toEqual(["Casey", ""]);
  });

  it("does not mark a reminder sent when delivery fails, so the next sweep retries it", async () => {
    const repo = new FakeReminderRepository();
    repo.candidates["24h"] = [candidate()];
    const templates = new FakeTemplateLookupPort();
    const messaging = new FakeMessagingPort();
    messaging.sendText = async () => {
      throw new Error("network down");
    };
    const service = createReminderService({ repo, templates, messaging });

    const result = await service.sendDueReminders("24h");

    expect(result).toEqual({ checked: 1, sent: 0 });
    expect(repo.marked).toEqual([]);
  });

  it("continues to remaining candidates after one delivery failure", async () => {
    const repo = new FakeReminderRepository();
    repo.candidates["24h"] = [
      candidate({ appointmentId: "fails", customerPhone: "+1000000000" }),
      candidate({ appointmentId: "succeeds", customerPhone: "+2000000000" }),
    ];
    const templates = new FakeTemplateLookupPort();
    const messaging = new FakeMessagingPort();
    messaging.sendText = async (to) => {
      if (to === "+1000000000") throw new Error("boom");
    };
    const service = createReminderService({ repo, templates, messaging });

    const result = await service.sendDueReminders("24h");

    expect(result).toEqual({ checked: 2, sent: 1 });
    expect(repo.marked).toEqual([{ appointmentId: "succeeds", kind: "24h" }]);
  });
});
