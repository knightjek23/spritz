#!/usr/bin/env node
// scripts/check-server-onclick.mjs
//
// Build-time guard: any Server Component (no "use client" directive at
// the top) that contains an onClick handler crashes at request time with:
//
//   "Event handlers cannot be passed to Client Component props."
//
// (Burned by this once on /family/[slug] — error digest 1930472941.)
//
// The crash happens at render time inside the React Server Components
// renderer when it tries to serialize the JSX tree to send to the client.
// Functions aren't serializable, so onClick blows up the whole response.
// Vercel returns a 500 with a digest hash and no useful client-side
// error — only the function logs show the real cause. By then production
// is broken.
//
// This script catches the pattern at build time. Walks app/ and
// components/, opens each .ts/.tsx, decides whether it's a Server or
// Client component (first non-comment line == "use client"), and fails
// the build if any Server file's code body contains onClick.
//
// Hooked into the build via the `prebuild` npm script — npm runs
// prebuild automatically before build, and a non-zero exit aborts the
// build chain. Local `npm run build` and Vercel deploy both protected.
//
// To bypass (rare — only if a false positive sneaks in), add a
// `// eslint-disable-next-line server-onclick` comment to the line.
// The script honors that directive.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const BYPASS_DIRECTIVE = "eslint-disable-next-line server-onclick";

/** Recursively collect .ts/.tsx/.js/.jsx files under dir. */
async function walk(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files; // dir doesn't exist (e.g. components/ not yet created) — skip
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Decide whether a file is a Client Component. Strict check: the first
 * non-blank, non-comment line must be exactly "use client" or 'use client'
 * (with optional trailing semicolon). Anything else is treated as a
 * Server Component.
 */
function isClientComponent(source) {
  const lines = source.split(/\r?\n/);
  let inBlockComment = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlockComment = true;
      continue;
    }
    if (line.startsWith("//")) continue;
    // First real code line — must be the directive.
    return /^["']use client["'];?\s*$/.test(line);
  }
  return false;
}

// Strip block and line comments so we don't false-positive on
// "onClick" mentioned in a comment.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** Return [{ line, text }] for every line containing onClick (excluding
 *  ones flagged with the bypass directive on the previous line). */
function findOnClickLines(source) {
  const lines = source.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("onClick")) continue;
    // Skip if the previous line carries the bypass directive
    if (i > 0 && lines[i - 1].includes(BYPASS_DIRECTIVE)) continue;
    hits.push({ line: i + 1, text: lines[i].trim() });
  }
  return hits;
}

let violations = 0;

for (const dir of SCAN_DIRS) {
  const files = await walk(path.join(ROOT, dir));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (isClientComponent(source)) continue;
    const codeOnly = stripComments(source);
    if (!codeOnly.includes("onClick")) continue;
    // Code body has onClick. Find the source lines (not comment-stripped
    // so the user sees the original line numbers).
    const hits = findOnClickLines(source);
    if (hits.length === 0) continue; // every hit was in a comment
    for (const h of hits) {
      console.error(
        `✗ ${path.relative(ROOT, file)}:${h.line} — Server Component contains onClick`,
      );
      console.error(`    ${h.text}`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error("");
  console.error(
    `${violations} Server Component(s) with onClick. These crash at runtime with`,
  );
  console.error(`"Event handlers cannot be passed to Client Component props."`);
  console.error("");
  console.error("Fix one of:");
  console.error(
    `  · Add "use client" to the top of the file (becomes a Client Component)`,
  );
  console.error(
    `  · Extract the interactive part into a small Client child component`,
  );
  console.error(
    `  · Remove the onClick if the wrapper is already an interactive element`,
  );
  console.error("");
  console.error(
    `If a hit is a real false positive, add // ${BYPASS_DIRECTIVE} on the line above.`,
  );
  process.exit(1);
}

console.log("✓ No Server Component onClick violations.");
