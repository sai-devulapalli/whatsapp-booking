import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../../.env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const redisUrl = required("REDIS_URL", "redis://localhost:6379");
const parsedRedisUrl = new URL(redisUrl);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl,
  redisConnectionOptions: {
    host: parsedRedisUrl.hostname,
    port: Number(parsedRedisUrl.port || 6379),
    ...(parsedRedisUrl.password ? { password: parsedRedisUrl.password } : {}),
  },
  jwtSecret: required("JWT_SECRET"),
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "",
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0",
  },
};
