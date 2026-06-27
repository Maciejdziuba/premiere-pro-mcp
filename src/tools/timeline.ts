import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";

const TIMELINE_SAFETY_HELPERS = `
function __timelineTrackIsLocked(track) {
  try { return track.isLocked() === true || track.isLocked() === 1; } catch(e) {}
  return false;
}

function __timelineTrackName(track) {
  try { if (track.name) return track.name; } catch(e) {}
  return "";
}

function __timelineCollectRangeOverlaps(track, trackType, trackIndex, startTicks, endTicks, ignoreNodeId) {
  var overlaps = [];
  if (!track || endTicks <= startTicks) return overlaps;

  for (var c = 0; c < track.clips.numItems; c++) {
    var clip = track.clips[c];
    if (ignoreNodeId && clip.nodeId === ignoreNodeId) continue;

    var clipStart = parseFloat(clip.start.ticks);
    var clipEnd = parseFloat(clip.end.ticks);
    if (clipStart < endTicks && clipEnd > startTicks) {
      overlaps.push({
        nodeId: clip.nodeId,
        name: clip.name,
        trackType: trackType,
        trackIndex: trackIndex,
        clipIndex: c,
        startSeconds: __ticksToSeconds(clip.start.ticks),
        endSeconds: __ticksToSeconds(clip.end.ticks)
      });
    }
  }

  return overlaps;
}

function __timelineProjectItemDurationTicks(item) {
  var inTicks = null;
  var outTicks = null;
  try { inTicks = parseFloat(item.getInPoint().ticks); } catch(e) {}
  try { outTicks = parseFloat(item.getOutPoint().ticks); } catch(e) {}
  if (!isNaN(inTicks) && !isNaN(outTicks) && outTicks > inTicks) return outTicks - inTicks;

  try {
    var durationTicks = parseFloat(item.getDuration().ticks);
    if (!isNaN(durationTicks) && durationTicks > 0) return durationTicks;
  } catch(e) {}

  try {
    var itemDurationTicks = parseFloat(item.duration.ticks);
    if (!isNaN(itemDurationTicks) && itemDurationTicks > 0) return itemDurationTicks;
  } catch(e) {}

  return 0;
}
`;

export function getTimelineTools(bridgeOptions: BridgeOptions) {
  return {
    add_to_timeline: {
      description: "Add a project item (clip) to the timeline at a specific position, with optional dry-run and empty-range safety checks",
      parameters: {
        type: "object" as const,
        properties: {
          item_id: {
            type: "string",
            description: "Node ID or name of the project item to add",
          },
          track_index: {
            type: "number",
            description: "Video track index (0-based, default: 0)",
          },
          start_seconds: {
            type: "number",
            description: "Start time in seconds on the timeline (default: 0)",
          },
          audio_track_index: {
            type: "number",
            description: "Audio track index for the audio portion (default: 0)",
          },
          duration_seconds: {
            type: "number",
            description: "Expected timeline duration for safety checks. If omitted, the tool tries to read the project item duration.",
          },
          require_empty_range: {
            type: "boolean",
            description: "If true, fail before inserting when the target video or audio range already contains clips. Default: false",
          },
          dry_run: {
            type: "boolean",
            description: "If true, return target track/range safety details without inserting the clip. Default: false",
          },
        },
        required: ["item_id"],
      },
      handler: async (args: {
        item_id: string;
        track_index?: number;
        start_seconds?: number;
        audio_track_index?: number;
        duration_seconds?: number;
        require_empty_range?: boolean;
        dry_run?: boolean;
      }) => {
        const trackIndex = args.track_index ?? 0;
        const startSeconds = args.start_seconds ?? 0;
        const audioTrackIndex = args.audio_track_index ?? 0;
        const durationTicksExpr = args.duration_seconds !== undefined
          ? `__secondsToTicks(${args.duration_seconds})`
          : "__timelineProjectItemDurationTicks(item)";
        const requireEmptyRange = args.require_empty_range === true;
        const dryRun = args.dry_run === true;

        const script = buildToolScript(`
          ${TIMELINE_SAFETY_HELPERS}
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var item = __findProjectItem("${escapeForExtendScript(args.item_id)}");
          if (!item) return __error("Project item not found: ${escapeForExtendScript(args.item_id)}");

          if (${trackIndex} < 0 || ${trackIndex} >= seq.videoTracks.numTracks) return __error("Video track index out of range");
          if (${audioTrackIndex} < 0 || ${audioTrackIndex} >= seq.audioTracks.numTracks) return __error("Audio track index out of range");

          var videoTrack = seq.videoTracks[${trackIndex}];
          var audioTrack = seq.audioTracks[${audioTrackIndex}];
          if (__timelineTrackIsLocked(videoTrack)) return __error("Target video track is locked");
          if (__timelineTrackIsLocked(audioTrack)) return __error("Target audio track is locked");
          
          var startTicks = __secondsToTicks(${startSeconds}).toString();
          var durationTicks = ${durationTicksExpr};
          var rangeChecked = durationTicks > 0;
          var endTicks = parseFloat(startTicks) + durationTicks;
          var videoOverlaps = [];
          var audioOverlaps = [];
          var warnings = [];
          if (rangeChecked) {
            videoOverlaps = __timelineCollectRangeOverlaps(videoTrack, "video", ${trackIndex}, parseFloat(startTicks), endTicks, null);
            audioOverlaps = __timelineCollectRangeOverlaps(audioTrack, "audio", ${audioTrackIndex}, parseFloat(startTicks), endTicks, null);
          } else {
            warnings.push("Could not determine source duration; provide duration_seconds for overlap preflight.");
          }

          var totalOverlaps = videoOverlaps.length + audioOverlaps.length;
          var requireEmptyRange = ${requireEmptyRange ? "true" : "false"};
          var dryRun = ${dryRun ? "true" : "false"};
          if (requireEmptyRange && !rangeChecked) return __error("duration_seconds is required when require_empty_range is true and source duration cannot be read");
          if (requireEmptyRange && totalOverlaps > 0) return __error("Target range is not empty; found " + totalOverlaps + " overlapping clip(s)");

          if (!dryRun) {
            seq.insertClip(item, startTicks, ${trackIndex}, ${audioTrackIndex});
          }
          
          return __result({
            added: !dryRun,
            dryRun: dryRun,
            item: item.name,
            trackIndex: ${trackIndex},
            audioTrackIndex: ${audioTrackIndex},
            startSeconds: ${startSeconds},
            durationSeconds: rangeChecked ? __ticksToSeconds(durationTicks) : null,
            rangeChecked: rangeChecked,
            safeToPlace: totalOverlaps === 0,
            overlaps: {
              video: videoOverlaps,
              audio: audioOverlaps
            },
            targetTracks: {
              video: { index: ${trackIndex}, name: __timelineTrackName(videoTrack), locked: false },
              audio: { index: ${audioTrackIndex}, name: __timelineTrackName(audioTrack), locked: false }
            },
            warnings: warnings
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    remove_from_timeline: {
      description: "Remove a clip from the timeline",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip to remove",
          },
          ripple: {
            type: "boolean",
            description: "Whether to ripple delete (close the gap). Default: false",
          },
        },
        required: ["node_id"],
      },
      handler: async (args: { node_id: string; ripple?: boolean }) => {
        const script = buildToolScript(`
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");
          
          var clip = result.clip;
          clip.remove(${args.ripple ? "true" : "false"}, ${args.ripple ? "true" : "false"});
          return __result({ removed: true, clipName: clip.name });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    move_clip: {
      description: "Move a clip to a new position on the timeline",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip to move",
          },
          new_start_seconds: {
            type: "number",
            description: "New start time in seconds",
          },
          new_track_index: {
            type: "number",
            description: "Optional new track index to move the clip to",
          },
          require_empty_range: {
            type: "boolean",
            description: "If true, fail before moving when the destination range already contains another clip. Default: false",
          },
          dry_run: {
            type: "boolean",
            description: "If true, return destination safety details without moving the clip. Default: false",
          },
        },
        required: ["node_id", "new_start_seconds"],
      },
      handler: async (args: { node_id: string; new_start_seconds: number; new_track_index?: number; require_empty_range?: boolean; dry_run?: boolean }) => {
        const targetTrackExpr = args.new_track_index !== undefined ? `${args.new_track_index}` : "result.trackIndex";
        const requireEmptyRange = args.require_empty_range === true;
        const dryRun = args.dry_run === true;
        const script = buildToolScript(`
          ${TIMELINE_SAFETY_HELPERS}
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");
          
          var clip = result.clip;
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");

          var originalStartTicks = clip.start.ticks;
          var targetTrackIndex = ${targetTrackExpr};
          var targetTracks = result.trackType === "video" ? seq.videoTracks : seq.audioTracks;
          if (targetTrackIndex < 0 || targetTrackIndex >= targetTracks.numTracks) return __error("Target track index out of range");
          var targetTrack = targetTracks[targetTrackIndex];
          if (__timelineTrackIsLocked(targetTrack)) return __error("Target track is locked");
          if (targetTrackIndex !== result.trackIndex && !clip.moveToTrack) return __error("Clip track move API is unavailable in this Premiere version");

          var newStartTicks = __secondsToTicks(${args.new_start_seconds}).toString();
          var durationTicks = parseFloat(clip.duration.ticks);
          if (isNaN(durationTicks) || durationTicks <= 0) return __error("Could not determine clip duration for move preflight");
          var newEndTicks = parseFloat(newStartTicks) + durationTicks;
          var overlaps = __timelineCollectRangeOverlaps(targetTrack, result.trackType, targetTrackIndex, parseFloat(newStartTicks), newEndTicks, clip.nodeId);
          var requireEmptyRange = ${requireEmptyRange ? "true" : "false"};
          var dryRun = ${dryRun ? "true" : "false"};
          if (requireEmptyRange && overlaps.length > 0) return __error("Destination range is not empty; found " + overlaps.length + " overlapping clip(s)");

          if (!dryRun) {
            clip.start = newStartTicks;
            if (targetTrackIndex !== result.trackIndex && clip.moveToTrack) {
              clip.moveToTrack(targetTrack);
            }
          }
          
          return __result({
            moved: !dryRun,
            dryRun: dryRun,
            clipName: clip.name,
            from: {
              trackType: result.trackType,
              trackIndex: result.trackIndex,
              startSeconds: __ticksToSeconds(originalStartTicks)
            },
            proposed: {
              trackType: result.trackType,
              trackIndex: targetTrackIndex,
              startSeconds: ${args.new_start_seconds},
              endSeconds: __ticksToSeconds(newEndTicks)
            },
            safeToMove: overlaps.length === 0,
            overlaps: overlaps
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    trim_clip: {
      description: "Trim a clip's in or out point",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip to trim",
          },
          new_in_seconds: {
            type: "number",
            description: "New in-point in seconds (relative to clip's source media)",
          },
          new_out_seconds: {
            type: "number",
            description: "New out-point in seconds (relative to clip's source media)",
          },
        },
        required: ["node_id"],
      },
      handler: async (args: { node_id: string; new_in_seconds?: number; new_out_seconds?: number }) => {
        const script = buildToolScript(`
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");
          
          var clip = result.clip;
          ${args.new_in_seconds !== undefined ? `clip.inPoint = __secondsToTicks(${args.new_in_seconds}).toString();` : ""}
          ${args.new_out_seconds !== undefined ? `clip.outPoint = __secondsToTicks(${args.new_out_seconds}).toString();` : ""}
          
          return __result({
            trimmed: true,
            clipName: clip.name,
            inPoint: __ticksToSeconds(clip.inPoint.ticks),
            outPoint: __ticksToSeconds(clip.outPoint.ticks)
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    split_clip: {
      description: "Split (razor) a clip at a specific time position. Requires QE DOM.",
      parameters: {
        type: "object" as const,
        properties: {
          time_seconds: {
            type: "number",
            description: "Time position in seconds where to split",
          },
          track_index: {
            type: "number",
            description: "Track index (0-based)",
          },
          track_type: {
            type: "string",
            enum: ["video", "audio"],
            description: "Track type (default: video)",
          },
        },
        required: ["time_seconds"],
      },
      handler: async (args: { time_seconds: number; track_index?: number; track_type?: string }) => {
        const trackType = args.track_type || "video";
        const trackIndex = args.track_index ?? 0;

        const script = buildToolScript(`
          app.enableQE();
          var seq = qe.project.getActiveSequence();
          if (!seq) return __error("No active sequence (QE)");
          
          var track = ${trackType === "video" ? `seq.getVideoTrackAt(${trackIndex})` : `seq.getAudioTrackAt(${trackIndex})`};
          if (!track) return __error("Track not found");
          
          var timeTicks = __secondsToTicks(${args.time_seconds}).toString();
          track.razor(timeTicks);
          
          return __result({ split: true, atSeconds: ${args.time_seconds}, trackIndex: ${trackIndex}, trackType: "${trackType}" });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    duplicate_clip: {
      description: "Duplicate a clip on the timeline (copy to same position on next available track)",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip to duplicate",
          },
        },
        required: ["node_id"],
      },
      handler: async (args: { node_id: string }) => {
        const script = buildToolScript(`
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");
          
          var clip = result.clip;
          var seq = app.project.activeSequence;
          var projectItem = clip.projectItem;
          
          if (!projectItem) return __error("Cannot find source project item for clip");
          
          var newTrackIndex = result.trackIndex + 1;
          var startTicks = clip.start.ticks;
          
          seq.insertClip(projectItem, startTicks, newTrackIndex, newTrackIndex);
          
          return __result({ duplicated: true, clipName: clip.name, newTrackIndex: newTrackIndex });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    enable_disable_clip: {
      description: "Enable or disable a clip on the timeline",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          enabled: {
            type: "boolean",
            description: "Set to true to enable, false to disable",
          },
        },
        required: ["node_id", "enabled"],
      },
      handler: async (args: { node_id: string; enabled: boolean }) => {
        const script = buildToolScript(`
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");
          
          result.clip.setDisabled(${args.enabled ? "false" : "true"});
          return __result({ clipName: result.clip.name, enabled: ${args.enabled} });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    set_clip_properties: {
      description: "Set properties on a clip (opacity, speed, etc.)",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          opacity: {
            type: "number",
            description: "Opacity value (0-100)",
          },
          speed: {
            type: "number",
            description: "Playback speed multiplier (1.0 = normal, 2.0 = double speed)",
          },
          scale: {
            type: "number",
            description: "Scale percentage (100 = original size)",
          },
          position_x: {
            type: "number",
            description: "Horizontal position",
          },
          position_y: {
            type: "number",
            description: "Vertical position",
          },
          rotation: {
            type: "number",
            description: "Rotation in degrees",
          },
        },
        required: ["node_id"],
      },
      handler: async (args: {
        node_id: string;
        opacity?: number;
        speed?: number;
        scale?: number;
        position_x?: number;
        position_y?: number;
        rotation?: number;
      }) => {
        const script = buildToolScript(`
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");
          
          var clip = result.clip;
          var changes = {};
          var missingProperties = [];
          
          ${args.opacity !== undefined ? `
          var opacityComp = __findOpacityComponent(clip);
          var opacityProp = __findKnownProperty(opacityComp, "opacity", "opacity");
          if (opacityProp) {
            opacityProp.setValue(${args.opacity}, true);
            changes.opacity = ${args.opacity};
          } else {
            missingProperties.push("opacity");
          }
          ` : ""}
          
          ${args.speed !== undefined ? `
          clip.setSpeed(${args.speed * 100});
          changes.speed = ${args.speed};
          ` : ""}
          
          ${args.scale !== undefined || args.position_x !== undefined || args.position_y !== undefined || args.rotation !== undefined ? `
          var motionComp = __findMotionComponent(clip);
          if (!motionComp) {
            missingProperties.push("motion");
          } else {
            ${args.scale !== undefined ? `
            var scaleProp = __findKnownProperty(motionComp, "motion", "scale");
            if (scaleProp) {
              scaleProp.setValue(${args.scale}, true);
              changes.scale = ${args.scale};
            } else {
              missingProperties.push("scale");
            }` : ""}
            ${args.position_x !== undefined || args.position_y !== undefined ? `
            var positionProp = __findKnownProperty(motionComp, "motion", "position");
            if (positionProp) {
              var posVal = positionProp.getValue();
              var px = posVal && typeof posVal === "object" && posVal.length >= 2 ? posVal[0] : 0;
              var py = posVal && typeof posVal === "object" && posVal.length >= 2 ? posVal[1] : 0;
              ${args.position_x !== undefined ? `px = ${args.position_x}; changes.position_x = ${args.position_x};` : ""}
              ${args.position_y !== undefined ? `py = ${args.position_y}; changes.position_y = ${args.position_y};` : ""}
              positionProp.setValue([px, py], true);
            } else {
              missingProperties.push("position");
            }` : ""}
            ${args.rotation !== undefined ? `
            var rotationProp = __findKnownProperty(motionComp, "motion", "rotation");
            if (rotationProp) {
              rotationProp.setValue(${args.rotation}, true);
              changes.rotation = ${args.rotation};
            } else {
              missingProperties.push("rotation");
            }` : ""}
          }
          ` : ""}
          
          return __result({ updated: true, clipName: clip.name, changes: changes, missingProperties: missingProperties });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    replace_clip: {
      description: "Replace a clip on the timeline with a different project item, preserving position and duration",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip to replace",
          },
          new_item_id: {
            type: "string",
            description: "Node ID or name of the new project item to replace with",
          },
        },
        required: ["node_id", "new_item_id"],
      },
      handler: async (args: { node_id: string; new_item_id: string }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found: ${escapeForExtendScript(args.node_id)}");
          
          var newItem = __findProjectItem("${escapeForExtendScript(args.new_item_id)}");
          if (!newItem) return __error("Replacement project item not found: ${escapeForExtendScript(args.new_item_id)}");
          
          var clip = result.clip;
          var oldName = clip.name;
          var startTicks = clip.start.ticks;
          var trackIndex = result.trackIndex;
          var trackType = result.trackType;
          
          // Remove old clip
          clip.remove(false, false);
          
          // Insert new clip at same position
          if (trackType === "video") {
            seq.insertClip(newItem, startTicks, trackIndex, trackIndex);
          } else {
            seq.insertClip(newItem, startTicks, 0, trackIndex);
          }
          
          return __result({
            replaced: true,
            oldClip: oldName,
            newClip: newItem.name,
            trackIndex: trackIndex,
            trackType: trackType
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    speed_change: {
      description: "Change the playback speed of a clip",
      parameters: {
        type: "object" as const,
        properties: {
          node_id: {
            type: "string",
            description: "Node ID of the clip",
          },
          speed_percent: {
            type: "number",
            description: "Speed as percentage (100 = normal, 200 = double, 50 = half)",
          },
          reverse: {
            type: "boolean",
            description: "Reverse playback direction (default: false)",
          },
        },
        required: ["node_id", "speed_percent"],
      },
      handler: async (args: { node_id: string; speed_percent: number; reverse?: boolean }) => {
        const script = buildToolScript(`
          app.enableQE();
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return __error("No active sequence (QE)");
          
          var result = __findClip("${escapeForExtendScript(args.node_id)}");
          if (!result) return __error("Clip not found");
          
          var clip = result.clip;
          var speed = "${args.speed_percent}";
          ${args.reverse ? 'speed = "-" + speed;' : ""}
          
          clip.setSpeed(speed);
          return __result({ speedChanged: true, clipName: clip.name, speed: ${args.speed_percent}, reverse: ${!!args.reverse} });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
