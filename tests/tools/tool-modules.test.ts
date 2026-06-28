import { describe, it, expect, vi, beforeEach } from "vitest";
import { BridgeOptions } from "../../src/bridge/file-bridge.js";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock sendCommand and sendRawCommand so tool handlers don't do real I/O
vi.mock("../../src/bridge/file-bridge.js", () => ({
  sendCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  sendRawCommand: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getTempDir: vi.fn().mockReturnValue("/tmp/test"),
  cleanupTempDir: vi.fn(),
}));

import { sendCommand, sendRawCommand } from "../../src/bridge/file-bridge.js";

const mockedSendCommand = vi.mocked(sendCommand);
const mockedSendRawCommand = vi.mocked(sendRawCommand);

const bridgeOptions: BridgeOptions = { tempDir: "/tmp/test-bridge", timeoutMs: 5000 };

// Import all tool modules
import { getDiscoveryTools } from "../../src/tools/discovery.js";
import { getProjectTools } from "../../src/tools/project.js";
import { getMediaTools } from "../../src/tools/media.js";
import { getSequenceTools } from "../../src/tools/sequence.js";
import { getTimelineTools } from "../../src/tools/timeline.js";
import { getEffectsTools } from "../../src/tools/effects.js";
import { getTransitionsTools } from "../../src/tools/transitions.js";
import { getAudioTools } from "../../src/tools/audio.js";
import { getTextTools } from "../../src/tools/text.js";
import { getMarkerTools } from "../../src/tools/markers.js";
import { getTrackTools } from "../../src/tools/tracks.js";
import { getPlayheadTools } from "../../src/tools/playhead.js";
import { getMetadataTools } from "../../src/tools/metadata.js";
import { getExportTools } from "../../src/tools/export.js";
import { getAdvancedTools } from "../../src/tools/advanced.js";
import { getKeyframeTools } from "../../src/tools/keyframes.js";
import { getScriptingTools } from "../../src/tools/scripting.js";
import { getInspectionTools } from "../../src/tools/inspection.js";
import { getSelectionTools } from "../../src/tools/selection.js";
import { getClipboardTools } from "../../src/tools/clipboard.js";
import { getSourceMonitorTools } from "../../src/tools/source-monitor.js";
import { getTrackTargetingTools } from "../../src/tools/track-targeting.js";
import { getUtilityTools } from "../../src/tools/utility.js";
import { getHealthTools } from "../../src/tools/health.js";
import { getWorkspaceTools } from "../../src/tools/workspace.js";
import { getCaptionTools } from "../../src/tools/captions.js";
import { getPlaybackTools } from "../../src/tools/playback.js";
import { getProjectManagerTools } from "../../src/tools/project-manager.js";

interface ToolDef {
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: any) => Promise<{ success: boolean; data?: unknown; error?: string }>;
}

type ToolModule = Record<string, ToolDef>;

// All modules with their expected tool counts and names
const ALL_MODULES: Array<{
  name: string;
  getter: (opts: BridgeOptions) => ToolModule;
  minTools: number;
}> = [
  { name: "discovery", getter: getDiscoveryTools, minTools: 8 },
  { name: "project", getter: getProjectTools, minTools: 20 },
  { name: "media", getter: getMediaTools, minTools: 12 },
  { name: "sequence", getter: getSequenceTools, minTools: 8 },
  { name: "timeline", getter: getTimelineTools, minTools: 8 },
  { name: "effects", getter: getEffectsTools, minTools: 9 },
  { name: "transitions", getter: getTransitionsTools, minTools: 6 },
  { name: "audio", getter: getAudioTools, minTools: 10 },
  { name: "text", getter: getTextTools, minTools: 4 },
  { name: "markers", getter: getMarkerTools, minTools: 3 },
  { name: "tracks", getter: getTrackTools, minTools: 3 },
  { name: "playhead", getter: getPlayheadTools, minTools: 4 },
  { name: "metadata", getter: getMetadataTools, minTools: 6 },
  { name: "export", getter: getExportTools, minTools: 16 },
  { name: "advanced", getter: getAdvancedTools, minTools: 20 },
  { name: "keyframes", getter: getKeyframeTools, minTools: 5 },
  { name: "scripting", getter: getScriptingTools, minTools: 3 },
  { name: "inspection", getter: getInspectionTools, minTools: 5 },
  { name: "selection", getter: getSelectionTools, minTools: 5 },
  { name: "clipboard", getter: getClipboardTools, minTools: 8 },
  { name: "source-monitor", getter: getSourceMonitorTools, minTools: 5 },
  { name: "track-targeting", getter: getTrackTargetingTools, minTools: 20 },
  { name: "utility", getter: getUtilityTools, minTools: 15 },
  { name: "health", getter: getHealthTools, minTools: 4 },
  { name: "workspace", getter: getWorkspaceTools, minTools: 2 },
  { name: "captions", getter: getCaptionTools, minTools: 13 },
  { name: "playback", getter: getPlaybackTools, minTools: 3 },
  { name: "project-manager", getter: getProjectManagerTools, minTools: 1 },
];

describe("Tool Module Structure", () => {
  for (const mod of ALL_MODULES) {
    describe(`${mod.name} module`, () => {
      let tools: ToolModule;

      beforeEach(() => {
        tools = mod.getter(bridgeOptions);
      });

      it(`exports at least ${mod.minTools} tools`, () => {
        expect(Object.keys(tools).length).toBeGreaterThanOrEqual(mod.minTools);
      });

      it("each tool has a description string", () => {
        for (const [name, tool] of Object.entries(tools)) {
          expect(typeof tool.description, `${name} description`).toBe("string");
          expect(tool.description.length, `${name} description length`).toBeGreaterThan(0);
        }
      });

      it("each tool has a parameters object", () => {
        for (const [name, tool] of Object.entries(tools)) {
          expect(typeof tool.parameters, `${name} parameters`).toBe("object");
        }
      });

      it("each tool has an async handler function", () => {
        for (const [name, tool] of Object.entries(tools)) {
          expect(typeof tool.handler, `${name} handler`).toBe("function");
        }
      });

      it("parameter properties all have type fields", () => {
        for (const [name, tool] of Object.entries(tools)) {
          const props = (tool.parameters as any).properties;
          if (props) {
            for (const [propName, prop] of Object.entries(props) as [string, any][]) {
              expect(prop.type, `${name}.${propName} type`).toBeDefined();
              expect(
                ["string", "number", "boolean", "array", "object"].includes(prop.type),
                `${name}.${propName} has valid type "${prop.type}"`
              ).toBe(true);
            }
          }
        }
      });

      it("parameter properties all have description fields", () => {
        for (const [name, tool] of Object.entries(tools)) {
          const props = (tool.parameters as any).properties;
          if (props) {
            for (const [propName, prop] of Object.entries(props) as [string, any][]) {
              expect(
                typeof prop.description,
                `${name}.${propName} should have description`
              ).toBe("string");
            }
          }
        }
      });

      it("required fields reference existing properties", () => {
        for (const [name, tool] of Object.entries(tools)) {
          const params = tool.parameters as any;
          const required = params.required || [];
          const propNames = Object.keys(params.properties || {});
          for (const req of required) {
            expect(
              propNames.includes(req),
              `${name}: required field "${req}" should exist in properties`
            ).toBe(true);
          }
        }
      });
    });
  }
});

describe("Total Tool Count", () => {
  it("all modules together have 297 tools", () => {
    let total = 0;
    for (const mod of ALL_MODULES) {
      total += Object.keys(mod.getter(bridgeOptions)).length;
    }
    expect(total).toBe(297);
  });

  it("there are 28 modules", () => {
    expect(ALL_MODULES.length).toBe(28);
  });
});

describe("Tool Handler Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSendCommand.mockResolvedValue({ success: true, data: { mock: true } });
  });

  describe("health.ping", () => {
    it("fork_ping returns fork info without bridge I/O", async () => {
      const tools = getHealthTools(bridgeOptions);
      const result = await (tools.fork_ping.handler as any)({});

      expect(mockedSendCommand).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        ok: true,
        fork: "Maciejdziuba/premiere-pro-mcp",
        requiresPremiere: false,
        requiresCepBridge: false,
      });
    });

    it("bridge_diagnostics returns local bridge details without bridge I/O", async () => {
      const tools = getHealthTools(bridgeOptions);
      const result = await (tools.bridge_diagnostics.handler as any)({});

      expect(mockedSendCommand).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        readOnly: true,
        package: "premiere-pro-mcp",
        bridge: {
          tempDir: "/tmp/test",
          timeoutMs: 5000,
        },
        requiresPremiere: false,
        requiresCepBridge: false,
      });
      expect(typeof (result.data as any).packageVersion).toBe("string");
      expect(Array.isArray((result.data as any).warnings)).toBe(true);
    });

    it("calls sendCommand with shortened timeout", async () => {
      const tools = getHealthTools(bridgeOptions);
      await (tools.ping.handler as any)({});

      expect(mockedSendCommand).toHaveBeenCalledTimes(1);
      const callArgs = mockedSendCommand.mock.calls[0];
      // Script should contain app.version
      expect(callArgs[0]).toContain("app.version");
      // Should use a 5-second timeout override
      expect(callArgs[1]?.timeoutMs).toBe(5000);
    });

    it("generates script that checks connectivity", async () => {
      const tools = getHealthTools(bridgeOptions);
      await (tools.ping.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("app.project");
      expect(script).toContain("__result");
      expect(script).toContain("connected: true");
      expect(script).toContain("premiereVersion");
      expect(script).toContain("$.locale");
      expect(script).toContain("hasEnableQE");
    });

    it("get_premiere_runtime_diagnostics reads version and locale without enabling QE", async () => {
      const tools = getHealthTools(bridgeOptions);
      await (tools.get_premiere_runtime_diagnostics.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("readOnly: true");
      expect(userCode).toContain("premiereVersion");
      expect(userCode).toContain("$.locale");
      expect(userCode).toContain("BridgeTalk");
      expect(userCode).toContain("enabledByThisTool: false");
      expect(userCode).not.toMatch(/app\.enableQE\s*\(/);
    });
  });

  describe("workspace tools", () => {
    it("get_workspaces generates correct script", async () => {
      const tools = getWorkspaceTools(bridgeOptions);
      await (tools.get_workspaces.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("app.getWorkspaces()");
      expect(script).toContain("__result");
    });

    it("set_workspace escapes the workspace name", async () => {
      const tools = getWorkspaceTools(bridgeOptions);
      await (tools.set_workspace.handler as any)({ name: 'My "Custom" Workspace' });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain('My \\"Custom\\" Workspace');
      expect(script).toContain("app.setWorkspace");
    });
  });

  describe("playback tools", () => {
    it("play_timeline uses QE DOM", async () => {
      const tools = getPlaybackTools(bridgeOptions);
      await (tools.play_timeline.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("app.enableQE()");
      expect(script).toContain("qe.startPlayback()");
    });

    it("play_timeline has no speed parameter (QE startPlayback ignores it)", async () => {
      const tools = getPlaybackTools(bridgeOptions);
      expect(tools.play_timeline.parameters).toEqual({});
    });

    it("stop_playback uses QE DOM", async () => {
      const tools = getPlaybackTools(bridgeOptions);
      await (tools.stop_playback.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("qe.stopPlayback()");
    });

    it("get_source_monitor_position reads ticks", async () => {
      const tools = getPlaybackTools(bridgeOptions);
      await (tools.get_source_monitor_position.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("app.sourceMonitor.getPosition()");
      expect(script).toContain("__ticksToSeconds");
    });
  });

  describe("timeline safety controls", () => {
    it("add_to_timeline can generate a dry-run empty-range preflight", async () => {
      const tools = getTimelineTools(bridgeOptions);
      await (tools.add_to_timeline.handler as any)({
        item_id: "clip-1",
        track_index: 1,
        audio_track_index: 2,
        start_seconds: 12.5,
        duration_seconds: 4,
        require_empty_range: true,
        dry_run: true,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("__timelineCollectRangeOverlaps");
      expect(userCode).toContain("var requireEmptyRange = true");
      expect(userCode).toContain("var dryRun = true");
      expect(userCode).toContain("if (!dryRun)");
      expect(userCode).toContain("safeToPlace");
      expect(userCode).toContain("seq.insertClip(item");
    });

    it("move_clip reports original position and destination overlaps for dry runs", async () => {
      const tools = getTimelineTools(bridgeOptions);
      await (tools.move_clip.handler as any)({
        node_id: "timeline-node-1",
        new_start_seconds: 20,
        new_track_index: 3,
        require_empty_range: true,
        dry_run: true,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("var originalStartTicks = clip.start.ticks");
      expect(userCode).toContain("__timelineCollectRangeOverlaps");
      expect(userCode).toContain("Clip track move API is unavailable");
      expect(userCode).toContain("moved: !dryRun");
      expect(userCode).toContain("overlaps: overlaps");
    });

    it("set_clip_properties uses locale helper lookup for motion and opacity properties", async () => {
      const tools = getTimelineTools(bridgeOptions);
      await (tools.set_clip_properties.handler as any)({
        node_id: "timeline-node-1",
        opacity: 75,
        position_x: 100,
        position_y: 200,
        scale: 125,
        rotation: 15,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("var opacityComp = __findOpacityComponent(clip)");
      expect(userCode).toContain('__findKnownProperty(opacityComp, "opacity", "opacity")');
      expect(userCode).toContain("var motionComp = __findMotionComponent(clip)");
      expect(userCode).toContain('__findKnownProperty(motionComp, "motion", "position")');
      expect(userCode).toContain("missingProperties");
      expect(userCode).not.toContain('displayName === "Motion"');
    });
  });

  describe("sequence and playhead runtime wrappers", () => {
    it("set_sequence_in_out_points passes seconds directly to Premiere sequence in/out setters", async () => {
      const tools = getPlayheadTools(bridgeOptions);
      await (tools.set_sequence_in_out_points.handler as any)({
        in_seconds: 1.25,
        out_seconds: 4.5,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("seq.setInPoint(1.25)");
      expect(userCode).toContain("seq.setOutPoint(4.5)");
      expect(userCode).toContain("Sequence in/out setters are not available");
      expect(userCode).not.toContain("__secondsToTicks(1.25)");
      expect(userCode).not.toContain("__secondsToTicks(4.5)");
    });

    it("get_sequence_in_out_points reads Premiere seconds strings without tick conversion", async () => {
      const tools = getPlayheadTools(bridgeOptions);
      await (tools.get_sequence_in_out_points.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("parseFloat(seq.getInPoint())");
      expect(userCode).toContain("parseFloat(seq.getOutPoint())");
      expect(userCode).not.toContain("__ticksToSeconds(seq.getInPoint())");
      expect(userCode).not.toContain("__ticksToSeconds(seq.getOutPoint())");
    });

    it("work area wrappers also use seconds-based sequence APIs", async () => {
      const tools = getPlayheadTools(bridgeOptions);
      await (tools.set_work_area.handler as any)({
        in_seconds: 2.5,
        out_seconds: 6.75,
      });

      let script = mockedSendCommand.mock.calls[0][0];
      let userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("seq.setWorkAreaInPoint(2.5)");
      expect(userCode).toContain("seq.setWorkAreaOutPoint(6.75)");
      expect(userCode).not.toContain("__secondsToTicks(2.5)");
      expect(userCode).not.toContain("__secondsToTicks(6.75)");

      vi.clearAllMocks();
      await (tools.get_work_area.handler as any)({});
      script = mockedSendCommand.mock.calls[0][0];
      userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("parseFloat(seq.getWorkAreaInPoint())");
      expect(userCode).toContain("parseFloat(seq.getWorkAreaOutPoint())");
      expect(userCode).not.toContain("seq.workInPoint.ticks");
      expect(userCode).not.toContain("seq.workOutPoint.ticks");
    });

    it("auto_reframe_sequence reduces target dimensions to the documented API ratio signature", async () => {
      const tools = getSequenceTools(bridgeOptions);
      await (tools.auto_reframe_sequence.handler as any)({
        sequence_id: "source-seq",
        target_width: 1080,
        target_height: 1920,
        motion_preset: "slower",
        new_sequence_name: "Vertical Cut",
        use_nested_sequences: true,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("var numerator = 9");
      expect(userCode).toContain("var denominator = 16");
      expect(userCode).toContain('var motionPreset = "slower"');
      expect(userCode).toContain('var newSequenceName = "Vertical Cut"');
      expect(userCode).toContain("var useNestedSequences = true");
      expect(userCode).toContain("seq.autoReframeSequence(numerator, denominator, motionPreset, newSequenceName, useNestedSequences)");
      expect(userCode).toContain("autoReframeSequence is not available");
      expect(userCode).not.toContain("seq.autoReframeSequence(1080, 1920, false)");
    });

    it("auto_reframe_sequence rejects invalid target dimensions before bridge I/O", async () => {
      const tools = getSequenceTools(bridgeOptions);
      const result = await (tools.auto_reframe_sequence.handler as any)({
        target_width: 0,
        target_height: 1920,
      });

      expect(mockedSendCommand).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain("target_width and target_height must be positive numbers");
    });
  });

  describe("source monitor safety controls", () => {
    it("insert_from_source can generate a dry-run range preflight", async () => {
      const tools = getSourceMonitorTools(bridgeOptions);
      await (tools.insert_from_source.handler as any)({
        video_track_index: 1,
        audio_track_index: 1,
        duration_seconds: 3,
        require_empty_range: true,
        dry_run: true,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("__sourceCollectRangeOverlaps");
      expect(userCode).toContain("var requireEmptyRange = true");
      expect(userCode).toContain("var dryRun = true");
      expect(userCode).toContain("if (!dryRun)");
      expect(userCode).toContain("seq.insertClip(item");
      expect(userCode).toContain("safeToPlace");
    });

    it("overwrite_from_source can report overlaps without overwriting", async () => {
      const tools = getSourceMonitorTools(bridgeOptions);
      await (tools.overwrite_from_source.handler as any)({
        video_track_index: 2,
        audio_track_index: 0,
        duration_seconds: 2.5,
        dry_run: true,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("__sourceCollectRangeOverlaps");
      expect(userCode).toContain("var dryRun = true");
      expect(userCode).toContain("if (!dryRun)");
      expect(userCode).toContain("seq.overwriteClip(item");
      expect(userCode).toContain("overwritten: !dryRun");
    });
  });

  describe("audio tools", () => {
    it("exposes dedicated audio tooling for gain, pan, fades, effects, transitions, diagnostics, and ducking", () => {
      const tools = getAudioTools(bridgeOptions);
      expect(Object.keys(tools)).toEqual(expect.arrayContaining([
        "adjust_audio_levels",
        "offset_audio_gain",
        "set_audio_pan",
        "add_audio_keyframes",
        "add_audio_fade",
        "apply_common_audio_effect",
        "add_audio_transition",
        "diagnose_audio_clipping_and_normalization",
        "duck_audio_under_voiceover",
        "mute_track",
      ]));
    });

    it("adjust_audio_levels uses the shared Volume/Level helper lookup", async () => {
      const tools = getAudioTools(bridgeOptions);
      await (tools.adjust_audio_levels.handler as any)({ node_id: "audio-1", level_db: -6 });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("__mcpFindAudioLevel");
      expect(userCode).toContain("__findVolumeComponent");
      expect(userCode).toContain("__findKnownProperty");
      expect(userCode).not.toContain('displayName === "Volume"');
    });

    it("add_audio_keyframes uses Time objects and addKey for Volume/Level automation", async () => {
      const tools = getAudioTools(bridgeOptions);
      await (tools.add_audio_keyframes.handler as any)({
        node_id: "audio-1",
        keyframes: [
          { time_seconds: 0, level_db: -96 },
          { time_seconds: 1, level_db: 0 },
        ],
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__mcpEnableAudioKeyframes");
      expect(script).toContain("var time = new Time()");
      expect(script).toContain("levelProp.addKey(time)");
      expect(script).toContain("levelProp.setValueAtKey(time, levelDb, true)");
    });

    it("apply_common_audio_effect uses audio QE lookup and rejects video-track clip ids", async () => {
      const tools = getAudioTools(bridgeOptions);
      await (tools.apply_common_audio_effect.handler as any)({
        node_id: "audio-1",
        effect: "hard_limiter",
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__findAudioEffect");
      expect(script).toContain("addAudioEffect");
      expect(script).toContain('result.trackType !== "audio"');
      expect(script).toContain("liveValidationNeeded: true");
    });

    it("add_audio_transition uses QE audio transition lookup", async () => {
      const tools = getAudioTools(bridgeOptions);
      await (tools.add_audio_transition.handler as any)({
        transition_name: "Constant Power",
        track_index: 0,
        cut_point_seconds: 3,
        duration_seconds: 0.5,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__findAudioTransition");
      expect(script).toContain("qeSeq.getAudioTrackAt(0)");
      expect(script).toContain("qeTrack.addTransition");
    });

    it("diagnose_audio_clipping_and_normalization is read-only and honest about raw peak limits", async () => {
      const tools = getAudioTools(bridgeOptions);
      await (tools.diagnose_audio_clipping_and_normalization.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("readOnly: true");
      expect(userCode).toContain("rawPeakAnalysisSupported: false");
      expect(userCode).toContain("destructiveNormalizationSupported: false");
      expect(userCode).not.toMatch(/app\.enableQE\s*\(/);
    });

    it("duck_audio_under_voiceover creates clip-relative ducking keyframes", async () => {
      const tools = getAudioTools(bridgeOptions);
      await (tools.duck_audio_under_voiceover.handler as any)({
        voice_track_index: 1,
        target_track_indices: [0, 2],
        duck_db: -20,
        fade_seconds: 0.2,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("var targetIndices = [0, 2]");
      expect(script).toContain("voiceSegments");
      expect(script).toContain("__mcpAddAudioLevelKey");
      expect(script).toContain("localIn = overlapStart - clipStart");
      expect(script).toContain("keyframesAdded += 4");
    });
  });

  describe("discovery tools", () => {
    it("get_project_info generates correct script", async () => {
      const tools = getDiscoveryTools(bridgeOptions);
      await (tools.get_project_info.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("app.project");
      expect(script).toContain("project.name");
      expect(script).toContain("project.path");
      expect(script).toContain("numSequences");
      expect(script).toContain("__result");
    });

    it("list_project_items handles optional bin_path", async () => {
      const tools = getDiscoveryTools(bridgeOptions);

      // Without bin_path
      await (tools.list_project_items.handler as any)({});
      let script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("var binPath = null");

      vi.clearAllMocks();

      // With bin_path
      await (tools.list_project_items.handler as any)({ bin_path: "Footage/Raw" });
      script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("Footage/Raw");
    });

    it("list_project_items escapes bin_path", async () => {
      const tools = getDiscoveryTools(bridgeOptions);
      await (tools.list_project_items.handler as any)({ bin_path: 'My "Folder"' });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain('My \\"Folder\\"');
    });

    it("get_clip_properties escapes node_id", async () => {
      const tools = getDiscoveryTools(bridgeOptions);
      await (tools.get_clip_properties.handler as any)({ node_id: "abc-123" });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("abc-123");
      expect(script).toContain("__findClip");
    });

    it("get_clip_at_position generates correct track lookup", async () => {
      const tools = getDiscoveryTools(bridgeOptions);
      await (tools.get_clip_at_position.handler as any)({
        time_seconds: 5.5,
        track_index: 1,
        track_type: "video",
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("seq.videoTracks");
      expect(script).toContain("5.5");
    });

    it("get_clip_at_position uses audio tracks when specified", async () => {
      const tools = getDiscoveryTools(bridgeOptions);
      await (tools.get_clip_at_position.handler as any)({
        time_seconds: 2.0,
        track_index: 0,
        track_type: "audio",
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("seq.audioTracks");
    });

    it("list_sequence_tracks defaults to active sequence", async () => {
      const tools = getDiscoveryTools(bridgeOptions);
      await (tools.list_sequence_tracks.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      // The user code portion (after helpers) should use activeSequence directly
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1];
      expect(userCode).toContain("app.project.activeSequence");
      // Should NOT call __findSequence in user code when no sequence_id is provided
      expect(userCode).not.toContain('__findSequence("');
    });

    it("list_sequence_tracks uses __findSequence when id provided", async () => {
      const tools = getDiscoveryTools(bridgeOptions);
      await (tools.list_sequence_tracks.handler as any)({ sequence_id: "seq-1" });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__findSequence");
      expect(script).toContain("seq-1");
    });
  });

  describe("text overlay tools", () => {
    it("add_text_overlay generates a caption-like PNG import script instead of using real captions", async () => {
      const tools = getTextTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-text-overlay-"));

      try {
        await (tools.add_text_overlay.handler as any)({
          text: "Bottom yellow text",
          track_index: 2,
          start_seconds: 1,
          duration_seconds: 2.5,
          font_color: "#ffff00",
          font_size: 64,
          video_width: 640,
          video_height: 360,
          bottom_margin: 48,
          asset_output_dir: tempDir,
        });

        const files = readdirSync(tempDir).filter((file) => file.endsWith(".png"));
        expect(files.length).toBe(1);
        expect(Array.from(readFileSync(join(tempDir, files[0])).subarray(0, 8))).toEqual([
          137, 80, 78, 71, 13, 10, 26, 10,
        ]);

        const script = mockedSendCommand.mock.calls[0][0];
        expect(script).toContain("app.project.importFiles");
        expect(script).toContain("seq.overwriteClip");
        expect(script).toContain("setOutPoint");
        expect(script).toContain("var allowOverwrite = false");
        expect(script).toContain("__captionOverlayCollectOverlaps");
        expect(script).toContain("Target video track/range is not empty");
        expect(script).toContain('overlayKind: "caption_like_png_text_overlay"');
        expect(script).toContain("realCaptionTrack: false");
        expect(script).toContain("singleLine: true");
        expect(script).toContain('position: "bottom"');
        expect(script).toContain('color: "#ffff00"');
        expect(script).not.toContain("createCaptionTrack");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("add_caption_text_overlays batches timed entries into single-line PNG overlays", async () => {
      const tools = getTextTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-caption-overlays-"));

      try {
        expect(tools.add_caption_text_overlays.parameters.required).toContain("captions");
        expect((tools.add_caption_text_overlays.parameters.properties as any).font_color.description).toContain("yellow");
        expect((tools.add_caption_text_overlays.parameters.properties as any).allow_overwrite.description).toContain("empty upper video track");

        await (tools.add_caption_text_overlays.handler as any)({
          captions: [
            { start_seconds: 0, end_seconds: 1.2, text: "First caption" },
            { start_seconds: 1.4, end_seconds: 2.4, text: "Second\ncaption" },
          ],
          asset_output_dir: tempDir,
          font_color: "#ffd400",
          video_width: 640,
          video_height: 360,
        });

        const files = readdirSync(tempDir).filter((file) => file.endsWith(".png"));
        expect(files.length).toBe(2);

        const script = mockedSendCommand.mock.calls[0][0];
        expect(script).toContain("var overlayEntries");
        expect(script).toContain("First caption");
        expect(script).toContain("Second caption");
        expect(script).toContain("count: placed.length");
        expect(script).toContain("realCaptionTrack: false");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("caption tools", () => {
    it("create_caption_track generates correct script", async () => {
      const tools = getCaptionTools(bridgeOptions);
      const toolNames = Object.keys(tools);
      expect(toolNames).toContain("create_caption_track");
      expect(toolNames).toContain("parse_transcript_json_file");
      expect(toolNames).toContain("import_text_panel_transcript");

      await (tools.create_caption_track.handler as any)({ item_id: "my-srt-file" });
      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__result");
      expect(script).toContain("my-srt-file");
      expect(script).toContain("createCaptionTrack");
    });

    it("parse_srt_file reads local SRT without bridge I/O", async () => {
      const tools = getCaptionTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-srt-"));
      const srtPath = join(tempDir, "sample.srt");

      try {
        writeFileSync(
          srtPath,
          "1\n00:00:01,000 --> 00:00:02,500\nHello world\n",
          "utf-8"
        );

        const result = await (tools.parse_srt_file.handler as any)({ file_path: srtPath });

        expect(mockedSendCommand).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.data.captionCount).toBe(1);
        expect(result.data.captions[0]).toMatchObject({
          startSeconds: 1,
          endSeconds: 2.5,
          text: "Hello world",
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("write_srt_file writes local SRT without bridge I/O", async () => {
      const tools = getCaptionTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-srt-"));
      const srtPath = join(tempDir, "written.srt");

      try {
        const result = await (tools.write_srt_file.handler as any)({
          output_path: srtPath,
          captions: [{ start_seconds: 0, end_seconds: 1.25, text: "Line one" }],
        });

        expect(mockedSendCommand).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(existsSync(srtPath)).toBe(true);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("parse_transcript_json_file validates Adobe transcript JSON locally", async () => {
      const tools = getCaptionTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-transcript-"));
      const transcriptPath = join(tempDir, "transcript.json");

      try {
        writeFileSync(
          transcriptPath,
          JSON.stringify({
            language: "en-us",
            speakers: [{ id: "00000000-0000-4000-8000-000000000001", name: "Speaker 1" }],
            segments: [
              {
                duration: 1.25,
                language: "en-us",
                speaker: "00000000-0000-4000-8000-000000000001",
                start: 0,
                words: [
                  {
                    confidence: 1,
                    duration: 1.25,
                    eos: true,
                    start: 0,
                    tags: [],
                    text: "Hello",
                    type: "word",
                  },
                ],
              },
            ],
          }),
          "utf-8"
        );

        const result = await (tools.parse_transcript_json_file.handler as any)({
          file_path: transcriptPath,
        });

        expect(mockedSendCommand).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({
          language: "en-us",
          segmentCount: 1,
          wordCount: 1,
          speakerCount: 1,
          requiresPremiere: false,
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("convert_srt_to_transcript_json_file writes valid transcript JSON locally", async () => {
      const tools = getCaptionTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-transcript-convert-"));
      const srtPath = join(tempDir, "source.srt");
      const transcriptPath = join(tempDir, "transcript.json");

      try {
        writeFileSync(
          srtPath,
          "1\n00:00:00,000 --> 00:00:02,000\nHello transcript world.\n",
          "utf-8"
        );

        const result = await (tools.convert_srt_to_transcript_json_file.handler as any)({
          srt_path: srtPath,
          output_path: transcriptPath,
          language: "en-us",
        });

        expect(mockedSendCommand).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        const written = JSON.parse(readFileSync(transcriptPath, "utf-8"));
        expect(written.segments[0].words).toHaveLength(3);
        expect(written.speakers[0].name).toBe("Speaker 1");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("export_transcript_json_to_srt_file renders transcript segments as SRT", async () => {
      const tools = getCaptionTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-transcript-srt-"));
      const transcriptPath = join(tempDir, "transcript.json");
      const srtPath = join(tempDir, "out.srt");

      try {
        writeFileSync(
          transcriptPath,
          JSON.stringify({
            language: "en-us",
            speakers: [{ id: "00000000-0000-4000-8000-000000000001", name: "Speaker 1" }],
            segments: [
              {
                duration: 1,
                language: "en-us",
                speaker: "00000000-0000-4000-8000-000000000001",
                start: 0.5,
                words: [
                  { confidence: 1, duration: 0.5, eos: false, start: 0.5, tags: [], text: "Hello", type: "word" },
                  { confidence: 1, duration: 0, eos: true, start: 1, tags: [], text: "!", type: "punctuation" },
                ],
              },
            ],
          }),
          "utf-8"
        );

        const result = await (tools.export_transcript_json_to_srt_file.handler as any)({
          transcript_path: transcriptPath,
          output_path: srtPath,
        });

        expect(mockedSendCommand).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(readFileSync(srtPath, "utf-8")).toContain("Hello!");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("Text panel transcript import returns an explicit UXP/CEP unsupported error", async () => {
      const tools = getCaptionTools(bridgeOptions);
      const tempDir = mkdtempSync(join(tmpdir(), "ppmcp-transcript-unsupported-"));
      const transcriptPath = join(tempDir, "transcript.json");

      try {
        writeFileSync(
          transcriptPath,
          JSON.stringify({
            language: "en-us",
            speakers: [{ id: "00000000-0000-4000-8000-000000000001", name: "Speaker 1" }],
            segments: [
              {
                duration: 1,
                language: "en-us",
                speaker: "00000000-0000-4000-8000-000000000001",
                start: 0,
                words: [
                  { confidence: 1, duration: 1, eos: true, start: 0, tags: [], text: "Hello", type: "word" },
                ],
              },
            ],
          }),
          "utf-8"
        );

        const result = await (tools.import_text_panel_transcript.handler as any)({
          transcript_path: transcriptPath,
          clip_project_item_id: "clip-1",
        });

        expect(mockedSendCommand).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toContain("CEP/ExtendScript bridge");
        expect(result.error).toContain("Transcript.importFromJSON");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("get_caption_api_capabilities reports UXP transcript APIs but marks CEP as unable to invoke them", async () => {
      const tools = getCaptionTools(bridgeOptions);

      await (tools.get_caption_api_capabilities.handler as any)({});
      const script = mockedSendCommand.mock.calls[0][0];

      expect(script).toContain("canExecuteUxpPremiereProModule");
      expect(script).toContain("Transcript.exportToJSON");
      expect(script).toContain("currentBridgeCanInvokeUxpApis");
      expect(script).toContain("createCaptionTrack");
    });
  });

  describe("transition tools", () => {
    it("find_transition uses matchName-aware helper lookup", async () => {
      const tools = getTransitionsTools(bridgeOptions);

      await (tools.find_transition.handler as any)({
        transition_name: "Cross Dissolve",
        transition_match_name: "ADBE Cross Dissolve",
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__findVideoTransition");
      expect(script).toContain("ADBE Cross Dissolve");
      expect(script).toContain("Cross Dissolve");
    });

    it("batch_add_transitions reports dry-run cut details", async () => {
      const tools = getTransitionsTools(bridgeOptions);

      await (tools.batch_add_transitions.handler as any)({
        transition_name: "Cross Dissolve",
        dry_run: true,
        start_seconds: 1,
        end_seconds: 10,
        max_cuts: 3,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__findVideoTransition");
      expect(script).toContain("var dryRun = true");
      expect(script).toContain("cuts: cuts");
      expect(script).toContain("failures: failures");
    });
  });

  describe("export tools", () => {
    it("get_export_capabilities reports encoder and interchange methods", async () => {
      const tools = getExportTools(bridgeOptions);

      await (tools.get_export_capabilities.handler as any)({});

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("detailedQueueStatus");
      expect(script).toContain("exportAAF");
      expect(script).toContain("exportOMF");
      expect(script).toContain("exportAsMediaDirect");
      expect(script).toContain("frameCapture");
      expect(script).toContain("standardSequenceExportFramePNG");
      expect(script).toContain("qeSequenceExportFramePNG");
    });

    it("diagnose_export_preset checks preset existence and extension without exporting", async () => {
      const tools = getExportTools(bridgeOptions);

      await (tools.diagnose_export_preset.handler as any)({ preset_path: "/tmp/test.epr" });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("getExportFileExtension");
      expect(script).toContain("Preset file not found");
      expect(script).toContain("exported: false");
    });

    it("batch_export_sequences queues jobs without starting by default", async () => {
      const tools = getExportTools(bridgeOptions);

      await (tools.batch_export_sequences.handler as any)({
        jobs: [{ sequence_id: "seq-1", output_path: "/tmp/out.mp4", preset_path: "/tmp/preset.epr" }],
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("encoder.encodeSequence");
      expect(script).toContain("started = false");
      expect(script).toContain("Sequence not found");
    });

    it("export_frame probes frame capture capability instead of assuming exportFramePNG exists", async () => {
      const tools = getExportTools(bridgeOptions);

      await (tools.export_frame.handler as any)({
        output_path: "/tmp/frame.png",
        time_seconds: 3,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("__mcpGetFrameCaptureCapability");
      expect(userCode).toContain("__mcpExportFramePng");
      expect(userCode).toContain("Frame capture unsupported");
      expect(userCode).toContain("qe.project.getActiveSequence()");
      expect(userCode).toContain("standardSequenceExportFramePNG");
      expect(userCode).not.toContain("seq.exportFramePNG(seq.getPlayerPosition().ticks, outputPath);");
    });

    it("capture_frame returns unsupported bridge errors without looking for a temp image", async () => {
      mockedSendCommand.mockResolvedValueOnce({
        success: false,
        error: "Frame capture unsupported: No scriptable frame PNG export API is available",
      });
      const tools = getExportTools(bridgeOptions);

      const result = await (tools.capture_frame.handler as any)({ time_seconds: 3 });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Frame capture unsupported");
      const script = mockedSendCommand.mock.calls[0][0];
      const userCode = script.split("// === End MCP Bridge Helpers ===")[1] ?? script;
      expect(userCode).toContain("__mcpGetFrameCaptureCapability");
      expect(userCode).toContain("__mcpExportFramePng");
      expect(userCode).toContain("Frame capture unsupported");
      expect(userCode).not.toContain("seq.exportFramePNG(seq.getPlayerPosition().ticks, outputPath);");
    });
  });

  describe("project-manager tools", () => {
    it("consolidate_and_transfer exists and is callable", async () => {
      const tools = getProjectManagerTools(bridgeOptions);
      expect(tools.consolidate_and_transfer).toBeDefined();
      expect(typeof tools.consolidate_and_transfer.handler).toBe("function");
    });
  });

  describe("lumetri color tools", () => {
    it("color_correct uses Lumetri helper lookup and optional controls", async () => {
      const tools = getEffectsTools(bridgeOptions);
      await (tools.color_correct.handler as any)({
        node_id: "clip-1",
        exposure: 1.25,
        vibrance: 20,
        vignette_amount: -30,
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__mcpApplyLumetriValues");
      expect(script).toContain("__findLumetriComponent");
      expect(script).toContain('"exposure":1.25');
      expect(script).toContain('"vibrance":20');
      expect(script).toContain('"vignette_amount":-30');
      expect(script).toContain("Optional Lumetri Creative and Vignette controls");
    });

    it("apply_lut can target the Creative Lumetri LUT slot", async () => {
      const tools = getEffectsTools(bridgeOptions);
      await (tools.apply_lut.handler as any)({
        node_id: "clip-1",
        lut_path: "/tmp/look.cube",
        lut_slot: "creative",
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain('__mcpApplyLumetriValues');
      expect(script).toContain('values["creative_lut"]');
      expect(script).toContain("/tmp/look.cube");
    });

    it("copy_lumetri_grade reads a serializable Lumetri grade", async () => {
      const tools = getClipboardTools(bridgeOptions);
      await (tools.copy_lumetri_grade.handler as any)({
        source_node_id: "source-clip",
        property_keys: ["exposure", "vibrance"],
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__mcpValidateLumetriKeys");
      expect(script).toContain("__mcpReadLumetriGrade");
      expect(script).toContain('"exposure","vibrance"');
    });

    it("paste_lumetri_grade applies a copied grade to target clips", async () => {
      const tools = getClipboardTools(bridgeOptions);
      await (tools.paste_lumetri_grade.handler as any)({
        target_node_ids: ["target-a", "target-b"],
        grade: { properties: { exposure: 0.5, saturation: 110 } },
      });

      const script = mockedSendCommand.mock.calls[0][0];
      expect(script).toContain("__mcpNormalizeLumetriGrade");
      expect(script).toContain("__mcpApplyLumetriValues");
      expect(script).toContain('"target-a","target-b"');
      expect(script).toContain('"saturation":110');
    });
  });
});

describe("Tool Handler Return Values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handlers return the result from sendCommand", async () => {
    const expected = { success: true, data: { version: "24.0" } };
    mockedSendCommand.mockResolvedValue(expected);

    const tools = getHealthTools(bridgeOptions);
    const result = await (tools.ping.handler as any)({});

    expect(result).toEqual(expected);
  });

  it("handlers propagate sendCommand errors", async () => {
    mockedSendCommand.mockRejectedValue(new Error("Connection failed"));

    const tools = getHealthTools(bridgeOptions);
    await expect((tools.ping.handler as any)({})).rejects.toThrow("Connection failed");
  });

  it("handlers propagate failure results", async () => {
    const failResult = { success: false, error: "No active sequence" };
    mockedSendCommand.mockResolvedValue(failResult);

    const tools = getDiscoveryTools(bridgeOptions);
    const result = await (tools.get_active_sequence.handler as any)({});

    expect(result.success).toBe(false);
    expect(result.error).toBe("No active sequence");
  });
});

describe("Tool Naming Conventions", () => {
  it("all tool names use snake_case", () => {
    for (const mod of ALL_MODULES) {
      const tools = mod.getter(bridgeOptions);
      for (const name of Object.keys(tools)) {
        expect(name, `${mod.name}.${name} should be snake_case`).toMatch(
          /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
        );
      }
    }
  });

  it("no duplicate tool names across modules", () => {
    const allNames: string[] = [];
    for (const mod of ALL_MODULES) {
      const tools = mod.getter(bridgeOptions);
      allNames.push(...Object.keys(tools));
    }
    const unique = new Set(allNames);
    expect(unique.size).toBe(allNames.length);
  });
});

describe("Script Generation Patterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSendCommand.mockResolvedValue({ success: true, data: {} });
  });

  it("all scripts contain __result or __error", async () => {
    for (const mod of ALL_MODULES) {
      const tools = mod.getter(bridgeOptions);
      for (const [name, tool] of Object.entries(tools)) {
        vi.clearAllMocks();
        try {
          // Call with minimal args — we only care about the generated script
          await tool.handler({});
        } catch {
          // Some handlers may throw if required args are missing, that's OK
          continue;
        }

        if (mockedSendCommand.mock.calls.length > 0) {
          const script = mockedSendCommand.mock.calls[0][0];
          const hasResult = script.includes("__result") || script.includes("__error");
          expect(hasResult, `${mod.name}.${name} script should use __result or __error`).toBe(true);
        }
        if (mockedSendRawCommand.mock.calls.length > 0) {
          // Raw commands (scripting module) may not follow the pattern
          continue;
        }
      }
    }
  });

  it("scripts are wrapped in IIFE with try/catch", async () => {
    const tools = getDiscoveryTools(bridgeOptions);
    await (tools.get_project_info.handler as any)({});

    const script = mockedSendCommand.mock.calls[0][0];
    expect(script).toContain("(function() {");
    expect(script).toContain("} catch(e) {");
    expect(script).toContain("})();");
  });

  it("scripts include helper functions", async () => {
    const tools = getDiscoveryTools(bridgeOptions);
    await (tools.get_project_info.handler as any)({});

    const script = mockedSendCommand.mock.calls[0][0];
    expect(script).toContain("function __result(data)");
    expect(script).toContain("function __error(msg)");
    expect(script).toContain("TICKS_PER_SECOND");
  });
});
