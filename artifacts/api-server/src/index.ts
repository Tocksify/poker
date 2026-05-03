import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool, db } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { attachWsServer } from "./lib/wsServer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  try {
    logger.info("Running database migrations...");
    const migrationsPath = join(__dirname, "drizzle");
    await migrate(db, { migrationsFolder: migrationsPath });
    logger.info("Migrations completed successfully");
  } catch (err) {
    const errStr = String(err);
    if (!errStr.includes("already exists")) {
      logger.error({ err }, "Failed to run migrations");
      await pool.end();
      process.exit(1);
    }
    logger.info("Migrations already applied, continuing...");
  }

  const server = createServer(app);
  attachWsServer(server);

  server.listen(port, () => {
    logger.info({ port }, "Server listening");
  });

  server.on("error", (err) => {
    logger.error({ err }, "Server error");
    process.exit(1);
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
