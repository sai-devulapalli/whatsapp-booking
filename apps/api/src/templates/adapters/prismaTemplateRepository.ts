import {
  TemplateApprovalStatus as PrismaTemplateApprovalStatus,
  TemplateCategory as PrismaTemplateCategory,
  type PrismaClient,
} from "@prisma/client";
import type {
  ApprovedTemplate,
  TemplateApprovalStatus,
  TemplateLookupPort,
  TemplateRecord,
  TemplateRepository,
} from "../domain/ports.js";

export class PrismaTemplateRepository implements TemplateRepository, TemplateLookupPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TemplateRecord | null> {
    return this.prisma.messageTemplate.findUnique({ where: { id } });
  }

  async markSubmitted(id: string, metaTemplateId: string): Promise<TemplateRecord> {
    return this.prisma.messageTemplate.update({
      where: { id },
      data: { metaTemplateId, approvalStatus: PrismaTemplateApprovalStatus.PENDING },
    });
  }

  async updateApprovalStatus(id: string, status: TemplateApprovalStatus): Promise<TemplateRecord> {
    return this.prisma.messageTemplate.update({
      where: { id },
      data: { approvalStatus: status as PrismaTemplateApprovalStatus },
    });
  }

  async findApproved(organizationId: string, category: string): Promise<ApprovedTemplate | null> {
    const template = await this.prisma.messageTemplate.findFirst({
      where: {
        organizationId,
        category: category as PrismaTemplateCategory,
        approvalStatus: PrismaTemplateApprovalStatus.APPROVED,
      },
    });
    return template ? { name: template.name, language: template.language, variables: template.variables } : null;
  }
}
