#!/usr/bin/env bun
/**
 * G2 Security Gate
 * 1. osv-scanner: dependency CVE scan (bun.lock)
 * 2. gitleaks: secret leak scan (unpushed commits)
 *
 * Single source of truth — called by both `bun run test:security`
 * and `.husky/pre-push`. Uses `command -v` guards so missing tools
 * produce a warning, not a hard failure.
 */
import { spawnSync } from "node:child_process";

function hasCommand(name: string): boolean {
  const r = spawnSync("command", ["-v", name], { shell: true });
  return r.status === 0;
}

function resolveUpstreamRange(): string {
  const r = spawnSync(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { encoding: "utf-8" },
  );
  const upstream = r.status === 0 ? r.stdout.trim() : "origin/main";
  return `${upstream}..HEAD`;
}

let failed = false;

// osv-scanner
if (hasCommand("osv-scanner")) {
  console.log("🔍 osv-scanner: scanning bun.lock...");
  const r = spawnSync("osv-scanner", ["--lockfile=bun.lock"], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("❌ osv-scanner found vulnerabilities.");
    failed = true;
  } else {
    console.log("✅ osv-scanner: clean");
  }
} else {
  console.warn("⚠️  osv-scanner not installed, skipping CVE scan");
}

// gitleaks
if (hasCommand("gitleaks")) {
  const range = resolveUpstreamRange();
  console.log(`🔍 gitleaks: scanning commits ${range}...`);
  const r = spawnSync("gitleaks", ["git", `--log-opts=${range}`], {
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("❌ gitleaks found secrets in commits.");
    failed = true;
  } else {
    console.log("✅ gitleaks: clean");
  }
} else {
  console.warn("⚠️  gitleaks not installed, skipping secret scan");
}

if (!failed) {
  console.log("\n✅ G2 security gate passed");
}

process.exit(failed ? 1 : 0);
