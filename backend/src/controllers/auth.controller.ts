import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { verifyGoogleCredential } from "../auth/google";
import { createSessionToken } from "../auth/session";

const SALT_ROUNDS = 12;

const getOrCreateSender = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  let sender = await prisma.sender.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (sender) {
    sender = await prisma.sender.update({
      where: { id: sender.id },
      data: {
        name: user.name,
        email: user.email,
        smtpHost: env.ETHEREAL_HOST,
        smtpPort: env.ETHEREAL_PORT,
        smtpUser: env.ETHEREAL_USER,
        smtpPassword: env.ETHEREAL_PASSWORD,
      },
    });
  } else {
    sender = await prisma.sender.create({
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        smtpHost: env.ETHEREAL_HOST,
        smtpPort: env.ETHEREAL_PORT,
        smtpUser: env.ETHEREAL_USER,
        smtpPassword: env.ETHEREAL_PASSWORD,
      },
    });
  }

  return sender;
};

const sessionResponse = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const sender = await getOrCreateSender(user.id);
  const token = createSessionToken(user.id);

  return {
    token,
    user: {
      id: user.id,
      googleId: user.googleId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    },
    sender: {
      id: sender.id,
      name: sender.name,
      email: sender.email,
    },
  };
};

export const googleLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const credential = String(req.body?.credential ?? "").trim();

    if (!credential) {
      res.status(400).json({
        success: false,
        message: "Google credential is required",
      });
      return;
    }

    const googleUser = await verifyGoogleCredential(credential);

    let user = await prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
    });

    if (!user) {
      const userWithSameEmail = await prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      user = userWithSameEmail
        ? await prisma.user.update({
            where: { id: userWithSameEmail.id },
            data: {
              googleId: googleUser.googleId,
              name: googleUser.name,
              avatar: googleUser.avatar,
            },
          })
        : await prisma.user.create({
            data: {
              googleId: googleUser.googleId,
              name: googleUser.name,
              email: googleUser.email,
              avatar: googleUser.avatar,
            },
          });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: googleUser.name,
          email: googleUser.email,
          avatar: googleUser.avatar,
        },
      });
    }

    const session = await sessionResponse(user.id);

    res.status(200).json({
      success: true,
      data: {
        ...session,
        credential,
      },
    });
  } catch (error) {
    console.error("Google login failed:", error);
    res.status(401).json({
      success: false,
      message: "Unable to sign in with Google",
    });
  }
};

export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const name = String(req.body?.name ?? "").trim();

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    // Registration must never overwrite an existing account.
    // Only show the "already exists" message when this email is actually registered.
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "Account already exists for this email. Please use a different email or sign in.",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash,
        googleId: null,
        avatar: null,
      },
    });

    const session = await sessionResponse(user.id);

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: session,
    });
  } catch (error) {
    console.error("Registration failed:", error);
    res.status(400).json({
      success: false,
      message: "Unable to create account",
    });
  }
};

export const passwordLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user?.passwordHash) {
      res.status(401).json({
        success: false,
        message:
          "No email/password account exists for this email. Use Google login or sign up first.",
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const session = await sessionResponse(user.id);

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Password login failed:", error);
    res.status(500).json({
      success: false,
      message: "Unable to sign in",
    });
  }
};

export const currentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const sender = await prisma.sender.findFirst({
    where: { userId: req.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  res.json({
    success: true,
    data: {
      user: req.user,
      sender,
    },
  });
};
