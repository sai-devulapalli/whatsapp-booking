import { Queue, Worker } from "bullmq";
import { env } from "../lib/env.js";
import type { ReminderService } from "./domain/reminderService.js";

// BullMQ bundles its own ioredis version, which is type-incompatible with our
// top-level ioredis client — pass plain connection options so BullMQ manages
// its own client rather than sharing (and fighting over) one instance.
const connection = env.redisConnectionOptions;

const QUEUE_NAME = "appointment-reminders";
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const REPEATABLE_JOB_ID = "reminder-sweep";

export function createReminderQueue(): Queue {
  return new Queue(QUEUE_NAME, { connection });
}

export async function scheduleReminderSweeps(queue: Queue): Promise<void> {
  await queue.add(
    "sweep",
    {},
    { repeat: { every: SWEEP_INTERVAL_MS }, jobId: REPEATABLE_JOB_ID },
  );
}

export function startReminderWorker(reminderService: ReminderService): Worker {
  return new Worker(
    QUEUE_NAME,
    async () => {
      const [day, hour] = await Promise.all([
        reminderService.sendDueReminders("24h"),
        reminderService.sendDueReminders("1h"),
      ]);
      console.log(
        `Reminder sweep: 24h ${day.sent}/${day.checked} sent, 1h ${hour.sent}/${hour.checked} sent`,
      );
    },
    { connection },
  );
}
