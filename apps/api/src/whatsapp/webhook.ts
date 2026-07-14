import crypto from "node:crypto";
import express, { Router } from "express";
import type { ConversationEngine, InboundMessage } from "./domain/conversationEngine.js";
import { env } from "../lib/env.js";

interface WhatsAppWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from: string;
          type: string;
          text?: { body: string };
          interactive?: {
            list_reply?: { id: string };
            button_reply?: { id: string };
          };
        }[];
      };
    }[];
  }[];
}

function extractInboundMessages(payload: WhatsAppWebhookPayload): { from: string; message: InboundMessage }[] {
  const results: { from: string; message: InboundMessage }[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type === "text" && msg.text) {
          results.push({ from: msg.from, message: { text: msg.text.body } });
        } else if (msg.type === "interactive" && msg.interactive?.list_reply) {
          results.push({ from: msg.from, message: { replyId: msg.interactive.list_reply.id } });
        } else if (msg.type === "interactive" && msg.interactive?.button_reply) {
          results.push({ from: msg.from, message: { replyId: msg.interactive.button_reply.id } });
        }
      }
    }
  }
  return results;
}

function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function createWhatsAppWebhookRouter(conversationEngine: ConversationEngine): Router {
  const router = Router();

  // Meta's webhook verification handshake.
  router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === env.whatsapp.verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  router.post(
    "/",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const rawBody = req.body as Buffer;

      if (env.whatsapp.appSecret && !isValidSignature(rawBody, req.header("x-hub-signature-256"), env.whatsapp.appSecret)) {
        return res.sendStatus(401);
      }

      // Acknowledge immediately — Meta expects a fast 200, retries otherwise.
      res.sendStatus(200);

      let payload: WhatsAppWebhookPayload;
      try {
        payload = JSON.parse(rawBody.toString("utf-8"));
      } catch {
        return;
      }

      for (const { from, message } of extractInboundMessages(payload)) {
        try {
          await conversationEngine.handleInboundMessage(from, message);
        } catch (err) {
          console.error("Error handling inbound WhatsApp message:", err);
        }
      }
    },
  );

  return router;
}
