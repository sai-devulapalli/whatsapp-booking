import { Prisma, PrismaClient, AppointmentStatus as PrismaAppointmentStatus } from "@prisma/client";
import { rangesOverlap } from "../domain/timeOverlap.js";
import { BookingConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import type { ExistingBooking } from "../domain/availability.js";
import type { AppointmentWithRelations } from "../domain/types.js";
import type { BookingRepository, CreateAppointmentData, ResourceAvailabilityContext } from "../domain/ports.js";

/** Prisma implementation of the BookingRepository port — the only place in this
 * bounded context that knows about SQL transactions, isolation levels, or the ORM. */
export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getService(serviceId: string) {
    return this.prisma.service.findUnique({ where: { id: serviceId } });
  }

  async resourceOffersService(resourceId: string, serviceId: string) {
    const link = await this.prisma.resourceService.findUnique({
      where: { resourceId_serviceId: { resourceId, serviceId } },
    });
    return link !== null;
  }

  async getResourceAvailabilityContext(resourceId: string): Promise<ResourceAvailabilityContext | null> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      include: { organization: true, weeklyAvailability: true, availabilityExceptions: true },
    });
    if (!resource) return null;

    return {
      timezone: resource.organization.timezone,
      weeklyAvailability: resource.weeklyAvailability,
      exceptions: resource.availabilityExceptions.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        isClosed: e.isClosed,
        startTime: e.startTime ?? undefined,
        endTime: e.endTime ?? undefined,
      })),
    };
  }

  async getBookedAppointments(resourceId: string): Promise<ExistingBooking[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: { resourceId, status: PrismaAppointmentStatus.BOOKED },
      include: { service: true },
    });
    return appointments.map((a) => ({
      startsAt: a.startsAt,
      durationMinutes: a.service.durationMinutes,
      bufferMinutes: a.service.bufferMinutes,
    }));
  }

  async createAppointment(data: CreateAppointmentData): Promise<AppointmentWithRelations> {
    const endsAt = new Date(data.startsAt.getTime() + data.durationMinutes * 60_000);

    return this.runWithSerializableRetry(async (tx) => {
      await this.assertNoConflict(tx, data.resourceId, data.startsAt, data.durationMinutes);

      const customer = await tx.customer.upsert({
        where: { phone: data.customerPhone },
        update: data.customerName ? { name: data.customerName } : {},
        create: { phone: data.customerPhone, name: data.customerName },
      });

      return tx.appointment.create({
        data: {
          organizationId: data.organizationId,
          resourceId: data.resourceId,
          serviceId: data.serviceId,
          customerId: customer.id,
          startsAt: data.startsAt,
          endsAt,
          status: PrismaAppointmentStatus.BOOKED,
        },
        include: { service: true, resource: true, customer: true },
      });
    });
  }

  async rescheduleAppointment(appointmentId: string, newStartsAt: Date): Promise<AppointmentWithRelations> {
    return this.runWithSerializableRetry(async (tx) => {
      const existing = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: { service: true },
      });
      if (!existing) throw new NotFoundError("Appointment not found.");
      if (existing.status !== PrismaAppointmentStatus.BOOKED) {
        throw new ValidationError("Only booked appointments can be rescheduled.");
      }

      await this.assertNoConflict(
        tx,
        existing.resourceId,
        newStartsAt,
        existing.service.durationMinutes,
        appointmentId,
      );

      const newEndsAt = new Date(newStartsAt.getTime() + existing.service.durationMinutes * 60_000);
      return tx.appointment.update({
        where: { id: appointmentId },
        data: { startsAt: newStartsAt, endsAt: newEndsAt },
        include: { service: true, resource: true, customer: true },
      });
    });
  }

  async cancelAppointment(appointmentId: string): Promise<AppointmentWithRelations> {
    const existing = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!existing) throw new NotFoundError("Appointment not found.");
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: PrismaAppointmentStatus.CANCELLED },
      include: { service: true, resource: true, customer: true },
    });
  }

  async findAppointmentById(appointmentId: string): Promise<AppointmentWithRelations | null> {
    return this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, resource: true, customer: true },
    });
  }

  /** Reuses the same pure overlap rule the availability engine uses, so "is this slot
   * free" and "is this slot still free right now" can never silently disagree. */
  private async assertNoConflict(
    tx: Prisma.TransactionClient,
    resourceId: string,
    startsAt: Date,
    durationMinutes: number,
    excludeAppointmentId?: string,
  ) {
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const searchWindowStart = new Date(startsAt.getTime() - 24 * 60 * 60_000);
    const searchWindowEnd = new Date(endsAt.getTime() + 24 * 60 * 60_000);

    const candidates = await tx.appointment.findMany({
      where: {
        resourceId,
        status: PrismaAppointmentStatus.BOOKED,
        startsAt: { gte: searchWindowStart, lte: searchWindowEnd },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      include: { service: true },
    });

    for (const existing of candidates) {
      const existingEnd = new Date(
        existing.startsAt.getTime() +
          (existing.service.durationMinutes + existing.service.bufferMinutes) * 60_000,
      );
      if (rangesOverlap(startsAt, endsAt, existing.startsAt, existingEnd)) {
        throw new BookingConflictError();
      }
    }
  }

  private async runWithSerializableRetry<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    attempts = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (err) {
        const isSerializationFailure =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
        if (isSerializationFailure && attempt < attempts) continue;
        throw err;
      }
    }
    throw new Error("unreachable");
  }
}
