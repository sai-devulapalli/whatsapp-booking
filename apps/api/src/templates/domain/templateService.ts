import { NotFoundError, ValidationError } from "../../booking/domain/errors.js";
import type { TemplateRepository, TemplateSubmissionPort } from "./ports.js";

/** Use case: submit a draft template to Meta for approval, and later sync
 * whatever Meta decided. Depends only on TemplateRepository + TemplateSubmissionPort. */
export function createTemplateService(deps: { repo: TemplateRepository; submission: TemplateSubmissionPort }) {
  async function submitForApproval(templateId: string) {
    const template = await deps.repo.findById(templateId);
    if (!template) throw new NotFoundError("Template not found.");
    if (template.approvalStatus !== "DRAFT") {
      throw new ValidationError("Only draft templates can be submitted for approval.");
    }

    const { metaTemplateId } = await deps.submission.submitTemplate({
      name: template.name,
      category: template.category,
      language: template.language,
      bodyText: template.bodyText,
    });

    return deps.repo.markSubmitted(templateId, metaTemplateId);
  }

  async function syncApprovalStatus(templateId: string) {
    const template = await deps.repo.findById(templateId);
    if (!template) throw new NotFoundError("Template not found.");
    if (!template.metaTemplateId) {
      throw new ValidationError("Template has not been submitted for approval yet.");
    }

    const status = await deps.submission.getApprovalStatus(template.metaTemplateId);
    return deps.repo.updateApprovalStatus(templateId, status);
  }

  return { submitForApproval, syncApprovalStatus };
}

export type TemplateService = ReturnType<typeof createTemplateService>;
