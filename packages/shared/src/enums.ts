export const StaffRole = { ORG_ADMIN: "ORG_ADMIN", STAFF: "STAFF" } as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export const AppointmentStatus = {
  BOOKED: "BOOKED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  NO_SHOW: "NO_SHOW",
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const TemplateCategory = {
  CONFIRMATION: "CONFIRMATION",
  REMINDER: "REMINDER",
  CANCELLATION: "CANCELLATION",
  CUSTOM: "CUSTOM",
} as const;
export type TemplateCategory = (typeof TemplateCategory)[keyof typeof TemplateCategory];

export const TemplateApprovalStatus = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type TemplateApprovalStatus =
  (typeof TemplateApprovalStatus)[keyof typeof TemplateApprovalStatus];

export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];
