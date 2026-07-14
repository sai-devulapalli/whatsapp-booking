export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title?: string;
  rows: ListRow[];
}

export interface ReplyButton {
  id: string;
  title: string;
}

/** Outbound WhatsApp messaging. Implemented by a Meta Cloud API adapter today;
 * a Twilio adapter (or any other channel) could implement this same port later
 * without the conversation engine changing at all. */
export interface MessagingPort {
  sendText(to: string, body: string): Promise<void>;
  sendList(
    to: string,
    params: { bodyText: string; buttonText: string; sections: ListSection[] },
  ): Promise<void>;
  sendButtons(to: string, params: { bodyText: string; buttons: ReplyButton[] }): Promise<void>;
  /** Sends a pre-approved WhatsApp Message Template — required for business-initiated
   * messages (reminders, confirmations) outside the 24h customer-service window. */
  sendTemplate(
    to: string,
    params: { name: string; language: string; bodyParams?: string[] },
  ): Promise<void>;
}

export type ConversationSession =
  | { step: "AWAITING_ORG" }
  | { step: "AWAITING_SERVICE"; organizationId: string }
  | { step: "AWAITING_RESOURCE"; organizationId: string; serviceId: string }
  | {
      step: "AWAITING_SLOT";
      organizationId: string;
      serviceId: string;
      resourceId: string;
      slots: { startsAt: string; endsAt: string }[];
      rescheduleAppointmentId?: string;
    }
  | {
      step: "AWAITING_CONFIRMATION";
      organizationId: string;
      serviceId: string;
      resourceId: string;
      startsAt: string;
      rescheduleAppointmentId?: string;
    }
  | { step: "AWAITING_MANAGE_SELECTION" }
  | { step: "AWAITING_MANAGE_ACTION"; appointmentId: string; resourceId: string; serviceId: string };

/** Per-phone-number conversation state, backed by Redis with a TTL so an
 * abandoned chat doesn't linger forever. */
export interface ConversationSessionStore {
  get(phone: string): Promise<ConversationSession | null>;
  set(phone: string, session: ConversationSession): Promise<void>;
  clear(phone: string): Promise<void>;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  category: string;
  timezone: string;
}

export interface ServiceSummary {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number | null;
}

export interface ResourceSummary {
  id: string;
  name: string;
  title: string | null;
}

export interface UpcomingAppointmentSummary {
  id: string;
  organizationName: string;
  serviceName: string;
  resourceId: string;
  resourceName: string;
  serviceId: string;
  startsAt: Date;
}

/** Read-only lookups the chat flow needs to let a customer browse an
 * organization's offerings. Kept separate from BookingRepository because it's
 * about presenting the catalog, not about the booking/conflict rules. */
export interface CatalogPort {
  listOrganizations(): Promise<OrganizationSummary[]>;
  getOrganization(organizationId: string): Promise<OrganizationSummary | null>;
  listServices(organizationId: string): Promise<ServiceSummary[]>;
  getService(serviceId: string): Promise<ServiceSummary | null>;
  listResourcesForService(organizationId: string, serviceId: string): Promise<ResourceSummary[]>;
  listUpcomingAppointmentsForCustomer(phone: string): Promise<UpcomingAppointmentSummary[]>;
}
