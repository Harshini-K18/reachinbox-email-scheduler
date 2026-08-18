import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type SessionPayload = {
  userId: string;
};

export const createSessionToken = (userId: string): string => {
  return jwt.sign({ userId }, env.AUTH_SECRET, { expiresIn: "7d" });
};

export const verifySessionToken = (token: string): SessionPayload => {
  const decoded = jwt.verify(token, env.AUTH_SECRET);

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as { userId?: unknown }).userId !== "string"
  ) {
    throw new Error("Invalid session token");
  }

  return { userId: (decoded as { userId: string }).userId };
};
