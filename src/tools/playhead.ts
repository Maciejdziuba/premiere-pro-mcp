import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";

export function getPlayheadTools(bridgeOptions: BridgeOptions) {
  return {
    get_playhead_position: {
      description: "Get the current playhead (CTI) position in the active sequence",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var ticks = seq.getPlayerPosition().ticks;
          return __result({
            seconds: __ticksToSeconds(ticks),
            ticks: ticks
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    set_playhead_position: {
      description: "Set the playhead (CTI) position in the active sequence",
      parameters: {
        type: "object" as const,
        properties: {
          time_seconds: {
            type: "number",
            description: "Time position in seconds to move the playhead to",
          },
        },
        required: ["time_seconds"],
      },
      handler: async (args: { time_seconds: number }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var ticks = __secondsToTicks(${args.time_seconds}).toString();
          seq.setPlayerPosition(ticks);
          
          return __result({ positionSeconds: ${args.time_seconds} });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    set_work_area: {
      description: "Set the work area (bar) in and out points using seconds",
      parameters: {
        type: "object" as const,
        properties: {
          in_seconds: {
            type: "number",
            description: "Work area in-point in seconds",
          },
          out_seconds: {
            type: "number",
            description: "Work area out-point in seconds",
          },
        },
        required: ["in_seconds", "out_seconds"],
      },
      handler: async (args: { in_seconds: number; out_seconds: number }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.setWorkAreaInPoint !== "function" || typeof seq.setWorkAreaOutPoint !== "function") {
            return __error("Sequence work area setters are not available in this Premiere ExtendScript runtime");
          }
          
          seq.setWorkAreaInPoint(${args.in_seconds});
          seq.setWorkAreaOutPoint(${args.out_seconds});
          
          return __result({ workAreaIn: ${args.in_seconds}, workAreaOut: ${args.out_seconds} });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    get_work_area: {
      description: "Get the current work area in and out points",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.getWorkAreaInPoint !== "function" || typeof seq.getWorkAreaOutPoint !== "function") {
            return __error("Sequence work area getters are not available in this Premiere ExtendScript runtime");
          }
          
          return __result({
            inSeconds: parseFloat(seq.getWorkAreaInPoint()),
            outSeconds: parseFloat(seq.getWorkAreaOutPoint())
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    set_sequence_in_out_points: {
      description: "Set the sequence in and out points in seconds (for export range, etc.)",
      parameters: {
        type: "object" as const,
        properties: {
          in_seconds: {
            type: "number",
            description: "In-point in seconds",
          },
          out_seconds: {
            type: "number",
            description: "Out-point in seconds",
          },
        },
        required: ["in_seconds", "out_seconds"],
      },
      handler: async (args: { in_seconds: number; out_seconds: number }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.setInPoint !== "function" || typeof seq.setOutPoint !== "function") {
            return __error("Sequence in/out setters are not available in this Premiere ExtendScript runtime");
          }
          
          seq.setInPoint(${args.in_seconds});
          seq.setOutPoint(${args.out_seconds});
          
          return __result({ inSeconds: ${args.in_seconds}, outSeconds: ${args.out_seconds} });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    get_sequence_in_out_points: {
      description: "Get the current sequence in and out points",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.getInPoint !== "function" || typeof seq.getOutPoint !== "function") {
            return __error("Sequence in/out getters are not available in this Premiere ExtendScript runtime");
          }
          
          return __result({
            inSeconds: parseFloat(seq.getInPoint()),
            outSeconds: parseFloat(seq.getOutPoint())
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
