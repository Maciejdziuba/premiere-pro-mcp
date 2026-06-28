import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const BIN = join(process.cwd(), "dist", "index.js");

describe("CLI flags", () => {
  it("--help prints usage and exits 0", () => {
    const output = execFileSync("node", [BIN, "--help"], { encoding: "utf-8" });
    expect(output).toContain("premiere-pro-mcp");
    expect(output).toContain("Usage:");
    expect(output).toContain("--install-cep");
    expect(output).toContain("--install-uxp");
    expect(output).toContain("PREMIERE_TEMP_DIR");
    expect(output).toContain("PREMIERE_TIMEOUT_MS");
  });

  it("-h is an alias for --help", () => {
    const output = execFileSync("node", [BIN, "-h"], { encoding: "utf-8" });
    expect(output).toContain("Usage:");
  });

  it("--install-uxp prints UDT loading guidance and exits 0", () => {
    const output = execFileSync(
      "node",
      [BIN, "--install-uxp", "--manifest", "/tmp/premiere-mcp-missing-uxp-manifest.json"],
      { encoding: "utf-8" }
    );

    expect(output).toContain("Preparing UXP panel loading instructions");
    expect(output).toContain("Adobe UXP Developer Tool");
    expect(output).toContain("Load or Load & Watch");
  });

  it("--version prints a semver version and exits 0", () => {
    const output = execFileSync("node", [BIN, "--version"], { encoding: "utf-8" }).trim();
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("-v is an alias for --version", () => {
    const output = execFileSync("node", [BIN, "-v"], { encoding: "utf-8" }).trim();
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("--version matches package.json version", () => {
    const version = execFileSync("node", [BIN, "--version"], { encoding: "utf-8" }).trim();
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
    expect(version).toBe(pkg.version);
  });
});
