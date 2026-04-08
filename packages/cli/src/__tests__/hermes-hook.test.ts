import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getHermesHookStatus,
  installHermesHook,
  uninstallHermesHook,
} from "../notifier/hermes-hook.js";

describe("Hermes hook installer", () => {
  let tempDir: string;
  let pluginDir: string;
  const pewBin = "/usr/local/bin/pew";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-hermes-hook-"));
    pluginDir = join(tempDir, "plugins");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("installs hook into new plugin file", async () => {
    const result = await installHermesHook({ pluginDir, pewBin });
    const pluginPath = join(pluginDir, "pew-tracker.json");
    const saved = JSON.parse(await readFile(pluginPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(result.action).toBe("install");
    expect(saved.name).toBe("pew-tracker");
    expect(saved.hooks).toHaveLength(1);
    expect(saved.hooks[0].event).toBe("session:end");
    expect(saved.hooks[0].command).toBe("/usr/local/bin/pew notify --source=hermes");
  });

  it("is idempotent when hook is already installed", async () => {
    await installHermesHook({ pluginDir, pewBin });
    const result = await installHermesHook({ pluginDir, pewBin });

    expect(result.changed).toBe(false);
    expect(result.action).toBe("install");
    expect(result.detail).toBe("Hermes hook already installed");
  });

  it("overwrites invalid JSON plugin file", async () => {
    await mkdir(pluginDir, { recursive: true });
    const pluginPath = join(pluginDir, "pew-tracker.json");
    await writeFile(pluginPath, "{ invalid json", "utf8");

    const result = await installHermesHook({ pluginDir, pewBin });

    expect(result.changed).toBe(true);
    expect(result.backupPath).toBeDefined();

    const saved = JSON.parse(await readFile(pluginPath, "utf8"));
    expect(saved.name).toBe("pew-tracker");
  });

  it("creates backup when overwriting existing plugin", async () => {
    await mkdir(pluginDir, { recursive: true });
    const pluginPath = join(pluginDir, "pew-tracker.json");
    await writeFile(
      pluginPath,
      `${JSON.stringify({ name: "old-plugin", hooks: [] }, null, 2)}\n`,
      "utf8",
    );

    const result = await installHermesHook({ pluginDir, pewBin });

    expect(result.changed).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(result.backupPath).toContain(".bak.");

    const backup = await readFile(result.backupPath!, "utf8");
    expect(JSON.parse(backup).name).toBe("old-plugin");
  });

  it("removes hook on uninstall", async () => {
    await installHermesHook({ pluginDir, pewBin });

    const result = await uninstallHermesHook({ pluginDir, pewBin });

    expect(result.changed).toBe(true);
    expect(result.action).toBe("uninstall");
    expect(result.backupPath).toBeDefined();

    // After uninstall, plugin file should exist but be disabled
    const pluginPath = join(pluginDir, "pew-tracker.json");
    const saved = JSON.parse(await readFile(pluginPath, "utf8"));
    expect(saved.hooks).toHaveLength(0);
  });

  it("skips uninstall when plugin file does not exist", async () => {
    const result = await uninstallHermesHook({ pluginDir, pewBin });

    expect(result.changed).toBe(false);
    expect(result.action).toBe("skip");
    expect(result.detail).toBe("Hermes hook not installed");
  });

  it("skips uninstall when plugin content does not match", async () => {
    await mkdir(pluginDir, { recursive: true });
    const pluginPath = join(pluginDir, "pew-tracker.json");
    await writeFile(
      pluginPath,
      `${JSON.stringify({ name: "pew-tracker", hooks: [{ event: "other", command: "echo" }] }, null, 2)}\n`,
      "utf8",
    );

    const result = await uninstallHermesHook({ pluginDir, pewBin });

    expect(result.changed).toBe(false);
    expect(result.action).toBe("skip");
    expect(result.detail).toBe("Hermes hook not installed (content mismatch)");
  });

  it("reports installed and not-installed status", async () => {
    expect(await getHermesHookStatus({ pluginDir, pewBin })).toBe("not-installed");

    await installHermesHook({ pluginDir, pewBin });

    expect(await getHermesHookStatus({ pluginDir, pewBin })).toBe("installed");
  });

  it("reports error status for invalid JSON", async () => {
    await mkdir(pluginDir, { recursive: true });
    const pluginPath = join(pluginDir, "pew-tracker.json");
    await writeFile(pluginPath, "{ broken", "utf8");

    expect(await getHermesHookStatus({ pluginDir, pewBin })).toBe("error");
  });
});
