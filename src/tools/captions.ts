import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

interface NormalizedSrtCaption {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

function parseSrtTime(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) {
    throw new Error(`Invalid SRT timecode: ${value}`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, "0"));

  if (minutes > 59 || seconds > 59) {
    throw new Error(`Invalid SRT timecode range: ${value}`);
  }

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function formatSrtTime(seconds: number): string {
  const totalMillis = Math.max(0, Math.round(seconds * 1000));
  const millis = totalMillis % 1000;
  const totalSeconds = Math.floor(totalMillis / 1000);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad2 = (value: number) => String(value).padStart(2, "0");
  const pad3 = (value: number) => String(value).padStart(3, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)},${pad3(millis)}`;
}

function parseSrt(content: string): NormalizedSrtCaption[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  return normalized.split(/\n{2,}/).map((block, blockIndex) => {
    const lines = block.split("\n");
    let lineIndex = 0;
    let index = blockIndex + 1;

    if (/^\d+$/.test(lines[0].trim())) {
      index = Number(lines[0].trim());
      lineIndex = 1;
    }

    const timingLine = lines[lineIndex];
    if (!timingLine || timingLine.indexOf("-->") === -1) {
      throw new Error(`Caption ${index} is missing an SRT timing line`);
    }

    const [startRaw, endRaw] = timingLine.split("-->").map((value) => value.trim());
    const startSeconds = parseSrtTime(startRaw);
    const endSeconds = parseSrtTime(endRaw);
    if (endSeconds <= startSeconds) {
      throw new Error(`Caption ${index} must end after it starts`);
    }

    const text = lines.slice(lineIndex + 1).join("\n").trim();
    if (!text) {
      throw new Error(`Caption ${index} is missing text`);
    }

    return { index, startSeconds, endSeconds, text };
  });
}

function normalizeCaptionInput(caption: unknown, index: number): NormalizedSrtCaption {
  if (!caption || typeof caption !== "object" || Array.isArray(caption)) {
    throw new Error(`Caption ${index} must be an object`);
  }

  const item = caption as Record<string, unknown>;
  const rawStart = item.start_seconds ?? item.startSeconds ?? item.start;
  const rawEnd = item.end_seconds ?? item.endSeconds ?? item.end;
  const rawText = item.text;
  const startSeconds = typeof rawStart === "number" ? rawStart : undefined;
  const endSeconds = typeof rawEnd === "number" ? rawEnd : undefined;
  const text = typeof rawText === "string" ? rawText.trim() : "";

  if (startSeconds === undefined || !Number.isFinite(startSeconds)) {
    throw new Error(`Caption ${index} needs a numeric start_seconds value`);
  }
  if (endSeconds === undefined || !Number.isFinite(endSeconds)) {
    throw new Error(`Caption ${index} needs a numeric end_seconds value`);
  }
  if (endSeconds <= startSeconds) {
    throw new Error(`Caption ${index} must end after it starts`);
  }
  if (!text) {
    throw new Error(`Caption ${index} needs non-empty text`);
  }

  return {
    index,
    startSeconds,
    endSeconds,
    text,
  };
}

function renderSrt(captions: unknown[]): string {
  return captions
    .map((caption, arrayIndex) => normalizeCaptionInput(caption, arrayIndex + 1))
    .map((caption) => [
      String(caption.index),
      `${formatSrtTime(caption.startSeconds)} --> ${formatSrtTime(caption.endSeconds)}`,
      caption.text,
    ].join("\n"))
    .join("\n\n") + "\n";
}

export function getCaptionTools(bridgeOptions: BridgeOptions) {
  return {
    parse_srt_file: {
      description:
        "Parse a local .srt file into normalized caption entries without contacting Premiere.",
      parameters: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Full path to the .srt file to parse.",
          },
        },
        required: ["file_path"],
      },
      handler: async (args: { file_path: string }) => {
        if (!existsSync(args.file_path)) {
          return { success: false, error: `SRT file not found: ${args.file_path}` };
        }

        try {
          const content = readFileSync(args.file_path, "utf-8");
          const captions = parseSrt(content);
          const durationSeconds = captions.length > 0
            ? captions[captions.length - 1].endSeconds
            : 0;
          return {
            success: true,
            data: {
              captionCount: captions.length,
              durationSeconds,
              captions,
              requiresPremiere: false,
              requiresCepBridge: false,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },

    write_srt_file: {
      description:
        "Write normalized caption entries to a local .srt file without contacting Premiere.",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full path where the .srt file should be written.",
          },
          captions: {
            type: "array",
            description:
              "Caption objects with start_seconds, end_seconds, and text fields.",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite an existing file (default: false).",
          },
        },
        required: ["output_path", "captions"],
      },
      handler: async (args: { output_path: string; captions: unknown[]; overwrite?: boolean }) => {
        if (existsSync(args.output_path) && !args.overwrite) {
          return {
            success: false,
            error: `Output file already exists: ${args.output_path}. Pass overwrite=true to replace it.`,
          };
        }

        if (!Array.isArray(args.captions) || args.captions.length === 0) {
          return { success: false, error: "captions must be a non-empty array" };
        }

        try {
          const content = renderSrt(args.captions);
          writeFileSync(args.output_path, content, "utf-8");
          const parsed = parseSrt(content);
          return {
            success: true,
            data: {
              written: true,
              outputPath: args.output_path,
              captionCount: parsed.length,
              durationSeconds: parsed[parsed.length - 1].endSeconds,
              requiresPremiere: false,
              requiresCepBridge: false,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },

    import_caption_file: {
      description:
        "Import a local caption sidecar file (.srt, .vtt, .scc, .mcc, .stl) into the project.",
      parameters: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Full path to the caption sidecar file.",
          },
          target_bin: {
            type: "string",
            description: "Optional target bin name or node ID. Imports to root if omitted.",
          },
          suppress_ui: {
            type: "boolean",
            description: "Suppress import dialogs (default: true).",
          },
        },
        required: ["file_path"],
      },
      handler: async (args: { file_path: string; target_bin?: string; suppress_ui?: boolean }) => {
        const binLookup = args.target_bin
          ? `var targetBin = __findProjectItem("${escapeForExtendScript(args.target_bin)}");
             if (!targetBin) return __error("Target bin not found: ${escapeForExtendScript(args.target_bin)}");
             if (targetBin.type !== 2) return __error("Target item is not a bin: ${escapeForExtendScript(args.target_bin)}");`
          : `var targetBin = app.project.rootItem;`;

        const script = buildToolScript(`
          ${binLookup}
          var captionFile = new File("${escapeForExtendScript(args.file_path)}");
          if (!captionFile.exists) return __error("Caption file not found: ${escapeForExtendScript(args.file_path)}");

          var lowerName = captionFile.name.toLowerCase();
          var allowed = [".srt", ".vtt", ".scc", ".mcc", ".stl"];
          var supported = false;
          for (var i = 0; i < allowed.length; i++) {
            if (lowerName.substr(lowerName.length - allowed[i].length) === allowed[i]) {
              supported = true;
              break;
            }
          }
          if (!supported) return __error("Unsupported caption sidecar extension: " + captionFile.name);

          var imported = app.project.importFiles(
            [captionFile.fsName],
            ${args.suppress_ui !== false ? "true" : "false"},
            targetBin,
            false
          );
          if (!imported) return __error("Caption file import failed");

          var item = __findProjectItem(captionFile.name);
          return __result({
            imported: true,
            filePath: captionFile.fsName,
            itemName: item ? item.name : captionFile.name,
            nodeId: item ? item.nodeId : null
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    get_caption_api_capabilities: {
      description:
        "Report caption-related Premiere ExtendScript APIs exposed by the current runtime without editing the project.",
      parameters: {},
      handler: async () => {
        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          var sequenceCapabilities = {
            hasActiveSequence: !!seq,
            createCaptionTrack: false,
            exportCaptionTrack: false,
            exportCaptions: false,
            exportCaption: false
          };

          if (seq) {
            sequenceCapabilities.createCaptionTrack = typeof seq.createCaptionTrack === "function";
            sequenceCapabilities.exportCaptionTrack = typeof seq.exportCaptionTrack === "function";
            sequenceCapabilities.exportCaptions = typeof seq.exportCaptions === "function";
            sequenceCapabilities.exportCaption = typeof seq.exportCaption === "function";
          }

          return __result({
            readOnly: true,
            sequence: sequenceCapabilities,
            supportedSidecarImports: [".srt", ".vtt", ".scc", ".mcc", ".stl"],
            limitations: [
              "Caption track creation requires an imported caption ProjectItem.",
              "Caption edit/export methods are version-dependent and may not be exposed through ExtendScript."
            ]
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    create_caption_track: {
      description:
        "Create a caption/subtitle track in the active sequence from an imported caption file (e.g., .srt, .vtt)",
      parameters: {
        type: "object" as const,
        properties: {
          item_id: {
            type: "string",
            description:
              "Node ID or name of the imported caption project item (e.g., an .srt file)",
          },
          start_seconds: {
            type: "number",
            description:
              "Offset in seconds from the start of the sequence (default: 0)",
          },
          caption_format: {
            type: "string",
            description:
              "Caption format: 'subtitle' (default), '608', '708', 'teletext', 'ebu', 'op42', 'op47'",
          },
        },
        required: ["item_id"],
      },
      handler: async (args: {
        item_id: string;
        start_seconds?: number;
        caption_format?: string;
      }) => {
        const startSeconds = args.start_seconds ?? 0;
        const requestedFormat = args.caption_format || "subtitle";
        const formatMap: Record<string, string> = {
          subtitle: "Sequence.CAPTION_FORMAT_SUBTITLE",
          "608": "Sequence.CAPTION_FORMAT_608",
          "708": "Sequence.CAPTION_FORMAT_708",
          teletext: "Sequence.CAPTION_FORMAT_TELETEXT",
          ebu: "Sequence.CAPTION_FORMAT_OPEN_EBU",
          op42: "Sequence.CAPTION_FORMAT_OP42",
          op47: "Sequence.CAPTION_FORMAT_OP47",
        };
        const format = formatMap[requestedFormat];
        if (!format) {
          return {
            success: false,
            error: `Unsupported caption_format: ${requestedFormat}. Supported values: ${Object.keys(formatMap).join(", ")}`,
          };
        }

        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          if (typeof seq.createCaptionTrack !== "function") {
            return __error("createCaptionTrack is not available in this Premiere ExtendScript runtime");
          }
          
          var item = __findProjectItem("${escapeForExtendScript(args.item_id)}");
          if (!item) return __error("Caption item not found: ${escapeForExtendScript(args.item_id)}");
          
          var result = seq.createCaptionTrack(item, ${startSeconds}, ${format});
          if (!result) return __error("Failed to create caption track");
          return __result({ created: true, item: item.name, startSeconds: ${startSeconds}, format: "${escapeForExtendScript(requestedFormat)}" });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
