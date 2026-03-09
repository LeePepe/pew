import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getOpenClawHookStatus,
  installOpenClawHook,
  uninstallOpenClawHook,
} from "../notifier/openclaw-hook.js";

describe("OpenClaw hook installer", () => {
  let tempDir: string;
  let pluginBaseDir: string;
  let openclawConfigPath: string;
  const notifyPath = "/tmp/pew/bin/notify.cjs";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-openclaw-hook-"));
    pluginBaseDir = join(tempDir, "openclaw-plugin");
    openclawConfigPath = join(tempDir, "openclaw.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes plugin files and runs openclaw install/enable commands", async () => {
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0 });

    const result = await installOpenClawHook({
      pluginBaseDir,
      notifyPath,
      openclawConfigPath,
      spawn,
    });

    const pluginDir = join(pluginBaseDir, "pew-session-sync");
    const index = await readFile(join(pluginDir, "index.js"), "utf8");

    expect(result.changed).toBe(true);
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      "openclaw",
      ["plugins", "install", "--link", pluginDir],
      expect.any(Object),
    );
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      "openclaw",
      ["plugins", "enable", "pew-session-sync"],
      expect.any(Object),
    );
    expect(index).toContain("agent_end");
    expect(index).toContain("gateway_start");
    expect(index).toContain("gateway_stop");
    expect(index).toContain("--source=openclaw");
  });

  it("skips installation when the openclaw CLI is missing", async () => {
    const spawn = vi.fn(() => {
      const err = new Error("missing") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    const result = await installOpenClawHook({
      pluginBaseDir,
      notifyPath,
      openclawConfigPath,
      spawn,
    });

    expect(result.action).toBe("skip");
    expect(result.warnings?.[0]).toContain("openclaw CLI not found");
  });

  it("reports installed status when config and files are present", async () => {
    const pluginDir = join(pluginBaseDir, "pew-session-sync");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "package.json"), "{}\n", "utf8");
    await writeFile(join(pluginDir, "openclaw.plugin.json"), "{}\n", "utf8");
    await writeFile(join(pluginDir, "index.js"), "// plugin\n", "utf8");
    await writeFile(
      openclawConfigPath,
      `${JSON.stringify(
        {
          plugins: {
            entries: { "pew-session-sync": { enabled: true } },
            load: { paths: [pluginDir] },
            installs: {
              "pew-session-sync": {
                sourcePath: pluginDir,
                installPath: pluginDir,
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    expect(
      await getOpenClawHookStatus({ pluginBaseDir, notifyPath, openclawConfigPath }),
    ).toBe("installed");
  });

  it("removes plugin references from config and deletes the plugin directory", async () => {
    const pluginDir = join(pluginBaseDir, "pew-session-sync");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "package.json"), "{}\n", "utf8");
    await writeFile(join(pluginDir, "openclaw.plugin.json"), "{}\n", "utf8");
    await writeFile(join(pluginDir, "index.js"), "// plugin\n", "utf8");
    await writeFile(
      openclawConfigPath,
      `${JSON.stringify(
        {
          plugins: {
            entries: { "pew-session-sync": { enabled: true }, keep: { enabled: true } },
            load: { paths: [pluginDir, "/tmp/keep"] },
            installs: {
              "pew-session-sync": {
                sourcePath: pluginDir,
                installPath: pluginDir,
              },
              keep: {
                sourcePath: "/tmp/keep",
                installPath: "/tmp/keep",
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = await uninstallOpenClawHook({
      pluginBaseDir,
      notifyPath,
      openclawConfigPath,
    });
    const saved = JSON.parse(await readFile(openclawConfigPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(saved.plugins.entries.keep).toBeDefined();
    expect(saved.plugins.entries["pew-session-sync"]).toBeUndefined();
    expect(saved.plugins.load.paths).toEqual(["/tmp/keep"]);
  });
});
