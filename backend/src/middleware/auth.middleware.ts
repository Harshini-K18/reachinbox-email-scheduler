import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { verifyGoogleCredential } from "../auth/google";
import { verifySessionToken } from "../auth/session";

export type AuthUser = {
  id: string;
  googleId: string | null;
  name: string;
  email: string;
  avatar: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.header("authorization");

    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const credential = header.slice("Bearer ".length).trim();

    if (!credential) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    // Password login uses our signed session token.
    try {
      const session = verifySessionToken(credential);
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
      });

      if (user) {
        req.user = {
          id: user.id,
          googleId: user.googleId,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
        };
        next();
        return;
      }
    } catch {
      // If it is not our session token, continue and try Google ID token.
    }

    // Keep existing Google authentication fully supported.
    const googleUser = await verifyGoogleCredential(credential);

    const user = await prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User is not registered. Please sign in again.",
      });
      return;
    }

    req.user = {
      id: user.id,
      googleId: user.googleId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    };

    next();
  } catch (error) {
    console.error("Authentication failed:", error);
    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication session",
    });
  }
};
