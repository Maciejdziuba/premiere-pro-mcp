import { buildToolScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";

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
          fork: "Maciejdziuba/premiere-pro-mcp",
          forkUrl: "https://github.com/Maciejdziuba/premiere-pro-mcp",
          upstream: "leancoderkavy/premiere-pro-mcp",
          upstreamUrl: "https://github.com/leancoderkavy/premiere-pro-mcp",
          requiresPremiere: false,
          requiresCepBridge: false,
        },
      }),
    },

    ping: {
      description: "Health check — verify the CEP plugin is running and connected to Premiere Pro. Call this before other tools to confirm connectivity.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var version = app.version;
          var projectName = app.project && app.project.name ? app.project.name : "No project open";
          var activeSeq = app.project && app.project.activeSequence ? app.project.activeSequence.name : "None";
          return __result({
            connected: true,
            premiereVersion: version,
            projectName: projectName,
            activeSequence: activeSeq
          });
        `);
        return sendCommand(script, { ...bridgeOptions, timeoutMs: 5000 });
      },
    },
  };
}
