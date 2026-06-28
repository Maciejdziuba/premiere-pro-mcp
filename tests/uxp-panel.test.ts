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

  it("manifest grants the reliable UXP network permission for the local HTTP bridge", () => {
    const manifest = JSON.parse(readFileSync(PANEL_MANIFEST, "utf-8"));

    expect(manifest.manifestVersion).toBe(5);
    // UXP enforces explicit-origin allowlists inconsistently for localhost HTTP
    // sidecars; the reliable form (matching Adobe's own oauth sample) is "all".
    expect(manifest.requiredPermissions.network.domains).toBe("all");
  });

  it("resolveClip matches a clip by name and falls back to Project panel selection", () => {
    const source = readFileSync(PANEL_MAIN, "utf-8");

    // The MCP tools only populate the id slot, so the supplied value (a name or
    // CEP node ID) must also be matched against the clip name; UXP getId()
    // returns a GUID that never matches a name or node ID.
    expect(source).toContain("name === String(targetId)");
    // It must no longer hard-throw before trying the Project panel selection.
    expect(source).toContain("no clip is selected in the Project panel");
  });

  it("reports runtime transcript capabilities and treats hasTranscript as optional", () => {
    const source = readFileSync(PANEL_MAIN, "utf-8");
    const exportBody = source.match(/async function handleExportTranscript\(args\) \{([\s\S]*?)\n  \}\n\n  async function handleImportTranscript/)?.[1] || "";

    expect(source).toContain("runtimeTranscriptCapabilities");
    expect(source).toContain("missingMethods");
    expect(source).toContain("canDeriveHasTranscriptFromExport");
    expect(source).toContain("premierepro.Transcript.hasTranscript(clipProjectItem) [optional in Premiere 26.2]");
    expect(source).toContain("Transcript.exportToJSON failed; transcript state is unknown");
    expect(exportBody).toContain("ensureCanExportTranscript");
    expect(exportBody).toContain("api.Transcript.exportToJSON");
    expect(exportBody).not.toContain("hasTranscript");
  });

  it("documents MCP bridge status separately from optional diagnostics status files", () => {
    const readme = readFileSync(PANEL_README, "utf-8");

    expect(readme).toContain("get_uxp_bridge_status");
    expect(readme).toContain("uxp_ping");
    expect(readme).toContain("does not write");
  });
});
