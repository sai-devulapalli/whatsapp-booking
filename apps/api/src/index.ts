import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { organizationsRouter } from "./routes/organizations.js";
import { servicesRouter } from "./routes/services.js";
import { resourcesRouter } from "./routes/resources.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { templatesRouter } from "./routes/templates.js";
import { createWhatsAppWebhookRouter } from "./whatsapp/webhook.js";
import { conversationEngine, reminderService } from "./composition/container.js";
import { createReminderQueue, scheduleReminderSweeps, startReminderWorker } from "./scheduler/worker.js";

const app = express();

app.use(cors());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Mounted before express.json() — the webhook needs the raw body for signature verification.
app.use("/webhook", createWhatsAppWebhookRouter(conversationEngine));

app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/organizations", organizationsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/resources", resourcesRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/templates", templatesRouter);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
});

const reminderQueue = createReminderQueue();
startReminderWorker(reminderService);
scheduleReminderSweeps(reminderQueue).catch((err) => {
  console.error("Failed to schedule reminder sweeps:", err);
});
