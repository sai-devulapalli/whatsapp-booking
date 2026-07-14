export type AppointmentStatus = "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export interface ServiceRecord {
  id: string;
  organizationId: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
}

export interface AppointmentRecord {
  id: string;
  organizationId: string;
  resourceId: string;
  serviceId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
}

export interface AppointmentWithRelations extends AppointmentRecord {
  service: ServiceRecord;
  resource: { id: string; name: string; title: string | null };
  customer: { id: string; phone: string; name: string | null };
}
