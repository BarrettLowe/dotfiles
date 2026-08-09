/**
 * Extensions list extension
 *
 * Provides a /extensions command to list installed and enabled extensions.
 * Scans global (~/.pi/agent/extensions/), project-local (.pi/extensions/),
 * and custom paths from settings.json.
 *
 * Usage: /extensions
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

interface ExtEntry {
  path: string;
  name: string;
  kind: "global" | "project" | "custom";
}

function readSettings(): Record<string, unknown> {
  const settingsPath = join(homedir(), CONFIG_DIR_NAME, "settings.json");
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function scan(ctxCwd: string): ExtEntry[] {
  const entries: ExtEntry[] = [];
  const settings = readSettings();
  const customPaths = (settings.extensions as string[]) ?? [];

  const globalDir = join(homedir(), ".pi", "agent", "extensions");
  if (existsSync(globalDir)) {
    for (const item of readdirSync(globalDir).sort()) {
      const fullPath = join(globalDir, item);
      const st = statSync(fullPath);

      if (st.isDirectory()) {
        // Directory-based: check for index.ts or src/index.ts
        if (existsSync(join(fullPath, "index.ts")) || existsSync(join(fullPath, "src", "index.ts"))) {
          entries.push({ path: fullPath, name: item, kind: "global" });
        }
      } else if (item.endsWith(".ts") && !item.includes("extensions-list")) {
        // Single-file extension
        const name = item.replace(".ts", "");
        if (!entries.some((e) => e.path === fullPath)) {
          entries.push({ path: fullPath, name, kind: "global" });
        }
      }
    }
  }

  // Project-local: .pi/extensions/ (only if dir exists)
  const projectDir = join(ctxCwd, CONFIG_DIR_NAME, "extensions");
  if (existsSync(projectDir)) {
    for (const item of readdirSync(projectDir).sort()) {
      const fullPath = join(projectDir, item);
      const st = statSync(fullPath);

      if (st.isDirectory()) {
        if (existsSync(join(fullPath, "index.ts")) || existsSync(join(fullPath, "src", "index.ts"))) {
          entries.push({ path: fullPath, name: item, kind: "project" });
        }
      } else if (item.endsWith(".ts") && !item.includes("extensions-list")) {
        const name = item.replace(".ts", "");
        if (!entries.some((e) => e.path === fullPath)) {
          entries.push({ path: fullPath, name, kind: "project" });
        }
      }
    }
  }

  // Custom paths from settings.json
  for (const p of customPaths) {
    const resolved = p.replace(/\$\w+/g, ""); // strip env var placeholders
    if (existsSync(resolved)) {
      const name = resolved.split("/").pop() ?? resolved;
      entries.push({ path: resolved, name, kind: "custom" });
    }
  }

  return entries;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("extensions", {
    description: "List installed and enabled extensions",
    handler: async (_args, ctx) => {
      const exts = scan(ctx.cwd);

      if (exts.length === 0) {
        ctx.ui.notify("No extensions found", "info");
        return;
      }

      // Group by kind for display
      const grouped: Record<string, ExtEntry[]> = {};
      for (const e of exts) {
        if (!grouped[e.kind]) grouped[e.kind] = [];
        grouped[e.kind].push(e);
      }

      const items: string[] = [];
      const order: { key: string; label: string }[] = [
        { key: "global", label: "Global (~/.pi/agent/extensions/)" },
        { key: "custom", label: "Custom (settings.json)" },
        { key: "project", label: "Project-local (.pi/extensions/)" },
      ];

      for (const { key, label } of order) {
        const list = grouped[key];
        if (!list?.length) continue;
        items.push(`--- ${label} (${list.length}) ---`);
        for (const ext of list) {
          items.push(`  /${ext.name}    ${ext.path}`);
        }
      }

      const selected = await ctx.ui.select("Installed Extensions", items);
      if (selected) {
        ctx.ui.notify(selected, "info");
      }
    },
  });
}
