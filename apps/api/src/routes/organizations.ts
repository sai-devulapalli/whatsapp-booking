import { Router } from "express";
import { organizationSchema } from "@whatsapp-booking/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireOrgAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";

export const organizationsRouter = Router();
organizationsRouter.use(requireAuth);

organizationsRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth!.organizationId },
    });
    res.json(organization);
  }),
);

organizationsRouter.patch(
  "/me",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const input = organizationSchema.partial().parse(req.body);
    const organization = await prisma.organization.update({
      where: { id: req.auth!.organizationId },
      data: input,
    });
    res.json(organization);
  }),
);
