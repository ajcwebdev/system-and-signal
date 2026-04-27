import OpenAI from "openai"
import { Command, CommanderError, Option } from "commander"

import { createOpenAIModelAdapter } from "./shared/openai.ts"
import { createAppPaths, ensureAppScaffold } from "./shared/create-scaffold.ts"
import { formatTurnResult } from "./shared/logger.ts"
import { runProfile } from "./shared/run-profile.ts"
import { initializeDatabase } from "./shared/session-database.ts"
import type { ProfileId } from "./shared/types.ts"

export { createOpenAIModelAdapter } from "./shared/openai.ts"
export { createAppPaths, ensureAppScaffold, type AppRuntime } from "./shared/create-scaffold.ts"
export { runProfile } from "./shared/run-profile.ts"

type RunCommandOptions = {
  profile: ProfileId
  message: string
  user?: string
  session?: string
}

const PROFILE_IDS = ["openclaw", "hermes"] as const
const LEGACY_RUN_COMMAND = "run"
const PROGRAM_NAME = "bun ah"

async function executeRunCommand(options: RunCommandOptions): Promise<void> {
  const paths = createAppPaths(process.cwd())
  await ensureAppScaffold(paths)

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to run the demo.")

  const db = initializeDatabase(paths.databasePath)
  try {
    const modelId = process.env.OPENAI_MODEL ?? "gpt-5.4-nano"
    const app = { paths, db, model: createOpenAIModelAdapter(new OpenAI({ apiKey }), modelId) }
    const result = await runProfile(app, {
      profileId: options.profile,
      message: options.message,
      userId: options.user,
      sessionId: options.session,
    })

    console.log(formatTurnResult(result))
  } finally {
    db.close()
  }
}

function normalizeArgv(argv: string[]): string[] {
  const normalizedArgv = [...argv]

  while (normalizedArgv[0] === LEGACY_RUN_COMMAND) {
    normalizedArgv.shift()
  }

  return normalizedArgv
}

export function createCliProgram(): Command {
  const program = new Command()
    .name(PROGRAM_NAME)
    .description("Run the shared agent loop against the openclaw or hermes demo profile.")
    .showHelpAfterError()
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        `  $ ${PROGRAM_NAME} --profile openclaw --message "What shell do I prefer?"`,
        `  $ ${PROGRAM_NAME} --profile hermes --message "What shell do I prefer?"`,
      ].join("\n"),
    )
    .addOption(new Option("--profile <profile>", "profile to run").choices(PROFILE_IDS).makeOptionMandatory())
    .requiredOption("--message <text>", "message to send to the selected profile")
    .option("--user <id>", "user identifier")
    .option("--session <id>", "session identifier")
    .action(executeRunCommand)

  return program
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const program = createCliProgram().exitOverride()
  const normalizedArgv = normalizeArgv(argv)

  if (normalizedArgv.length === 0) {
    program.outputHelp()
    return
  }

  try {
    await program.parseAsync(normalizedArgv, { from: "user" })
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        return
      }

      process.exitCode = error.exitCode
      return
    }

    throw error
  }
}

if (import.meta.main) {
  await main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
