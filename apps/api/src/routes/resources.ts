import { Router } from "express";
import {
  resourceSchema,
  weeklyAvailabilitySchema,
  availabilityExceptionSchema,
} from "@whatsapp-booking/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireOrgAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { NotFoundError } from "../booking/domain/errors.js";

export const resourcesRouter = Router();
resourcesRouter.use(requireAuth);

async function assertOwnedByOrg(resourceId: string, organizationId: string) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource || resource.organizationId !== organizationId) {
    throw new NotFoundError("Resource not found.");
  }
  return resource;
}

resourcesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const resources = await prisma.resource.findMany({
      where: { organizationId: req.auth!.organizationId },
      include: { services: { include: { service: true } }, weeklyAvailability: true, availabilityExceptions: true },
      orderBy: { name: "asc" },
    });
    res.json(resources);
  }),
);

resourcesRouter.post(
  "/",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const input = resourceSchema.omit({ organizationId: true }).parse(req.body);
    const resource = await prisma.resource.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: input.name,
        title: input.title,
        services: { create: input.serviceIds.map((serviceId) => ({ serviceId })) },
      },
      include: { services: { include: { service: true } } },
    });
    res.status(201).json(resource);
  }),
);

resourcesRouter.patch(
  "/:id",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const input = resourceSchema.omit({ organizationId: true }).partial().parse(req.body);

    const resource = await prisma.$transaction(async (tx) => {
      if (input.serviceIds) {
        await tx.resourceService.deleteMany({ where: { resourceId: req.params.id } });
        await tx.resourceService.createMany({
          data: input.serviceIds.map((serviceId) => ({ resourceId: req.params.id, serviceId })),
        });
      }
      return tx.resource.update({
        where: { id: req.params.id },
        data: { ...(input.name ? { name: input.name } : {}), ...(input.title !== undefined ? { title: input.title } : {}) },
        include: { services: { include: { service: true } } },
      });
    });

    res.json(resource);
  }),
);

resourcesRouter.delete(
  "/:id",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    await prisma.resource.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

resourcesRouter.put(
  "/:id/weekly-availability",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const rules = weeklyAvailabilitySchema
      .omit({ resourceId: true })
      .array()
      .parse(req.body);

    const availability = await prisma.$transaction(async (tx) => {
      await tx.weeklyAvailability.deleteMany({ where: { resourceId: req.params.id } });
      await tx.weeklyAvailability.createMany({
        data: rules.map((rule) => ({ ...rule, resourceId: req.params.id })),
      });
      return tx.weeklyAvailability.findMany({ where: { resourceId: req.params.id } });
    });

    res.json(availability);
  }),
);

resourcesRouter.post(
  "/:id/availability-exceptions",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const input = availabilityExceptionSchema.omit({ resourceId: true }).parse(req.body);

    const exception = await prisma.availabilityException.upsert({
      where: { resourceId_date: { resourceId: req.params.id, date: new Date(input.date) } },
      update: {
        isClosed: input.isClosed,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
      },
      create: {
        resourceId: req.params.id,
        date: new Date(input.date),
        isClosed: input.isClosed,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
      },
    });

    res.status(201).json(exception);
  }),
);

resourcesRouter.delete(
  "/:id/availability-exceptions/:exceptionId",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    await prisma.availabilityException.delete({ where: { id: req.params.exceptionId } });
    res.status(204).end();
  }),
);
