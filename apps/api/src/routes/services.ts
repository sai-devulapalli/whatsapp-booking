import { Router } from "express";
import { serviceSchema } from "@whatsapp-booking/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireOrgAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { NotFoundError } from "../booking/domain/errors.js";

export const servicesRouter = Router();
servicesRouter.use(requireAuth);

servicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const services = await prisma.service.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { name: "asc" },
    });
    res.json(services);
  }),
);

servicesRouter.post(
  "/",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const input = serviceSchema.omit({ organizationId: true }).parse(req.body);
    const service = await prisma.service.create({
      data: { ...input, organizationId: req.auth!.organizationId },
    });
    res.status(201).json(service);
  }),
);

async function assertOwnedByOrg(serviceId: string, organizationId: string) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || service.organizationId !== organizationId) {
    throw new NotFoundError("Service not found.");
  }
  return service;
}

servicesRouter.patch(
  "/:id",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const input = serviceSchema.omit({ organizationId: true }).partial().parse(req.body);
    const service = await prisma.service.update({ where: { id: req.params.id }, data: input });
    res.json(service);
  }),
);

servicesRouter.delete(
  "/:id",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    await prisma.service.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
