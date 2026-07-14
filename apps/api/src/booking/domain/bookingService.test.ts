import { describe, expect, it } from "vitest";
import { createBookingService } from "./bookingService.js";
import { NotFoundError, ValidationError } from "./errors.js";
import type { BookingRepository, CreateAppointmentData, ResourceAvailabilityContext } from "./ports.js";
import type { AppointmentWithRelations } from "./types.js";
import type { ServiceRecord } from "./types.js";
import type { ExistingBooking } from "./availability.js";

/** In-memory fake standing in for Prisma — this is the payoff of the port:
 * the use-case layer is fully testable with no database. */
class FakeBookingRepository implements BookingRepository {
  services = new Map<string, ServiceRecord>();
  resourceServiceLinks = new Set<string>(); // `${resourceId}:${serviceId}`
  availabilityContexts = new Map<string, ResourceAvailabilityContext>();
  bookedAppointments = new Map<string, ExistingBooking[]>();
  created: CreateAppointmentData[] = [];

  async getService(serviceId: string) {
    return this.services.get(serviceId) ?? null;
  }

  async resourceOffersService(resourceId: string, serviceId: string) {
    return this.resourceServiceLinks.has(`${resourceId}:${serviceId}`);
  }

  async getResourceAvailabilityContext(resourceId: string) {
    return this.availabilityContexts.get(resourceId) ?? null;
  }

  async getBookedAppointments(resourceId: string) {
    return this.bookedAppointments.get(resourceId) ?? [];
  }

  async createAppointment(data: CreateAppointmentData): Promise<AppointmentWithRelations> {
    this.created.push(data);
    const endsAt = new Date(data.startsAt.getTime() + data.durationMinutes * 60_000);
    return {
      id: "apt-1",
      organizationId: data.organizationId,
      resourceId: data.resourceId,
      serviceId: data.serviceId,
      customerId: "cust-1",
      startsAt: data.startsAt,
      endsAt,
      status: "BOOKED",
      service: this.services.get(data.serviceId)!,
      resource: { id: data.resourceId, name: "Resource", title: null },
      customer: { id: "cust-1", phone: data.customerPhone, name: data.customerName ?? null },
    };
  }

  async rescheduleAppointment(): Promise<AppointmentWithRelations> {
    throw new Error("not used in this test");
  }

  async cancelAppointment(): Promise<AppointmentWithRelations> {
    throw new Error("not used in this test");
  }

  async findAppointmentById() {
    return null;
  }
}

describe("bookingService (createBookingService)", () => {
  it("rejects booking a service that doesn't belong to the organization", async () => {
    const repo = new FakeBookingRepository();
    repo.services.set("svc-1", {
      id: "svc-1",
      organizationId: "org-A",
      name: "Haircut",
      durationMinutes: 30,
      bufferMinutes: 0,
    });
    const service = createBookingService(repo);

    await expect(
      service.createAppointment({
        organizationId: "org-B", // wrong org
        resourceId: "res-1",
        serviceId: "svc-1",
        customerPhone: "+15551234567",
        startsAt: new Date("2024-01-01T09:00:00Z"),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects booking a resource that doesn't offer the service", async () => {
    const repo = new FakeBookingRepository();
    repo.services.set("svc-1", {
      id: "svc-1",
      organizationId: "org-A",
      name: "Haircut",
      durationMinutes: 30,
      bufferMinutes: 0,
    });
    // no resourceServiceLinks entry -> resource does not offer this service
    const service = createBookingService(repo);

    await expect(
      service.createAppointment({
        organizationId: "org-A",
        resourceId: "res-1",
        serviceId: "svc-1",
        customerPhone: "+15551234567",
        startsAt: new Date("2024-01-01T09:00:00Z"),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("delegates to the repository with the service's duration once validated", async () => {
    const repo = new FakeBookingRepository();
    repo.services.set("svc-1", {
      id: "svc-1",
      organizationId: "org-A",
      name: "Haircut",
      durationMinutes: 45,
      bufferMinutes: 10,
    });
    repo.resourceServiceLinks.add("res-1:svc-1");
    const service = createBookingService(repo);

    const result = await service.createAppointment({
      organizationId: "org-A",
      resourceId: "res-1",
      serviceId: "svc-1",
      customerPhone: "+15551234567",
      startsAt: new Date("2024-01-01T09:00:00Z"),
    });

    expect(repo.created).toHaveLength(1);
    expect(repo.created[0].durationMinutes).toBe(45);
    expect(result.id).toBe("apt-1");
  });

  it("throws NotFoundError when listing slots for an unknown resource", async () => {
    const repo = new FakeBookingRepository();
    const service = createBookingService(repo);

    await expect(
      service.listAvailableSlots({
        resourceId: "missing",
        serviceId: "svc-1",
        fromDate: "2024-01-01",
        toDate: "2024-01-01",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("computes slots by combining the repository's availability context and service duration", async () => {
    const repo = new FakeBookingRepository();
    repo.availabilityContexts.set("res-1", {
      timezone: "UTC",
      weeklyAvailability: [{ weekday: "MONDAY", startTime: "09:00", endTime: "10:00" }],
      exceptions: [],
    });
    repo.services.set("svc-1", {
      id: "svc-1",
      organizationId: "org-A",
      name: "Haircut",
      durationMinutes: 30,
      bufferMinutes: 0,
    });
    const service = createBookingService(repo);

    const slots = await service.listAvailableSlots({
      resourceId: "res-1",
      serviceId: "svc-1",
      fromDate: "2024-01-01", // Monday
      toDate: "2024-01-01",
      now: new Date("2023-12-01T00:00:00Z"),
    });

    expect(slots).toHaveLength(3);
    expect(slots[0].startsAt.toISOString()).toBe("2024-01-01T09:00:00.000Z");
  });
});
