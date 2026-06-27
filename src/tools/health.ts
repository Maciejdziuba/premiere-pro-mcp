import { buildToolScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions, getTempDir } from "../bridge/file-bridge.js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_BRIDGE_FILE_SAMPLES = 10;

interface PackageInfo {
  name: string;
  version: string;
}

let cachedPackageInfo: PackageInfo | null = null;

function getPackageInfo(): PackageInfo {
  if (cachedPackageInfo) return cachedPackageInfo;

  try {
    const packageUrl = new URL("../../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(packageUrl, "utf-8")) as Partial<PackageInfo>;
    cachedPackageInfo = {
      name: pkg.name || "premiere-pro-mcp",
      version: pkg.version || "unknown",
    };
  } catch {
    cachedPackageInfo = {
      name: "premiere-pro-mcp",
      version: "unknown",
    };
  }

  return cachedPackageInfo;
}

function getEffectiveTimeoutMs(bridgeOptions: BridgeOptions): number {
  if (typeof bridgeOptions.timeoutMs === "number" && Number.isFinite(bridgeOptions.timeoutMs)) {
    return bridgeOptions.timeoutMs;
  }

  const envTimeout = process.env.PREMIERE_TIMEOUT_MS;
  if (envTimeout) {
    const parsed = Number.parseInt(envTimeout, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_TIMEOUT_MS;
}

function inspectBridgeDirectory(tempDir: string) {
  if (!existsSync(tempDir)) {
    return {
      exists: false,
      commandFiles: 0,
      responseFiles: 0,
      otherFiles: 0,
      bridgeFiles: [],
    };
  }

  const now = Date.now();
  const files = readdirSync(tempDir);
  let commandFiles = 0;
  let responseFiles = 0;
  let otherFiles = 0;
  const bridgeFiles: Array<{
    name: string;
    kind: "command" | "response";
    ageSeconds: number | null;
    sizeBytes: number | null;
  }> = [];

  for (const file of files) {
    const isCommand = file.startsWith("cmd_");
    const isResponse = file.startsWith("res_");

    if (!isCommand && !isResponse) {
      otherFiles++;
      continue;
    }

    if (isCommand) commandFiles++;
    if (isResponse) responseFiles++;

    if (bridgeFiles.length >= MAX_BRIDGE_FILE_SAMPLES) continue;

    try {
      const stats = statSync(join(tempDir, file));
      bridgeFiles.push({
        name: file,
        kind: isCommand ? "command" : "response",
        ageSeconds: Math.max(0, Math.round((now - stats.mtimeMs) / 1000)),
        sizeBytes: stats.size,
      });
    } catch {
      bridgeFiles.push({
        name: file,
        kind: isCommand ? "command" : "response",
        ageSeconds: null,
        sizeBytes: null,
      });
    }
  }

  return {
    exists: true,
    commandFiles,
    responseFiles,
    otherFiles,
    bridgeFiles,
  };
}

export function getHealthTools(bridgeOptions: BridgeOptions) {
  return {
    fork_ping: {
      description: "Fork-local health check that does not contact Premiere Pro. Returns static fork and repo information.",
      parameters: {},
      handler: async () => ({
        success: true,
        data: {
          ok: true,
          message: "fork_ping succeeded",
          package: "premiere-pro-mcp",
          packageVersion: getPackageInfo().version,
          fork: "Maciejdziuba/premiere-pro-mcp",
          forkUrl: "https://github.com/Maciejdziuba/premiere-pro-mcp",
          upstream: "leancoderkavy/premiere-pro-mcp",
          upstreamUrl: "https://github.com/leancoderkavy/premiere-pro-mcp",
          requiresPremiere: false,
          requiresCepBridge: false,
        },
      }),
    },

    bridge_diagnostics: {
      description: "Read-only local diagnostics for the file bridge: temp directory, pending command/response files, package version, Node runtime, and configured timeouts. Does not contact Premiere Pro.",
      parameters: {},
      handler: async () => {
        const tempDir = getTempDir(bridgeOptions);
        const packageInfo = getPackageInfo();
        const directory = inspectBridgeDirectory(tempDir);
        const warnings: string[] = [];

        if (!directory.exists) {
          warnings.push("Bridge temp directory does not exist yet. This is expected before the first command is sent.");
        }
        if (directory.commandFiles > 0 || directory.responseFiles > 0) {
          warnings.push("Bridge temp directory contains pending cmd_/res_ files. If Premiere is idle, run cleanupTempDir or restart the bridge.");
        }
        if (process.env.PREMIERE_TIMEOUT_MS) {
          const parsed = Number.parseInt(process.env.PREMIERE_TIMEOUT_MS, 10);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            warnings.push("PREMIERE_TIMEOUT_MS is set but is not a positive integer.");
          }
        }

        return {
          success: true,
          data: {
            ok: warnings.length === 0,
            readOnly: true,
            package: packageInfo.name,
            packageVersion: packageInfo.version,
            bridge: {
              tempDir,
              timeoutMs: getEffectiveTimeoutMs(bridgeOptions),
              tempDirExists: directory.exists,
              pendingCommandFiles: directory.commandFiles,
              pendingResponseFiles: directory.responseFiles,
              otherFiles: directory.otherFiles,
              bridgeFileSamples: directory.bridgeFiles,
              sampleLimit: MAX_BRIDGE_FILE_SAMPLES,
            },
            environment: {
              nodeVersion: process.version,
              platform: process.platform,
              arch: process.arch,
              cwd: process.cwd(),
              premiereTempDirEnvSet: Boolean(process.env.PREMIERE_TEMP_DIR),
              premiereTimeoutMsEnv: process.env.PREMIERE_TIMEOUT_MS || null,
            },
            warnings,
            requiresPremiere: false,
            requiresCepBridge: false,
          },
        };
      },
    },

    ping: {
      description: "Health check — verify the CEP plugin is running and connected to Premiere Pro. Returns version, locale, project, and active sequence metadata.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var info = {
            connected: true,
            readOnly: true
          };
          try { info.premiereVersion = app.version; } catch(e) {}
          try { info.premiereBuild = app.build; } catch(e) {}
          try { info.appName = app.name; } catch(e) {}
          try { info.locale = $.locale; } catch(e) {}
          try { info.os = $.os; } catch(e) {}
          try { info.extendScriptVersion = $.version; } catch(e) {}
          try { info.projectName = app.project && app.project.name ? app.project.name : "No project open"; } catch(e) {}
          try { info.projectPath = app.project && app.project.path ? app.project.path : ""; } catch(e) {}
          try { info.sequenceCount = app.project && app.project.sequences ? app.project.sequences.numSequences : 0; } catch(e) {}
          try { info.activeSequence = app.project && app.project.activeSequence ? app.project.activeSequence.name : "None"; } catch(e) {}
          try { info.hasEnableQE = typeof app.enableQE === "function"; } catch(e) {}
          return __result(info);
        `);
        return sendCommand(script, { ...bridgeOptions, timeoutMs: 5000 });
      },
    },

    get_premiere_runtime_diagnostics: {
      description: "Read-only Premiere runtime diagnostics for live validation: app version/build, ExtendScript locale/OS, BridgeTalk identifiers, project state, sequence state, and QE availability without enabling QE.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var collectedAt;
          try {
            var d = new Date();
            collectedAt = d.toISOString ? d.toISOString() : d.toString();
          } catch(e) {
            collectedAt = "";
          }

          var info = {
            connected: true,
            readOnly: true,
            collectedAt: collectedAt
          };

          try { info.premiereVersion = app.version; } catch(e) { info.premiereVersionError = e.toString(); }
          try { info.premiereBuild = app.build; } catch(e) {}
          try { info.appName = app.name; } catch(e) {}
          try { info.appPath = app.path ? String(app.path) : ""; } catch(e) {}
          try { info.isoLanguage = app.isoLanguage; } catch(e) {}
          try { info.locale = $.locale; } catch(e) {}
          try { info.os = $.os; } catch(e) {}
          try { info.extendScriptVersion = $.version; } catch(e) {}
          try { info.engineName = $.engineName; } catch(e) {}

          try {
            if (typeof BridgeTalk !== "undefined") {
              info.bridgeTalk = {
                appName: BridgeTalk.appName,
                appSpecifier: BridgeTalk.appSpecifier,
                version: BridgeTalk.getSpecifier ? BridgeTalk.getSpecifier("premierepro") : ""
              };
            }
          } catch(e) {}

          try {
            info.qe = {
              globalAvailable: typeof qe !== "undefined",
              enableFunctionAvailable: typeof app.enableQE === "function",
              enabledByThisTool: false
            };
          } catch(e) {}

          try {
            info.project = {
              open: !!app.project,
              name: app.project && app.project.name ? app.project.name : "No project open",
              path: app.project && app.project.path ? app.project.path : "",
              sequenceCount: app.project && app.project.sequences ? app.project.sequences.numSequences : 0
            };
          } catch(e) {}

          try {
            if (app.project && app.project.activeSequence) {
              var seq = app.project.activeSequence;
              info.activeSequence = {
                name: seq.name,
                id: seq.sequenceID,
                width: seq.frameSizeHorizontal,
                height: seq.frameSizeVertical,
                durationSeconds: __ticksToSeconds(seq.end),
                videoTracks: seq.videoTracks ? seq.videoTracks.numTracks : 0,
                audioTracks: seq.audioTracks ? seq.audioTracks.numTracks : 0
              };
            } else {
              info.activeSequence = null;
            }
          } catch(e) {}

          try {
            info.capabilities = {
              hasSourceMonitor: !!app.sourceMonitor,
              hasEncoder: !!app.encoder,
              hasProjectManager: !!app.projectManager
            };
          } catch(e) {}

          return __result(info);
        `);
        return sendCommand(script, { ...bridgeOptions, timeoutMs: 5000 });
      },
    },
  };
}
