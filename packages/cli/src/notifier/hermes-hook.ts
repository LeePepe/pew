import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { NotifierOperationResult, NotifierStatus } from "@pew/core";

interface HermesHookFs {
  readFile: (path: string, encoding: BufferEncoding) => Promise<string>;
  writeFile: (path: string, data: string, encoding: BufferEncoding) => Promise<unknown>;
  mkdir: (path: string, options: { recursive: boolean }) => Promise<unknown>;
}

export interface HermesHookOptions {
  pluginDir: string;
  pewBin: string;
  fs?: HermesHookFs;
}

const SOURCE = "hermes";
const PLUGIN_NAME = "pew-tracker";

export async function installHermesHook(
  opts: HermesHookOptions,
): Promise<NotifierOperationResult> {
  const fs = opts.fs ?? { readFile, writeFile, mkdir };
  const pluginPath = `${opts.pluginDir}/${PLUGIN_NAME}.json`;
  const expected = buildPluginContent(opts.pewBin);

  const existing = await readOptional(pluginPath, fs);
  if (existing !== null) {
    try {
      const parsed = JSON.parse(existing);
      if (JSON.stringify(parsed) === JSON.stringify(expected)) {
        return {
          source: SOURCE,
          action: "install",
          changed: false,
          detail: "Hermes hook already installed",
        };
      }
    } catch {
      // Invalid JSON → overwrite
    }
  }

  await fs.mkdir(opts.pluginDir, { recursive: true });
  const backupPath = existing !== null
    ? `${pluginPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`
    : null;

  if (backupPath && existing !== null) {
    await fs.writeFile(backupPath, existing, "utf8");
  }

  await fs.writeFile(pluginPath, `${JSON.stringify(expected, null, 2)}\n`, "utf8");

  return {
    source: SOURCE,
    action: "install",
    changed: true,
    detail: "Hermes hook installed",
    backupPath: backupPath ?? undefined,
  };
}

export async function uninstallHermesHook(
  opts: HermesHookOptions,
): Promise<NotifierOperationResult> {
  const fs = opts.fs ?? { readFile, writeFile, mkdir };
  const pluginPath = `${opts.pluginDir}/${PLUGIN_NAME}.json`;
  const expected = buildPluginContent(opts.pewBin);

  const existing = await readOptional(pluginPath, fs);
  if (existing === null) {
    return {
      source: SOURCE,
      action: "skip",
      changed: false,
      detail: "Hermes hook not installed",
    };
  }

  try {
    const parsed = JSON.parse(existing);
    if (JSON.stringify(parsed) !== JSON.stringify(expected)) {
      return {
        source: SOURCE,
        action: "skip",
        changed: false,
        detail: "Hermes hook not installed (content mismatch)",
      };
    }
  } catch {
    return {
      source: SOURCE,
      action: "skip",
      changed: false,
      detail: "Hermes hook not installed (invalid JSON)",
    };
  }

  // Delete the plugin file
  const backupPath = `${pluginPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fs.writeFile(backupPath, existing, "utf8");

  // Instead of deleting, write empty content (or we could use fs.unlink if available)
  // For consistency with other notifiers that restore state, we keep the backup
  // but the actual removal requires fs.unlink which isn't in the FS interface
  // So we'll write an empty disabled plugin
  await fs.writeFile(
    pluginPath,
    `${JSON.stringify({ name: PLUGIN_NAME, hooks: [] }, null, 2)}\n`,
    "utf8",
  );

  return {
    source: SOURCE,
    action: "uninstall",
    changed: true,
    detail: "Hermes hook removed",
    backupPath,
  };
}

export async function getHermesHookStatus(
  opts: HermesHookOptions,
): Promise<NotifierStatus> {
  const fs = opts.fs ?? { readFile, writeFile, mkdir };
  const pluginPath = `${opts.pluginDir}/${PLUGIN_NAME}.json`;
  const expected = buildPluginContent(opts.pewBin);

  const existing = await readOptional(pluginPath, fs);
  if (existing === null) return "not-installed";

  try {
    const parsed = JSON.parse(existing);
    return JSON.stringify(parsed) === JSON.stringify(expected)
      ? "installed"
      : "not-installed";
  } catch {
    return "error";
  }
}

function buildPluginContent(pewBin: string): Record<string, unknown> {
  return {
    name: PLUGIN_NAME,
    hooks: [
      {
        event: "session:end",
        command: `${pewBin} notify --source=${SOURCE}`,
      },
    ],
  };
}

async function readOptional(
  filePath: string,
  fs: HermesHookFs,
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return null;
    throw err;
  }
}
