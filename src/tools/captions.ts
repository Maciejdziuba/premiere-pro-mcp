import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";
import { getDisabledUxpBridgeStatus, sendUxpCommand, type UxpBridge } from "../bridge/uxp-bridge.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

interface NormalizedSrtCaption {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

interface TranscriptWord {
  confidence: number;
  duration: number;
  eos: boolean;
  start: number;
  tags: string[];
  text: string;
  type: "word" | "punctuation";
}

interface TranscriptSegment {
  duration: number;
  language: string;
  speaker: string;
  start: number;
  words: TranscriptWord[];
}

interface TranscriptSpeaker {
  id: string;
  name: string;
}

interface AdobeTranscript {
  language: string;
  segments: TranscriptSegment[];
  speakers: TranscriptSpeaker[];
}

const ADOBE_TRANSCRIPT_SCHEMA_ID = "https://schemas.adobe.com/transcript/v1.0.0";
const DEFAULT_SPEAKER_ID = "00000000-0000-4000-8000-000000000001";
const SUPPORTED_TRANSCRIPT_LANGUAGES = [
  "en-us", "en-gb", "zh-hk", "cmn-hans", "cmn-hant", "es-es", "de-de",
  "fr-fr", "ja-jp", "pt-pt", "pt-br", "ko-kr", "it-it", "ru-ru", "hi-in",
  "nb-no", "sv-se", "nl-nl", "da-dk", "id-id", "th-th", "vi-vn", "ms-my",
  "tr-tr", "pl-pl", "fil-ph", "te-in", "ml-in", "pa-in", "??-??",
];

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireNumber(value: unknown, path: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
    throw new Error(`${path} must be a finite number >= ${min}`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function requireTextString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string`);
  }
  return value;
}

function validateLanguageCode(value: unknown, path: string): string {
  const language = requireString(value, path).toLowerCase();
  if (!SUPPORTED_TRANSCRIPT_LANGUAGES.includes(language)) {
    throw new Error(`${path} must be a Premiere transcript language code`);
  }
  return language;
}

function validateUuid(value: unknown, path: string): string {
  const text = requireString(value, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`${path} must be a UUID`);
  }
  return text;
}

function normalizeTranscriptJson(value: unknown): AdobeTranscript {
  if (!isPlainObject(value)) {
    throw new Error("transcript must be an object");
  }

  const language = validateLanguageCode(value.language, "transcript.language");

  if (!Array.isArray(value.speakers) || value.speakers.length === 0) {
    throw new Error("transcript.speakers must be a non-empty array");
  }
  const speakers = value.speakers.map((speaker, speakerIndex) => {
    if (!isPlainObject(speaker)) {
      throw new Error(`transcript.speakers[${speakerIndex}] must be an object`);
    }
    return {
      id: validateUuid(speaker.id, `transcript.speakers[${speakerIndex}].id`),
      name: requireString(speaker.name, `transcript.speakers[${speakerIndex}].name`),
    };
  });
  const speakerIds = new Set(speakers.map((speaker) => speaker.id));

  if (!Array.isArray(value.segments) || value.segments.length === 0) {
    throw new Error("transcript.segments must be a non-empty array");
  }
  const segments = value.segments.map((segment, segmentIndex) => {
    if (!isPlainObject(segment)) {
      throw new Error(`transcript.segments[${segmentIndex}] must be an object`);
    }

    const speaker = validateUuid(segment.speaker, `transcript.segments[${segmentIndex}].speaker`);
    if (!speakerIds.has(speaker)) {
      throw new Error(`transcript.segments[${segmentIndex}].speaker must reference transcript.speakers`);
    }
    if (!Array.isArray(segment.words) || segment.words.length === 0) {
      throw new Error(`transcript.segments[${segmentIndex}].words must be a non-empty array`);
    }

    const words = segment.words.map((word, wordIndex) => {
      if (!isPlainObject(word)) {
        throw new Error(`transcript.segments[${segmentIndex}].words[${wordIndex}] must be an object`);
      }
      const confidence = requireNumber(
        word.confidence,
        `transcript.segments[${segmentIndex}].words[${wordIndex}].confidence`
      );
      if (confidence > 1) {
        throw new Error(`transcript.segments[${segmentIndex}].words[${wordIndex}].confidence must be <= 1`);
      }
      const type = requireString(
        word.type,
        `transcript.segments[${segmentIndex}].words[${wordIndex}].type`
      );
      if (type !== "word" && type !== "punctuation") {
        throw new Error(`transcript.segments[${segmentIndex}].words[${wordIndex}].type must be word or punctuation`);
      }
      const wordType: "word" | "punctuation" = type;
      if (!Array.isArray(word.tags) || word.tags.some((tag) => typeof tag !== "string")) {
        throw new Error(`transcript.segments[${segmentIndex}].words[${wordIndex}].tags must be an array of strings`);
      }
      const tags = word.tags as string[];
      return {
        confidence,
        duration: requireNumber(
          word.duration,
          `transcript.segments[${segmentIndex}].words[${wordIndex}].duration`
        ),
        eos: typeof word.eos === "boolean" ? word.eos : false,
        start: requireNumber(word.start, `transcript.segments[${segmentIndex}].words[${wordIndex}].start`),
        tags,
        text: requireTextString(word.text, `transcript.segments[${segmentIndex}].words[${wordIndex}].text`),
        type: wordType,
      };
    });

    return {
      duration: requireNumber(segment.duration, `transcript.segments[${segmentIndex}].duration`),
      language: validateLanguageCode(segment.language, `transcript.segments[${segmentIndex}].language`),
      speaker,
      start: requireNumber(segment.start, `transcript.segments[${segmentIndex}].start`),
      words,
    };
  });

  return { language, segments, speakers };
}

function summarizeTranscript(transcript: AdobeTranscript) {
  const durationSeconds = transcript.segments.reduce((max, segment) => {
    return Math.max(max, segment.start + segment.duration);
  }, 0);
  const wordCount = transcript.segments.reduce((sum, segment) => sum + segment.words.length, 0);
  return {
    schema: ADOBE_TRANSCRIPT_SCHEMA_ID,
    language: transcript.language,
    segmentCount: transcript.segments.length,
    wordCount,
    speakerCount: transcript.speakers.length,
    durationSeconds,
  };
}

function segmentText(words: TranscriptWord[]): string {
  let text = "";
  for (const word of words) {
    if (!text || word.type === "punctuation" || /^[,.;:!?)]/.test(word.text)) {
      text += word.text;
    } else {
      text += " " + word.text;
    }
  }
  return text.trim();
}

function transcriptToSrtCaptions(transcript: AdobeTranscript): NormalizedSrtCaption[] {
  return transcript.segments.map((segment, index) => {
    const endSeconds = segment.start + segment.duration;
    if (endSeconds <= segment.start) {
      throw new Error(`Transcript segment ${index + 1} must end after it starts`);
    }
    return {
      index: index + 1,
      startSeconds: segment.start,
      endSeconds,
      text: segmentText(segment.words),
    };
  });
}

function srtCaptionsToTranscript(
  captions: NormalizedSrtCaption[],
  language: string,
  speakerName: string,
  speakerId: string
): AdobeTranscript {
  const normalizedLanguage = validateLanguageCode(language, "language");
  const normalizedSpeakerId = validateUuid(speakerId, "speaker_id");
  const normalizedSpeakerName = requireString(speakerName, "speaker_name");

  const segments = captions.map((caption) => {
    const tokens = caption.text.replace(/\s+/g, " ").trim().split(" ");
    const duration = caption.endSeconds - caption.startSeconds;
    var cursor = caption.startSeconds;
    const wordDuration = duration / Math.max(tokens.length, 1);
    const words = tokens.map((token, tokenIndex) => {
      const isLast = tokenIndex === tokens.length - 1;
      const item = {
        confidence: 1,
        duration: wordDuration,
        eos: isLast,
        start: cursor,
        tags: [],
        text: token,
        type: "word" as const,
      };
      cursor += wordDuration;
      return item;
    });

    return {
      duration,
      language: normalizedLanguage,
      speaker: normalizedSpeakerId,
      start: caption.startSeconds,
      words,
    };
  });

  return {
    language: normalizedLanguage,
    segments,
    speakers: [{ id: normalizedSpeakerId, name: normalizedSpeakerName }],
  };
}

function readTranscriptJsonFile(filePath: string): AdobeTranscript {
  if (!existsSync(filePath)) {
    throw new Error(`Transcript JSON file not found: ${filePath}`);
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
  return normalizeTranscriptJson(parsed);
}

function unsupportedTextPanelResult(operation: string) {
  return {
    success: false,
    error:
      `${operation} is not available through this MCP server's CEP/ExtendScript bridge. ` +
      "Premiere Pro 25+ exposes Text panel transcript import/export through UXP " +
      "(`premierepro`.Transcript.exportToJSON/importFromJSON/createImportTextSegmentsAction, " +
      "with `premierepro`.Transcript.hasTranscript optional in Premiere 26.2), " +
      "but CEP evalScript cannot call UXP modules and Adobe has not exposed Speech-to-Text auto-transcribe " +
      "or Text panel transcript import/export in ExtendScript.",
  };
}

function extractObjectData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function objectHasKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function buildUxpDiagnosticData(
  value: unknown,
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  const diagnostic = extractObjectData(value);
  const capabilities = extractObjectData(diagnostic.runtimeTranscriptCapabilities);
  const data: Record<string, unknown> = {
    ...context,
    requiresPremiere: true,
    requiresCepBridge: false,
    requiresUxpPanel: true,
  };

  if (objectHasKeys(diagnostic)) {
    data.uxpDiagnostic = diagnostic;
  }
  if (Array.isArray(diagnostic.missingMethods)) {
    data.missingMethods = diagnostic.missingMethods;
  }
  if (objectHasKeys(capabilities)) {
    data.runtimeTranscriptCapabilities = capabilities;
  }

  return data;
}

function describeValueShape(value: unknown, depth = 0): unknown {
  if (value === null) return { type: "null" };
  if (value === undefined) return { type: "undefined" };
  if (typeof value === "string") {
    return {
      type: "string",
      length: value.length,
      prefix: value.slice(0, 240),
    };
  }
  if (typeof value !== "object") {
    return { type: typeof value, value };
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      first: depth < 3 && value.length > 0 ? describeValueShape(value[0], depth + 1) : undefined,
    };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).slice(0, 40);
  const sample: Record<string, unknown> = {};
  if (depth < 2) {
    for (const key of keys.slice(0, 10)) {
      sample[key] = describeValueShape(record[key], depth + 1);
    }
  }

  return {
    type: "object",
    keys,
    sample,
  };
}

function extractHasTranscript(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const data = extractObjectData(value);
  if (typeof data.hasTranscript === "boolean") return data.hasTranscript;
  if (typeof data.has_transcript === "boolean") return data.has_transcript;
  return null;
}

function transcriptCandidate(value: unknown): unknown {
  const data = extractObjectData(value);
  return data.transcript ?? data.transcriptJson ?? data.transcript_json ?? value;
}

function parseTranscriptCandidate(value: unknown): unknown {
  const candidate = transcriptCandidate(value);
  if (typeof candidate === "string") {
    return JSON.parse(candidate);
  }
  return candidate;
}

function extractTranscript(value: unknown): AdobeTranscript | null {
  try {
    return normalizeTranscriptJson(parseTranscriptCandidate(value));
  } catch {
    return null;
  }
}

function transcriptValidationError(value: unknown): string | null {
  try {
    normalizeTranscriptJson(parseTranscriptCandidate(value));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function uxpTranscriptError(operation: string, error: string | undefined): string {
  return [
    `${operation} failed: ${error || "UXP bridge unavailable"}.`,
    "Start the MCP server with PREMIERE_UXP_BRIDGE_ENABLED=true, load uxp-panel/manifest.json in Adobe UXP Developer Tool, and keep the panel polling GET /uxp/poll.",
  ].join(" ");
}

export interface CaptionToolOptions {
  uxpBridge?: UxpBridge;
}

export function getCaptionTools(bridgeOptions: BridgeOptions, options: CaptionToolOptions = {}) {
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

    parse_transcript_json_file: {
      description:
        "Parse and validate a local Adobe Text panel transcript JSON file without contacting Premiere.",
      parameters: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Full path to an Adobe transcript JSON file.",
          },
        },
        required: ["file_path"],
      },
      handler: async (args: { file_path: string }) => {
        try {
          const transcript = readTranscriptJsonFile(args.file_path);
          return {
            success: true,
            data: {
              ...summarizeTranscript(transcript),
              transcript,
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

    write_transcript_json_file: {
      description:
        "Validate and write an Adobe Text panel transcript JSON file without contacting Premiere.",
      parameters: {
        type: "object" as const,
        properties: {
          output_path: {
            type: "string",
            description: "Full path where the transcript JSON should be written.",
          },
          transcript: {
            type: "object",
            description:
              "Adobe transcript JSON object with language, speakers, segments, and timed words.",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite an existing file (default: false).",
          },
        },
        required: ["output_path", "transcript"],
      },
      handler: async (args: { output_path: string; transcript: unknown; overwrite?: boolean }) => {
        if (existsSync(args.output_path) && !args.overwrite) {
          return {
            success: false,
            error: `Output file already exists: ${args.output_path}. Pass overwrite=true to replace it.`,
          };
        }

        try {
          const transcript = normalizeTranscriptJson(args.transcript);
          writeFileSync(args.output_path, JSON.stringify(transcript, null, 2) + "\n", "utf-8");
          return {
            success: true,
            data: {
              written: true,
              outputPath: args.output_path,
              ...summarizeTranscript(transcript),
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

    convert_srt_to_transcript_json_file: {
      description:
        "Convert a local SRT file to Adobe Text panel transcript JSON without contacting Premiere.",
      parameters: {
        type: "object" as const,
        properties: {
          srt_path: {
            type: "string",
            description: "Full path to the source .srt file.",
          },
          output_path: {
            type: "string",
            description: "Full path where the transcript JSON should be written.",
          },
          language: {
            type: "string",
            description: "Premiere transcript language code (default: en-us).",
          },
          speaker_name: {
            type: "string",
            description: "Speaker display name for generated transcript segments (default: Speaker 1).",
          },
          speaker_id: {
            type: "string",
            description: "UUID speaker id (default: deterministic generated id).",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite an existing file (default: false).",
          },
        },
        required: ["srt_path", "output_path"],
      },
      handler: async (args: {
        srt_path: string;
        output_path: string;
        language?: string;
        speaker_name?: string;
        speaker_id?: string;
        overwrite?: boolean;
      }) => {
        if (!existsSync(args.srt_path)) {
          return { success: false, error: `SRT file not found: ${args.srt_path}` };
        }
        if (existsSync(args.output_path) && !args.overwrite) {
          return {
            success: false,
            error: `Output file already exists: ${args.output_path}. Pass overwrite=true to replace it.`,
          };
        }

        try {
          const captions = parseSrt(readFileSync(args.srt_path, "utf-8"));
          if (captions.length === 0) {
            return { success: false, error: "SRT file contains no captions" };
          }
          const transcript = srtCaptionsToTranscript(
            captions,
            args.language || "en-us",
            args.speaker_name || "Speaker 1",
            args.speaker_id || DEFAULT_SPEAKER_ID
          );
          writeFileSync(args.output_path, JSON.stringify(transcript, null, 2) + "\n", "utf-8");
          return {
            success: true,
            data: {
              converted: true,
              sourcePath: args.srt_path,
              outputPath: args.output_path,
              captionCount: captions.length,
              ...summarizeTranscript(transcript),
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

    export_transcript_json_to_srt_file: {
      description:
        "Convert a local Adobe Text panel transcript JSON file to SRT without contacting Premiere.",
      parameters: {
        type: "object" as const,
        properties: {
          transcript_path: {
            type: "string",
            description: "Full path to an Adobe transcript JSON file.",
          },
          output_path: {
            type: "string",
            description: "Full path where the .srt file should be written.",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite an existing file (default: false).",
          },
        },
        required: ["transcript_path", "output_path"],
      },
      handler: async (args: { transcript_path: string; output_path: string; overwrite?: boolean }) => {
        if (existsSync(args.output_path) && !args.overwrite) {
          return {
            success: false,
            error: `Output file already exists: ${args.output_path}. Pass overwrite=true to replace it.`,
          };
        }

        try {
          const transcript = readTranscriptJsonFile(args.transcript_path);
          const captions = transcriptToSrtCaptions(transcript);
          writeFileSync(args.output_path, renderSrt(captions), "utf-8");
          return {
            success: true,
            data: {
              converted: true,
              sourcePath: args.transcript_path,
              outputPath: args.output_path,
              captionCount: captions.length,
              ...summarizeTranscript(transcript),
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
        "Report caption and transcript APIs exposed by this CEP/ExtendScript bridge without editing the project.",
      parameters: {},
      handler: async () => {
        const uxpBridgeStatus = options.uxpBridge?.getStatus() ?? getDisabledUxpBridgeStatus();
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
            bridge: {
              kind: "CEP/ExtendScript",
              canExecuteExtendScript: true,
              canExecuteUxpPremiereProModule: false
            },
            sequence: sequenceCapabilities,
            textPanelTranscript: {
              extendScriptImportExport: false,
              extendScriptAutoTranscribe: false,
              uxpPremiere25PlusApis: [
                "Transcript.exportToJSON(clipProjectItem)",
                "Transcript.importFromJSON(json)",
                "TextSegments.importFromJSON(json, callback) [alternate callback API, not used by MCP import]",
                "Transcript.createImportTextSegmentsAction(textSegments, clipProjectItem)",
                "Transcript.querySupportedLanguages()",
                "Transcript.hasTranscript(clipProjectItem) [optional; exportToJSON is the required export path]"
              ],
              currentBridgeCanInvokeUxpApis: false
            },
            supportedSidecarImports: [".srt", ".vtt", ".scc", ".mcc", ".stl"],
            supportedLocalTranscriptJsonSchema: "${ADOBE_TRANSCRIPT_SCHEMA_ID}",
            limitations: [
              "Caption track creation requires an imported caption ProjectItem.",
              "The Text panel transcript APIs are exposed in Premiere Pro UXP, not through CEP evalScript/ExtendScript.",
              "Adobe has not exposed Speech-to-Text auto-transcribe as a public ExtendScript or CEP API.",
              "This MCP server can prepare/validate Adobe transcript JSON locally and can import sidecar caption files through ExtendScript, but cannot attach/read Text panel transcripts without a UXP bridge."
            ]
          });
        `);
        const result = await sendCommand(script, bridgeOptions);
        if (!result.success) return result;
        return {
          success: true,
          data: {
            ...extractObjectData(result.data),
            uxpSidecarBridge: {
              enabled: uxpBridgeStatus.enabled,
              running: uxpBridgeStatus.running,
              url: uxpBridgeStatus.url,
              pollPath: uxpBridgeStatus.pollPath,
              resultPath: uxpBridgeStatus.resultPath,
              panelOnline: uxpBridgeStatus.panelOnline,
              pendingCommands: uxpBridgeStatus.pendingCommands,
              inFlightCommands: uxpBridgeStatus.inFlightCommands,
              currentBridgeCanInvokeUxpApis: uxpBridgeStatus.running && uxpBridgeStatus.panelOnline,
            },
          },
        };
      },
    },

    has_text_panel_transcript: {
      description:
        "Check whether a clip ProjectItem has a Text panel transcript through the Premiere UXP sidecar bridge.",
      parameters: {
        type: "object" as const,
        properties: {
          clip_project_item_id: {
            type: "string",
            description: "Project item node ID or name of the clip to check.",
          },
        },
        required: ["clip_project_item_id"],
      },
      handler: async (args: { clip_project_item_id: string }) => {
        const result = await sendUxpCommand(options.uxpBridge, "textPanel.hasTranscript", {
          clipProjectItemId: args.clip_project_item_id,
        });
        if (!result.success) {
          return {
            success: false,
            error: uxpTranscriptError("Text panel transcript check", result.error),
            data: buildUxpDiagnosticData(result.data, {
              clipProjectItemId: args.clip_project_item_id,
              operation: "has_text_panel_transcript",
            }),
          };
        }

        const hasTranscript = extractHasTranscript(result.data);
        if (hasTranscript === null) {
          return {
            success: false,
            error:
              "UXP bridge returned success but did not include a boolean hasTranscript value. " +
              "Expected result data like { hasTranscript: true|false }; refusing to claim transcript state.",
          };
        }
        const uxpData = extractObjectData(result.data);

        return {
          success: true,
          data: {
            clipProjectItemId: args.clip_project_item_id,
            hasTranscript,
            methodUsed: typeof uxpData.methodUsed === "string" ? uxpData.methodUsed : null,
            exportProbe: uxpData.exportProbe ?? null,
            runtimeTranscriptCapabilities: uxpData.runtimeTranscriptCapabilities ?? null,
            requiresPremiere: true,
            requiresCepBridge: false,
            requiresUxpPanel: true,
          },
        };
      },
    },

    import_text_panel_transcript: {
      description:
        "Import Adobe Text panel transcript JSON into a clip through the Premiere UXP sidecar bridge.",
      parameters: {
        type: "object" as const,
        properties: {
          transcript_path: {
            type: "string",
            description: "Full path to Adobe transcript JSON that a UXP implementation would import.",
          },
          clip_project_item_id: {
            type: "string",
            description: "Project item node ID or name of the target clip.",
          },
        },
        required: ["transcript_path", "clip_project_item_id"],
      },
      handler: async (args: { transcript_path: string; clip_project_item_id: string }) => {
        let transcript: AdobeTranscript;
        try {
          transcript = readTranscriptJsonFile(args.transcript_path);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        const result = await sendUxpCommand(options.uxpBridge, "textPanel.importTranscript", {
          clipProjectItemId: args.clip_project_item_id,
          transcript,
        });
        if (!result.success) {
          return {
            success: false,
            error: uxpTranscriptError("Text panel transcript import", result.error),
            data: buildUxpDiagnosticData(result.data, {
              clipProjectItemId: args.clip_project_item_id,
              transcriptPath: args.transcript_path,
              operation: "import_text_panel_transcript",
            }),
          };
        }

        const uxpData = extractObjectData(result.data);
        return {
          success: true,
          data: {
            imported: true,
            clipProjectItemId: args.clip_project_item_id,
            transcriptPath: args.transcript_path,
            ...summarizeTranscript(transcript),
            uxpResult: result.data ?? null,
            runtimeTranscriptCapabilities: uxpData.runtimeTranscriptCapabilities ?? null,
            requiresPremiere: true,
            requiresCepBridge: false,
            requiresUxpPanel: true,
          },
        };
      },
    },

    export_text_panel_transcript: {
      description:
        "Export a clip's Text panel transcript JSON through the Premiere UXP sidecar bridge.",
      parameters: {
        type: "object" as const,
        properties: {
          clip_project_item_id: {
            type: "string",
            description: "Project item node ID or name of the clip whose Text panel transcript should be exported.",
          },
          output_path: {
            type: "string",
            description: "Full path where the exported transcript JSON should be written.",
          },
          overwrite: {
            type: "boolean",
            description: "Overwrite an existing transcript JSON file (default: false).",
          },
        },
        required: ["clip_project_item_id", "output_path"],
      },
      handler: async (args: { clip_project_item_id: string; output_path: string; overwrite?: boolean }) => {
        if (existsSync(args.output_path) && !args.overwrite) {
          return {
            success: false,
            error: `Output file already exists: ${args.output_path}. Pass overwrite=true to replace it.`,
          };
        }

        const result = await sendUxpCommand(options.uxpBridge, "textPanel.exportTranscript", {
          clipProjectItemId: args.clip_project_item_id,
        });
        if (!result.success) {
          return {
            success: false,
            error: uxpTranscriptError("Text panel transcript export", result.error),
            data: buildUxpDiagnosticData(result.data, {
              clipProjectItemId: args.clip_project_item_id,
              outputPath: args.output_path,
              operation: "export_text_panel_transcript",
            }),
          };
        }

        const transcript = extractTranscript(result.data);
        if (!transcript) {
          const uxpData = extractObjectData(result.data);
          return {
            success: false,
            error:
              "UXP bridge returned success but did not include valid Adobe transcript JSON. " +
              "Expected result data like { transcript: { language, speakers, segments } }; refusing to write a false transcript export.",
            data: {
              ...buildUxpDiagnosticData(
                { runtimeTranscriptCapabilities: uxpData.runtimeTranscriptCapabilities },
                {
                  clipProjectItemId: args.clip_project_item_id,
                  outputPath: args.output_path,
                  operation: "export_text_panel_transcript",
                }
              ),
              methodUsed: typeof uxpData.methodUsed === "string" ? uxpData.methodUsed : null,
              validationError: transcriptValidationError(result.data),
              uxpResultShape: describeValueShape(result.data),
              transcriptCandidateShape: describeValueShape(transcriptCandidate(result.data)),
            },
          };
        }
        const uxpData = extractObjectData(result.data);

        writeFileSync(args.output_path, JSON.stringify(transcript, null, 2) + "\n", "utf-8");
        return {
          success: true,
          data: {
            exported: true,
            clipProjectItemId: args.clip_project_item_id,
            outputPath: args.output_path,
            ...summarizeTranscript(transcript),
            methodUsed: typeof uxpData.methodUsed === "string" ? uxpData.methodUsed : null,
            runtimeTranscriptCapabilities: uxpData.runtimeTranscriptCapabilities ?? null,
            requiresPremiere: true,
            requiresCepBridge: false,
            requiresUxpPanel: true,
          },
        };
      },
    },

    create_captions_from_text_panel_transcript: {
      description:
        "Unsupported in this CEP bridge: creating captions directly from Text panel transcript requires Premiere UXP/UI automation.",
      parameters: {
        type: "object" as const,
        properties: {
          clip_project_item_id: {
            type: "string",
            description: "Project item node ID or name of the clip with a Text panel transcript.",
          },
          start_seconds: {
            type: "number",
            description: "Sequence offset where captions would start.",
          },
        },
        required: ["clip_project_item_id"],
      },
      handler: async () => unsupportedTextPanelResult("Creating captions from a Text panel transcript"),
    },

    auto_transcribe_sequence: {
      description:
        "Unsupported: Premiere Speech-to-Text auto transcription is not exposed as a public CEP/ExtendScript MCP API.",
      parameters: {
        type: "object" as const,
        properties: {
          sequence_id: {
            type: "string",
            description: "Optional sequence ID/name that would be transcribed if Adobe exposed a scriptable API.",
          },
          language: {
            type: "string",
            description: "Requested transcription language code.",
          },
        },
      },
      handler: async () => unsupportedTextPanelResult("Speech-to-Text auto transcription"),
    },

    create_caption_track: {
      description:
        "Create a caption/subtitle track in the active sequence from an imported caption sidecar ProjectItem.",
      parameters: {
        type: "object" as const,
        properties: {
          sequence_id: {
            type: "string",
            description:
              "Optional sequence name or ID to receive the caption track. Uses the active sequence if omitted.",
          },
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
        sequence_id?: string;
        item_id: string;
        start_seconds?: number;
        caption_format?: string;
      }) => {
        const startSeconds = args.start_seconds ?? 0;
        if (!Number.isFinite(startSeconds) || startSeconds < 0) {
          return {
            success: false,
            error: "start_seconds must be a finite number >= 0",
          };
        }

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

        const seqLookup = args.sequence_id
          ? `var seq = __findSequence("${escapeForExtendScript(args.sequence_id)}");
             if (!seq) return __error("Sequence not found: ${escapeForExtendScript(args.sequence_id)}");
             app.project.activeSequence = seq;`
          : `var seq = app.project.activeSequence;
             if (!seq) return __error("No active sequence");`;

        const script = buildToolScript(`
          ${seqLookup}
          if (typeof seq.createCaptionTrack !== "function") {
            return __error("createCaptionTrack is not available in this Premiere ExtendScript runtime");
          }
          
          var item = __findProjectItem("${escapeForExtendScript(args.item_id)}");
          if (!item) return __error("Caption item not found: ${escapeForExtendScript(args.item_id)}");
          
          var result = seq.createCaptionTrack(item, ${startSeconds}, ${format});
          if (!result) return __error("Failed to create caption track");
          return __result({
            created: true,
            nativeCaptionTrack: true,
            method: "Sequence.createCaptionTrack",
            methodReturn: result,
            sequenceName: seq.name,
            sequenceId: seq.sequenceID,
            item: item.name,
            itemNodeId: item.nodeId,
            startSeconds: ${startSeconds},
            format: "${escapeForExtendScript(requestedFormat)}",
            formatConstant: "${escapeForExtendScript(format)}",
            captionTracksCollectionExposed: typeof seq.captionTracks !== "undefined",
            note: "Premiere Pro 2026 CEP/ExtendScript creates native caption tracks via createCaptionTrack but does not expose caption track items as video clips."
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    inspect_native_caption_sequence: {
      description:
        "Read-only inspection for native-caption support and caption-like PNG overlays on a sequence.",
      parameters: {
        type: "object" as const,
        properties: {
          sequence_id: {
            type: "string",
            description: "Optional sequence name or ID. Uses the active sequence if omitted.",
          },
          caption_item_id: {
            type: "string",
            description: "Optional caption sidecar ProjectItem node ID or name to include in the report.",
          },
        },
      },
      handler: async (args: { sequence_id?: string; caption_item_id?: string }) => {
        const seqLookup = args.sequence_id
          ? `var seq = __findSequence("${escapeForExtendScript(args.sequence_id)}");
             if (!seq) return __error("Sequence not found: ${escapeForExtendScript(args.sequence_id)}");`
          : `var seq = app.project.activeSequence;
             if (!seq) return __error("No active sequence");`;
        const captionItemLookup = args.caption_item_id
          ? `"${escapeForExtendScript(args.caption_item_id)}"`
          : "null";

        const script = buildToolScript(`
          ${seqLookup}

          function __isCaptionSidecarName(name) {
            var lower = String(name || "").toLowerCase();
            var extensions = [".srt", ".vtt", ".scc", ".mcc", ".stl"];
            for (var e = 0; e < extensions.length; e++) {
              if (lower.substr(lower.length - extensions[e].length) === extensions[e]) return true;
            }
            return false;
          }

          function __isCaptionPngOverlay(clip) {
            var name = "";
            var mediaPath = "";
            try { name = String(clip.name || ""); } catch(e) {}
            try {
              if (clip.projectItem && clip.projectItem.getMediaPath) {
                mediaPath = String(clip.projectItem.getMediaPath() || "");
              }
            } catch(e2) {}
            return name.indexOf("MCP_caption_text_overlay_") === 0 ||
              mediaPath.indexOf("MCP_caption_text_overlay_") !== -1;
          }

          function __scanVideoTracks(sequence) {
            var overlays = [];
            var videoTrackClipCounts = [];
            for (var t = 0; t < sequence.videoTracks.numTracks; t++) {
              var track = sequence.videoTracks[t];
              videoTrackClipCounts.push(track.clips.numItems);
              for (var c = 0; c < track.clips.numItems; c++) {
                var clip = track.clips[c];
                if (__isCaptionPngOverlay(clip)) {
                  overlays.push({
                    trackIndex: t,
                    clipIndex: c,
                    name: clip.name,
                    projectItemName: clip.projectItem ? clip.projectItem.name : null,
                    startSeconds: clip.start ? __ticksToSeconds(clip.start.ticks) : null,
                    endSeconds: clip.end ? __ticksToSeconds(clip.end.ticks) : null
                  });
                }
              }
            }
            return {
              videoTrackClipCounts: videoTrackClipCounts,
              captionPngOverlayCount: overlays.length,
              captionPngOverlaySamples: overlays.slice(0, 12)
            };
          }

          function __findCaptionItems(root, requested) {
            var matches = [];
            if (!root) root = app.project.rootItem;
            for (var i = 0; i < root.children.numItems; i++) {
              var item = root.children[i];
              var itemMatches = !requested || item.nodeId === requested || item.name === requested;
              if (itemMatches && __isCaptionSidecarName(item.name)) {
                var entry = {
                  name: item.name,
                  nodeId: item.nodeId,
                  type: item.type,
                  mediaPath: null
                };
                try { entry.mediaPath = item.getMediaPath(); } catch(e) {}
                matches.push(entry);
              }
              if (item.type === 2) {
                var childMatches = __findCaptionItems(item, requested);
                for (var c = 0; c < childMatches.length; c++) matches.push(childMatches[c]);
              }
            }
            return matches;
          }

          function __captionApiProbe(sequence) {
            var probe = {
              createCaptionTrack: typeof sequence.createCaptionTrack,
              exportCaptionTrack: typeof sequence.exportCaptionTrack,
              exportCaptions: typeof sequence.exportCaptions,
              exportCaption: typeof sequence.exportCaption,
              captionTracksType: typeof sequence.captionTracks,
              captionsType: typeof sequence.captions,
              captionTracksNumTracks: null,
              captionsNumItems: null
            };
            try { probe.captionTracksNumTracks = sequence.captionTracks ? sequence.captionTracks.numTracks : null; } catch(e) { probe.captionTracksNumTracksError = e.toString(); }
            try { probe.captionsNumItems = sequence.captions ? sequence.captions.numItems : null; } catch(e2) { probe.captionsNumItemsError = e2.toString(); }
            return probe;
          }

          function __qeCaptionApiProbe() {
            var probe = { available: false };
            try {
              app.enableQE();
              var qeSeq = qe.project.getActiveSequence();
              probe.available = !!qeSeq;
              if (qeSeq) {
                var names = ["numCaptionTracks", "getCaptionTrackAt", "getCaptionTrackCount", "getSubtitleTrackAt", "getCaptions", "getCaptionAt"];
                probe.methods = {};
                for (var i = 0; i < names.length; i++) {
                  try { probe.methods[names[i]] = typeof qeSeq[names[i]]; } catch(e) { probe.methods[names[i]] = "error:" + e.toString(); }
                }
              }
            } catch(e2) {
              probe.error = e2.toString();
            }
            return probe;
          }

          var trackScan = __scanVideoTracks(seq);
          return __result({
            readOnly: true,
            sequence: {
              name: seq.name,
              id: seq.sequenceID,
              videoTrackCount: seq.videoTracks ? seq.videoTracks.numTracks : null,
              audioTrackCount: seq.audioTracks ? seq.audioTracks.numTracks : null
            },
            captionApi: __captionApiProbe(seq),
            qeCaptionApi: __qeCaptionApiProbe(),
            videoTrackClipCounts: trackScan.videoTrackClipCounts,
            captionPngOverlayCount: trackScan.captionPngOverlayCount,
            captionPngOverlaySamples: trackScan.captionPngOverlaySamples,
            captionSidecarItems: __findCaptionItems(app.project.rootItem, ${captionItemLookup}),
            directCaptionItemReadAvailable: false,
            nativeCaptionProof:
              "Use this read-only probe with create_caption_track results. In this Premiere CEP runtime native captions are created by Sequence.createCaptionTrack returning true; caption tracks are not exposed as video clips or as a readable captionTracks collection."
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
