export type TemplateApprovalStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export interface TemplateRecord {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  language: string;
  bodyText: string;
  variables: string[];
  approvalStatus: TemplateApprovalStatus;
  metaTemplateId: string | null;
}

export interface TemplateRepository {
  findById(id: string): Promise<TemplateRecord | null>;
  markSubmitted(id: string, metaTemplateId: string): Promise<TemplateRecord>;
  updateApprovalStatus(id: string, status: TemplateApprovalStatus): Promise<TemplateRecord>;
}

export interface ApprovedTemplate {
  name: string;
  language: string;
  /** Ordered variable names the template's body placeholders expect —
   * resolveTemplateParams uses this to fill {{1}}, {{2}}... dynamically,
   * whatever the org named them, instead of a hardcoded parameter list. */
  variables: string[];
}

/** Shared by every automatic sender (reminders, booking confirmations,
 * cancellations) — each looks up whatever approved template exists for its
 * category and organization, rather than each maintaining its own lookup. */
export interface TemplateLookupPort {
  findApproved(organizationId: string, category: string): Promise<ApprovedTemplate | null>;
}

/** Meta's Message Template submission/approval API. WhatsApp requires
 * business-initiated messages outside the 24h session window to use a
 * template that's gone through this approval flow — this port is what lets
 * an org submit one and later check whether Meta approved it. */
export interface TemplateSubmissionPort {
  submitTemplate(params: {
    name: string;
    category: string;
    language: string;
    bodyText: string;
  }): Promise<{ metaTemplateId: string }>;
  getApprovalStatus(metaTemplateId: string): Promise<"PENDING" | "APPROVED" | "REJECTED">;
}
