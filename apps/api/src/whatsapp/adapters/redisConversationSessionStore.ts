import type { Redis } from "ioredis";
import type { ConversationSession, ConversationSessionStore } from "../domain/ports.js";

const SESSION_TTL_SECONDS = 30 * 60;

function sessionKey(phone: string): string {
  return `conversation:${phone}`;
}

export class RedisConversationSessionStore implements ConversationSessionStore {
  constructor(private readonly redis: Redis) {}

  async get(phone: string): Promise<ConversationSession | null> {
    const raw = await this.redis.get(sessionKey(phone));
    return raw ? (JSON.parse(raw) as ConversationSession) : null;
  }

  async set(phone: string, session: ConversationSession): Promise<void> {
    await this.redis.set(sessionKey(phone), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);
  }

  async clear(phone: string): Promise<void> {
    await this.redis.del(sessionKey(phone));
  }
}
