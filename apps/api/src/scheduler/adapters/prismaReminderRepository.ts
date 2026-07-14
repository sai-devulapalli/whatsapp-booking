import { AppointmentStatus, type PrismaClient } from "@prisma/client";
import type { ReminderCandidate, ReminderKind, ReminderRepository } from "../domain/ports.js";

const THRESHOLDS: Record<ReminderKind, { hours: number; field: "reminder24hSentAt" | "reminder1hSentAt" }> = {
  "24h": { hours: 24, field: "reminder24hSentAt" },
  "1h": { hours: 1, field: "reminder1hSentAt" },
};

export class PrismaReminderRepository implements ReminderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAppointmentsNeedingReminder(kind: ReminderKind, now: Date): Promise<ReminderCandidate[]> {
    const { hours, field } = THRESHOLDS[kind];
    const windowEnd = new Date(now.getTime() + hours * 60 * 60_000);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.BOOKED,
        startsAt: { gt: now, lte: windowEnd },
        [field]: null,
      },
      include: { organization: true, service: true, resource: true, customer: true },
    });

    return appointments.map((a) => ({
      appointmentId: a.id,
      organizationId: a.organizationId,
      organizationName: a.organization.name,
      customerPhone: a.customer.phone,
      customerName: a.customer.name,
      serviceName: a.service.name,
      resourceName: a.resource.name,
      startsAt: a.startsAt,
      timezone: a.organization.timezone,
    }));
  }

  async markReminderSent(appointmentId: string, kind: ReminderKind): Promise<void> {
    const { field } = THRESHOLDS[kind];
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { [field]: new Date() },
    });
  }
}
