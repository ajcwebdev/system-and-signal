import { PowerSyncDatabase } from "@powersync/node";
import { AppSchema } from "./schema.ts";
import { Connector } from "./connector.ts";

const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_FIRST_SYNC_TIMEOUT_MS = 60_000;
const HEALTH_RETRY_MS = 500;

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: "agent.db" },
});

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Run "bun run setup" first.`);
  }
  return value;
}

function envMs(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number of milliseconds.`);
  }
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = "message" in error ? error.message : undefined;
    if (typeof maybeMessage === "string") return maybeMessage;

    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

function describeSyncStatus() {
  const status = db.currentStatus;
  const flow = status.dataFlowStatus;
  const progress = status.downloadProgress;
  const parts = [
    `connected=${status.connected}`,
    `connecting=${status.connecting}`,
    `hasSynced=${String(status.hasSynced)}`,
    `downloading=${String(flow.downloading ?? false)}`,
    `uploading=${String(flow.uploading ?? false)}`,
  ];

  if (progress) {
    parts.push(
      `download=${progress.downloadedOperations}/${progress.totalOperations}`,
    );
  }
  if (flow.downloadError) {
    parts.push(`downloadError=${formatError(flow.downloadError)}`);
  }
  if (flow.uploadError) {
    parts.push(`uploadError=${formatError(flow.uploadError)}`);
  }

  return parts.join(", ");
}

async function waitForPowerSyncHealth(endpoint: string, timeoutMs: number) {
  const url = new URL("/probes/liveness", endpoint).toString();
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return;
      lastError = `HTTP ${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = formatError(error);
    } finally {
      clearTimeout(timeout);
    }

    await sleep(Math.min(HEALTH_RETRY_MS, Math.max(0, deadline - Date.now())));
  }

  throw new Error(
    `PowerSync did not become healthy at ${url} within ${timeoutMs}ms (${lastError}).\n` +
      `Run "docker compose ps" and "docker compose logs powersync --tail=200".`,
  );
}

function logSyncErrors() {
  let lastMessage = "";

  return db.registerListener({
    statusChanged(status) {
      const flow = status.dataFlowStatus;
      const messages = [
        flow.downloadError
          ? `download error: ${formatError(flow.downloadError)}`
          : null,
        flow.uploadError ? `upload error: ${formatError(flow.uploadError)}` : null,
      ].filter(Boolean);

      const message = messages.join("; ");
      if (message && message !== lastMessage) {
        lastMessage = message;
        console.warn(`[sync] ${message}`);
      }
    },
  });
}

async function waitForFirstSyncWithTimeout(timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      db.waitForFirstSync(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting for first sync after ${timeoutMs}ms.\n` +
                `Latest status: ${describeSyncStatus()}\n` +
                `Run "docker compose logs powersync --tail=200" for the service-side error.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function connectAndSync() {
  const endpoint = requiredEnv("POWERSYNC_URL");
  requiredEnv("POWERSYNC_TOKEN");

  await waitForPowerSyncHealth(
    endpoint,
    envMs("POWERSYNC_HEALTH_TIMEOUT_MS", DEFAULT_HEALTH_TIMEOUT_MS),
  );

  await db.init();

  const disposeSyncLogger = logSyncErrors();
  const connector = new Connector();
  try {
    await db.connect(connector);
    const firstSyncTimeoutMs = envMs(
      "POWERSYNC_FIRST_SYNC_TIMEOUT_MS",
      DEFAULT_FIRST_SYNC_TIMEOUT_MS,
    );
    console.log(`Waiting for first sync (timeout ${firstSyncTimeoutMs}ms)...`);
    await waitForFirstSyncWithTimeout(firstSyncTimeoutMs);
  } finally {
    disposeSyncLogger();
  }

  const { count } = await db.get<{ count: number }>(
    "SELECT count(*) as count FROM tasks",
  );
  console.log(`Synced - ${count} tasks in local database`);
}
