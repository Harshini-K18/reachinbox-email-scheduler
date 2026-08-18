import app from "./app";
import { env } from "./config/env";
import { prisma } from "./db/prisma";
import { redis } from "./db/redis";
import "./workers/email.worker";
const startServer = async () => {
  try {
    // Test PostgreSQL connection
    await prisma.$connect();
    console.log("PostgreSQL connected");

    // Test Redis connection
    await redis.ping();
    console.log("Redis connected");

    const server = app.listen(env.PORT, () => {
      console.log(`Server running on http://localhost:${env.PORT}`);
    });

    const shutdown = async () => {
      console.log("Shutting down server...");

      server.close(async () => {
        console.log("HTTP server closed");

        await prisma.$disconnect();
        await redis.quit();

        console.log("Database and Redis connections closed");

        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start server:", error);

    await prisma.$disconnect();
    redis.disconnect();

    process.exit(1);
  }
};

startServer();