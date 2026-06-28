import { buildToolScript, escapeForExtendScript } from "../bridge/script-builder.js";
import { sendCommand, BridgeOptions } from "../bridge/file-bridge.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

interface TextOverlayStyleArgs {
  font_size?: number;
  font_color?: string;
  video_width?: number;
  video_height?: number;
  bottom_margin?: number;
  background?: boolean;
  background_opacity?: number;
  asset_output_dir?: string;
  allow_overwrite?: boolean;
}

interface TimedTextOverlayEntry {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

interface GeneratedTextOverlayAsset extends TimedTextOverlayEntry {
  filePath: string;
  fileName: string;
}

const DEFAULT_OVERLAY_WIDTH = 1920;
const DEFAULT_OVERLAY_HEIGHT = 1080;
const DEFAULT_FONT_SIZE = 72;
const DEFAULT_FONT_COLOR = "#ffd400";
const DEFAULT_BOTTOM_MARGIN = 110;
const DEFAULT_BACKGROUND_OPACITY = 0.58;

const FONT_5X7: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "\"": ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "11100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10111", "10000", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "\\": ["10000", "01000", "00100", "00010", "00001", "00000", "00000"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
};

let pngNameCounter = 0;
let crcTable: number[] | null = null;

function failure(error: string) {
  return { success: false, error };
}

function normalizeSingleLineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeTimedTextEntry(caption: unknown, index: number): TimedTextOverlayEntry {
  if (!caption || typeof caption !== "object" || Array.isArray(caption)) {
    throw new Error(`Caption overlay ${index} must be an object`);
  }

  const item = caption as Record<string, unknown>;
  const rawStart = item.start_seconds ?? item.startSeconds ?? item.start;
  const rawEnd = item.end_seconds ?? item.endSeconds ?? item.end;
  const text = typeof item.text === "string" ? normalizeSingleLineText(item.text) : "";
  const startSeconds = typeof rawStart === "number" ? rawStart : NaN;
  const endSeconds = typeof rawEnd === "number" ? rawEnd : NaN;

  if (!Number.isFinite(startSeconds)) {
    throw new Error(`Caption overlay ${index} needs a numeric start_seconds value`);
  }
  if (!Number.isFinite(endSeconds)) {
    throw new Error(`Caption overlay ${index} needs a numeric end_seconds value`);
  }
  if (endSeconds <= startSeconds) {
    throw new Error(`Caption overlay ${index} must end after it starts`);
  }
  if (!text) {
    throw new Error(`Caption overlay ${index} needs non-empty text`);
  }

  return { text, startSeconds, endSeconds };
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampUnit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return `#${hex.toLowerCase()}`;
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
  const hex = normalizeHexColor(value, DEFAULT_FONT_COLOR).slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function outputDirectory(args: TextOverlayStyleArgs): string {
  return args.asset_output_dir || join(tmpdir(), "premiere-mcp-caption-overlays");
}

function textWidth(text: string, cellSize: number): number {
  if (!text) return 0;
  return text.length * 5 * cellSize + Math.max(0, text.length - 1) * cellSize;
}

function textThatFits(text: string, cellSize: number, maxWidth: number): string {
  if (textWidth(text, cellSize) <= maxWidth) return text;
  const ellipsis = "...";
  let candidate = text;
  while (candidate.length > 0 && textWidth(candidate + ellipsis, cellSize) > maxWidth) {
    candidate = candidate.slice(0, -1);
  }
  return candidate.length > 0 ? candidate + ellipsis : ellipsis;
}

function blendPixel(data: Uint8Array, width: number, height: number, x: number, y: number, r: number, g: number, b: number, alpha: number): void {
  if (x < 0 || x >= width || y < 0 || y >= height || alpha <= 0) return;
  const offset = (y * width + x) * 4;
  const srcA = alpha / 255;
  const dstA = data[offset + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;

  data[offset] = Math.round((r * srcA + data[offset] * dstA * (1 - srcA)) / outA);
  data[offset + 1] = Math.round((g * srcA + data[offset + 1] * dstA * (1 - srcA)) / outA);
  data[offset + 2] = Math.round((b * srcA + data[offset + 2] * dstA * (1 - srcA)) / outA);
  data[offset + 3] = Math.round(outA * 255);
}

function drawRect(data: Uint8Array, width: number, height: number, x: number, y: number, rectWidth: number, rectHeight: number, r: number, g: number, b: number, alpha: number): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + rectWidth));
  const y1 = Math.min(height, Math.ceil(y + rectHeight));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      blendPixel(data, width, height, px, py, r, g, b, alpha);
    }
  }
}

function drawGlyphText(data: Uint8Array, width: number, height: number, text: string, x: number, y: number, cellSize: number, r: number, g: number, b: number, alpha: number): void {
  let cursorX = x;
  const upperText = text.toUpperCase();
  for (let i = 0; i < upperText.length; i++) {
    const glyph = FONT_5X7[upperText[i]] || FONT_5X7["?"];
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === "1") {
          drawRect(data, width, height, cursorX + col * cellSize, y + row * cellSize, cellSize, cellSize, r, g, b, alpha);
        }
      }
    }
    cursorX += 6 * cellSize;
  }
}

function buildCrcTable(): number[] {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer): number {
  if (!crcTable) crcTable = buildCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function renderTextOverlayPng(text: string, style: TextOverlayStyleArgs): Buffer {
  const width = clampInteger(style.video_width, DEFAULT_OVERLAY_WIDTH, 320, 8192);
  const height = clampInteger(style.video_height, DEFAULT_OVERLAY_HEIGHT, 180, 8192);
  const fontSize = clampInteger(style.font_size, DEFAULT_FONT_SIZE, 12, Math.floor(height / 3));
  const bottomMargin = clampInteger(style.bottom_margin, DEFAULT_BOTTOM_MARGIN, 0, Math.floor(height / 2));
  const color = hexToRgb(normalizeHexColor(style.font_color, DEFAULT_FONT_COLOR));
  const backgroundOpacity = clampUnit(style.background_opacity, DEFAULT_BACKGROUND_OPACITY);
  const data = new Uint8Array(width * height * 4);

  let cellSize = Math.max(1, Math.floor(fontSize / 7));
  const maxTextWidth = Math.floor(width * 0.88);
  while (cellSize > 1 && textWidth(text, cellSize) > maxTextWidth) {
    cellSize--;
  }

  const visibleText = textThatFits(text, cellSize, maxTextWidth);
  const renderedWidth = textWidth(visibleText, cellSize);
  const renderedHeight = 7 * cellSize;
  const x = Math.round((width - renderedWidth) / 2);
  const y = Math.max(0, height - bottomMargin - renderedHeight);
  const paddingX = Math.max(8, cellSize * 2);
  const paddingY = Math.max(6, cellSize);

  if (style.background !== false) {
    drawRect(
      data,
      width,
      height,
      x - paddingX,
      y - paddingY,
      renderedWidth + paddingX * 2,
      renderedHeight + paddingY * 2,
      0,
      0,
      0,
      Math.round(backgroundOpacity * 255)
    );
  }

  const shadowOffset = Math.max(1, Math.round(cellSize / 3));
  drawGlyphText(data, width, height, visibleText, x + shadowOffset, y + shadowOffset, cellSize, 0, 0, 0, 220);
  drawGlyphText(data, width, height, visibleText, x, y, cellSize, color.r, color.g, color.b, 255);
  return encodePng(width, height, data);
}

function generateTextOverlayAssets(entries: TimedTextOverlayEntry[], style: TextOverlayStyleArgs): GeneratedTextOverlayAsset[] {
  const dir = outputDirectory(style);
  mkdirSync(dir, { recursive: true });

  return entries.map((entry) => {
    pngNameCounter += 1;
    const fileName = `MCP_caption_text_overlay_${Date.now()}_${process.pid}_${pngNameCounter}.png`;
    const filePath = join(dir, fileName);
    writeFileSync(filePath, renderTextOverlayPng(entry.text, style));
    return { ...entry, filePath, fileName };
  });
}

function buildCaptionOverlayScript(assets: GeneratedTextOverlayAsset[], style: TextOverlayStyleArgs, trackIndex?: number): string {
  const trackIndexExpr = trackIndex !== undefined ? String(trackIndex) : "seq.videoTracks.numTracks - 1";
  const fontColor = normalizeHexColor(style.font_color, DEFAULT_FONT_COLOR);
  const allowOverwrite = style.allow_overwrite === true;
  const pathList = assets
    .map((asset) => `"${escapeForExtendScript(asset.filePath)}"`)
    .join(", ");
  const entryList = assets
    .map((asset) => `{
      fileName: "${escapeForExtendScript(asset.fileName)}",
      text: "${escapeForExtendScript(asset.text)}",
      startSeconds: ${asset.startSeconds},
      endSeconds: ${asset.endSeconds},
      durationSeconds: ${asset.endSeconds - asset.startSeconds}
    }`)
    .join(", ");

  return buildToolScript(`
    function __captionOverlayCollectOverlaps(track, startTicks, endTicks) {
      var overlaps = [];
      if (!track) return overlaps;
      for (var c = 0; c < track.clips.numItems; c++) {
        var clip = track.clips[c];
        var clipStart = parseFloat(clip.start.ticks);
        var clipEnd = parseFloat(clip.end.ticks);
        if (clipStart < endTicks && clipEnd > startTicks) {
          overlaps.push({
            nodeId: clip.nodeId,
            name: clip.name,
            startSeconds: __ticksToSeconds(clip.start.ticks),
            endSeconds: __ticksToSeconds(clip.end.ticks)
          });
        }
      }
      return overlaps;
    }

    var seq = app.project.activeSequence;
    if (!seq) return __error("No active sequence");

    var trackIndex = ${trackIndexExpr};
    if (trackIndex < 0 || trackIndex >= seq.videoTracks.numTracks) {
      return __error("Video track index out of range");
    }

    var targetTrack = seq.videoTracks[trackIndex];
    try {
      if (targetTrack.isLocked && targetTrack.isLocked()) {
        return __error("Target video track is locked");
      }
    } catch(e) {}

    var overlayPaths = [${pathList}];
    var overlayEntries = [${entryList}];
    var allowOverwrite = ${allowOverwrite ? "true" : "false"};
    var targetOverlaps = [];
    for (var p = 0; p < overlayEntries.length; p++) {
      var preflightEntry = overlayEntries[p];
      var preflightStart = __secondsToTicks(preflightEntry.startSeconds);
      var preflightEnd = __secondsToTicks(preflightEntry.endSeconds);
      var entryOverlaps = __captionOverlayCollectOverlaps(targetTrack, preflightStart, preflightEnd);
      for (var o = 0; o < entryOverlaps.length; o++) {
        entryOverlaps[o].overlayText = preflightEntry.text;
        targetOverlaps.push(entryOverlaps[o]);
      }
    }
    if (!allowOverwrite && targetOverlaps.length > 0) {
      return __error("Target video track/range is not empty for caption-like overlays; choose an empty upper video track or pass allow_overwrite=true.");
    }

    var imported = app.project.importFiles(overlayPaths, true, app.project.rootItem, false);
    if (!imported) return __error("Caption-like overlay PNG import failed");

    var placed = [];
    for (var i = 0; i < overlayEntries.length; i++) {
      var entry = overlayEntries[i];
      var item = __findProjectItem(entry.fileName);
      if (!item) return __error("Imported overlay project item not found: " + entry.fileName);

      var startTicks = __secondsToTicks(entry.startSeconds).toString();
      var durationTicks = __secondsToTicks(entry.durationSeconds).toString();
      try { if (item.setInPoint) item.setInPoint("0", 4); } catch(e) {}
      try { if (item.setOutPoint) item.setOutPoint(durationTicks, 4); } catch(e) {}

      seq.overwriteClip(item, startTicks, trackIndex, -1);
      placed.push({
        text: entry.text,
        fileName: entry.fileName,
        startSeconds: entry.startSeconds,
        endSeconds: entry.endSeconds,
        durationSeconds: entry.durationSeconds
      });
    }

    return __result({
      added: true,
      overlayKind: "caption_like_png_text_overlay",
      realCaptionTrack: false,
      singleLine: true,
      styled: {
        position: "bottom",
        color: "${escapeForExtendScript(fontColor)}"
      },
      trackIndex: trackIndex,
      count: placed.length,
      allowOverwrite: allowOverwrite,
      targetOverlaps: targetOverlaps,
      overlays: placed,
      note: "These are imported PNG graphics overlays, not Premiere caption-track items."
    });
  `);
}

export function getTextTools(bridgeOptions: BridgeOptions) {
  return {
    add_text_overlay: {
      description: "Add a caption-like transparent PNG text overlay to the active sequence. This creates styled graphics overlays, not real Premiere caption-track items.",
      parameters: {
        type: "object" as const,
        properties: {
          text: {
            type: "string",
            description: "Single-line text content to display. Whitespace is collapsed to one line.",
          },
          track_index: {
            type: "number",
            description: "Video track index to place the overlay on (default: topmost track)",
          },
          start_seconds: {
            type: "number",
            description: "Start time in seconds (default: 0)",
          },
          duration_seconds: {
            type: "number",
            description: "Duration in seconds (default: 5)",
          },
          font_size: {
            type: "number",
            description: "Overlay font height in pixels before fit-to-width shrinking (default: 72)",
          },
          font_color: {
            type: "string",
            description: "Hex text color for the overlay (default: #ffd400 yellow)",
          },
          video_width: {
            type: "number",
            description: "Pixel width of the generated transparent PNG (default: 1920)",
          },
          video_height: {
            type: "number",
            description: "Pixel height of the generated transparent PNG (default: 1080)",
          },
          bottom_margin: {
            type: "number",
            description: "Distance in pixels from the bottom of the PNG to the text baseline area (default: 110)",
          },
          background: {
            type: "boolean",
            description: "Draw a semi-transparent black box behind the text (default: true)",
          },
          background_opacity: {
            type: "number",
            description: "Opacity of the background box from 0 to 1 (default: 0.58)",
          },
          asset_output_dir: {
            type: "string",
            description: "Directory where generated PNG overlay assets are written before Premiere imports them (default: OS temp directory)",
          },
          allow_overwrite: {
            type: "boolean",
            description: "Allow Premiere to overwrite existing clips in the target track/range. Default: false; use an empty upper video track for overlays.",
          },
        },
        required: ["text"],
      },
      handler: async (args: {
        text: string;
        track_index?: number;
        start_seconds?: number;
        duration_seconds?: number;
        font_size?: number;
        font_color?: string;
        video_width?: number;
        video_height?: number;
        bottom_margin?: number;
        background?: boolean;
        background_opacity?: number;
        asset_output_dir?: string;
        allow_overwrite?: boolean;
      }) => {
        const startSeconds = args.start_seconds ?? 0;
        const durationSeconds = args.duration_seconds ?? 5;

        if (!Number.isFinite(startSeconds) || startSeconds < 0) {
          return failure("start_seconds must be a non-negative number");
        }
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          return failure("duration_seconds must be greater than 0");
        }

        const text = normalizeSingleLineText(args.text);
        if (!text) return failure("text must be non-empty");

        const assets = generateTextOverlayAssets(
          [{ text, startSeconds, endSeconds: startSeconds + durationSeconds }],
          args
        );
        const script = buildCaptionOverlayScript(assets, args, args.track_index);
        return sendCommand(script, bridgeOptions);
      },
    },

    add_caption_text_overlays: {
      description: "Create caption-like transparent PNG text overlays from timed entries. Use when styled bottom yellow text is needed; this does not create real Premiere caption tracks.",
      parameters: {
        type: "object" as const,
        properties: {
          captions: {
            type: "array",
            description: "Timed entries with start_seconds, end_seconds, and text. Each entry is rendered as one single-line bottom text overlay.",
          },
          track_index: {
            type: "number",
            description: "Video track index to place overlays on (default: topmost track)",
          },
          font_size: {
            type: "number",
            description: "Overlay font height in pixels before fit-to-width shrinking (default: 72)",
          },
          font_color: {
            type: "string",
            description: "Hex text color for overlays (default: #ffd400 yellow)",
          },
          video_width: {
            type: "number",
            description: "Pixel width of generated transparent PNG assets (default: 1920)",
          },
          video_height: {
            type: "number",
            description: "Pixel height of generated transparent PNG assets (default: 1080)",
          },
          bottom_margin: {
            type: "number",
            description: "Distance in pixels from the bottom of the PNG to the text baseline area (default: 110)",
          },
          background: {
            type: "boolean",
            description: "Draw a semi-transparent black box behind each text overlay (default: true)",
          },
          background_opacity: {
            type: "number",
            description: "Opacity of the background box from 0 to 1 (default: 0.58)",
          },
          asset_output_dir: {
            type: "string",
            description: "Directory where generated PNG overlay assets are written before Premiere imports them (default: OS temp directory)",
          },
          allow_overwrite: {
            type: "boolean",
            description: "Allow Premiere to overwrite existing clips in the target track/range. Default: false; use an empty upper video track for overlays.",
          },
        },
        required: ["captions"],
      },
      handler: async (args: {
        captions: unknown[];
        track_index?: number;
        font_size?: number;
        font_color?: string;
        video_width?: number;
        video_height?: number;
        bottom_margin?: number;
        background?: boolean;
        background_opacity?: number;
        asset_output_dir?: string;
        allow_overwrite?: boolean;
      }) => {
        if (!Array.isArray(args.captions) || args.captions.length === 0) {
          return failure("captions must be a non-empty array");
        }

        try {
          const entries = args.captions.map((caption, index) => normalizeTimedTextEntry(caption, index + 1));
          const assets = generateTextOverlayAssets(entries, args);
          const script = buildCaptionOverlayScript(assets, args, args.track_index);
          return sendCommand(script, bridgeOptions);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      },
    },

    import_mogrt: {
      description: "Import a Motion Graphics Template (.mogrt) file and add it to the timeline",
      parameters: {
        type: "object" as const,
        properties: {
          mogrt_path: {
            type: "string",
            description: "Full path to the .mogrt file",
          },
          track_index: {
            type: "number",
            description: "Video track index (default: 0)",
          },
          start_seconds: {
            type: "number",
            description: "Start time in seconds (default: 0)",
          },
          duration_seconds: {
            type: "number",
            description: "Duration in seconds (default: 5)",
          },
        },
        required: ["mogrt_path"],
      },
      handler: async (args: {
        mogrt_path: string;
        track_index?: number;
        start_seconds?: number;
        duration_seconds?: number;
      }) => {
        const trackIndex = args.track_index ?? 0;
        const startSeconds = args.start_seconds ?? 0;
        const durationSeconds = args.duration_seconds ?? 5;

        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var mogrtPath = "${escapeForExtendScript(args.mogrt_path)}";
          var startTicks = __secondsToTicks(${startSeconds}).toString();
          var durationTicks = __secondsToTicks(${durationSeconds}).toString();
          
          var success = seq.importMGT(
            mogrtPath,
            startTicks,
            ${trackIndex},
            ${trackIndex}  // audio track index
          );
          
          if (!success) return __error("Failed to import MOGRT");
          
          return __result({
            imported: true,
            mogrtPath: mogrtPath,
            trackIndex: ${trackIndex},
            startSeconds: ${startSeconds},
            durationSeconds: ${durationSeconds}
          });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },

    import_mogrt_from_library: {
      description: "Import a MOGRT from an Adobe Library by name",
      parameters: {
        type: "object" as const,
        properties: {
          mogrt_name: {
            type: "string",
            description: "Name of the MOGRT in the library",
          },
          track_index: {
            type: "number",
            description: "Video track index (default: 0)",
          },
          start_seconds: {
            type: "number",
            description: "Start time in seconds (default: 0)",
          },
        },
        required: ["mogrt_name"],
      },
      handler: async (args: { mogrt_name: string; track_index?: number; start_seconds?: number }) => {
        const trackIndex = args.track_index ?? 0;
        const startSeconds = args.start_seconds ?? 0;

        const script = buildToolScript(`
          var seq = app.project.activeSequence;
          if (!seq) return __error("No active sequence");
          
          var mogrtName = "${escapeForExtendScript(args.mogrt_name)}";
          var startTicks = __secondsToTicks(${startSeconds}).toString();
          
          var success = seq.importMGTFromLibrary(mogrtName, startTicks, ${trackIndex}, ${trackIndex});
          if (!success) return __error("Failed to import MOGRT from library: " + mogrtName);
          
          return __result({ imported: true, mogrtName: mogrtName, trackIndex: ${trackIndex} });
        `);
        return sendCommand(script, bridgeOptions);
      },
    },
  };
}
