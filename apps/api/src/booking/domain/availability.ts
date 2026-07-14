import { DateTime } from "luxon";
import type { Weekday } from "@whatsapp-booking/shared";
import { rangesOverlap } from "./timeOverlap.js";

export interface WeeklyAvailabilityRule {
  weekday: Weekday;
  startTime: string; // "HH:mm", local to org timezone
  endTime: string; // "HH:mm", local to org timezone
}

export interface AvailabilityExceptionRule {
  date: string; // "YYYY-MM-DD"
  isClosed: boolean;
  startTime?: string;
  endTime?: string;
}

export interface ExistingBooking {
  startsAt: Date;
  durationMinutes: number;
  bufferMinutes: number;
}

export interface ComputeSlotsParams {
  timezone: string;
  weeklyAvailability: WeeklyAvailabilityRule[];
  exceptions: AvailabilityExceptionRule[];
  existingAppointments: ExistingBooking[];
  serviceDurationMinutes: number;
  serviceBufferMinutes: number;
  fromDate: string; // "YYYY-MM-DD"
  toDate: string; // "YYYY-MM-DD"
  slotGranularityMinutes?: number;
  now?: Date;
}

export interface AvailableSlot {
  startsAt: Date;
  endsAt: Date;
}

const WEEKDAY_BY_LUXON_INDEX: Weekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

function parseHm(day: DateTime, hm: string): DateTime {
  const [hour, minute] = hm.split(":").map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

function windowsForDay(
  day: DateTime,
  weeklyAvailability: WeeklyAvailabilityRule[],
  exceptions: AvailabilityExceptionRule[],
): { start: DateTime; end: DateTime }[] {
  const dateStr = day.toISODate();
  const exception = exceptions.find((e) => e.date === dateStr);

  if (exception) {
    if (exception.isClosed) return [];
    if (exception.startTime && exception.endTime) {
      return [{ start: parseHm(day, exception.startTime), end: parseHm(day, exception.endTime) }];
    }
  }

  const weekday = WEEKDAY_BY_LUXON_INDEX[day.weekday - 1];
  return weeklyAvailability
    .filter((w) => w.weekday === weekday)
    .map((w) => ({ start: parseHm(day, w.startTime), end: parseHm(day, w.endTime) }));
}

/**
 * Computes bookable slots for a single resource across a date range, honoring
 * weekly recurring hours, date-specific exceptions/holidays, existing bookings
 * (each occupying its own duration + buffer), and the requested service's
 * duration + buffer. All wall-clock math happens in the organization's timezone.
 *
 * Pure function — no I/O. This is the application core; adapters feed it plain data.
 */
export function computeAvailableSlots(params: ComputeSlotsParams): AvailableSlot[] {
  const {
    timezone,
    weeklyAvailability,
    exceptions,
    existingAppointments,
    serviceDurationMinutes,
    serviceBufferMinutes,
    fromDate,
    toDate,
    slotGranularityMinutes = 15,
    now = new Date(),
  } = params;

  const nowZoned = DateTime.fromJSDate(now, { zone: timezone });
  const busyRanges = existingAppointments.map((apt) => {
    const start = DateTime.fromJSDate(apt.startsAt, { zone: timezone });
    const end = start.plus({ minutes: apt.durationMinutes + apt.bufferMinutes });
    return { start, end };
  });

  const slots: AvailableSlot[] = [];
  let cursor = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
  const end = DateTime.fromISO(toDate, { zone: timezone }).startOf("day");

  while (cursor <= end) {
    const windows = windowsForDay(cursor, weeklyAvailability, exceptions);

    for (const window of windows) {
      let candidateStart = window.start;

      while (candidateStart.plus({ minutes: serviceDurationMinutes }) <= window.end) {
        const candidateEnd = candidateStart.plus({ minutes: serviceDurationMinutes });
        const candidateBusyEnd = candidateEnd.plus({ minutes: serviceBufferMinutes });

        const isPast = candidateStart < nowZoned;
        const hasConflict = busyRanges.some((busy) =>
          rangesOverlap(candidateStart, candidateBusyEnd, busy.start, busy.end),
        );

        if (!isPast && !hasConflict) {
          slots.push({ startsAt: candidateStart.toJSDate(), endsAt: candidateEnd.toJSDate() });
        }

        candidateStart = candidateStart.plus({ minutes: slotGranularityMinutes });
      }
    }

    cursor = cursor.plus({ days: 1 });
  }

  return slots;
}
