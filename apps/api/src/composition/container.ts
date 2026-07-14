import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/redis.js";
import { env } from "../lib/env.js";
import { PrismaBookingRepository } from "../booking/adapters/prismaBookingRepository.js";
import { createBookingService } from "../booking/domain/bookingService.js";
import { MetaCloudApiClient } from "../whatsapp/adapters/metaCloudApiClient.js";
import { RedisConversationSessionStore } from "../whatsapp/adapters/redisConversationSessionStore.js";
import { PrismaCatalogRepository } from "../whatsapp/adapters/prismaCatalogRepository.js";
import { createConversationEngine } from "../whatsapp/domain/conversationEngine.js";
import { PrismaReminderRepository } from "../scheduler/adapters/prismaReminderRepository.js";
import { createReminderService } from "../scheduler/domain/reminderService.js";
import { PrismaTemplateRepository } from "../templates/adapters/prismaTemplateRepository.js";
import { MetaTemplateSubmissionAdapter } from "../templates/adapters/metaTemplateSubmissionAdapter.js";
import { createTemplateService } from "../templates/domain/templateService.js";

/** Composition root: the one place infrastructure adapters are wired to the
 * application core. Routes and other driving adapters import services
 * from here — never construct a repository/adapter or import Prisma directly. */
const bookingRepository = new PrismaBookingRepository(prisma);
export const bookingService = createBookingService(bookingRepository);

const messaging = new MetaCloudApiClient({
  phoneNumberId: env.whatsapp.phoneNumberId,
  accessToken: env.whatsapp.accessToken,
  graphApiVersion: env.whatsapp.graphApiVersion,
});
const sessions = new RedisConversationSessionStore(redisConnection);
const catalog = new PrismaCatalogRepository(prisma);

// One Prisma-backed template repository, shared as the TemplateLookupPort by
// every automatic sender (conversation engine's confirmations/cancellations,
// the reminder scheduler) as well as the admin-facing template CRUD/submission flow.
const templateRepository = new PrismaTemplateRepository(prisma);

export const conversationEngine = createConversationEngine({
  messaging,
  sessions,
  catalog,
  booking: bookingService,
  templates: templateRepository,
});

const reminderRepository = new PrismaReminderRepository(prisma);
export const reminderService = createReminderService({
  repo: reminderRepository,
  templates: templateRepository,
  messaging,
});

const templateSubmission = new MetaTemplateSubmissionAdapter({
  businessAccountId: env.whatsapp.businessAccountId,
  accessToken: env.whatsapp.accessToken,
  graphApiVersion: env.whatsapp.graphApiVersion,
});
export const templateService = createTemplateService({
  repo: templateRepository,
  submission: templateSubmission,
});
