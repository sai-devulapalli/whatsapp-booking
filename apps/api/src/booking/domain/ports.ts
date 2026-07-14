import type { AvailabilityExceptionRule, ExistingBooking, WeeklyAvailabilityRule } from "./availability.js";
import type { AppointmentWithRelations, ServiceRecord } from "./types.js";

export interface ResourceAvailabilityContext {
  timezone: string;
  weeklyAvailability: WeeklyAvailabilityRule[];
  exceptions: AvailabilityExceptionRule[];
}

export interface CreateAppointmentData {
  organizationId: string;
  resourceId: string;
  serviceId: string;
  customerPhone: string;
  customerName?: string;
  startsAt: Date;
  durationMinutes: number;
}

/**
 * The application core's only dependency on persistence. Implemented by an
 * infrastructure adapter (e.g. Prisma) so the domain layer never imports an
 * ORM or transaction API directly. Methods that must be atomic (conflict
 * check + write) are modeled as single port calls — the adapter owns the
 * transactional mechanics, the domain owns the conflict rule (via the shared
 * `rangesOverlap` pure function the adapter reuses internally).
 */
export interface BookingRepository {
  getService(serviceId: string): Promise<ServiceRecord | null>;
  resourceOffersService(resourceId: string, serviceId: string): Promise<boolean>;
  getResourceAvailabilityContext(resourceId: string): Promise<ResourceAvailabilityContext | null>;
  getBookedAppointments(resourceId: string): Promise<ExistingBooking[]>;

  /** Throws BookingConflictError (domain/errors.ts) if the slot is no longer free. */
  createAppointment(data: CreateAppointmentData): Promise<AppointmentWithRelations>;
  /** Throws BookingConflictError, NotFoundError, or ValidationError as appropriate. */
  rescheduleAppointment(appointmentId: string, newStartsAt: Date): Promise<AppointmentWithRelations>;
  cancelAppointment(appointmentId: string): Promise<AppointmentWithRelations>;
  findAppointmentById(appointmentId: string): Promise<AppointmentWithRelations | null>;
}
