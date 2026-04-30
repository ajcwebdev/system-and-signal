import { createInterface } from "node:readline";
import { toolDefinitions, executeTool } from "./tools.ts";

const SYSTEM_PROMPT = `You are a project management assistant with direct access to the task database.
You can list, create, update, search, and complete tasks across projects.
You share the same live data as web and mobile clients — any changes you make are instantly synced to all connected apps.
Be concise but helpful. Use tools to answer questions rather than guessing.`;

interface Message {
  role: "user" | "assistant";
  content: unknown;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

interface TextBlock {
  type: "text";
  text: string;
}

async function chat(
  messages: Message[],
): Promise<{ text: string; messages: Message[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      text: "[Set ANTHROPIC_API_KEY in .env to enable the LLM agent]",
      messages,
    };
  }

  let currentMessages = [...messages];

  // Agent loop: keep calling the LLM until it stops requesting tools
  while (true) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages: currentMessages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      content: (ToolUseBlock | TextBlock)[];
      stop_reason: string;
    };

    // Append assistant response
    currentMessages.push({ role: "assistant", content: data.content });

    // If the model is done (no more tool calls), extract text and return
    if (data.stop_reason !== "tool_use") {
      const text = data.content
        .filter((b): b is TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { text, messages: currentMessages };
    }

    // Execute tool calls and collect results
    const toolUseBlocks = data.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );

    const results: ToolResultBlock[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    // Feed tool results back to the model
    currentMessages.push({ role: "user", content: results });
  }
}

export async function runAgent() {
  const messages: Message[] = [];
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log("Agent ready. Type a message or 'quit' to exit.\n");

  while (true) {
    const input = await ask("you> ");
    if (input.trim().toLowerCase() === "quit") break;
    if (!input.trim()) continue;

    messages.push({ role: "user", content: input });
    try {
      const { text, messages: updated } = await chat(messages);
      messages.length = 0;
      messages.push(...updated);
      console.log(`\nassistant> ${text}\n`);
    } catch (err) {
      console.error("Error:", err);
    }
  }

  rl.close();
}
