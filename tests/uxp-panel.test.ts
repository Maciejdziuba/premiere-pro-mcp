import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PANEL_MAIN = join(process.cwd(), "uxp-panel", "main.js");
const PANEL_MANIFEST = join(process.cwd(), "uxp-panel", "manifest.json");
const PANEL_README = join(process.cwd(), "uxp-panel", "README.md");
const PANEL_HTML = join(process.cwd(), "uxp-panel", "index.html");

describe("UXP panel static contracts", () => {
  it("manual bridge check uses status and does not consume long-poll commands", () => {
    const source = readFileSync(PANEL_MAIN, "utf-8");
    const html = readFileSync(PANEL_HTML, "utf-8");
    const pingBridgeBody = source.match(/async function pingBridge\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";

    expect(pingBridgeBody).toContain('"/uxp/status"');
    expect(pingBridgeBody).not.toContain("/uxp/poll");
    expect(html).toContain('<button id="pingButton">Status</button>');
  });

  it("manifest allows explicit localhost HTTP bridge origins for the default sidecar port", () => {
    const manifest = JSON.parse(readFileSync(PANEL_MANIFEST, "utf-8"));

    expect(manifest.manifestVersion).toBe(5);
    expect(manifest.requiredPermissions.network.domains).toEqual([
      "http://127.0.0.1:17777",
      "http://localhost:17777",
    ]);
  });

  it("documents MCP bridge status separately from optional diagnostics status files", () => {
    const readme = readFileSync(PANEL_README, "utf-8");

    expect(readme).toContain("get_uxp_bridge_status");
    expect(readme).toContain("uxp_ping");
    expect(readme).toContain("does not write");
  });
});
