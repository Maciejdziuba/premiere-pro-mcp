import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";
import {
  buildLumetriExtendScriptHelpers,
  collectLumetriAdjustments,
  extendScriptLiteral,
  LUMETRI_CONTROL_PARAMETERS,
  LumetriControlArgs,
} from "./lumetri-helpers.js";

export function getEffectsTools(bridgeOptions: BridgeOptions) {
  return {
    apply_effect: {
      description: "Apply a video effect to a clip. Uses QE DOM for effect lookup.",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip to apply the effect to",
          },
          effect_name: {
            type: "string",
            description: "Name of the effect (e.g., 'Gaussian Blur', 'Lumetri Color')",
          },
        },
        required: ["node_id", "effect_name"],
      },
      handler: async (args: { node_id: string; effect_name: string }) => {
        const script = buildToolScript(`
          app.enableQE();
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");

          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");

          // Find the effect in QE
          var effectName = "${escapeForExtendScript(args.effect_name)}";
          var qeTrack = result.trackType === "video"
            ? qeSeq.getVideoTrackAt(result.trackIndex)
            : qeSeq.getAudioTrackAt(result.trackIndex);

          if (!qeTrack) return __error("QE track not found");

          var qeClip = qeTrack.getItemAt(result.clipIndex);
          if (!qeClip) return __error("QE clip not found");

          // Search for the effect
          var effects = qe.project.getVideoEffectList();
          var found = false;
          for (var i = 0; i < effects.numItems; i++) {
            if (effects[i].name === effectName) {
              qeClip.addVideoEffect(effects[i]);
              found = true;
              break;
            }
          }

          if (!found) return __error("Effect not found: " + effectName);
          return __result({ applied: true, effect: effectName, clipName: result.clip.name });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    apply_audio_effect: {
      description: "Apply an audio effect to a clip",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          effect_name: {
            type: "string",
            description: "Name of the audio effect",
          },
        },
        required: ["node_id", "effect_name"],
      },
      handler: async (args: { node_id: string; effect_name: string }) => {
        const script = buildToolScript(`
          app.enableQE();
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");

          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var effectName = "${escapeForExtendScript(args.effect_name)}";
          var qeTrack = qeSeq.getAudioTrackAt(result.trackIndex);
          if (!qeTrack) return __error("QE audio track not found");

          var qeClip = qeTrack.getItemAt(result.clipIndex);
          if (!qeClip) return __error("QE clip not found");

          var effects = qe.project.getAudioEffectList();
          var found = false;
          for (var i = 0; i < effects.numItems; i++) {
            if (effects[i].name === effectName) {
              qeClip.addAudioEffect(effects[i]);
              found = true;
              break;
            }
          }

          if (!found) return __error("Audio effect not found: " + effectName);
          return __result({ applied: true, effect: effectName });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    remove_effect: {
      description: "Remove an effect from a clip by its index or name",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          effect_index: {
            type: "number",
            description: "Index of the effect to remove (0-based). Use get_clip_properties to see effects list.",
          },
          effect_name: {
            type: "string",
            description: "Name of the effect to remove (alternative to effect_index)",
          },
        },
        required: ["node_id"],
      },
      handler: async (args: { node_id: string; effect_index?: number; effect_name?: string }) => {
        const script = buildToolScript(`
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var clip = result.clip;
          ${args.effect_index !== undefined ? `
          if (${args.effect_index} >= clip.components.numItems) return __error("Effect index out of range");
          var effectName = clip.components[${args.effect_index}].displayName;
          clip.components[${args.effect_index}].remove();
          return __result({ removed: true, effect: effectName });
          ` : `
          var effectName = "${escapeForExtendScript(args.effect_name || "")}";
          var found = false;
          for (var i = clip.components.numItems - 1; i >= 0; i--) {
            if (clip.components[i].displayName === effectName) {
              clip.components[i].remove();
              found = true;
              break;
            }
          }
          if (!found) return __error("Effect not found: " + effectName);
          return __result({ removed: true, effect: effectName });
          `}
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    list_available_effects: {
      description: "List all available video effects in Premiere Pro. Uses QE DOM.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          app.enableQE();
          var effects = qe.project.getVideoEffectList();
          var list = [];
          for (var i = 0; i < effects.numItems; i++) {
            list.push({ name: effects[i].name, index: i });
          }
          return __result(list);
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    list_available_audio_effects: {
      description: "List all available audio effects in Premiere Pro. Uses QE DOM.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          app.enableQE();
          var effects = qe.project.getAudioEffectList();
          var list = [];
          for (var i = 0; i < effects.numItems; i++) {
            list.push({ name: effects[i].name, index: i });
          }
          return __result(list);
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    color_correct: {
      description: "Apply Lumetri Color corrections to a clip using locale-resilient component/property lookup where Premiere exposes the properties",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          ...LUMETRI_CONTROL_PARAMETERS,
          fail_on_missing: {
            type: "boolean",
            description: "Return an error when a requested Lumetri property is unavailable (default: true). Set false to skip unsupported optional controls.",
          },
        },
        required: ["node_id"],
      },
      handler: async (args: LumetriControlArgs & {
        node_id: string;
        fail_on_missing?: boolean;
      }) => {
        const adjustments = collectLumetriAdjustments(args);
        const script = buildToolScript(`
          ${buildLumetriExtendScriptHelpers()}

          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var values = ${extendScriptLiteral(adjustments)};
          var applyResult = __mcpApplyLumetriValues(
            result,
            values,
            ${args.fail_on_missing === false ? "false" : "true"},
            true
          );
          if (!applyResult.ok) return __error(applyResult.error);

          return __result({
            colorCorrected: true,
            clipName: result.clip.name,
            appliedLumetri: applyResult.appliedLumetri,
            changes: applyResult.changes,
            skipped: applyResult.skipped,
            liveValidationNeeded: applyResult.liveValidationNeeded
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    apply_lut: {
      description: "Apply an input or Creative LUT file to a clip via Lumetri Color using locale-resilient lookup where Premiere exposes the LUT property",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          lut_path: {
            type: "string",
            description: "Full path to the .cube or .3dl LUT file",
          },
          lut_slot: {
            type: "string",
            enum: ["input", "creative"],
            description: "Lumetri LUT slot to set: input/Input LUT or creative/Look (default: input)",
          },
        },
        required: ["node_id", "lut_path"],
      },
      handler: async (args: { node_id: string; lut_path: string; lut_slot?: string }) => {
        const propertyKey = args.lut_slot === "creative" ? "creative_lut" : "input_lut";
        const script = buildToolScript(`
          ${buildLumetriExtendScriptHelpers()}

          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var values = {};
          values["${propertyKey}"] = "${escapeForExtendScript(args.lut_path)}";
          var applyResult = __mcpApplyLumetriValues(result, values, true, true);
          if (!applyResult.ok) return __error(applyResult.error);

          return __result({
            lutApplied: true,
            clipName: result.clip.name,
            lutPath: "${escapeForExtendScript(args.lut_path)}",
            lutSlot: "${args.lut_slot === "creative" ? "creative" : "input"}",
            appliedLumetri: applyResult.appliedLumetri,
            changes: applyResult.changes,
            liveValidationNeeded: applyResult.liveValidationNeeded
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    batch_color_correct: {
      description: "Apply the same Lumetri Color corrections to selected clips, a video track, explicit node IDs, or all video clips",
      parameters: {
        type: "object" as const,
        properties: {
          target: {
            type: "string",
            enum: ["selected", "track", "node_ids", "all"],
            description: "Which video clips to color correct",
          },
          node_ids: {
            type: "array",
            description: "Clip node IDs to target when target is node_ids",
          },
          track_index: {
            type: "number",
            description: "Video track index when target is track (0-based, default: 0)",
          },
          ...LUMETRI_CONTROL_PARAMETERS,
          fail_on_missing: {
            type: "boolean",
            description: "Return an error when a requested Lumetri property is unavailable on any target clip (default: true). Set false to skip unsupported optional controls.",
          },
        },
        required: ["target"],
      },
      handler: async (args: LumetriControlArgs & {
        target: string;
        node_ids?: string[];
        track_index?: number;
        fail_on_missing?: boolean;
      }) => {
        const adjustments = collectLumetriAdjustments(args);
        const target = args.target || "selected";
        const trackIndex = args.track_index ?? 0;
        const nodeIds = Array.isArray(args.node_ids) ? args.node_ids : [];

        const script = buildToolScript(`
          ${buildLumetriExtendScriptHelpers()}

          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");

          var target = "${escapeForExtendScript(target)}";
          var nodeIds = ${extendScriptLiteral(nodeIds)};
          var targets = [];

          function addVideoTarget(clip, trackIndex, clipIndex) {
            targets.push({
              clip: clip,
              trackIndex: trackIndex,
              clipIndex: clipIndex,
              trackType: "video"
            });
          }

          if (target === "node_ids") {
            if (!nodeIds || nodeIds.length === 0) return __error("node_ids must include at least one clip when target is node_ids");
            for (var n = 0; n < nodeIds.length; n++) {
              var found = __findClip(String(nodeIds[n]));
              if (!found) return __error("Clip not found: " + nodeIds[n]);
              if (found.trackType !== "video") return __error("Lumetri Color can only be applied to video clips: " + nodeIds[n]);
              targets.push(found);
            }
          } else if (target === "track") {
            if (${trackIndex} >= seq.videoTracks.numTracks) return __error("Video track index out of range");
            var track = seq.videoTracks[${trackIndex}];
            for (var c = 0; c < track.clips.numItems; c++) {
              addVideoTarget(track.clips[c], ${trackIndex}, c);
            }
          } else if (target === "all") {
            for (var t = 0; t < seq.videoTracks.numTracks; t++) {
              var videoTrack = seq.videoTracks[t];
              for (var vc = 0; vc < videoTrack.clips.numItems; vc++) {
                addVideoTarget(videoTrack.clips[vc], t, vc);
              }
            }
          } else if (target === "selected") {
            for (var st = 0; st < seq.videoTracks.numTracks; st++) {
              var selectedTrack = seq.videoTracks[st];
              for (var sc = 0; sc < selectedTrack.clips.numItems; sc++) {
                var selectedClip = selectedTrack.clips[sc];
                try {
                  if (selectedClip.isSelected()) addVideoTarget(selectedClip, st, sc);
                } catch(e) {}
              }
            }
          } else {
            return __error("Unsupported batch color target: " + target);
          }

          if (targets.length === 0) return __error("No video clips matched batch color target: " + target);

          var values = ${extendScriptLiteral(adjustments)};
          var details = [];
          for (var i = 0; i < targets.length; i++) {
            var applyResult = __mcpApplyLumetriValues(
              targets[i],
              values,
              ${args.fail_on_missing === false ? "false" : "true"},
              true
            );
            if (!applyResult.ok) {
              return __error("Failed to apply Lumetri values to clip " + targets[i].clip.name + ": " + applyResult.error);
            }
            details.push({
              nodeId: targets[i].clip.nodeId,
              clipName: targets[i].clip.name,
              trackIndex: targets[i].trackIndex,
              changes: applyResult.changes,
              skipped: applyResult.skipped,
              appliedLumetri: applyResult.appliedLumetri
            });
          }

          return __result({
            colorCorrected: details.length,
            target: target,
            changes: values,
            clips: details,
            liveValidationNeeded: __MCP_LUMETRI_LIVE_VALIDATION_NOTE
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    stabilize_clip: {
      description: "Apply the Warp Stabilizer effect to a clip for video stabilization. Uses QE DOM.",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip to stabilize",
          },
          smoothness: {
            type: "number",
            description: "Stabilization smoothness percentage (default: 50). Higher = smoother but more cropping.",
          },
          method: {
            type: "string",
            enum: ["Subspace Warp", "Position", "Position, Scale, Rotation"],
            description: "Stabilization method (default: 'Subspace Warp')",
          },
        },
        required: ["node_id"],
      },
      handler: async (args: { node_id: string; smoothness?: number; method?: string }) => {
        const script = buildToolScript(`
          app.enableQE();
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");

          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");

          var qeTrack = result.trackType === "video"
            ? qeSeq.getVideoTrackAt(result.trackIndex)
            : null;
          if (!qeTrack) return __error("Warp Stabilizer can only be applied to video clips");

          var qeClip = qeTrack.getItemAt(result.clipIndex);
          if (!qeClip) return __error("QE clip not found");

          // Find and apply Warp Stabilizer
          var effects = qe.project.getVideoEffectList();
          var found = false;
          for (var i = 0; i < effects.numItems; i++) {
            if (effects[i].name === "Warp Stabilizer") {
              qeClip.addVideoEffect(effects[i]);
              found = true;
              break;
            }
          }

          if (!found) return __error("Warp Stabilizer effect not found");

          // Set properties if specified
          var clip = result.clip;
          var changes = { stabilized: true };
          ${args.smoothness !== undefined || args.method !== undefined ? `
          for (var i = 0; i < clip.components.numItems; i++) {
            var comp = clip.components[i];
            if (comp.displayName === "Warp Stabilizer") {
              for (var p = 0; p < comp.properties.numItems; p++) {
                var prop = comp.properties[p];
                ${args.smoothness !== undefined ? `
                if (prop.displayName === "Smoothness") {
                  prop.setValue(${args.smoothness}, true);
                  changes.smoothness = ${args.smoothness};
                }` : ""}
                ${args.method !== undefined ? `
                if (prop.displayName === "Method") {
                  prop.setValue("${escapeForExtendScript(args.method)}", true);
                  changes.method = "${escapeForExtendScript(args.method)}";
                }` : ""}
              }
              break;
            }
          }
          ` : ""}

          return __result({ clipName: clip.name, info: "Warp Stabilizer applied. Analysis will begin automatically.", changes: changes });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
