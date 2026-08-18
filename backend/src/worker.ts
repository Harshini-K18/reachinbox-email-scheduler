import "dotenv/config";
import { emailWorker } from "./workers/email.worker";

console.log("Email worker started");

const shutdown = async () => {
  console.log("Shutting down email worker...");

  await emailWorker.close();

  console.log("Email worker closed");

  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);