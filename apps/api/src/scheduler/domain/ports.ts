export type ReminderKind = "24h" | "1h";

export interface ReminderCandidate {
  appointmentId: string;
  organizationId: string;
  organizationName: string;
  customerPhone: string;
  customerName: string | null;
  serviceName: string;
  resourceName: string;
  startsAt: Date;
  timezone: string;
}

export interface ReminderRepository {
  /** Appointments within the reminder's window that haven't had this reminder sent yet.
   * "Within window" (startsAt in (now, now+threshold]) rather than an exact instant match,
   * so a missed or delayed job run never causes a reminder to be silently skipped. */
  findAppointmentsNeedingReminder(kind: ReminderKind, now: Date): Promise<ReminderCandidate[]>;
  markReminderSent(appointmentId: string, kind: ReminderKind): Promise<void>;
}
