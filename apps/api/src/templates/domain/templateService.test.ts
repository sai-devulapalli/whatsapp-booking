import { describe, expect, it } from "vitest";
import { createTemplateService } from "./templateService.js";
import { NotFoundError, ValidationError } from "../../booking/domain/errors.js";
import type { TemplateApprovalStatus, TemplateRecord, TemplateRepository, TemplateSubmissionPort } from "./ports.js";

class FakeTemplateRepository implements TemplateRepository {
  records = new Map<string, TemplateRecord>();

  async findById(id: string) {
    return this.records.get(id) ?? null;
  }
  async markSubmitted(id: string, metaTemplateId: string) {
    const record = this.records.get(id)!;
    const updated = { ...record, metaTemplateId, approvalStatus: "PENDING" as TemplateApprovalStatus };
    this.records.set(id, updated);
    return updated;
  }
  async updateApprovalStatus(id: string, status: TemplateApprovalStatus) {
    const record = this.records.get(id)!;
    const updated = { ...record, approvalStatus: status };
    this.records.set(id, updated);
    return updated;
  }
}

class FakeTemplateSubmissionPort implements TemplateSubmissionPort {
  submitCalls: unknown[] = [];
  statusToReturn: "PENDING" | "APPROVED" | "REJECTED" = "APPROVED";

  async submitTemplate(params: unknown) {
    this.submitCalls.push(params);
    return { metaTemplateId: "meta-123" };
  }
  async getApprovalStatus() {
    return this.statusToReturn;
  }
}

function makeTemplate(overrides: Partial<TemplateRecord> = {}): TemplateRecord {
  return {
    id: "tpl-1",
    organizationId: "org-1",
    name: "appointment_reminder",
    category: "REMINDER",
    language: "en",
    bodyText: "Hi {{1}}, reminder for {{2}}",
    variables: ["customer_name", "service_name"],
    approvalStatus: "DRAFT",
    metaTemplateId: null,
    ...overrides,
  };
}

describe("templateService", () => {
  it("submits a draft template and records the returned Meta template id", async () => {
    const repo = new FakeTemplateRepository();
    repo.records.set("tpl-1", makeTemplate());
    const submission = new FakeTemplateSubmissionPort();
    const service = createTemplateService({ repo, submission });

    const result = await service.submitForApproval("tpl-1");

    expect(submission.submitCalls).toHaveLength(1);
    expect(result.metaTemplateId).toBe("meta-123");
    expect(result.approvalStatus).toBe("PENDING");
  });

  it("rejects submitting a template that isn't in DRAFT status", async () => {
    const repo = new FakeTemplateRepository();
    repo.records.set("tpl-1", makeTemplate({ approvalStatus: "PENDING", metaTemplateId: "meta-123" }));
    const submission = new FakeTemplateSubmissionPort();
    const service = createTemplateService({ repo, submission });

    await expect(service.submitForApproval("tpl-1")).rejects.toThrow(ValidationError);
    expect(submission.submitCalls).toHaveLength(0);
  });

  it("throws NotFoundError when submitting an unknown template", async () => {
    const repo = new FakeTemplateRepository();
    const submission = new FakeTemplateSubmissionPort();
    const service = createTemplateService({ repo, submission });

    await expect(service.submitForApproval("missing")).rejects.toThrow(NotFoundError);
  });

  it("syncs approval status from Meta onto the local record", async () => {
    const repo = new FakeTemplateRepository();
    repo.records.set("tpl-1", makeTemplate({ approvalStatus: "PENDING", metaTemplateId: "meta-123" }));
    const submission = new FakeTemplateSubmissionPort();
    submission.statusToReturn = "APPROVED";
    const service = createTemplateService({ repo, submission });

    const result = await service.syncApprovalStatus("tpl-1");

    expect(result.approvalStatus).toBe("APPROVED");
  });

  it("refuses to sync status for a template that was never submitted", async () => {
    const repo = new FakeTemplateRepository();
    repo.records.set("tpl-1", makeTemplate());
    const submission = new FakeTemplateSubmissionPort();
    const service = createTemplateService({ repo, submission });

    await expect(service.syncApprovalStatus("tpl-1")).rejects.toThrow(ValidationError);
  });
});
