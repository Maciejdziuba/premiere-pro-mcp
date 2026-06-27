import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";

type AudioKeyframe = { time_seconds: number; level_db: number };

const COMMON_AUDIO_EFFECT_ALIASES: Record<string, string[]> = {
  parametric_equalizer: ["Parametric Equalizer"],
  dynamics: ["Dynamics"],
  hard_limiter: ["Hard Limiter"],
  multiband_compressor: ["Multiband Compressor"],
  denoise: ["DeNoise", "Denoise"],
  dereverb: ["DeReverb", "Dereverb"],
  deesser: ["DeEsser", "De-Esser", "De Esser"],
};

const AUDIO_EXTENDSCRIPT_HELPERS = `
function __mcpAudioName(item) {
  if (!item) return null;
  try { if (item.displayName !== undefined && item.displayName !== null) return String(item.displayName); } catch(e) {}
  try { if (item.name !== undefined && item.name !== null) return String(item.name); } catch(e) {}
  try { if (item.matchName !== undefined && item.matchName !== null) return String(item.matchName); } catch(e) {}
  return null;
}

function __mcpNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Array && value.length > 0) value = value[0];
  var numberValue = parseFloat(value);
  if (isNaN(numberValue)) return null;
  return numberValue;
}

function __mcpReadPropertyValue(prop) {
  var value = null;
  try { value = prop.getValue(); } catch(e) {}
  if (value === null || value === undefined) {
    try { value = prop.getValue(0, 0); } catch(e2) {}
  }
  return value;
}

function __mcpFindAudioLevel(clip) {
  var volumeComp = __findVolumeComponent(clip);
  if (!volumeComp) return { component: null, property: null };
  var levelProp = __findKnownProperty(volumeComp, "volume", "level");
  return { component: volumeComp, property: levelProp };
}

function __mcpFindAudioPan(clip) {
  var pannerComp = __findComponent(
    clip,
    ["audioPanner", "audioPan", "ADBE Audio Pan", "ADBE Audio Balance"],
    ["Panner", "Pan", "Balance"]
  );
  if (!pannerComp) return { component: null, property: null };
  var panProp = __findPropertyDeep(
    pannerComp,
    ["audioPan", "ADBE Audio Pan", "ADBE Audio Balance"],
    ["Pan", "Balance"],
    8
  );
  return { component: pannerComp, property: panProp };
}

function __mcpEnableAudioKeyframes(prop) {
  try {
    if (prop.areKeyframesSupported && !prop.areKeyframesSupported()) {
      return false;
    }
  } catch(e) {}
  try {
    if (prop.isTimeVarying && !prop.isTimeVarying()) {
      prop.setTimeVarying(true);
    } else {
      prop.setTimeVarying(true);
    }
  } catch(e2) {
    try { prop.setTimeVarying(true); } catch(e3) {}
  }
  return true;
}

function __mcpAddAudioLevelKey(levelProp, timeSeconds, levelDb) {
  if (timeSeconds < 0) timeSeconds = 0;
  var time = new Time();
  time.ticks = __secondsToTicks(timeSeconds).toString();
  try { levelProp.addKey(time); } catch(e) {}
  levelProp.setValueAtKey(time, levelDb, true);
}

function __mcpReadAudioLevelInfo(levelProp, includeKeyframes) {
  var currentLevel = __mcpNumberOrNull(__mcpReadPropertyValue(levelProp));
  var maxLevel = currentLevel;
  var minLevel = currentLevel;
  var keyframes = [];
  var isTimeVarying = false;

  try { isTimeVarying = levelProp.isTimeVarying(); } catch(e) {}
  if (includeKeyframes && isTimeVarying) {
    try {
      var keys = levelProp.getKeys();
      if (keys) {
        for (var k = 0; k < keys.length; k++) {
          var keyTime = keys[k];
          var keyValue = null;
          try { keyValue = __mcpNumberOrNull(levelProp.getValueAtKey(keyTime)); } catch(e2) {}
          keyframes.push({
            timeSeconds: __ticksToSeconds(keyTime.ticks),
            levelDb: keyValue
          });
          if (keyValue !== null) {
            if (maxLevel === null || keyValue > maxLevel) maxLevel = keyValue;
            if (minLevel === null || keyValue < minLevel) minLevel = keyValue;
          }
        }
      }
    } catch(e3) {}
  }

  return {
    currentLevelDb: currentLevel,
    maxTimelineLevelDb: maxLevel,
    minTimelineLevelDb: minLevel,
    isTimeVarying: isTimeVarying,
    keyframes: keyframes
  };
}
`;

function escapeStringArray(values: string[]) {
  return `[${values.map((value) => `"${escapeForExtendScript(value)}"`).join(", ")}]`;
}

function numberArrayLiteral(values: number[]) {
  return `[${values.map((value) => String(value)).join(", ")}]`;
}

function failure(error: string) {
  return { success: false, error };
}

export function getAudioTools(bridgeOptions: BridgeOptions) {
  return {
    adjust_audio_levels: {
      description: "Adjust the audio Volume/Level property of a clip in dB",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the audio or video clip",
          },
          level_db: {
            type: "number",
            description: "Audio level in dB (0 = unity, negative = quieter, positive = louder)",
          },
        },
        required: ["node_id", "level_db"],
      },
      handler: async (args: { node_id: string; level_db: number }) => {
        const script = buildToolScript(`
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var clip = result.clip;
          var lookup = __mcpFindAudioLevel(clip);
          if (!lookup.component) return __error("Could not find Volume component on clip");
          if (!lookup.property) return __error("Could not find Volume/Level property on clip");

          lookup.property.setValue(${args.level_db}, true);
          return __result({
            adjusted: true,
            clipName: clip.name,
            levelDb: ${args.level_db},
            component: __mcpAudioName(lookup.component),
            property: __mcpAudioName(lookup.property)
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    offset_audio_gain: {
      description: "Apply a gain-style offset by adding dB to the clip Volume/Level property; Premiere's Audio Gain command is not exposed through ExtendScript",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the audio clip",
          },
          gain_db: {
            type: "number",
            description: "Gain offset in dB to add to the current Volume/Level value",
          },
        },
        required: ["node_id", "gain_db"],
      },
      handler: async (args: { node_id: string; gain_db: number }) => {
        const script = buildToolScript(`
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var clip = result.clip;
          var lookup = __mcpFindAudioLevel(clip);
          if (!lookup.component) return __error("Could not find Volume component on clip");
          if (!lookup.property) return __error("Could not find Volume/Level property on clip");

          var currentLevel = __mcpNumberOrNull(__mcpReadPropertyValue(lookup.property));
          if (currentLevel === null) return __error("Could not read current Volume/Level value; cannot apply a relative gain offset safely");

          var newLevel = currentLevel + ${args.gain_db};
          lookup.property.setValue(newLevel, true);

          return __result({
            adjusted: true,
            clipName: clip.name,
            previousLevelDb: currentLevel,
            gainOffsetDb: ${args.gain_db},
            levelDb: newLevel,
            implementation: "Volume/Level offset, not Premiere Audio Gain"
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    set_audio_pan: {
      description: "Set an audio clip pan or balance property when Premiere exposes a Panner component",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the audio clip",
          },
          pan: {
            type: "number",
            description: "Pan value (-100 = full left, 0 = center, 100 = full right)",
          },
        },
        required: ["node_id", "pan"],
      },
      handler: async (args: { node_id: string; pan: number }) => {
        const script = buildToolScript(`
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          if (${args.pan} < -100 || ${args.pan} > 100) return __error("pan must be between -100 and 100");

          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var clip = result.clip;
          var lookup = __mcpFindAudioPan(clip);
          if (!lookup.component) return __error("Could not find Panner component on clip; this Premiere version or clip channel layout may not expose clip pan");
          if (!lookup.property) return __error("Could not find Pan/Balance property on clip");

          lookup.property.setValue(${args.pan}, true);
          return __result({
            panned: true,
            clipName: clip.name,
            pan: ${args.pan},
            component: __mcpAudioName(lookup.component),
            property: __mcpAudioName(lookup.property),
            liveValidationNeeded: true
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    add_audio_keyframes: {
      description: "Add audio level keyframes to create fades or level changes",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          keyframes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time_seconds: { type: "number", description: "Time in seconds relative to clip start" },
                level_db: { type: "number", description: "Audio level in dB" },
              },
              required: ["time_seconds", "level_db"],
            },
            description: "Array of keyframe objects with time_seconds and level_db",
          },
        },
        required: ["node_id", "keyframes"],
      },
      handler: async (args: { node_id: string; keyframes: AudioKeyframe[] }) => {
        if (!Array.isArray(args.keyframes) || args.keyframes.length === 0) {
          return failure("keyframes must contain at least one keyframe");
        }

        const keyframeCode = args.keyframes
          .map((kf) => `__mcpAddAudioLevelKey(levelProp, ${kf.time_seconds}, ${kf.level_db});`)
          .join("\n");

        const script = buildToolScript(`
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var clip = result.clip;
          var lookup = __mcpFindAudioLevel(clip);
          if (!lookup.component) return __error("Could not find Volume component on clip");
          if (!lookup.property) return __error("Could not find audio Level property");

          var levelProp = lookup.property;
          if (!__mcpEnableAudioKeyframes(levelProp)) return __error("Audio Level property does not support keyframes");
          ${keyframeCode}

          return __result({
            keyframesAdded: ${args.keyframes.length},
            clipName: clip.name,
            property: __mcpAudioName(levelProp),
            timeBasis: "clip-relative seconds; live validation recommended across Premiere versions"
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    add_audio_fade: {
      description: "Create clip fade-in, fade-out, or both by adding Volume/Level keyframes",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the audio clip",
          },
          fade_type: {
            type: "string",
            enum: ["in", "out", "both"],
            description: "Which fade to add",
          },
          duration_seconds: {
            type: "number",
            description: "Fade duration in seconds",
          },
          silent_level_db: {
            type: "number",
            description: "Level for silence at the fade edge (default: -96)",
          },
          target_level_db: {
            type: "number",
            description: "Level after fade-in or before fade-out (default: 0)",
          },
        },
        required: ["node_id", "fade_type", "duration_seconds"],
      },
      handler: async (args: {
        node_id: string;
        fade_type: string;
        duration_seconds: number;
        silent_level_db?: number;
        target_level_db?: number;
      }) => {
        if (!["in", "out", "both"].includes(args.fade_type)) {
          return failure("fade_type must be one of: in, out, both");
        }
        if (!Number.isFinite(args.duration_seconds) || args.duration_seconds <= 0) {
          return failure("duration_seconds must be greater than 0");
        }

        const silentLevel = args.silent_level_db ?? -96;
        const targetLevel = args.target_level_db ?? 0;

        const script = buildToolScript(`
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");

          var clip = result.clip;
          var clipDuration = __ticksToSeconds(clip.duration.ticks);
          if (clipDuration <= 0) return __error("Clip has no measurable duration");

          var lookup = __mcpFindAudioLevel(clip);
          if (!lookup.component) return __error("Could not find Volume component on clip");
          if (!lookup.property) return __error("Could not find audio Level property");

          var levelProp = lookup.property;
          if (!__mcpEnableAudioKeyframes(levelProp)) return __error("Audio Level property does not support keyframes");

          var fadeType = "${escapeForExtendScript(args.fade_type)}";
          var requestedDuration = ${args.duration_seconds};
          var fadeDuration = requestedDuration;
          var capped = false;
          if (fadeType === "both" && fadeDuration * 2 > clipDuration) {
            fadeDuration = clipDuration / 2;
            capped = true;
          } else if (fadeDuration > clipDuration) {
            fadeDuration = clipDuration;
            capped = true;
          }

          var keyframes = [];
          function addFadeKey(timeSeconds, levelDb) {
            __mcpAddAudioLevelKey(levelProp, timeSeconds, levelDb);
            keyframes.push({ timeSeconds: timeSeconds, levelDb: levelDb });
          }

          if (fadeType === "in" || fadeType === "both") {
            addFadeKey(0, ${silentLevel});
            addFadeKey(fadeDuration, ${targetLevel});
          }
          if (fadeType === "out" || fadeType === "both") {
            var fadeOutStart = clipDuration - fadeDuration;
            if (fadeOutStart < 0) fadeOutStart = 0;
            addFadeKey(fadeOutStart, ${targetLevel});
            addFadeKey(clipDuration, ${silentLevel});
          }

          return __result({
            faded: true,
            clipName: clip.name,
            fadeType: fadeType,
            requestedDurationSeconds: requestedDuration,
            appliedDurationSeconds: fadeDuration,
            durationCapped: capped,
            keyframes: keyframes,
            timeBasis: "clip-relative seconds; live validation recommended across Premiere versions"
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    apply_common_audio_effect: {
      description: "Apply a common audio effect to an audio track clip via QE DOM effect lookup",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the audio clip",
          },
          effect: {
            type: "string",
            enum: Object.keys(COMMON_AUDIO_EFFECT_ALIASES),
            description: "Common audio effect key to apply",
          },
          effect_name_override: {
            type: "string",
            description: "Optional localized Premiere effect name to try before built-in aliases",
          },
        },
        required: ["node_id", "effect"],
      },
      handler: async (args: { node_id: string; effect: string; effect_name_override?: string }) => {
        const aliases = COMMON_AUDIO_EFFECT_ALIASES[args.effect];
        if (!aliases) {
          return failure(`Unknown common audio effect: ${args.effect}`);
        }

        const localizedAliases = args.effect_name_override
          ? [args.effect_name_override, ...aliases]
          : aliases;

        const script = buildToolScript(`
          app.enableQE();
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");

          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");
          if (result.trackType !== "audio") return __error("Audio effects must be applied to an audio track clip; re-query and pass the audio clip node_id");

          var effectQE = __findAudioEffect(${escapeStringArray(aliases)}, ${escapeStringArray(localizedAliases)});
          if (!effectQE) return __error("Audio effect not found for common effect '${escapeForExtendScript(args.effect)}'. Use list_available_audio_effects to inspect names for this Premiere installation.");

          var qeTrack = qeSeq.getAudioTrackAt(result.trackIndex);
          if (!qeTrack) return __error("QE audio track not found");
          var qeClip = qeTrack.getItemAt(result.clipIndex);
          if (!qeClip) return __error("QE clip not found");

          qeClip.addAudioEffect(effectQE);
          return __result({
            applied: true,
            effectKey: "${escapeForExtendScript(args.effect)}",
            effectName: __mcpAudioName(effectQE),
            clipName: result.clip.name,
            liveValidationNeeded: true
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    add_audio_transition: {
      description: "Add an audio transition at a cut point on an audio track. Uses QE DOM.",
      parameters: {
        type: "object" as const,
        properties: {
          transition_name: {
            type: "string",
            description: "Audio transition name (default: Constant Power)",
          },
          track_index: {
            type: "number",
            description: "Audio track index (0-based)",
          },
          cut_point_seconds: {
            type: "number",
            description: "Time position in seconds of the cut point",
          },
          duration_seconds: {
            type: "number",
            description: "Duration of the transition in seconds (default: 1.0)",
          },
        },
        required: ["track_index", "cut_point_seconds"],
      },
      handler: async (args: {
        transition_name?: string;
        track_index: number;
        cut_point_seconds: number;
        duration_seconds?: number;
      }) => {
        const transitionName = args.transition_name || "Constant Power";
        const duration = args.duration_seconds ?? 1.0;

        const script = buildToolScript(`
          app.enableQE();
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");

          var qeTrack = qeSeq.getAudioTrackAt(${args.track_index});
          if (!qeTrack) return __error("QE audio track not found");

          var transitionName = "${escapeForExtendScript(transitionName)}";
          var transitionQE = __findAudioTransition([transitionName], [transitionName]);
          if (!transitionQE) return __error("Audio transition not found: " + transitionName);

          var cutTicks = __secondsToTicks(${args.cut_point_seconds}).toString();
          var durationTicks = __secondsToTicks(${duration}).toString();
          qeTrack.addTransition(transitionQE, true, cutTicks, durationTicks, "0", false);

          return __result({
            added: true,
            transition: __mcpAudioName(transitionQE) || transitionName,
            trackIndex: ${args.track_index},
            atSeconds: ${args.cut_point_seconds},
            durationSeconds: ${duration},
            liveValidationNeeded: true
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    diagnose_audio_clipping_and_normalization: {
      description: "Read timeline Volume/Level settings and report clipping or normalization limits; raw sample peak analysis is not exposed by ExtendScript",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Optional clip node ID. If omitted, all audio-track clips in the active sequence are scanned.",
          },
          warning_level_db: {
            type: "number",
            description: "Timeline level threshold that should be flagged as clipping risk (default: 0)",
          },
          target_peak_db: {
            type: "number",
            description: "Target ceiling used for suggested timeline trims (default: -1)",
          },
          include_keyframes: {
            type: "boolean",
            description: "Include audio level keyframes when estimating max timeline level (default: true)",
          },
        },
      },
      handler: async (args: {
        node_id?: string;
        warning_level_db?: number;
        target_peak_db?: number;
        include_keyframes?: boolean;
      }) => {
        const nodeIdCode = args.node_id
          ? `"${escapeForExtendScript(args.node_id)}"`
          : "null";
        const warningLevel = args.warning_level_db ?? 0;
        const targetPeak = args.target_peak_db ?? -1;
        const includeKeyframes = args.include_keyframes !== false;

        const script = buildToolScript(`
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var nodeId = ${nodeIdCode};
          var warningLevelDb = ${warningLevel};
          var targetPeakDb = ${targetPeak};
          var includeKeyframes = ${includeKeyframes};
          var items = [];
          var unsupported = [
            "Raw sample peak analysis is not exposed through Premiere ExtendScript.",
            "True peak, LUFS, and destructive normalization cannot be computed safely by this tool.",
            "Use Premiere audio meters, Essential Sound, or external audio analysis for final clipping/normalization decisions."
          ];

          function analyzeClip(clip, trackIndex, clipIndex, trackName) {
            var item = {
              nodeId: clip.nodeId,
              name: clip.name,
              trackIndex: trackIndex,
              clipIndex: clipIndex,
              trackName: trackName,
              startSeconds: __ticksToSeconds(clip.start.ticks),
              endSeconds: __ticksToSeconds(clip.end.ticks),
              durationSeconds: __ticksToSeconds(clip.duration.ticks),
              rawPeakAnalysisSupported: false,
              destructiveNormalizationSupported: false,
              warnings: []
            };

            var lookup = __mcpFindAudioLevel(clip);
            if (!lookup.component || !lookup.property) {
              item.audioLevelReadable = false;
              item.warnings.push("Volume/Level property not exposed on this clip");
              items.push(item);
              return;
            }

            var levelInfo = __mcpReadAudioLevelInfo(lookup.property, includeKeyframes);
            item.audioLevelReadable = true;
            item.component = __mcpAudioName(lookup.component);
            item.property = __mcpAudioName(lookup.property);
            item.currentLevelDb = levelInfo.currentLevelDb;
            item.maxTimelineLevelDb = levelInfo.maxTimelineLevelDb;
            item.minTimelineLevelDb = levelInfo.minTimelineLevelDb;
            item.isTimeVarying = levelInfo.isTimeVarying;
            item.keyframes = levelInfo.keyframes;

            if (levelInfo.maxTimelineLevelDb !== null && levelInfo.maxTimelineLevelDb >= warningLevelDb) {
              item.clippingRisk = "timeline_level_at_or_above_threshold";
              item.suggestedTrimToTargetDb = targetPeakDb - levelInfo.maxTimelineLevelDb;
              item.warnings.push("Timeline Volume/Level reaches " + levelInfo.maxTimelineLevelDb + " dB; source waveform peaks are unknown");
            } else {
              item.clippingRisk = "not_detected_from_timeline_level";
              item.suggestedTrimToTargetDb = null;
            }

            items.push(item);
          }

          if (nodeId) {
            var found = __findClip(nodeId);
            if (!found) return __error("Clip not found");
            analyzeClip(found.clip, found.trackIndex, found.clipIndex, found.trackType);
          } else {
            var seq = app.project.activeSequence;
            if (!seq) return __error("No active sequence");
            for (var t = 0; t < seq.audioTracks.numTracks; t++) {
              var track = seq.audioTracks[t];
              for (var c = 0; c < track.clips.numItems; c++) {
                analyzeClip(track.clips[c], t, c, track.name);
              }
            }
          }

          return __result({
            readOnly: true,
            warningLevelDb: warningLevelDb,
            targetPeakDb: targetPeakDb,
            includeKeyframes: includeKeyframes,
            analysisScope: nodeId ? "clip" : "active sequence audio tracks",
            analysisType: "timeline Volume/Level metadata only",
            rawPeakAnalysisSupported: false,
            destructiveNormalizationSupported: false,
            unsupported: unsupported,
            items: items,
            liveValidationNeeded: true
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    duck_audio_under_voiceover: {
      description: "Add Volume/Level keyframes to lower target audio tracks under voiceover clips",
      parameters: {
        type: "object" as const,
        properties: {
          voice_track_index: {
            type: "number",
            description: "Audio track index containing voiceover clips",
          },
          target_track_indices: {
            type: "array",
            items: { type: "number" },
            description: "Audio track indices to duck. If omitted, all audio tracks except the voice track are used.",
          },
          duck_db: {
            type: "number",
            description: "Level to use while ducked (default: -18)",
          },
          restore_db: {
            type: "number",
            description: "Level to restore before and after ducked regions (default: 0)",
          },
          fade_seconds: {
            type: "number",
            description: "Ramp duration before and after each voiceover region (default: 0.25)",
          },
          margin_seconds: {
            type: "number",
            description: "Extra time before and after voiceover clips to include in ducking (default: 0)",
          },
          selected_voice_clips_only: {
            type: "boolean",
            description: "Only use selected clips on the voice track as ducking triggers (default: false)",
          },
        },
        required: ["voice_track_index"],
      },
      handler: async (args: {
        voice_track_index: number;
        target_track_indices?: number[];
        duck_db?: number;
        restore_db?: number;
        fade_seconds?: number;
        margin_seconds?: number;
        selected_voice_clips_only?: boolean;
      }) => {
        if (!Number.isFinite(args.voice_track_index)) {
          return failure("voice_track_index is required");
        }
        if (args.target_track_indices !== undefined) {
          if (!Array.isArray(args.target_track_indices) || args.target_track_indices.length === 0) {
            return failure("target_track_indices must contain at least one track index when provided");
          }
          for (const trackIndex of args.target_track_indices) {
            if (!Number.isFinite(trackIndex)) {
              return failure("target_track_indices must contain only numbers");
            }
          }
        }

        const targetIndices = args.target_track_indices
          ? numberArrayLiteral(args.target_track_indices)
          : "null";
        const duckDb = args.duck_db ?? -18;
        const restoreDb = args.restore_db ?? 0;
        const fadeSeconds = args.fade_seconds ?? 0.25;
        const marginSeconds = args.margin_seconds ?? 0;
        const selectedOnly = args.selected_voice_clips_only === true;

        const script = buildToolScript(`
          ${AUDIO_EXTENDSCRIPT_HELPERS}
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");

          var voiceTrackIndex = ${args.voice_track_index};
          if (voiceTrackIndex < 0 || voiceTrackIndex >= seq.audioTracks.numTracks) return __error("voice_track_index out of range");

          var targetIndices = ${targetIndices};
          var duckDb = ${duckDb};
          var restoreDb = ${restoreDb};
          var fadeSeconds = ${fadeSeconds};
          var marginSeconds = ${marginSeconds};
          var selectedOnly = ${selectedOnly};
          if (fadeSeconds < 0) return __error("fade_seconds must be >= 0");
          if (marginSeconds < 0) return __error("margin_seconds must be >= 0");

          function shouldDuckTrack(trackIndex) {
            if (trackIndex === voiceTrackIndex) return false;
            if (!targetIndices) return true;
            for (var i = 0; i < targetIndices.length; i++) {
              if (targetIndices[i] === trackIndex) return true;
            }
            return false;
          }

          var voiceTrack = seq.audioTracks[voiceTrackIndex];
          var voiceSegments = [];
          for (var vc = 0; vc < voiceTrack.clips.numItems; vc++) {
            var voiceClip = voiceTrack.clips[vc];
            if (selectedOnly) {
              var isSelected = false;
              try { isSelected = voiceClip.isSelected(); } catch(e) {}
              if (!isSelected) continue;
            }
            var startSeconds = __ticksToSeconds(voiceClip.start.ticks) - marginSeconds;
            var endSeconds = __ticksToSeconds(voiceClip.end.ticks) + marginSeconds;
            if (startSeconds < 0) startSeconds = 0;
            if (endSeconds <= startSeconds) continue;

            if (voiceSegments.length > 0 && startSeconds <= voiceSegments[voiceSegments.length - 1].endSeconds) {
              if (endSeconds > voiceSegments[voiceSegments.length - 1].endSeconds) {
                voiceSegments[voiceSegments.length - 1].endSeconds = endSeconds;
              }
            } else {
              voiceSegments.push({ startSeconds: startSeconds, endSeconds: endSeconds });
            }
          }

          if (voiceSegments.length === 0) {
            return __error(selectedOnly ? "No selected voiceover clips found on voice track" : "No voiceover clips found on voice track");
          }

          var duckedClips = 0;
          var keyframesAdded = 0;
          var affected = [];
          var skipped = [];

          for (var t = 0; t < seq.audioTracks.numTracks; t++) {
            if (!shouldDuckTrack(t)) continue;
            var track = seq.audioTracks[t];
            try {
              if (track.isLocked && track.isLocked()) {
                skipped.push({ trackIndex: t, reason: "track locked" });
                continue;
              }
            } catch(e) {}

            for (var c = 0; c < track.clips.numItems; c++) {
              var clip = track.clips[c];
              var clipStart = __ticksToSeconds(clip.start.ticks);
              var clipEnd = __ticksToSeconds(clip.end.ticks);
              var clipDuration = __ticksToSeconds(clip.duration.ticks);
              var lookup = __mcpFindAudioLevel(clip);
              if (!lookup.component || !lookup.property) {
                skipped.push({ trackIndex: t, clipIndex: c, clipName: clip.name, reason: "Volume/Level property not exposed" });
                continue;
              }

              var clipWasAffected = false;
              for (var s = 0; s < voiceSegments.length; s++) {
                var seg = voiceSegments[s];
                var overlapStart = Math.max(seg.startSeconds, clipStart);
                var overlapEnd = Math.min(seg.endSeconds, clipEnd);
                if (overlapEnd <= overlapStart) continue;

                if (!__mcpEnableAudioKeyframes(lookup.property)) {
                  skipped.push({ trackIndex: t, clipIndex: c, clipName: clip.name, reason: "Audio Level property does not support keyframes" });
                  continue;
                }

                var localIn = overlapStart - clipStart;
                var localOut = overlapEnd - clipStart;
                var pre = localIn - fadeSeconds;
                var post = localOut + fadeSeconds;
                if (pre < 0) pre = 0;
                if (post > clipDuration) post = clipDuration;

                __mcpAddAudioLevelKey(lookup.property, pre, restoreDb);
                __mcpAddAudioLevelKey(lookup.property, localIn, duckDb);
                __mcpAddAudioLevelKey(lookup.property, localOut, duckDb);
                __mcpAddAudioLevelKey(lookup.property, post, restoreDb);
                keyframesAdded += 4;
                clipWasAffected = true;
              }

              if (clipWasAffected) {
                duckedClips++;
                affected.push({ trackIndex: t, clipIndex: c, clipName: clip.name });
              }
            }
          }

          return __result({
            ducked: true,
            voiceTrackIndex: voiceTrackIndex,
            targetTrackIndices: targetIndices,
            duckDb: duckDb,
            restoreDb: restoreDb,
            fadeSeconds: fadeSeconds,
            marginSeconds: marginSeconds,
            voiceSegments: voiceSegments,
            duckedClips: duckedClips,
            keyframesAdded: keyframesAdded,
            affected: affected,
            skipped: skipped,
            timeBasis: "clip-relative seconds; live validation recommended across Premiere versions",
            liveValidationNeeded: true
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    mute_track: {
      description: "Mute or unmute an audio track",
      parameters: {
        type: "object" as const,
        properties: {
          track_index: {
            type: "number",
            description: "Audio track index (0-based)",
          },
          muted: {
            type: "boolean",
            description: "True to mute, false to unmute",
          },
        },
        required: ["track_index", "muted"],
      },
      handler: async (args: { track_index: number; muted: boolean }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");

          if (${args.track_index} >= seq.audioTracks.numTracks) return __error("Track index out of range");

          var track = seq.audioTracks[${args.track_index}];
          track.setMute(${args.muted ? 1 : 0});

          return __result({ trackIndex: ${args.track_index}, muted: ${args.muted}, trackName: track.name });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
