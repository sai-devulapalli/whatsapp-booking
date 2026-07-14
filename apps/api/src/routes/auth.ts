import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { loginSchema, organizationSchema } from "@whatsapp-booking/shared";
import { prisma } from "../lib/prisma.js";
import { signAuthToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ValidationError } from "../booking/domain/errors.js";

export const authRouter = Router();

const signupSchema = organizationSchema.extend({
  adminName: z.string().min(1).max(120),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

authRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = signupSchema.parse(req.body);

    const existing = await prisma.staffUser.findUnique({ where: { email: input.adminEmail } });
    if (existing) throw new ValidationError("An account with that email already exists.");

    const passwordHash = await bcrypt.hash(input.adminPassword, 10);

    const { organization, user } = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.name, category: input.category, timezone: input.timezone },
      });
      const user = await tx.staffUser.create({
        data: {
          organizationId: organization.id,
          name: input.adminName,
          email: input.adminEmail,
          passwordHash,
          role: "ORG_ADMIN",
        },
      });
      return { organization, user };
    });

    const token = signAuthToken({ sub: user.id, organizationId: organization.id, role: "ORG_ADMIN" });
    res.status(201).json({
      token,
      organization,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.staffUser.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    const token = signAuthToken({ sub: user.id, organizationId: user.organizationId, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }),
);
