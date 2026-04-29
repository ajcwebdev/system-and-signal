import { connectAndSync } from "./src/db.ts";
import { runAgent } from "./src/agent.ts";
import { watchNewTasks } from "./src/watch.ts";

const AGENT_USER_ID = "agent-001";

async function main() {
  // 1. Connect to PowerSync and sync the local database
  await connectAndSync();

  // 2. Start watching for new task assignments in the background
  watchNewTasks(AGENT_USER_ID);

  // 3. Start the interactive agent REPL
  await runAgent();

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});