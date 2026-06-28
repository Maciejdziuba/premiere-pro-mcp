import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function toExtendScriptJsonLiteral(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function workAreaTypeCode(workAreaType?: string): string {
  switch (workAreaType) {
    case "in_to_out":
      return "1";
    case "work_area":
      return "2";
    default:
      return "0";
  }
}

const FRAME_CAPTURE_HELPERS = `
function __mcpGetFrameCaptureCapability(seq) {
  var capability = {
    supported: false,
    method: null,
    requiresQe: false,
    standardSequenceExportFramePNG: false,
    qeSequenceExportFramePNG: false,
    qeEnabledForProbe: false,
    unsupportedReason: null,
    probeErrors: []
  };

  try {
    capability.standardSequenceExportFramePNG = !!(seq && typeof seq.exportFramePNG === "function");
  } catch(e) {
    capability.probeErrors.push("Sequence.exportFramePNG probe failed: " + e.toString());
  }

  if (capability.standardSequenceExportFramePNG) {
    capability.supported = true;
    capability.method = "Sequence.exportFramePNG";
    return capability;
  }

  try {
    if (typeof app.enableQE === "function") {
      app.enableQE();
      capability.qeEnabledForProbe = true;
    }
    if (typeof qe !== "undefined" && qe.project && typeof qe.project.getActiveSequence === "function") {
      var qeSeq = qe.project.getActiveSequence();
      capability.qeSequenceExportFramePNG = !!(qeSeq && typeof qeSeq.exportFramePNG === "function");
    }
  } catch(e2) {
    capability.probeErrors.push("QE exportFramePNG probe failed: " + e2.toString());
  }

  if (capability.qeSequenceExportFramePNG) {
    capability.supported = true;
    capability.method = "QE.Sequence.exportFramePNG";
    capability.requiresQe = true;
    return capability;
  }

  capability.unsupportedReason = "No scriptable frame PNG export API is available. Sequence.exportFramePNG is absent, and QE active sequence exportFramePNG is unavailable.";
  return capability;
}

function __mcpExportFramePng(seq, ticks, outputPath) {
  var capability = __mcpGetFrameCaptureCapability(seq);
  if (!capability.supported) {
    return {
      ok: false,
      error: "Frame capture unsupported: " + capability.unsupportedReason,
      capability: capability
    };
  }

  try {
    var result = null;
    if (capability.method === "Sequence.exportFramePNG") {
      result = seq.exportFramePNG(ticks, outputPath);
    } else {
      var qeSeq = qe.project.getActiveSequence();
      if (!qeSeq || typeof qeSeq.exportFramePNG !== "function") {
        return {
          ok: false,
          error: "Frame capture unsupported: QE active sequence exportFramePNG became unavailable",
          capability: capability
        };
      }
      result = qeSeq.exportFramePNG(ticks, outputPath);
    }

    if (result === false) {
      return {
        ok: false,
        error: capability.method + " returned false",
        capability: capability
      };
    }

    return {
      ok: true,
      method: capability.method,
      capability: capability
    };
  } catch(e3) {
    return {
      ok: false,
      error: "Frame capture failed via " + capability.method + ": " + e3.toString(),
      capability: capability
    };
  }
}
`;

export function getExportTools(bridgeOptions: BridgeOptions) {
  return {
    get_export_capabilities: {
      description:
        "Report export, interchange, and AME encoder APIs exposed by the current Premiere runtime without queueing exports.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          ${FRAME_CAPTURE_HELPERS}
          var seq = app.project.activeSequence;
          var encoder = app.encoder;
          var sequence = {
            hasActiveSequence: !!seq,
            exportAsMediaDirect: false,
            exportAsFinalCutProXML: false,
            getExportFileExtension: false,
            exportAsProject: false,
            exportFramePNG: false
          };
          if (seq) {
            sequence.exportAsMediaDirect = typeof seq.exportAsMediaDirect === "function";
            sequence.exportAsFinalCutProXML = typeof seq.exportAsFinalCutProXML === "function";
            sequence.getExportFileExtension = typeof seq.getExportFileExtension === "function";
            sequence.exportAsProject = typeof seq.exportAsProject === "function";
            sequence.exportFramePNG = typeof seq.exportFramePNG === "function";
          }
          var frameCapture = seq ? __mcpGetFrameCaptureCapability(seq) : {
            supported: false,
            method: null,
            requiresQe: false,
            standardSequenceExportFramePNG: false,
            qeSequenceExportFramePNG: false,
            qeEnabledForProbe: false,
            unsupportedReason: "No active sequence",
            probeErrors: []
          };

          return __result({
            readOnly: true,
            premiereVersion: app.version || null,
            build: app.build || null,
            activeSequenceName: seq ? seq.name : null,
            encoder: {
              available: !!encoder,
              launchEncoder: !!(encoder && encoder.launchEncoder),
              encodeSequence: !!(encoder && encoder.encodeSequence),
              encodeProjectItem: !!(encoder && encoder.encodeProjectItem),
              encodeFile: !!(encoder && encoder.encodeFile),
              startBatch: !!(encoder && encoder.startBatch),
              setEmbeddedXMPEnabled: !!(encoder && encoder.setEmbeddedXMPEnabled),
              setSidecarXMPEnabled: !!(encoder && encoder.setSidecarXMPEnabled),
              detailedQueueStatus: false
            },
            sequence: sequence,
            project: {
              exportAAF: typeof app.project.exportAAF === "function",
              exportOMF: typeof app.project.exportOMF === "function",
              exportFinalCutProXML: typeof app.project.exportFinalCutProXML === "function"
            },
            frameCapture: frameCapture,
            limitations: [
              "Premiere ExtendScript can enqueue AME jobs but does not expose detailed queue progress/status.",
              "AME availability depends on the local Premiere/AME installation and version.",
              "Frame capture is only reported as supported when Sequence.exportFramePNG or QE active sequence exportFramePNG is present.",
              "Interchange export behavior should be live-tested on disposable projects before production use."
            ]
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    diagnose_export_preset: {
      description:
        "Validate an AME .epr preset path and ask the active sequence which output extension it maps to, without exporting.",
      parameters: {
        type: "object" as const,
        properties: {
          preset_path: {
            type: "string",
            description: "Full path to the AME preset file (.epr).",
          },
        },
        required: ["preset_path"],
      },
      handler: async (args: { preset_path: string }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.getExportFileExtension !== "function") {
            return __error("getExportFileExtension is not available in this Premiere ExtendScript runtime");
          }

          var presetPath = "${escapeForExtendScript(args.preset_path)}";
          var presetFile = new File(presetPath);
          if (!presetFile.exists) return __error("Preset file not found: " + presetPath);

          var lowerName = presetFile.name.toLowerCase();
          if (lowerName.substr(lowerName.length - 4) !== ".epr") {
            return __error("Export preset must be an .epr file: " + presetFile.name);
          }

          var extension = seq.getExportFileExtension(presetFile.fsName);
          if (!extension) return __error("Premiere could not resolve an output extension for preset: " + presetFile.fsName);

          return __result({
            presetPath: presetFile.fsName,
            exists: true,
            activeSequence: seq.name,
            outputExtension: extension,
            encoderAvailable: !!app.encoder,
            exported: false,
            queued: false
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    export_sequence: {
      description: "Export the active sequence using Adobe Media Encoder",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full output file path (e.g., '/Users/me/exports/video.mp4')",
          },
          preset_path: {
            type: "string",
            description: "Path to an AME preset file (.epr). Uses default H.264 if omitted.",
          },
          work_area_only: {
            type: "boolean",
            description: "Export only the work area (default: false, exports entire sequence)",
          },
        },
        required: ["output_path"],
      },
      handler: async (args: { output_path: string; preset_path?: string; work_area_only?: boolean }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.exportAsMediaDirect !== "function") {
            return __error("exportAsMediaDirect is not available in this Premiere ExtendScript runtime");
          }
          
          var outputPath = "${escapeForExtendScript(args.output_path)}";
          
          ${args.preset_path
            ? `var presetPath = "${escapeForExtendScript(args.preset_path)}";
               var presetFile = new File(presetPath);
               if (!presetFile.exists) return __error("Preset file not found: " + presetPath);
               presetPath = presetFile.fsName;`
            : `// Use default H.264 preset
               var presetPath = "";
               // Try common preset locations
               var presetFile = new File("/Applications/Adobe Media Encoder 2025/MediaIO/systempresets/4028/HDTV 1080p 29.97 High Quality.epr");
               if (presetFile.exists) presetPath = presetFile.fsName;
               if (!presetPath) return __error("preset_path is required; no bundled default AME preset was found");`
          }
          
          var exportResult = seq.exportAsMediaDirect(
            outputPath,
            presetPath,
            ${args.work_area_only ? "2" : "0"}
          );
          if (exportResult === false) return __error("exportAsMediaDirect returned false");
          
          return __result({ exported: true, outputPath: outputPath, presetPath: presetPath });
        `);
        return sendCommand(script, { ...bridgeOptions, timeoutMs: 120000 }); // 2 min timeout for exports
      },
    },

    export_frame: {
      description: "Export the current frame as an image file",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full output file path (e.g., '/Users/me/frame.png'). Extension determines format.",
          },
          time_seconds: {
            type: "number",
            description: "Time position in seconds to export. Uses current playhead if omitted.",
          },
        },
        required: ["output_path"],
      },
      handler: async (args: { output_path: string; time_seconds?: number }) => {
        const script = buildToolScript(`
          ${FRAME_CAPTURE_HELPERS}
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          ${args.time_seconds !== undefined
            ? `seq.setPlayerPosition(__secondsToTicks(${args.time_seconds}).toString());`
            : ""
          }
          
          var outputPath = "${escapeForExtendScript(args.output_path)}";
          var captureResult = __mcpExportFramePng(seq, seq.getPlayerPosition().ticks, outputPath);
          if (!captureResult.ok) return __error(captureResult.error);
          
          return __result({
            exported: true,
            outputPath: outputPath,
            method: captureResult.method,
            capability: captureResult.capability
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    export_as_fcp_xml: {
      description: "Export the active sequence as a Final Cut Pro XML file",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full output file path (e.g., '/Users/me/export.xml')",
          },
          suppress_ui: {
            type: "boolean",
            description: "Suppress Premiere export dialogs where supported (default: true).",
          },
        },
        required: ["output_path"],
      },
      handler: async (args: { output_path: string; suppress_ui?: boolean }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.exportAsFinalCutProXML !== "function") {
            return __error("exportAsFinalCutProXML is not available in this Premiere ExtendScript runtime");
          }
          
          var result = seq.exportAsFinalCutProXML("${escapeForExtendScript(args.output_path)}", ${args.suppress_ui !== false ? "1" : "0"});
          if (result === false) return __error("exportAsFinalCutProXML returned false");
          return __result({ exported: true, outputPath: "${escapeForExtendScript(args.output_path)}", format: "FCP XML" });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    export_aaf: {
      description: "Export the active sequence as an AAF file (for Pro Tools, etc.)",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full output file path (e.g., '/Users/me/export.aaf')",
          },
          mix_down_video: {
            type: "boolean",
            description: "Mix down video to single track (default: true)",
          },
          explode_to_mono: {
            type: "boolean",
            description: "Explode multichannel audio to mono (default: false)",
          },
          sample_rate: {
            type: "number",
            description: "Audio sample rate (default: 48000)",
          },
          bits_per_sample: {
            type: "number",
            description: "Audio bit depth (default: 16)",
          },
        },
        required: ["output_path"],
      },
      handler: async (args: {
        output_path: string;
        mix_down_video?: boolean;
        explode_to_mono?: boolean;
        sample_rate?: number;
        bits_per_sample?: number;
      }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof app.project.exportAAF !== "function") {
            return __error("project.exportAAF is not available in this Premiere ExtendScript runtime");
          }
          
          var result = app.project.exportAAF(
            seq,
            "${escapeForExtendScript(args.output_path)}",
            ${args.mix_down_video !== false ? 1 : 0},
            ${args.explode_to_mono ? 1 : 0},
            ${args.sample_rate ?? 48000},
            ${args.bits_per_sample ?? 16}
          );
          if (result === false) return __error("project.exportAAF returned false");
          
          return __result({ exported: true, outputPath: "${escapeForExtendScript(args.output_path)}", format: "AAF" });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    add_to_render_queue: {
      description: "Add the active sequence to the Adobe Media Encoder render queue",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full output file path",
          },
          preset_path: {
            type: "string",
            description: "Path to an AME preset file (.epr)",
          },
        },
        required: ["output_path"],
      },
      handler: async (args: { output_path: string; preset_path?: string }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var encoder = app.encoder;
          if (!encoder) return __error("Adobe Media Encoder not available");
          if (typeof encoder.launchEncoder !== "function") return __error("encoder.launchEncoder is not available");
          if (typeof encoder.encodeSequence !== "function") return __error("encoder.encodeSequence is not available");
          
          encoder.launchEncoder();
          
          var outputPath = "${escapeForExtendScript(args.output_path)}";
          ${args.preset_path
            ? `var presetPath = "${escapeForExtendScript(args.preset_path)}";
               var presetFile = new File(presetPath);
               if (!presetFile.exists) return __error("Preset file not found: " + presetPath);
               presetPath = presetFile.fsName;`
            : `return __error("preset_path is required when adding an AME queue item");`
          }
          
          var jobId = encoder.encodeSequence(
            seq,
            outputPath,
            presetPath,
            0, // workAreaType
            1  // removeOnCompletion
          );
          
          return __result({ queued: true, started: false, outputPath: outputPath, presetPath: presetPath, jobId: jobId || null });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    get_render_queue_status: {
      description: "Report available Adobe Media Encoder queue APIs and known status limitations",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var encoder = app.encoder;
          if (!encoder) return __error("Adobe Media Encoder not available");
          
          return __result({
            readOnly: true,
            encoderAvailable: true,
            canLaunchEncoder: typeof encoder.launchEncoder === "function",
            canEncodeSequence: typeof encoder.encodeSequence === "function",
            canEncodeProjectItem: typeof encoder.encodeProjectItem === "function",
            canEncodeFile: typeof encoder.encodeFile === "function",
            canStartBatch: typeof encoder.startBatch === "function",
            isRunning: encoder.isRunning ? encoder.isRunning() : "unknown",
            detailedQueueStatusAvailable: false,
            limitations: [
              "Premiere ExtendScript does not expose detailed AME queue item progress or completion status.",
              "Use Adobe Media Encoder itself for per-job progress, failure reason, and completion details."
            ]
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    create_subclip: {
      description: "Create a subclip from a project item with in/out points",
      parameters: {
        type: "object" as const,
        properties: {
          item_id: {
            type: "string",
            description: "Node ID or name of the source project item",
          },
          name: {
            type: "string",
            description: "Name for the subclip",
          },
          in_seconds: {
            type: "number",
            description: "In-point in seconds",
          },
          out_seconds: {
            type: "number",
            description: "Out-point in seconds",
          },
        },
        required: ["item_id", "name", "in_seconds", "out_seconds"],
      },
      handler: async (args: { item_id: string; name: string; in_seconds: number; out_seconds: number }) => {
        const script = buildToolScript(`
          var item = __findProjectItem("${escapeForExtendScript(args.item_id)}");
          if (!item) return __error("Item not found");
          
          var inTicks = __secondsToTicks(${args.in_seconds}).toString();
          var outTicks = __secondsToTicks(${args.out_seconds}).toString();
          
          var subclip = item.createSubClip(
            "${escapeForExtendScript(args.name)}",
            inTicks,
            outTicks,
            0, // hasHardBoundaries
            1, // takeVideo
            1  // takeAudio
          );
          
          if (!subclip) return __error("Failed to create subclip");
          return __result({ created: true, name: "${escapeForExtendScript(args.name)}", source: item.name });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    capture_frame: {
      description: "Capture the current frame and return it as inline image data for the LLM to see. This lets the AI visually inspect the current state of the timeline.",
      parameters: {
        type: "object" as const,
        properties: {
          time_seconds: {
            type: "number",
            description: "Time position in seconds to capture. Uses current playhead if omitted.",
          },
        },
      },
      handler: async (args: { time_seconds?: number }) => {
        const tempPath = join(tmpdir(), `mcp_frame_capture_${Date.now()}.png`);
        const escapedPath = escapeForExtendScript(tempPath);

        const script = buildToolScript(`
          ${FRAME_CAPTURE_HELPERS}
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          ${args.time_seconds !== undefined
            ? `seq.setPlayerPosition(__secondsToTicks(${args.time_seconds}).toString());`
            : ""
          }
          
          var outputPath = "${escapedPath}";
          var captureResult = __mcpExportFramePng(seq, seq.getPlayerPosition().ticks, outputPath);
          if (!captureResult.ok) return __error(captureResult.error);
          
          return __result({
            exported: true,
            outputPath: outputPath,
            method: captureResult.method,
            capability: captureResult.capability
          });
        `);

        const result = await sendCommand(script, bridgeOptions);
        if (!result.success) return result;

        // Read the exported PNG and return as base64 image content
        // Wait a moment for the file to be written
        let attempts = 0;
        while (!existsSync(tempPath) && attempts < 20) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }

        if (!existsSync(tempPath)) {
          return { success: false, error: "Frame export completed but file not found at: " + tempPath };
        }

        try {
          const imageData = readFileSync(tempPath);
          const base64 = imageData.toString("base64");
          // Clean up temp file
          try { unlinkSync(tempPath); } catch {}
          return {
            success: true,
            data: {
              captured: true,
              mimeType: "image/png",
              base64: base64,
            },
          };
        } catch (e) {
          return { success: false, error: `Failed to read captured frame: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },

    export_omf: {
      description: "Export the active sequence as an OMF file (Open Media Framework, for audio post-production)",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full output file path (e.g., '/Users/me/export.omf')",
          },
          sample_rate: {
            type: "number",
            description: "Audio sample rate (default: 48000)",
          },
          bits_per_sample: {
            type: "number",
            description: "Audio bit depth (default: 16)",
          },
          audio_encapsulated: {
            type: "boolean",
            description: "Embed audio in OMF (true) or reference external files (false). Default: true",
          },
          audio_file_format: {
            type: "number",
            description: "Audio format: 0=AIFF, 1=WAV. Default: 1",
          },
          trim_audio_files: {
            type: "boolean",
            description: "Trim audio to used range plus handles (default: true)",
          },
          include_pan: {
            type: "boolean",
            description: "Include pan information where supported (default: true)",
          },
          handle_frames: {
            type: "number",
            description: "Handle length in frames when trimming (default: 1000)",
          },
        },
        required: ["output_path"],
      },
      handler: async (args: {
        output_path: string;
        sample_rate?: number;
        bits_per_sample?: number;
        audio_encapsulated?: boolean;
        audio_file_format?: number;
        trim_audio_files?: boolean;
        include_pan?: boolean;
        handle_frames?: number;
      }) => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof app.project.exportOMF !== "function") {
            return __error("project.exportOMF is not available in this Premiere ExtendScript runtime");
          }
          
          var result = app.project.exportOMF(
            seq,
            "${escapeForExtendScript(args.output_path)}",
            "OMFTitle",
            ${args.sample_rate ?? 48000},
            ${args.bits_per_sample ?? 16},
            ${args.audio_encapsulated !== false ? 1 : 0},
            ${args.audio_file_format ?? 1},
            ${args.trim_audio_files !== false ? 1 : 0},
            ${args.include_pan !== false ? 1 : 0},
            ${args.handle_frames ?? 1000}
          );
          if (result === false) return __error("project.exportOMF returned false");
          
          return __result({ exported: true, outputPath: "${escapeForExtendScript(args.output_path)}", format: "OMF" });
        `);
        return sendCommand(script, { ...bridgeOptions, timeoutMs: 120000 });
      },
    },

    encode_project_item: {
      description: "Encode a specific project item (not a sequence) using Adobe Media Encoder",
      parameters: {
        type: "object" as const,
        properties: {
          item_id: {
            type: "string",
            description: "Node ID or name of the project item to encode",
          },
          output_path: {
            type: "string",
            description: "Full output file path",
          },
          preset_path: {
            type: "string",
            description: "Path to an AME preset file (.epr)",
          },
          remove_on_completion: {
            type: "boolean",
            description: "Remove from queue on completion (default: true)",
          },
        },
        required: ["item_id", "output_path", "preset_path"],
      },
      handler: async (args: {
        item_id: string;
        output_path: string;
        preset_path: string;
        remove_on_completion?: boolean;
      }) => {
        const script = buildToolScript(`
          var item = __findProjectItem("${escapeForExtendScript(args.item_id)}");
          if (!item) return __error("Project item not found: ${escapeForExtendScript(args.item_id)}");
          if (!app.encoder) return __error("Adobe Media Encoder not available");
          if (typeof app.encoder.launchEncoder !== "function") return __error("encoder.launchEncoder is not available");
          if (typeof app.encoder.encodeProjectItem !== "function") return __error("encoder.encodeProjectItem is not available");
          if (typeof app.encoder.startBatch !== "function") return __error("encoder.startBatch is not available");

          var presetPath = "${escapeForExtendScript(args.preset_path)}";
          var presetFile = new File(presetPath);
          if (!presetFile.exists) return __error("Preset file not found: " + presetPath);
          
          app.encoder.launchEncoder();
          var jobId = app.encoder.encodeProjectItem(
            item,
            "${escapeForExtendScript(args.output_path)}",
            presetFile.fsName,
            app.encoder.ENCODE_IN_TO_OUT,
            ${args.remove_on_completion !== false ? 1 : 0}
          );
          app.encoder.startBatch();
          
          return __result({
            queued: true,
            item: item.name,
            outputPath: "${escapeForExtendScript(args.output_path)}",
            presetPath: presetFile.fsName,
            jobId: jobId || null
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    encode_file: {
      description: "Encode an external file (not in project) using Adobe Media Encoder",
      parameters: {
        type: "object" as const,
        properties: {
          input_path: {
            type: "string",
            description: "Full path to the input file",
          },
          output_path: {
            type: "string",
            description: "Full output file path",
          },
          preset_path: {
            type: "string",
            description: "Path to an AME preset file (.epr)",
          },
          in_seconds: {
            type: "number",
            description: "Optional start time in seconds",
          },
          out_seconds: {
            type: "number",
            description: "Optional end time in seconds",
          },
          remove_on_completion: {
            type: "boolean",
            description: "Remove from queue on completion (default: true)",
          },
        },
        required: ["input_path", "output_path", "preset_path"],
      },
      handler: async (args: {
        input_path: string;
        output_path: string;
        preset_path: string;
        in_seconds?: number;
        out_seconds?: number;
        remove_on_completion?: boolean;
      }) => {
        const inPointCode = args.in_seconds !== undefined
          ? `var srcIn = new Time(); srcIn.seconds = ${args.in_seconds};`
          : `var srcIn = undefined;`;
        const outPointCode = args.out_seconds !== undefined
          ? `var srcOut = new Time(); srcOut.seconds = ${args.out_seconds};`
          : `var srcOut = undefined;`;

        const script = buildToolScript(`
          if (!app.encoder) return __error("Adobe Media Encoder not available");
          if (typeof app.encoder.launchEncoder !== "function") return __error("encoder.launchEncoder is not available");
          if (typeof app.encoder.encodeFile !== "function") return __error("encoder.encodeFile is not available");
          if (typeof app.encoder.startBatch !== "function") return __error("encoder.startBatch is not available");

          var inputFile = new File("${escapeForExtendScript(args.input_path)}");
          if (!inputFile.exists) return __error("Input file not found: " + inputFile.fsName);
          var presetFile = new File("${escapeForExtendScript(args.preset_path)}");
          if (!presetFile.exists) return __error("Preset file not found: " + presetFile.fsName);

          app.encoder.launchEncoder();
          
          ${inPointCode}
          ${outPointCode}
          
          var jobId = app.encoder.encodeFile(
            inputFile.fsName,
            "${escapeForExtendScript(args.output_path)}",
            presetFile.fsName,
            ${args.remove_on_completion !== false ? 1 : 0},
            srcIn,
            srcOut
          );
          app.encoder.startBatch();
          
          return __result({
            queued: true,
            inputPath: inputFile.fsName,
            outputPath: "${escapeForExtendScript(args.output_path)}",
            presetPath: presetFile.fsName,
            jobId: jobId || null
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    batch_export_sequences: {
      description:
        "Queue multiple sequences in Adobe Media Encoder from explicit output/preset jobs. Does not start the queue unless start_queue is true.",
      parameters: {
        type: "object" as const,
        properties: {
          jobs: {
            type: "array",
            description:
              "Array of jobs with output_path, preset_path, and optional sequence_id. sequence_id omitted uses the active sequence.",
          },
          work_area_type: {
            type: "string",
            enum: ["entire", "in_to_out", "work_area"],
            description: "Range to encode for each sequence (default: entire).",
          },
          remove_on_completion: {
            type: "boolean",
            description: "Remove AME queue item on completion (default: true).",
          },
          start_queue: {
            type: "boolean",
            description: "Start the AME batch after queueing all valid jobs (default: false).",
          },
        },
        required: ["jobs"],
      },
      handler: async (args: {
        jobs: Array<{ sequence_id?: string; output_path?: string; outputPath?: string; preset_path?: string; presetPath?: string }>;
        work_area_type?: string;
        remove_on_completion?: boolean;
        start_queue?: boolean;
      }) => {
        if (!Array.isArray(args.jobs) || args.jobs.length === 0) {
          return { success: false, error: "jobs must be a non-empty array" };
        }

        const jobsLiteral = toExtendScriptJsonLiteral(args.jobs);
        const workAreaType = workAreaTypeCode(args.work_area_type);

        const script = buildToolScript(`
          var encoder = app.encoder;
          if (!encoder) return __error("Adobe Media Encoder not available");
          if (typeof encoder.launchEncoder !== "function") return __error("encoder.launchEncoder is not available");
          if (typeof encoder.encodeSequence !== "function") return __error("encoder.encodeSequence is not available");
          if (${args.start_queue ? "true" : "false"} && typeof encoder.startBatch !== "function") {
            return __error("encoder.startBatch is not available");
          }

          var jobs = ${jobsLiteral};
          var queued = [];
          var errors = [];
          encoder.launchEncoder();

          for (var i = 0; i < jobs.length; i++) {
            var job = jobs[i];
            var outputPath = job.output_path || job.outputPath;
            var presetPath = job.preset_path || job.presetPath;
            if (!outputPath) {
              errors.push({ index: i, error: "Missing output_path" });
              continue;
            }
            if (!presetPath) {
              errors.push({ index: i, error: "Missing preset_path" });
              continue;
            }

            var seq = job.sequence_id ? __findSequence(String(job.sequence_id)) : app.project.activeSequence;
            if (!seq) {
              errors.push({ index: i, outputPath: outputPath, error: "Sequence not found" });
              continue;
            }

            var presetFile = new File(String(presetPath));
            if (!presetFile.exists) {
              errors.push({ index: i, sequence: seq.name, outputPath: outputPath, error: "Preset file not found: " + presetPath });
              continue;
            }

            try {
              var jobId = encoder.encodeSequence(
                seq,
                String(outputPath),
                presetFile.fsName,
                ${workAreaType},
                ${args.remove_on_completion !== false ? 1 : 0}
              );
              queued.push({
                index: i,
                sequence: seq.name,
                sequenceId: seq.sequenceID,
                outputPath: String(outputPath),
                presetPath: presetFile.fsName,
                jobId: jobId || null
              });
            } catch(e) {
              errors.push({ index: i, sequence: seq ? seq.name : null, outputPath: outputPath, error: e.toString() });
            }
          }

          var started = false;
          if (${args.start_queue ? "true" : "false"} && queued.length > 0) {
            encoder.startBatch();
            started = true;
          }

          return __result({
            queued: queued.length,
            failed: errors.length,
            started: started,
            workAreaType: "${escapeForExtendScript(args.work_area_type || "entire")}",
            jobs: queued,
            errors: errors
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    batch_export_interchange: {
      description:
        "Export active, selected, or all sequences to FCP XML, AAF, and/or OMF interchange files in one pass.",
      parameters: {
        type: "object" as const,
        properties: {
          output_directory: {
            type: "string",
            description: "Existing folder where interchange files should be written.",
          },
          formats: {
            type: "array",
            description: "Array containing one or more of: fcp_xml, aaf, omf.",
          },
          sequence_ids: {
            type: "array",
            description: "Optional sequence IDs/names to export. Omit to use the active sequence.",
          },
          include_all_sequences: {
            type: "boolean",
            description: "Export every sequence in the project instead of only the active sequence.",
          },
          suppress_ui: {
            type: "boolean",
            description: "Suppress dialogs where supported (default: true).",
          },
          sample_rate: {
            type: "number",
            description: "AAF/OMF audio sample rate (default: 48000).",
          },
          bits_per_sample: {
            type: "number",
            description: "AAF/OMF audio bit depth (default: 16).",
          },
          handle_frames: {
            type: "number",
            description: "OMF handle length in frames when trimming (default: 1000).",
          },
        },
        required: ["output_directory", "formats"],
      },
      handler: async (args: {
        output_directory: string;
        formats: string[];
        sequence_ids?: string[];
        include_all_sequences?: boolean;
        suppress_ui?: boolean;
        sample_rate?: number;
        bits_per_sample?: number;
        handle_frames?: number;
      }) => {
        const allowedFormats = new Set(["fcp_xml", "aaf", "omf"]);
        const formats = Array.isArray(args.formats)
          ? args.formats.filter((format) => allowedFormats.has(format))
          : [];
        if (formats.length === 0) {
          return { success: false, error: "formats must include at least one of: fcp_xml, aaf, omf" };
        }

        const formatsLiteral = toExtendScriptJsonLiteral(formats);
        const sequenceIdsLiteral = toExtendScriptJsonLiteral(args.sequence_ids || []);

        const script = buildToolScript(`
          var outputFolder = new Folder("${escapeForExtendScript(args.output_directory)}");
          if (!outputFolder.exists) return __error("Output directory not found: ${escapeForExtendScript(args.output_directory)}");

          var formats = ${formatsLiteral};
          var sequenceIds = ${sequenceIdsLiteral};
          var sequences = [];
          var errors = [];
          var exported = [];

          function safeFileName(name) {
            return String(name).replace(/[\\\\\\/:*?"<>|]/g, "_");
          }

          if (${args.include_all_sequences ? "true" : "false"}) {
            for (var s = 0; s < app.project.sequences.numSequences; s++) {
              sequences.push(app.project.sequences[s]);
            }
          } else if (sequenceIds.length > 0) {
            for (var i = 0; i < sequenceIds.length; i++) {
              var foundSeq = __findSequence(String(sequenceIds[i]));
              if (foundSeq) {
                sequences.push(foundSeq);
              } else {
                errors.push({ sequenceId: String(sequenceIds[i]), error: "Sequence not found" });
              }
            }
          } else if (app.project.activeSequence) {
            sequences.push(app.project.activeSequence);
          }

          if (sequences.length === 0) return __error("No sequences selected for interchange export");

          for (var q = 0; q < sequences.length; q++) {
            var seq = sequences[q];
            var basePath = outputFolder.fsName + "/" + safeFileName(seq.name);
            for (var f = 0; f < formats.length; f++) {
              var format = formats[f];
              try {
                if (format === "fcp_xml") {
                  if (typeof seq.exportAsFinalCutProXML !== "function") {
                    errors.push({ sequence: seq.name, format: format, error: "exportAsFinalCutProXML is not available" });
                    continue;
                  }
                  var xmlPath = basePath + ".xml";
                  var xmlResult = seq.exportAsFinalCutProXML(xmlPath, ${args.suppress_ui !== false ? "1" : "0"});
                  if (xmlResult === false) {
                    errors.push({ sequence: seq.name, format: format, outputPath: xmlPath, error: "exportAsFinalCutProXML returned false" });
                  } else {
                    exported.push({ sequence: seq.name, format: format, outputPath: xmlPath });
                  }
                } else if (format === "aaf") {
                  if (typeof app.project.exportAAF !== "function") {
                    errors.push({ sequence: seq.name, format: format, error: "project.exportAAF is not available" });
                    continue;
                  }
                  var aafPath = basePath + ".aaf";
                  var aafResult = app.project.exportAAF(
                    seq,
                    aafPath,
                    1,
                    0,
                    ${args.sample_rate ?? 48000},
                    ${args.bits_per_sample ?? 16}
                  );
                  if (aafResult === false) {
                    errors.push({ sequence: seq.name, format: format, outputPath: aafPath, error: "project.exportAAF returned false" });
                  } else {
                    exported.push({ sequence: seq.name, format: format, outputPath: aafPath });
                  }
                } else if (format === "omf") {
                  if (typeof app.project.exportOMF !== "function") {
                    errors.push({ sequence: seq.name, format: format, error: "project.exportOMF is not available" });
                    continue;
                  }
                  var omfPath = basePath + ".omf";
                  var omfResult = app.project.exportOMF(
                    seq,
                    omfPath,
                    safeFileName(seq.name),
                    ${args.sample_rate ?? 48000},
                    ${args.bits_per_sample ?? 16},
                    1,
                    1,
                    1,
                    1,
                    ${args.handle_frames ?? 1000}
                  );
                  if (omfResult === false) {
                    errors.push({ sequence: seq.name, format: format, outputPath: omfPath, error: "project.exportOMF returned false" });
                  } else {
                    exported.push({ sequence: seq.name, format: format, outputPath: omfPath });
                  }
                }
              } catch(e) {
                errors.push({ sequence: seq.name, format: format, error: e.toString() });
              }
            }
          }

          return __result({
            exported: exported.length,
            failed: errors.length,
            files: exported,
            errors: errors
          });
        `);
        return sendCommand(script, { ...bridgeOptions, timeoutMs: 300000 });
      },
    },

    manage_proxies: {
      description: "Create or attach proxies for a project item",
      parameters: {
        type: "object" as const,
        properties: {
          item_id: {
            type: "string",
            description: "Node ID or name of the project item",
          },
          action: {
            type: "string",
            enum: ["create", "attach", "toggle"],
            description: "Action to perform on proxies",
          },
          proxy_path: {
            type: "string",
            description: "Path to proxy file (required for 'attach' action)",
          },
        },
        required: ["item_id", "action"],
      },
      handler: async (args: { item_id: string; action: string; proxy_path?: string }) => {
        const script = buildToolScript(`
          var item = __findProjectItem("${escapeForExtendScript(args.item_id)}");
          if (!item) return __error("Item not found");
          
          var action = "${args.action}";
          
          if (action === "create") {
            item.createProxy("", 0);
            return __result({ action: "create", item: item.name, status: "Proxy creation started" });
          } else if (action === "attach") {
            ${args.proxy_path
              ? `item.attachProxy("${escapeForExtendScript(args.proxy_path)}", 0);
                 return __result({ action: "attach", item: item.name, proxyPath: "${escapeForExtendScript(args.proxy_path)}" });`
              : `return __error("proxy_path is required for attach action");`
            }
          } else if (action === "toggle") {
            app.project.setProxyEnabled(!app.project.isProxyEnabled());
            return __result({ action: "toggle", proxiesEnabled: !app.project.isProxyEnabled() });
          }
          
          return __error("Unknown proxy action: " + action);
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
