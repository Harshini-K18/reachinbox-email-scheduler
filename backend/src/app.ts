import express from "express";
import cors from "cors";
import helmet from "helmet";
import emailRoutes from "./routes/email.routes";
import authRoutes from "./routes/auth.routes";
import { env } from "./config/env";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: "25mb" }));

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "ReachInbox backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/emails", emailRoutes);

export default app;
