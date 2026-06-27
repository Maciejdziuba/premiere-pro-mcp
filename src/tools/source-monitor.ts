import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";

const SOURCE_EDIT_SAFETY_HELPERS = `
function __sourceTrackIsLocked(track) {
  try { return track.isLocked() === true || track.isLocked() === 1; } catch(e) {}
  return false;
}

function __sourceTrackName(track) {
  try { if (track.name) return track.name; } catch(e) {}
  return "";
}

function __sourceCollectRangeOverlaps(track, trackType, trackIndex, startTicks, endTicks) {
  var overlaps = [];
  if (!track || endTicks <= startTicks) return overlaps;

  for (var c = 0; c < track.clips.numItems; c++) {
    var clip = track.clips[c];
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

function __sourceProjectItemDurationTicks(item) {
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

export function getSourceMonitorTools(bridgeOptions: BridgeOptions) {
  return {
    open_in_source: {
      description: "Open a project item in the Source Monitor for preview and trimming.",
      parameters: {
        type: "object" as const,
        properties: {
          item_id: {
            type: "string",
            description: "Node ID or name of the project item to open",
          },
        },
        required: ["item_id"],
      },
      handler: async (args: { item_id: string }) => {
        const script = buildToolScript(`
          var item = __findProjectItem("${escapeForExtendScript(args.item_id)}");
          if (!item) return __error("Project item not found");
          app.sourceMonitor.openProjectItem(item);
          return __result({ opened: true, item: item.name });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    close_source_monitor: {
      description: "Close the clip currently open in the Source Monitor.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          app.sourceMonitor.closeClip();
          return __result({ closed: true });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    close_all_source_clips: {
      description: "Close all clips in the Source Monitor.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          app.sourceMonitor.closeAllClips();
          return __result({ closed: true });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    set_source_in_out: {
      description: "Set in and/or out points on the clip currently open in the Source Monitor.",
      parameters: {
        type: "object" as const,
        properties: {
          in_seconds: {
            type: "number",
            description: "In point in seconds (optional)",
          },
          out_seconds: {
            type: "number",
            description: "Out point in seconds (optional)",
          },
        },
      },
      handler: async (args: { in_seconds?: number; out_seconds?: number }) => {
        const script = buildToolScript(`
          var item = app.sourceMonitor.getProjectItem();
          if (!item) return __error("No clip open in Source Monitor");

          ${args.in_seconds !== undefined ? `
          var inTime = new Time();
          inTime.seconds = ${args.in_seconds};
          item.setInPoint(inTime.ticks, 4);
          ` : ""}

          ${args.out_seconds !== undefined ? `
          var outTime = new Time();
          outTime.seconds = ${args.out_seconds};
          item.setOutPoint(outTime.ticks, 4);
          ` : ""}

          return __result({
            item: item.name,
            inSet: ${args.in_seconds !== undefined},
            outSet: ${args.out_seconds !== undefined}
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    insert_from_source: {
      description: "Insert the clip from the Source Monitor at the playhead position (insert edit — shifts existing clips), with optional dry-run and empty-range checks.",
      parameters: {
        type: "object" as const,
        properties: {
          video_track_index: {
            type: "number",
            description: "Target video track index (default: 0)",
          },
          audio_track_index: {
            type: "number",
            description: "Target audio track index (default: 0)",
          },
          duration_seconds: {
            type: "number",
            description: "Expected edit duration for safety checks. If omitted, the tool tries to read the source in/out or duration.",
          },
          require_empty_range: {
            type: "boolean",
            description: "If true, fail before inserting when the target video or audio range already contains clips. Default: false",
          },
          dry_run: {
            type: "boolean",
            description: "If true, return target track/range safety details without inserting. Default: false",
          },
        },
      },
      handler: async (args: { video_track_index?: number; audio_track_index?: number; duration_seconds?: number; require_empty_range?: boolean; dry_run?: boolean }) => {
        const vTrack = args.video_track_index ?? 0;
        const aTrack = args.audio_track_index ?? 0;
        const durationTicksExpr = args.duration_seconds !== undefined
          ? `__secondsToTicks(${args.duration_seconds})`
          : "__sourceProjectItemDurationTicks(item)";
        const requireEmptyRange = args.require_empty_range === true;
        const dryRun = args.dry_run === true;
        const script = buildToolScript(`
          ${SOURCE_EDIT_SAFETY_HELPERS}
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");

          var item = app.sourceMonitor.getProjectItem();
          if (!item) return __error("No clip open in Source Monitor");

          if (${vTrack} < 0 || ${vTrack} >= seq.videoTracks.numTracks) return __error("Video track index out of range");
          if (${aTrack} < 0 || ${aTrack} >= seq.audioTracks.numTracks) return __error("Audio track index out of range");

          var videoTrack = seq.videoTracks[${vTrack}];
          var audioTrack = seq.audioTracks[${aTrack}];
          if (__sourceTrackIsLocked(videoTrack)) return __error("Target video track is locked");
          if (__sourceTrackIsLocked(audioTrack)) return __error("Target audio track is locked");

          var pos = seq.getPlayerPosition().ticks;
          var durationTicks = ${durationTicksExpr};
          var rangeChecked = durationTicks > 0;
          var endTicks = parseFloat(pos) + durationTicks;
          var videoOverlaps = [];
          var audioOverlaps = [];
          var warnings = [];
          if (rangeChecked) {
            videoOverlaps = __sourceCollectRangeOverlaps(videoTrack, "video", ${vTrack}, parseFloat(pos), endTicks);
            audioOverlaps = __sourceCollectRangeOverlaps(audioTrack, "audio", ${aTrack}, parseFloat(pos), endTicks);
          } else {
            warnings.push("Could not determine source duration; provide duration_seconds for overlap preflight.");
          }

          var totalOverlaps = videoOverlaps.length + audioOverlaps.length;
          var requireEmptyRange = ${requireEmptyRange ? "true" : "false"};
          var dryRun = ${dryRun ? "true" : "false"};
          if (requireEmptyRange && !rangeChecked) return __error("duration_seconds is required when require_empty_range is true and source duration cannot be read");
          if (requireEmptyRange && totalOverlaps > 0) return __error("Target range is not empty; found " + totalOverlaps + " overlapping clip(s)");

          if (!dryRun) {
            seq.insertClip(item, pos, ${vTrack}, ${aTrack});
          }

          return __result({
            inserted: !dryRun,
            dryRun: dryRun,
            item: item.name,
            atSeconds: __ticksToSeconds(pos),
            durationSeconds: rangeChecked ? __ticksToSeconds(durationTicks) : null,
            rangeChecked: rangeChecked,
            safeToPlace: totalOverlaps === 0,
            targetTracks: {
              video: { index: ${vTrack}, name: __sourceTrackName(videoTrack), locked: false },
              audio: { index: ${aTrack}, name: __sourceTrackName(audioTrack), locked: false }
            },
            overlaps: {
              video: videoOverlaps,
              audio: audioOverlaps
            },
            warnings: warnings
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    overwrite_from_source: {
      description: "Overwrite the clip from the Source Monitor at the playhead position (overwrite edit — replaces existing clips), with optional dry-run and empty-range checks.",
      parameters: {
        type: "object" as const,
        properties: {
          video_track_index: {
            type: "number",
            description: "Target video track index (default: 0)",
          },
          audio_track_index: {
            type: "number",
            description: "Target audio track index (default: 0)",
          },
          duration_seconds: {
            type: "number",
            description: "Expected edit duration for safety checks. If omitted, the tool tries to read the source in/out or duration.",
          },
          require_empty_range: {
            type: "boolean",
            description: "If true, fail before overwriting when the target video or audio range already contains clips. Default: false",
          },
          dry_run: {
            type: "boolean",
            description: "If true, return target track/range safety details without overwriting. Default: false",
          },
        },
      },
      handler: async (args: { video_track_index?: number; audio_track_index?: number; duration_seconds?: number; require_empty_range?: boolean; dry_run?: boolean }) => {
        const vTrack = args.video_track_index ?? 0;
        const aTrack = args.audio_track_index ?? 0;
        const durationTicksExpr = args.duration_seconds !== undefined
          ? `__secondsToTicks(${args.duration_seconds})`
          : "__sourceProjectItemDurationTicks(item)";
        const requireEmptyRange = args.require_empty_range === true;
        const dryRun = args.dry_run === true;
        const script = buildToolScript(`
          ${SOURCE_EDIT_SAFETY_HELPERS}
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");

          var item = app.sourceMonitor.getProjectItem();
          if (!item) return __error("No clip open in Source Monitor");

          if (${vTrack} < 0 || ${vTrack} >= seq.videoTracks.numTracks) return __error("Video track index out of range");
          if (${aTrack} < 0 || ${aTrack} >= seq.audioTracks.numTracks) return __error("Audio track index out of range");

          var videoTrack = seq.videoTracks[${vTrack}];
          var audioTrack = seq.audioTracks[${aTrack}];
          if (__sourceTrackIsLocked(videoTrack)) return __error("Target video track is locked");
          if (__sourceTrackIsLocked(audioTrack)) return __error("Target audio track is locked");

          var pos = seq.getPlayerPosition().ticks;
          var durationTicks = ${durationTicksExpr};
          var rangeChecked = durationTicks > 0;
          var endTicks = parseFloat(pos) + durationTicks;
          var videoOverlaps = [];
          var audioOverlaps = [];
          var warnings = [];
          if (rangeChecked) {
            videoOverlaps = __sourceCollectRangeOverlaps(videoTrack, "video", ${vTrack}, parseFloat(pos), endTicks);
            audioOverlaps = __sourceCollectRangeOverlaps(audioTrack, "audio", ${aTrack}, parseFloat(pos), endTicks);
          } else {
            warnings.push("Could not determine source duration; provide duration_seconds for overlap preflight.");
          }

          var totalOverlaps = videoOverlaps.length + audioOverlaps.length;
          var requireEmptyRange = ${requireEmptyRange ? "true" : "false"};
          var dryRun = ${dryRun ? "true" : "false"};
          if (requireEmptyRange && !rangeChecked) return __error("duration_seconds is required when require_empty_range is true and source duration cannot be read");
          if (requireEmptyRange && totalOverlaps > 0) return __error("Target range is not empty; found " + totalOverlaps + " overlapping clip(s)");

          if (!dryRun) {
            seq.overwriteClip(item, pos, ${vTrack}, ${aTrack});
          }

          return __result({
            overwritten: !dryRun,
            dryRun: dryRun,
            item: item.name,
            atSeconds: __ticksToSeconds(pos),
            durationSeconds: rangeChecked ? __ticksToSeconds(durationTicks) : null,
            rangeChecked: rangeChecked,
            safeToPlace: totalOverlaps === 0,
            targetTracks: {
              video: { index: ${vTrack}, name: __sourceTrackName(videoTrack), locked: false },
              audio: { index: ${aTrack}, name: __sourceTrackName(audioTrack), locked: false }
            },
            overlaps: {
              video: videoOverlaps,
              audio: audioOverlaps
            },
            warnings: warnings
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    get_source_monitor_info: {
      description: "Get information about the clip currently loaded in the Source Monitor.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var item = app.sourceMonitor.getProjectItem();
          if (!item) return __result({ loaded: false });

          var info = {
            loaded: true,
            nodeId: item.nodeId,
            name: item.name
          };
          try { info.mediaPath = item.getMediaPath(); } catch(e) {}
          try { info.inPoint = __ticksToSeconds(item.getInPoint().ticks); } catch(e) {}
          try { info.outPoint = __ticksToSeconds(item.getOutPoint().ticks); } catch(e) {}

          return __result(info);
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
