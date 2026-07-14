import { describe, expect, it } from "vitest";
import { computeAvailableSlots } from "./availability.js";

const MONDAY_9_TO_12 = [{ weekday: "MONDAY" as const, startTime: "09:00", endTime: "12:00" }];

describe("computeAvailableSlots", () => {
  it("generates slots within a single working window", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [],
      existingAppointments: [],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 0,
      fromDate: "2024-01-01", // a Monday
      toDate: "2024-01-01",
      slotGranularityMinutes: 30,
      now: new Date("2023-12-01T00:00:00Z"),
    });

    // 09:00-12:00 in 30-min slots with 30-min duration => 6 slots
    expect(slots).toHaveLength(6);
    expect(slots[0].startsAt.toISOString()).toBe("2024-01-01T09:00:00.000Z");
    expect(slots.at(-1)!.startsAt.toISOString()).toBe("2024-01-01T11:30:00.000Z");
  });

  it("excludes a slot that would run past the end of the working window", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [],
      existingAppointments: [],
      serviceDurationMinutes: 45,
      serviceBufferMinutes: 0,
      fromDate: "2024-01-01",
      toDate: "2024-01-01",
      slotGranularityMinutes: 30,
      now: new Date("2023-12-01T00:00:00Z"),
    });

    // Last valid 45-min slot must end by 12:00 -> starts at 11:15, but granularity
    // is 30 so candidates are 09:00, 09:30 ... 11:30. 11:30+45=12:15 > 12:00, excluded.
    expect(slots.every((s) => s.endsAt.getTime() <= new Date("2024-01-01T12:00:00.000Z").getTime())).toBe(true);
    expect(slots.some((s) => s.startsAt.toISOString() === "2024-01-01T11:30:00.000Z")).toBe(false);
  });

  it("excludes slots that conflict with an existing booking (including its buffer)", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [],
      existingAppointments: [
        { startsAt: new Date("2024-01-01T10:00:00.000Z"), durationMinutes: 30, bufferMinutes: 15 },
      ],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 0,
      fromDate: "2024-01-01",
      toDate: "2024-01-01",
      slotGranularityMinutes: 30,
      now: new Date("2023-12-01T00:00:00Z"),
    });

    // Existing booking occupies 10:00-10:45 (30 min + 15 min buffer).
    // A candidate at 10:00 or 10:30 would overlap that busy range.
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain("2024-01-01T10:00:00.000Z");
    expect(starts).not.toContain("2024-01-01T10:30:00.000Z");
    expect(starts).toContain("2024-01-01T09:00:00.000Z");
    expect(starts).toContain("2024-01-01T11:00:00.000Z");
  });

  it("enforces the new service's own trailing buffer against the next booking", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [],
      existingAppointments: [
        { startsAt: new Date("2024-01-01T10:00:00.000Z"), durationMinutes: 30, bufferMinutes: 0 },
      ],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 20,
      fromDate: "2024-01-01",
      toDate: "2024-01-01",
      slotGranularityMinutes: 30,
      now: new Date("2023-12-01T00:00:00Z"),
    });

    // Candidate at 09:30 occupies 09:30-10:00 plus a 20-min trailing buffer to 10:20,
    // which overlaps the 10:00 booking -> must be excluded.
    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain("2024-01-01T09:30:00.000Z");
  });

  it("treats a date marked isClosed as fully unavailable regardless of weekly hours", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [{ date: "2024-01-01", isClosed: true }],
      existingAppointments: [],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 0,
      fromDate: "2024-01-01",
      toDate: "2024-01-01",
      now: new Date("2023-12-01T00:00:00Z"),
    });

    expect(slots).toHaveLength(0);
  });

  it("uses exception hours instead of weekly hours when both exist for a date", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [{ date: "2024-01-01", isClosed: false, startTime: "14:00", endTime: "15:00" }],
      existingAppointments: [],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 0,
      fromDate: "2024-01-01",
      toDate: "2024-01-01",
      slotGranularityMinutes: 30,
      now: new Date("2023-12-01T00:00:00Z"),
    });

    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).toEqual(["2024-01-01T14:00:00.000Z", "2024-01-01T14:30:00.000Z"]);
  });

  it("excludes slots that start in the past", () => {
    const slots = computeAvailableSlots({
      timezone: "UTC",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [],
      existingAppointments: [],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 0,
      fromDate: "2024-01-01",
      toDate: "2024-01-01",
      slotGranularityMinutes: 30,
      now: new Date("2024-01-01T10:15:00.000Z"),
    });

    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain("2024-01-01T09:00:00.000Z");
    expect(starts).not.toContain("2024-01-01T09:30:00.000Z");
    expect(starts).toContain("2024-01-01T10:30:00.000Z");
  });

  it("converts non-UTC organization timezones to correct UTC instants", () => {
    // 09:00 local time in America/New_York in January (EST, UTC-5) is 14:00 UTC.
    const slots = computeAvailableSlots({
      timezone: "America/New_York",
      weeklyAvailability: MONDAY_9_TO_12,
      exceptions: [],
      existingAppointments: [],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 0,
      fromDate: "2024-01-01",
      toDate: "2024-01-01",
      slotGranularityMinutes: 30,
      now: new Date("2023-12-01T00:00:00Z"),
    });

    expect(slots[0].startsAt.toISOString()).toBe("2024-01-01T14:00:00.000Z");
  });

  it("handles a DST spring-forward day without producing an invalid local slot", () => {
    // 2024-03-10 is when America/New_York springs forward (2:00 AM -> 3:00 AM).
    const slots = computeAvailableSlots({
      timezone: "America/New_York",
      weeklyAvailability: [{ weekday: "SUNDAY", startTime: "01:00", endTime: "04:00" }],
      exceptions: [],
      existingAppointments: [],
      serviceDurationMinutes: 30,
      serviceBufferMinutes: 0,
      fromDate: "2024-03-10",
      toDate: "2024-03-10",
      slotGranularityMinutes: 30,
      now: new Date("2024-03-01T00:00:00Z"),
    });

    // The window is 3 wall-clock hours but only 2 real hours elapse (02:00-03:00 skipped),
    // so at most 4 half-hour slots should be produced, all at valid distinct UTC instants.
    expect(slots.length).toBeLessThanOrEqual(4);
    const uniqueInstants = new Set(slots.map((s) => s.startsAt.getTime()));
    expect(uniqueInstants.size).toBe(slots.length);
  });
});
