#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { cleanupTempDir, getTempDir } from "./bridge/file-bridge.js";
import { UxpBridge } from "./bridge/uxp-bridge.js";
import { execFileSync, execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Handle CLI flags
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
premiere-pro-mcp — MCP server for Adobe Premiere Pro (302 tools)

Usage:
  premiere-pro-mcp              Start the MCP server (stdio transport)
  premiere-pro-mcp --install-cep   Install the CEP plugin into Premiere Pro
  premiere-pro-mcp --install-uxp   Print UXP Developer Tool loading steps
  premiere-pro-mcp --help          Show this help message
  premiere-pro-mcp --version       Show version

Environment variables:
  PREMIERE_TEMP_DIR     Shared temp directory (default: OS temp + /premiere-mcp-bridge)
  PREMIERE_TIMEOUT_MS   Command timeout in ms (default: 30000)
  PREMIERE_UXP_BRIDGE_ENABLED  Set true/1 to start the localhost UXP sidecar bridge
  PREMIERE_UXP_BRIDGE_PORT     UXP sidecar port when enabled (default: 17777)

More info: https://github.com/ppmcp/premiere-pro-mcp
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  const pkg = await import("../package.json", { with: { type: "json" } }).catch(
    () => ({ default: { version: "unknown" } })
  );
  console.log(pkg.default.version);
  process.exit(0);
}

if (args.includes("--install-cep")) {
  const scriptPath = path.join(projectRoot, "scripts", "install-cep.sh");
  console.log("Installing CEP plugin...\n");
  try {
    execSync(`bash "${scriptPath}"`, { stdio: "inherit", cwd: projectRoot });
  } catch {
    console.error("CEP installation failed. Try running manually:");
    console.error(`  bash "${scriptPath}"`);
    process.exit(1);
  }
  process.exit(0);
}

if (args.includes("--install-uxp")) {
  const scriptPath = path.join(projectRoot, "scripts", "install-uxp.sh");
  const scriptArgs = args.filter((arg) => arg !== "--install-uxp");
  console.log("Preparing UXP panel loading instructions...\n");
  try {
    execFileSync("bash", [scriptPath, ...scriptArgs], { stdio: "inherit", cwd: projectRoot });
  } catch {
    console.error("UXP loading helper failed. Try running manually:");
    console.error(`  bash "${scriptPath}"`);
    process.exit(1);
  }
  process.exit(0);
}

function envFlag(name: string): boolean {
  const value = process.env[name]?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envPositiveInt(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function main() {
  const bridgeOptions = {
    tempDir: process.env.PREMIERE_TEMP_DIR,
    timeoutMs: envPositiveInt("PREMIERE_TIMEOUT_MS"),
  };

  const tempDir = getTempDir(bridgeOptions);
  console.error(`[premiere-pro-mcp] Starting MCP server...`);
  console.error(`[premiere-pro-mcp] Temp directory: ${tempDir}`);

  // Clean up any stale files from previous sessions
  cleanupTempDir(bridgeOptions);

  const uxpBridge = new UxpBridge({
    enabled: envFlag("PREMIERE_UXP_BRIDGE_ENABLED"),
    host: process.env.PREMIERE_UXP_BRIDGE_HOST,
    port: envPositiveInt("PREMIERE_UXP_BRIDGE_PORT"),
    pollTimeoutMs: envPositiveInt("PREMIERE_UXP_POLL_TIMEOUT_MS"),
    commandTimeoutMs: envPositiveInt("PREMIERE_UXP_COMMAND_TIMEOUT_MS"),
  });
  const uxpStatus = await uxpBridge.start();
  if (uxpStatus.running) {
    console.error(`[premiere-pro-mcp] UXP bridge listening at ${uxpStatus.url}`);
  } else {
    console.error("[premiere-pro-mcp] UXP bridge disabled");
  }

  const server = createServer(bridgeOptions, { uxpBridge });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(`[premiere-pro-mcp] Server connected and ready`);

  const shutdown = async () => {
    await uxpBridge.shutdown();
    await server.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => {
    shutdown().catch(() => process.exit(1));
  });
  process.on("SIGINT", () => {
    shutdown().catch(() => process.exit(1));
  });
}

main().catch((err) => {
  console.error("[premiere-pro-mcp] Fatal error:", err);
  process.exit(1);
});
