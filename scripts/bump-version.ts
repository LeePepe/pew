#!/usr/bin/env bun
/**
 * Bump the monorepo version across all package.json files and source constants.
 *
 * Usage:
 *   bun run scripts/bump-version.ts <new-version>
 *   bun run scripts/bump-version.ts patch|minor|major
 *
 * Examples:
 *   bun run scripts/bump-version.ts 1.15.0
 *   bun run scripts/bump-version.ts patch    # 1.14.5 → 1.14.6
 *   bun run scripts/bump-version.ts minor    # 1.14.5 → 1.15.0
 *   bun run scripts/bump-version.ts major    # 1.14.5 → 2.0.0
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Files to update
// ---------------------------------------------------------------------------

interface Target {
  /** Relative path from monorepo root */
  path: string;
  /** How to find and replace the version string */
  pattern: "json-version" | "const-version";
}

const TARGETS: Target[] = [
  // package.json files
  { path: "package.json", pattern: "json-version" },
  { path: "packages/core/package.json", pattern: "json-version" },
  { path: "packages/cli/package.json", pattern: "json-version" },
  { path: "packages/web/package.json", pattern: "json-version" },
  { path: "packages/worker/package.json", pattern: "json-version" },
  { path: "packages/worker-read/package.json", pattern: "json-version" },
  // Source code version constants
  { path: "packages/cli/src/cli.ts", pattern: "const-version" },
  { path: "packages/cli/src/__tests__/cli.test.ts", pattern: "const-version" },
  { path: "packages/worker/src/index.ts", pattern: "const-version" },
  { path: "packages/worker-read/src/index.ts", pattern: "const-version" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentVersion(): string {
  const rootPkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  return rootPkg.version;
}

function bumpVersion(current: string, bump: "patch" | "minor" | "major"): string {
  const [major, minor, patch] = current.split(".").map(Number);
  if (major === undefined || minor === undefined || patch === undefined) {
    throw new Error(`Invalid version format: ${current}`);
  }
  switch (bump) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
  }
}

function isValidSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v);
}

function replaceInFile(filePath: string, target: Target, oldVersion: string, newVersion: string): boolean {
  const abs = resolve(ROOT, filePath);
  const content = readFileSync(abs, "utf-8");
  let updated: string;

  if (target.pattern === "json-version") {
    // Replace "version": "x.y.z"
    const pattern = `"version": "${oldVersion}"`;
    const replacement = `"version": "${newVersion}"`;
    if (!content.includes(pattern)) {
      console.error(`  ✗ ${filePath} — pattern not found: ${pattern}`);
      return false;
    }
    updated = content.replace(pattern, replacement);
  } else {
    // Replace any quoted version string like "x.y.z"
    const escaped = oldVersion.replace(/\./g, "\\.");
    const re = new RegExp(`"${escaped}"`, "g");
    if (!re.test(content)) {
      console.error(`  ✗ ${filePath} — version "${oldVersion}" not found`);
      return false;
    }
    updated = content.replace(re, `"${newVersion}"`);
  }

  writeFileSync(abs, updated, "utf-8");
  console.log(`  ✓ ${filePath}`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: bun run scripts/bump-version.ts <version|patch|minor|major>");
  process.exit(1);
}

const currentVersion = getCurrentVersion();
let newVersion: string;

if (["patch", "minor", "major"].includes(arg)) {
  newVersion = bumpVersion(currentVersion, arg as "patch" | "minor" | "major");
} else if (isValidSemver(arg)) {
  newVersion = arg;
} else {
  console.error(`Invalid version or bump type: ${arg}`);
  process.exit(1);
}

console.log(`\nBumping version: ${currentVersion} → ${newVersion}\n`);

let failures = 0;
for (const target of TARGETS) {
  const ok = replaceInFile(target.path, target, currentVersion, newVersion);
  if (!ok) failures++;
}

console.log(`\n${failures === 0 ? "✅" : "⚠️"} Updated ${TARGETS.length - failures}/${TARGETS.length} files`);

if (failures > 0) {
  process.exit(1);
}
