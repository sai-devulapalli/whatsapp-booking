import { Router } from "express";
import { z } from "zod";
import { availabilityQuerySchema, createAppointmentSchema } from "@whatsapp-booking/shared";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { bookingService } from "../composition/container.js";
import { NotFoundError, ValidationError } from "../booking/domain/errors.js";

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

appointmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ fromDate: z.string().optional(), toDate: z.string().optional() })
      .parse(req.query);

    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        ...(query.fromDate || query.toDate
          ? {
              startsAt: {
                ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
                ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
              },
            }
          : {}),
      },
      include: { resource: true, service: true, customer: true },
      orderBy: { startsAt: "asc" },
    });
    res.json(appointments);
  }),
);

appointmentsRouter.get(
  "/available-slots",
  asyncHandler(async (req, res) => {
    const query = availabilityQuerySchema.parse(req.query);
    const resource = await prisma.resource.findUnique({ where: { id: query.resourceId } });
    if (!resource || resource.organizationId !== req.auth!.organizationId) {
      throw new NotFoundError("Resource not found.");
    }
    const slots = await bookingService.listAvailableSlots(query);
    res.json(slots);
  }),
);

appointmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createAppointmentSchema.parse(req.body);
    if (input.organizationId !== req.auth!.organizationId) {
      throw new ValidationError("Cannot create an appointment for another organization.");
    }
    const appointment = await bookingService.createAppointment({
      ...input,
      startsAt: new Date(input.startsAt),
    });
    res.status(201).json(appointment);
  }),
);

async function assertOwnedByOrg(appointmentId: string, organizationId: string) {
  const appointment = await bookingService.findAppointmentById(appointmentId);
  if (!appointment || appointment.organizationId !== organizationId) {
    throw new NotFoundError("Appointment not found.");
  }
}

appointmentsRouter.patch(
  "/:id/reschedule",
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const { startsAt } = z.object({ startsAt: z.string().datetime() }).parse(req.body);
    const appointment = await bookingService.rescheduleAppointment(req.params.id, new Date(startsAt));
    res.json(appointment);
  }),
);

appointmentsRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    await assertOwnedByOrg(req.params.id, req.auth!.organizationId);
    const appointment = await bookingService.cancelAppointment(req.params.id);
    res.json(appointment);
  }),
);
