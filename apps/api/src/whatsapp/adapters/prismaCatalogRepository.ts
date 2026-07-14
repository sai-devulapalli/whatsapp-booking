import { AppointmentStatus, type PrismaClient } from "@prisma/client";
import type { CatalogPort } from "../domain/ports.js";

export class PrismaCatalogRepository implements CatalogPort {
  constructor(private readonly prisma: PrismaClient) {}

  async listOrganizations() {
    return this.prisma.organization.findMany({ orderBy: { name: "asc" } });
  }

  async getOrganization(organizationId: string) {
    return this.prisma.organization.findUnique({ where: { id: organizationId } });
  }

  async listServices(organizationId: string) {
    return this.prisma.service.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
  }

  async getService(serviceId: string) {
    return this.prisma.service.findUnique({ where: { id: serviceId } });
  }

  async listResourcesForService(organizationId: string, serviceId: string) {
    const resources = await this.prisma.resource.findMany({
      where: { organizationId, services: { some: { serviceId } } },
      orderBy: { name: "asc" },
    });
    return resources.map((r) => ({ id: r.id, name: r.name, title: r.title }));
  }

  async listUpcomingAppointmentsForCustomer(phone: string) {
    const customer = await this.prisma.customer.findUnique({ where: { phone } });
    if (!customer) return [];

    const appointments = await this.prisma.appointment.findMany({
      where: { customerId: customer.id, status: AppointmentStatus.BOOKED, startsAt: { gte: new Date() } },
      include: { organization: true, service: true, resource: true },
      orderBy: { startsAt: "asc" },
    });

    return appointments.map((a) => ({
      id: a.id,
      organizationName: a.organization.name,
      serviceName: a.service.name,
      serviceId: a.serviceId,
      resourceId: a.resourceId,
      resourceName: a.resource.name,
      startsAt: a.startsAt,
    }));
  }
}
