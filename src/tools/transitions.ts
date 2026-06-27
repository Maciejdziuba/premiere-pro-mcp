import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";

function toExtendScriptStringArray(values: string[]): string {
  return `[${values.map((value) => `"${escapeForExtendScript(value)}"`).join(", ")}]`;
}

function transitionLookupCode(args: {
  transition_name: string;
  transition_match_name?: string;
  localized_names?: string[];
}) {
  const matchNames = args.transition_match_name
    ? [args.transition_match_name]
    : [args.transition_name];
  const localizedNames =
    args.localized_names && args.localized_names.length > 0
      ? args.localized_names
      : [args.transition_name];

  return {
    matchNames: toExtendScriptStringArray(matchNames),
    localizedNames: toExtendScriptStringArray(localizedNames),
  };
}

export function getTransitionsTools(bridgeOptions: BridgeOptions) {
  return {
    find_transition: {
      description:
        "Look up a video or audio transition by matchName first, then localized display/name fallback. Uses QE DOM.",
      parameters: {
        type: "object" as const,
        properties: {
          transition_name: {
            type: "string",
            description: "Localized transition name fallback (e.g., 'Cross Dissolve')",
          },
          transition_match_name: {
            type: "string",
            description: "Stable transition matchName when known. Checked before localized names.",
          },
          localized_names: {
            type: "array",
            description:
              "Additional localized display/name fallbacks for non-English Premiere installations.",
          },
          transition_type: {
            type: "string",
            enum: ["video", "audio"],
            description: "Transition list to search (default: video)",
          },
        },
        required: ["transition_name"],
      },
      handler: async (args: {
        transition_name: string;
        transition_match_name?: string;
        localized_names?: string[];
        transition_type?: string;
      }) => {
        const transitionType = args.transition_type === "audio" ? "audio" : "video";
        const lookup = transitionLookupCode(args);
        const script = buildToolScript(`
          app.enableQE();
          if (typeof qe === "undefined" || !qe.project) return __error("QE project API not available");

          var matchNames = ${lookup.matchNames};
          var localizedNames = ${lookup.localizedNames};
          var transitionType = "${transitionType}";
          var transitionQE = transitionType === "audio"
            ? __findAudioTransition(matchNames, localizedNames)
            : __findVideoTransition(matchNames, localizedNames);

          if (!transitionQE) {
            return __error("Transition not found by matchName/name: ${escapeForExtendScript(args.transition_name)}");
          }

          return __result({
            found: true,
            transitionType: transitionType,
            requestedName: "${escapeForExtendScript(args.transition_name)}",
            name: transitionQE.name || null,
            displayName: transitionQE.displayName || null,
            matchName: transitionQE.matchName || null
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    add_transition: {
      description:
        "Add a video transition between two clips at a cut point. Uses QE DOM and matchName/name lookup.",
      parameters: {
        type: "object" as const,
        properties: {
          transition_name: {
            type: "string",
            description: "Name of the transition (e.g., 'Cross Dissolve', 'Dip to Black')",
          },
          transition_match_name: {
            type: "string",
            description: "Stable transition matchName when known. Checked before localized names.",
          },
          localized_names: {
            type: "array",
            description:
              "Additional localized display/name fallbacks for non-English Premiere installations.",
          },
          track_index: {
            type: "number",
            description: "Video track index (0-based)",
          },
          cut_point_seconds: {
            type: "number",
            description: "Time position in seconds of the cut point where the transition should be placed",
          },
          duration_seconds: {
            type: "number",
            description: "Duration of the transition in seconds (default: 1.0)",
          },
        },
        required: ["transition_name", "track_index", "cut_point_seconds"],
      },
      handler: async (args: {
        transition_name: string;
        transition_match_name?: string;
        localized_names?: string[];
        track_index: number;
        cut_point_seconds: number;
        duration_seconds?: number;
      }) => {
        const duration = args.duration_seconds ?? 1.0;
        const lookup = transitionLookupCode(args);
        const script = buildToolScript(`
          app.enableQE();
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");
          
          var qeTrack = qeSeq.getVideoTrackAt(${args.track_index});
          if (!qeTrack) return __error("Track not found");
          
          var transitionName = "${escapeForExtendScript(args.transition_name)}";
          var transitionQE = __findVideoTransition(${lookup.matchNames}, ${lookup.localizedNames});
          
          if (!transitionQE) return __error("Transition not found by matchName/name: " + transitionName);
          if (!qeTrack.addTransition) return __error("QE track addTransition API is not available in this Premiere runtime");
          
          var cutTicks = __secondsToTicks(${args.cut_point_seconds}).toString();
          var durationTicks = __secondsToTicks(${duration}).toString();
          
          qeTrack.addTransition(transitionQE, true, cutTicks, durationTicks, "0", false);
          
          return __result({
            added: true,
            transition: transitionName,
            resolvedTransition: transitionQE.name || transitionQE.displayName || transitionName,
            matchName: transitionQE.matchName || null,
            trackIndex: ${args.track_index},
            atSeconds: ${args.cut_point_seconds},
            durationSeconds: ${duration}
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    add_transition_to_clip: {
      description:
        "Add a video transition to a specific clip's start or end. Uses QE DOM and matchName/name lookup.",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          transition_name: {
            type: "string",
            description: "Name of the transition",
          },
          transition_match_name: {
            type: "string",
            description: "Stable transition matchName when known. Checked before localized names.",
          },
          localized_names: {
            type: "array",
            description:
              "Additional localized display/name fallbacks for non-English Premiere installations.",
          },
          position: {
            type: "string",
            enum: ["start", "end", "both"],
            description: "Where to apply the transition (default: end)",
          },
          duration_seconds: {
            type: "number",
            description: "Duration of the transition in seconds (default: 1.0)",
          },
        },
        required: ["node_id", "transition_name"],
      },
      handler: async (args: {
        node_id: string;
        transition_name: string;
        transition_match_name?: string;
        localized_names?: string[];
        position?: string;
        duration_seconds?: number;
      }) => {
        const position = args.position || "end";
        const duration = args.duration_seconds ?? 1.0;
        const lookup = transitionLookupCode(args);

        const script = buildToolScript(`
          app.enableQE();
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");
          
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");
          
          var transitionName = "${escapeForExtendScript(args.transition_name)}";
          var transitionQE = __findVideoTransition(${lookup.matchNames}, ${lookup.localizedNames});
          if (!transitionQE) return __error("Transition not found by matchName/name: " + transitionName);
          
          var qeTrack = qeSeq.getVideoTrackAt(result.trackIndex);
          if (!qeTrack) return __error("QE video track not found");
          if (!qeTrack.addTransition) return __error("QE track addTransition API is not available in this Premiere runtime");

          var durationTicks = __secondsToTicks(${duration}).toString();
          var clip = result.clip;
          var position = "${position}";
          
          if (position === "start" || position === "both") {
            var startTicks = clip.start.ticks;
            qeTrack.addTransition(transitionQE, true, startTicks, durationTicks, "0", false);
          }
          if (position === "end" || position === "both") {
            var endTicks = clip.end.ticks;
            qeTrack.addTransition(transitionQE, true, endTicks, durationTicks, "0", false);
          }
          
          return __result({
            added: true,
            transition: transitionName,
            resolvedTransition: transitionQE.name || transitionQE.displayName || transitionName,
            matchName: transitionQE.matchName || null,
            clipName: clip.name,
            position: position,
            durationSeconds: ${duration}
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    batch_add_transitions: {
      description:
        "Add the same video transition to cut points on a track, with optional time range and dry-run reporting. Uses QE DOM.",
      parameters: {
        type: "object" as const,
        properties: {
          transition_name: {
            type: "string",
            description: "Name of the transition (e.g., 'Cross Dissolve')",
          },
          transition_match_name: {
            type: "string",
            description: "Stable transition matchName when known. Checked before localized names.",
          },
          localized_names: {
            type: "array",
            description:
              "Additional localized display/name fallbacks for non-English Premiere installations.",
          },
          track_index: {
            type: "number",
            description: "Video track index (0-based, default: 0)",
          },
          duration_seconds: {
            type: "number",
            description: "Duration of each transition in seconds (default: 1.0)",
          },
          start_seconds: {
            type: "number",
            description: "Only consider cuts at or after this time in seconds.",
          },
          end_seconds: {
            type: "number",
            description: "Only consider cuts at or before this time in seconds.",
          },
          max_cuts: {
            type: "number",
            description: "Maximum number of cut points to process.",
          },
          dry_run: {
            type: "boolean",
            description: "Report matching cut points without applying transitions.",
          },
        },
        required: ["transition_name"],
      },
      handler: async (args: {
        transition_name: string;
        transition_match_name?: string;
        localized_names?: string[];
        track_index?: number;
        duration_seconds?: number;
        start_seconds?: number;
        end_seconds?: number;
        max_cuts?: number;
        dry_run?: boolean;
      }) => {
        const trackIndex = args.track_index ?? 0;
        const duration = args.duration_seconds ?? 1.0;
        const lookup = transitionLookupCode(args);
        const startTicks = args.start_seconds !== undefined
          ? `__secondsToTicks(${args.start_seconds})`
          : "null";
        const endTicks = args.end_seconds !== undefined
          ? `__secondsToTicks(${args.end_seconds})`
          : "null";
        const maxCuts = args.max_cuts !== undefined ? args.max_cuts : "null";

        const script = buildToolScript(`
          app.enableQE();
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");
          
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var transitionName = "${escapeForExtendScript(args.transition_name)}";
          var transitionQE = __findVideoTransition(${lookup.matchNames}, ${lookup.localizedNames});
          if (!transitionQE) return __error("Transition not found by matchName/name: " + transitionName);
          
          var track = seq.videoTracks[${trackIndex}];
          if (!track) return __error("Video track not found: ${trackIndex}");

          var qeTrack = qeSeq.getVideoTrackAt(${trackIndex});
          if (!qeTrack) return __error("QE video track not found: ${trackIndex}");
          if (!qeTrack.addTransition) return __error("QE track addTransition API is not available in this Premiere runtime");

          var durationTicks = __secondsToTicks(${duration}).toString();
          var count = 0;
          var attempted = 0;
          var failures = [];
          var cuts = [];
          var startTicks = ${startTicks};
          var endTicks = ${endTicks};
          var maxCuts = ${maxCuts};
          var dryRun = ${args.dry_run ? "true" : "false"};
          
          // Add transition at each adjacent cut point on the selected video track.
          for (var c = 0; c < track.clips.numItems - 1; c++) {
            var leftClip = track.clips[c];
            var rightClip = track.clips[c + 1];
            var cutTicksNumber = parseFloat(leftClip.end.ticks);
            if (startTicks !== null && cutTicksNumber < startTicks) continue;
            if (endTicks !== null && cutTicksNumber > endTicks) continue;
            if (leftClip.end.ticks !== rightClip.start.ticks) continue;
            if (maxCuts !== null && attempted >= maxCuts) break;

            attempted++;
            var cutTicks = leftClip.end.ticks;
            var cutInfo = {
              index: c,
              atSeconds: __ticksToSeconds(cutTicks),
              leftClipName: leftClip.name,
              rightClipName: rightClip.name
            };
            cuts.push(cutInfo);

            if (dryRun) continue;

            try {
              qeTrack.addTransition(transitionQE, true, cutTicks, durationTicks, "0", false);
              count++;
              cutInfo.added = true;
            } catch(e) {
              cutInfo.added = false;
              cutInfo.error = e.toString();
              failures.push(cutInfo);
            }
          }
          
          return __result({
            added: count,
            attempted: attempted,
            dryRun: dryRun,
            transition: transitionName,
            resolvedTransition: transitionQE.name || transitionQE.displayName || transitionName,
            matchName: transitionQE.matchName || null,
            trackIndex: ${trackIndex},
            durationSeconds: ${duration},
            cuts: cuts,
            failures: failures
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    list_available_transitions: {
      description: "List all available video transitions with exposed name/matchName details. Uses QE DOM.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          app.enableQE();
          if (typeof qe === "undefined" || !qe.project || !qe.project.getVideoTransitionList) {
            return __error("QE video transition list API is not available in this Premiere runtime");
          }
          var transitions = qe.project.getVideoTransitionList();
          var list = [];
          for (var i = 0; i < transitions.numItems; i++) {
            list.push({
              name: transitions[i].name || null,
              displayName: transitions[i].displayName || null,
              matchName: transitions[i].matchName || null,
              index: i
            });
          }
          return __result(list);
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    list_available_audio_transitions: {
      description: "List all available audio transitions with exposed name/matchName details. Uses QE DOM.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          app.enableQE();
          if (typeof qe === "undefined" || !qe.project || !qe.project.getAudioTransitionList) {
            return __error("QE audio transition list API is not available in this Premiere runtime");
          }
          var transitions = qe.project.getAudioTransitionList();
          var list = [];
          for (var i = 0; i < transitions.numItems; i++) {
            list.push({
              name: transitions[i].name || null,
              displayName: transitions[i].displayName || null,
              matchName: transitions[i].matchName || null,
              index: i
            });
          }
          return __result(list);
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
