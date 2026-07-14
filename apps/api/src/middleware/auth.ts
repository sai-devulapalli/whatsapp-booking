import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";
import type { StaffRole } from "@whatsapp-booking/shared";

export interface AuthTokenPayload {
  sub: string;
  organizationId: string;
  role: StaffRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token." });
  }
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), env.jwtSecret) as AuthTokenPayload;
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

export function requireOrgAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "ORG_ADMIN") {
    return res.status(403).json({ error: "Requires organization admin role." });
  }
  next();
}
