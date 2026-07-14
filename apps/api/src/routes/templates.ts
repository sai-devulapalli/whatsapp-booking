import { Router } from "express";
import { countBodyPlaceholders, messageTemplateObjectSchema } from "@whatsapp-booking/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireOrgAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { templateService } from "../composition/container.js";
import { NotFoundError, ValidationError } from "../booking/domain/errors.js";

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

async function assertOwnedByOrg(templateId: string, organizationId: string) {
  const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.organizationId !== organizationId) {
    throw new NotFoundError("Template not found.");
  }
}

templatesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const templates = await prisma.messageTemplate.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "desc" },
    });
    res.json(templates);
  }),
);

templatesRouter.post(
  "/",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const input = messageTemplateObjectSchema.omit({ organizationId: true }).parse(req.body);
    if (countBodyPlaceholders(input.bodyText) !== input.variables.length) {
      throw new ValidationError(
        "The number of {{n}} placeholders in the body text must match the number of variables.",
      );
    }
    const template = await prisma.messageTemplate.create({
      data: { ...input, organizationId: req.auth!.organizationId },
    });
    res.status(201).json(template);
  }),
);

templatesRouter.delete(
  "/:id",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    await prisma.messageTemplate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

templatesRouter.post(
  "/:id/submit",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const template = await templateService.submitForApproval(req.params.id);
    res.json(template);
  }),
);

templatesRouter.post(
  "/:id/sync-status",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const template = await templateService.syncApprovalStatus(req.params.id);
    res.json(template);
  }),
);
