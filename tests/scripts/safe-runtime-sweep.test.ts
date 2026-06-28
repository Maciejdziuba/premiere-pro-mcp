import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const SCRIPT = join(process.cwd(), "scripts", "safe-runtime-sweep.mjs");

function runSweep(args: string[] = []) {
  return execFileSync("node", [SCRIPT, ...args], { encoding: "utf-8" });
}

describe("safe-runtime-sweep CLI", () => {
  it("defaults to dry-run without contacting Premiere", () => {
    const output = runSweep();

    expect(output).toContain("Dry run: no dist import and no Premiere bridge contact.");
    expect(output).toContain("Static contract checks:");
    expect(output).toContain("PASS auto_reframe_signature");
    expect(output).toContain("PASS text_overlay_styling");
    expect(output).toContain("PASS frame_capture_export_capability");
    expect(output).toContain("PASS transcript_capability_not_advertised");
  });

  it("prints machine-readable dry-run contract labels", () => {
    const output = runSweep(["--dry-run", "--json"]);
    const payload = JSON.parse(output);

    expect(payload).toMatchObject({
      readOnly: true,
      contactsPremiere: false,
      contractSummary: {
        knownGaps: 0,
        checks: expect.any(Array),
      },
    });
    expect(payload.contractSummary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "auto_reframe_signature", status: "pass" }),
        expect.objectContaining({ id: "text_overlay_styling", status: "pass" }),
        expect.objectContaining({ id: "frame_capture_export_capability", status: "pass" }),
        expect.objectContaining({ id: "transcript_capability_not_advertised", status: "pass" }),
      ])
    );
    expect(payload.liveProbePlan).toEqual(
      expect.arrayContaining([
        expect.stringContaining("MCP_TEST_VALIDATE_* scratch sequence"),
        expect.stringContaining("probe exportFramePNG capability without exporting"),
      ])
    );
  });

  it("strict dry-run contract passes for the integrated fixes", () => {
    const result = spawnSync("node", [SCRIPT, "--dry-run", "--strict-contract"], {
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS auto_reframe_signature");
    expect(result.stdout).toContain("PASS text_overlay_styling");
    expect(result.stdout).toContain("PASS frame_capture_export_capability");
  });

  it("rejects invalid argument combinations before importing dist", () => {
    const result = spawnSync("node", [SCRIPT, "--run-readonly", "--dry-run"], {
      encoding: "utf-8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--dry-run cannot be combined with --run-readonly or --live-probes");
  });

  it("refuses live probes without explicit confirmation", () => {
    const result = spawnSync("node", [SCRIPT, "--live-probes"], {
      encoding: "utf-8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--live-probes would mutate the open Premiere project");
    expect(result.stderr).toContain("--confirm-live-probes");
    expect(result.stderr).toContain("MCP_TEST_VALIDATE_*");
  });
});
