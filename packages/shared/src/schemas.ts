import { z } from "zod";
import { StaffRole, AppointmentStatus, TemplateCategory, WEEKDAYS } from "./enums.js";

export const organizationSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  timezone: z.string().min(1),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;

export const staffUserSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum([StaffRole.ORG_ADMIN, StaffRole.STAFF]),
});
export type StaffUserInput = z.infer<typeof staffUserSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const serviceSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  durationMinutes: z.number().int().min(5).max(24 * 60),
  bufferMinutes: z.number().int().min(0).max(240).default(0),
  priceCents: z.number().int().min(0).nullable().optional(),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const resourceSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  title: z.string().max(120).optional(),
  serviceIds: z.array(z.string().uuid()).default([]),
});
export type ResourceInput = z.infer<typeof resourceSchema>;

export const weeklyAvailabilitySchema = z.object({
  resourceId: z.string().uuid(),
  weekday: z.enum(WEEKDAYS),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm"),
});
export type WeeklyAvailabilityInput = z.infer<typeof weeklyAvailabilitySchema>;

export const availabilityExceptionSchema = z.object({
  resourceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  isClosed: z.boolean(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:mm")
    .optional(),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:mm")
    .optional(),
  reason: z.string().max(200).optional(),
});
export type AvailabilityExceptionInput = z.infer<typeof availabilityExceptionSchema>;

export const createAppointmentSchema = z.object({
  organizationId: z.string().uuid(),
  resourceId: z.string().uuid(),
  serviceId: z.string().uuid(),
  customerPhone: z.string().min(6).max(20),
  customerName: z.string().max(120).optional(),
  startsAt: z.string().datetime(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const appointmentStatusSchema = z.enum([
  AppointmentStatus.BOOKED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
]);

// Suggested variable names for the categories our system fills in automatically
// (reminders, confirmations, cancellations). Not an enforced list — a template's
// `variables` can be any names the org wants, which matters for CUSTOM templates
// sent for reasons the system doesn't know about ahead of time.
export const KNOWN_TEMPLATE_VARIABLES = [
  "customer_name",
  "service_name",
  "resource_name",
  "organization_name",
  "appointment_time",
] as const;

// Plain object (no refinement) so callers can still `.omit()`/`.partial()` it —
// e.g. routes omit `organizationId` before parsing a request body.
export const messageTemplateObjectSchema = z.object({
  organizationId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscores only"),
  category: z.enum([
    TemplateCategory.CONFIRMATION,
    TemplateCategory.REMINDER,
    TemplateCategory.CANCELLATION,
    TemplateCategory.CUSTOM,
  ]),
  language: z.string().min(2).max(10).default("en"),
  bodyText: z.string().min(1).max(1024),
  // Ordered — variables[0] fills {{1}} in bodyText, variables[1] fills {{2}}, etc.
  variables: z.array(z.string().min(1).max(60)).max(20).default([]),
});
export type MessageTemplateInput = z.infer<typeof messageTemplateObjectSchema>;

export function countBodyPlaceholders(bodyText: string): number {
  return new Set([...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
}

export const messageTemplateSchema = messageTemplateObjectSchema.refine(
  (data) => countBodyPlaceholders(data.bodyText) === data.variables.length,
  {
    message: "The number of {{n}} placeholders in the body text must match the number of variables.",
    path: ["variables"],
  },
);

export const availabilityQuerySchema = z.object({
  resourceId: z.string().uuid(),
  serviceId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
});
export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
