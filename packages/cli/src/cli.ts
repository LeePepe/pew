import { defineCommand } from "citty";
import { consola } from "consola";
import pc from "picocolors";
import { resolveDefaultPaths } from "./utils/paths.js";
import { executeSync } from "./commands/sync.js";
import { executeStatus } from "./commands/status.js";

const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Set up Zebra hooks for your AI coding tools",
  },
  async run() {
    // TODO: Phase 2.8 — install hooks for Claude Code, Gemini CLI, OpenCode, OpenClaw
    consola.info("zebra init — not yet implemented");
  },
});

const syncCommand = defineCommand({
  meta: {
    name: "sync",
    description: "Parse local AI tool usage and upload to dashboard",
  },
  async run() {
    const paths = resolveDefaultPaths();
    consola.start("Syncing token usage from AI coding tools...\n");

    const result = await executeSync({
      stateDir: paths.stateDir,
      claudeDir: paths.claudeDir,
      geminiDir: paths.geminiDir,
      openCodeMessageDir: paths.openCodeMessageDir,
      openclawDir: paths.openclawDir,
      onProgress(event) {
        if (event.phase === "parse" && event.current && event.total) {
          // Only log at 25% intervals or small counts
          if (
            event.total <= 10 ||
            event.current === event.total ||
            event.current % Math.ceil(event.total / 4) === 0
          ) {
            consola.info(
              `  ${pc.cyan(event.source)} ${event.current}/${event.total} files`,
            );
          }
        }
      },
    });

    // Summary
    consola.log("");
    if (result.totalDeltas === 0) {
      consola.info("No new token usage found.");
    } else {
      consola.success(
        `Synced ${pc.bold(String(result.totalDeltas))} events → ${pc.bold(String(result.totalRecords))} queue records`,
      );
      const parts: string[] = [];
      if (result.sources.claude > 0) parts.push(`Claude: ${result.sources.claude}`);
      if (result.sources.gemini > 0) parts.push(`Gemini: ${result.sources.gemini}`);
      if (result.sources.opencode > 0) parts.push(`OpenCode: ${result.sources.opencode}`);
      if (result.sources.openclaw > 0) parts.push(`OpenClaw: ${result.sources.openclaw}`);
      if (parts.length > 0) {
        consola.info(`  ${pc.dim(parts.join("  |  "))}`);
      }
    }
  },
});

const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show current sync status and token usage summary",
  },
  async run() {
    const paths = resolveDefaultPaths();
    const result = await executeStatus({ stateDir: paths.stateDir });

    consola.log("");
    consola.log(pc.bold("Zebra Status"));
    consola.log(pc.dim("─".repeat(40)));
    consola.log(`  Tracked files:   ${pc.cyan(String(result.trackedFiles))}`);
    consola.log(
      `  Last sync:       ${result.lastSync ? pc.green(result.lastSync) : pc.dim("never")}`,
    );
    consola.log(
      `  Pending upload:  ${result.pendingRecords > 0 ? pc.yellow(String(result.pendingRecords)) : pc.dim("0")} records`,
    );

    if (Object.keys(result.sources).length > 0) {
      consola.log("");
      consola.log(pc.bold("  Files by source:"));
      for (const [source, count] of Object.entries(result.sources)) {
        consola.log(`    ${pc.cyan(source.padEnd(14))} ${count}`);
      }
    }
    consola.log("");
  },
});

const loginCommand = defineCommand({
  meta: {
    name: "login",
    description: "Connect your CLI to the Zebra dashboard via browser OAuth",
  },
  async run() {
    // TODO: Phase 3 — browser-based OAuth flow, save token
    consola.info("zebra login — not yet implemented");
  },
});

export const main = defineCommand({
  meta: {
    name: "zebra",
    version: "0.1.0",
    description: "Track token usage from your local AI coding tools",
  },
  subCommands: {
    init: initCommand,
    sync: syncCommand,
    status: statusCommand,
    login: loginCommand,
  },
});
