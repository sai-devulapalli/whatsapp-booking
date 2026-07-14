import { computeAvailableSlots } from "./availability.js";
import { NotFoundError, ValidationError } from "./errors.js";
import type { BookingRepository } from "./ports.js";

export interface CreateAppointmentParams {
  organizationId: string;
  resourceId: string;
  serviceId: string;
  customerPhone: string;
  customerName?: string;
  startsAt: Date;
}

export interface ListSlotsParams {
  resourceId: string;
  serviceId: string;
  fromDate: string;
  toDate: string;
  now?: Date;
}

/**
 * Application core for the booking bounded context. Depends only on the
 * `BookingRepository` port — no Prisma, no HTTP, no transport concerns —
 * so it can be unit tested with an in-memory fake and is agnostic to
 * whatever persistence adapter is wired in at the composition root.
 */
export function createBookingService(repo: BookingRepository) {
  return {
    async createAppointment(params: CreateAppointmentParams) {
      const service = await repo.getService(params.serviceId);
      if (!service || service.organizationId !== params.organizationId) {
        throw new NotFoundError("Service not found for this organization.");
      }

      const offersService = await repo.resourceOffersService(params.resourceId, params.serviceId);
      if (!offersService) {
        throw new ValidationError("This resource does not offer the requested service.");
      }

      return repo.createAppointment({
        organizationId: params.organizationId,
        resourceId: params.resourceId,
        serviceId: params.serviceId,
        customerPhone: params.customerPhone,
        customerName: params.customerName,
        startsAt: params.startsAt,
        durationMinutes: service.durationMinutes,
      });
    },

    async rescheduleAppointment(appointmentId: string, newStartsAt: Date) {
      return repo.rescheduleAppointment(appointmentId, newStartsAt);
    },

    async cancelAppointment(appointmentId: string) {
      return repo.cancelAppointment(appointmentId);
    },

    async findAppointmentById(appointmentId: string) {
      return repo.findAppointmentById(appointmentId);
    },

    async listAvailableSlots(params: ListSlotsParams) {
      const context = await repo.getResourceAvailabilityContext(params.resourceId);
      if (!context) throw new NotFoundError("Resource not found.");

      const service = await repo.getService(params.serviceId);
      if (!service) throw new NotFoundError("Service not found.");

      const existingAppointments = await repo.getBookedAppointments(params.resourceId);

      return computeAvailableSlots({
        timezone: context.timezone,
        weeklyAvailability: context.weeklyAvailability,
        exceptions: context.exceptions,
        existingAppointments,
        serviceDurationMinutes: service.durationMinutes,
        serviceBufferMinutes: service.bufferMinutes,
        fromDate: params.fromDate,
        toDate: params.toDate,
        now: params.now,
      });
    },
  };
}

export type BookingService = ReturnType<typeof createBookingService>;
