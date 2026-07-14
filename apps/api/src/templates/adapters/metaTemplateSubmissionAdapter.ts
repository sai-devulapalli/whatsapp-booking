import type { TemplateSubmissionPort } from "../domain/ports.js";

export interface MetaTemplateSubmissionConfig {
  businessAccountId: string;
  accessToken: string;
  graphApiVersion: string;
}

// Our internal categories map onto Meta's smaller set of template categories.
const META_CATEGORY_BY_INTERNAL_CATEGORY: Record<string, string> = {
  CONFIRMATION: "UTILITY",
  REMINDER: "UTILITY",
  CANCELLATION: "UTILITY",
  CUSTOM: "MARKETING",
};

interface MetaTemplateStatusResponse {
  status?: string;
}

/** Adapter for Meta's Message Template submission/approval API. */
export class MetaTemplateSubmissionAdapter implements TemplateSubmissionPort {
  constructor(private readonly config: MetaTemplateSubmissionConfig) {}

  async submitTemplate(params: {
    name: string;
    category: string;
    language: string;
    bodyText: string;
  }): Promise<{ metaTemplateId: string }> {
    const url = `https://graph.facebook.com/${this.config.graphApiVersion}/${this.config.businessAccountId}/message_templates`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.name,
        category: META_CATEGORY_BY_INTERNAL_CATEGORY[params.category] ?? "UTILITY",
        language: params.language,
        components: [{ type: "BODY", text: params.bodyText }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta template submission failed (${response.status}): ${errorBody}`);
    }

    const body = (await response.json()) as { id: string };
    return { metaTemplateId: body.id };
  }

  async getApprovalStatus(metaTemplateId: string): Promise<"PENDING" | "APPROVED" | "REJECTED"> {
    const url = `https://graph.facebook.com/${this.config.graphApiVersion}/${metaTemplateId}?fields=status`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Meta template status check failed (${response.status}): ${errorBody}`);
    }

    const body = (await response.json()) as MetaTemplateStatusResponse;
    if (body.status === "APPROVED") return "APPROVED";
    if (body.status === "REJECTED") return "REJECTED";
    return "PENDING";
  }
}
