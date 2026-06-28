#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const DEFAULT_TIMEOUT_MS = 5000;
const SCRATCH_PREFIX = "MCP_TEST_VALIDATE_";

function printHelp() {
  console.log(`Run a safe Premiere validation sweep.

Usage:
  npm run diagnostics:sweep
  npm run diagnostics:sweep -- --dry-run
  npm run diagnostics:sweep -- --run-readonly
  npm run diagnostics:sweep -- --run-readonly --include-project
  npm run diagnostics:sweep -- --live-probes --confirm-live-probes

Options:
  --temp-dir <path>        Bridge temp dir. Defaults to PREMIERE_TEMP_DIR or OS bridge default.
  --timeout-ms <number>    Per-command timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.
  --include-project        Also plan/run read-only project/timeline inspection tools.
  --json                   Print machine-readable JSON instead of text lines.
  --dry-run                Print planned checks and do not import dist or contact Premiere. This is the default.
  --run-readonly           Contact Premiere for read-only bridge/runtime/capability checks.
  --live-probes            Run opt-in scratch probes that mutate the open project.
  --confirm-live-probes    Required with --live-probes. Creates only MCP_TEST_VALIDATE_* scratch assets/sequences.
  --strict-contract        Exit nonzero when static contract checks find known or unexpected gaps.
  -h, --help               Show this help.

The default sweep is dry-run/read-only and never imports dist or contacts
Premiere. Read-only live mode does not install CEP, change global config, enable
QE, save projects, edit timelines, enqueue exports, or modify media. Live probes
warn and require --confirm-live-probes before creating MCP_TEST_VALIDATE_*
scratch project items/sequences. They never save, export, delete, or start AME.`);
}

function parseArgs(argv) {
  const options = {
    tempDir: process.env.PREMIERE_TEMP_DIR,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    includeProject: false,
    json: false,
    dryRun: true,
    runReadonly: false,
    liveProbes: false,
    confirmLiveProbes: false,
    strictContract: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--include-project") {
      options.includeProject = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--run-readonly") {
      options.runReadonly = true;
      options.dryRun = false;
    } else if (arg === "--live-probes") {
      options.liveProbes = true;
      options.dryRun = false;
    } else if (arg === "--confirm-live-probes") {
      options.confirmLiveProbes = true;
    } else if (arg === "--strict-contract") {
      options.strictContract = true;
    } else if (arg === "--temp-dir") {
      options.tempDir = argv[++i];
    } else if (arg.startsWith("--temp-dir=")) {
      options.tempDir = arg.slice("--temp-dir=".length);
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number.parseInt(argv[++i], 10);
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number.parseInt(arg.slice("--timeout-ms=".length), 10);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.runReadonly && options.liveProbes) {
    throw new Error("--run-readonly and --live-probes are mutually exclusive");
  }
  if (options.dryRun && (options.runReadonly || options.liveProbes)) {
    throw new Error("--dry-run cannot be combined with --run-readonly or --live-probes");
  }
  if (options.confirmLiveProbes && !options.liveProbes) {
    throw new Error("--confirm-live-probes only applies with --live-probes");
  }
  if (options.liveProbes && !options.confirmLiveProbes) {
    throw new Error(
      "--live-probes would mutate the open Premiere project. Re-run with --confirm-live-probes to create only MCP_TEST_VALIDATE_* scratch assets/sequences. It will not save, export, delete, or start AME."
    );
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }

  return options;
}

function sourceText(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf-8");
}

function contractCheck({ id, area, status, severity, title, evidence, expected, recommendation }) {
  return {
    id,
    area,
    status,
    severity,
    title,
    evidence,
    expected,
    recommendation,
  };
}

function runStaticContractChecks() {
  const sequenceSource = sourceText("src/tools/sequence.ts");
  const captionsSource = sourceText("src/tools/captions.ts");
  const textSource = sourceText("src/tools/text.ts");
  const exportSource = sourceText("src/tools/export.ts");
  const sourceMonitorSource = sourceText("src/tools/source-monitor.ts");
  const trackTargetingSource = sourceText("src/tools/track-targeting.ts");
  const playheadSource = sourceText("src/tools/playhead.ts");
  const timelineSource = sourceText("src/tools/timeline.ts");

  const checks = [];

  checks.push(contractCheck({
    id: "captions_api_capability_probe",
    area: "captions",
    status: captionsSource.includes("get_caption_api_capabilities") &&
      captionsSource.includes("typeof seq.createCaptionTrack") &&
      captionsSource.includes("createCaptionTrack is not available")
      ? "pass"
      : "known_gap",
    severity: "high",
    title: "Caption creation is guarded by a runtime API capability probe.",
    evidence: "src/tools/captions.ts create_caption_track and get_caption_api_capabilities",
    expected: "Caption tools must expose a read-only capability probe and guard createCaptionTrack before mutation.",
    recommendation: "Keep caption creation behind get_caption_api_capabilities/live probe results.",
  }));

  const transcriptUxPLimitIsExplicit =
    captionsSource.includes("unsupportedTextPanelResult") &&
    captionsSource.includes("currentBridgeCanInvokeUxpApis: false") &&
    captionsSource.includes("parse_transcript_json_file") &&
    captionsSource.includes("write_transcript_json_file");
  checks.push(contractCheck({
    id: "transcript_capability_not_advertised",
    area: "captions",
    status: transcriptUxPLimitIsExplicit ? "pass" : "known_gap",
    severity: "high",
    title: "Text panel transcript support is separated between local JSON helpers and explicit UXP-only unsupported operations.",
    evidence: transcriptUxPLimitIsExplicit
      ? "src/tools/captions.ts has local transcript JSON helpers, capability reporting, and explicit CEP/UXP unsupported errors."
      : "Transcript wording exists without the expected CEP/UXP limitation guards.",
    expected: "Local transcript JSON preparation may be supported, but Text panel import/export and auto-transcribe must return explicit unsupported errors under CEP.",
    recommendation: "Keep UXP-only Text panel operations clearly labeled unsupported unless a UXP bridge is added.",
  }));

  const projectItemInOutUsesTimeTicks =
    sourceMonitorSource.includes("inTime.seconds = ${args.in_seconds}") &&
    sourceMonitorSource.includes("item.setInPoint(inTime.ticks") &&
    trackTargetingSource.includes("inTime.seconds = ${args.in_seconds}") &&
    trackTargetingSource.includes("item.setInPoint(inTime.ticks");
  const sequenceInOutUsesSeconds =
    playheadSource.includes("seq.setWorkAreaInPoint(${args.in_seconds})") &&
    playheadSource.includes("seq.setWorkAreaOutPoint(${args.out_seconds})") &&
    playheadSource.includes("seq.setInPoint(${args.in_seconds})") &&
    playheadSource.includes("seq.setOutPoint(${args.out_seconds})");
  const subclipAndClipInOutUseTicks =
    exportSource.includes("var inTicks = __secondsToTicks") &&
    exportSource.includes("item.createSubClip(") &&
    timelineSource.includes("clip.inPoint = __secondsToTicks");
  const inOutUsesCorrectUnits =
    projectItemInOutUsesTimeTicks && sequenceInOutUsesSeconds && subclipAndClipInOutUseTicks;
  checks.push(contractCheck({
    id: "in_out_seconds_are_converted_to_ticks",
    area: "in_out_units",
    status: inOutUsesCorrectUnits ? "pass" : "known_gap",
    severity: "high",
    title: "Tools accepting *_seconds use the correct Premiere units for each in/out API.",
    evidence: "src/tools/source-monitor.ts, track-targeting.ts, playhead.ts, timeline.ts, export.ts",
    expected: "ProjectItem/subclip/clip boundaries should use ticks, while sequence in/out and work-area wrappers should use Premiere's seconds-based sequence APIs.",
    recommendation: "Keep each in/out wrapper aligned to the specific Premiere API unit contract.",
  }));

  const autoReframeUsesPixelSignature =
    sequenceSource.includes("target_width") &&
    sequenceSource.includes("target_height") &&
    sequenceSource.includes("autoReframeSequence(${args.target_width}, ${args.target_height}, false)");
  checks.push(contractCheck({
    id: "auto_reframe_signature",
    area: "auto_reframe",
    status: autoReframeUsesPixelSignature ? "known_gap" : "pass",
    severity: "high",
    title: "Auto Reframe tool signature matches Premiere's documented aspect-ratio API.",
    evidence: autoReframeUsesPixelSignature
      ? "src/tools/sequence.ts calls autoReframeSequence(target_width, target_height, false)."
      : "No pixel-width/height Auto Reframe signature detected.",
    expected: "Premiere documents autoReframeSequence(numerator, denominator, motionPreset, newName, useNestedSequences).",
    recommendation: "Runtime agent should replace width/height schema with numerator/denominator plus motion preset/name options.",
  }));

  const overlayUsesPngGraphics =
    textSource.includes("add_caption_text_overlays") &&
    textSource.includes("caption_like_png_text_overlay") &&
    textSource.includes("realCaptionTrack: false") &&
    textSource.includes("font_color") &&
    textSource.includes("background_opacity");
  const overlayUsesCaptionApi =
    textSource.includes("createCaptionTrack(textContent") ||
    textSource.includes("using the captions API approach");
  checks.push(contractCheck({
    id: "text_overlay_styling",
    area: "text_overlay",
    status: overlayUsesPngGraphics && !overlayUsesCaptionApi ? "pass" : "known_gap",
    severity: "high",
    title: "Text overlay tools create styled PNG graphics and do not masquerade as editable caption tracks.",
    evidence: overlayUsesPngGraphics && !overlayUsesCaptionApi
      ? "src/tools/text.ts renders caption-like PNG overlays with style parameters and reports realCaptionTrack: false."
      : "src/tools/text.ts does not show the expected styled PNG overlay path.",
    expected: "Styled caption-like overlays should use a graphics/asset path and clearly report that they are not real caption-track items.",
    recommendation: "Keep text overlays on the PNG/MOGRT path or relabel limitations explicitly.",
  }));

  const frameExportHasCapabilityReport = exportSource.includes("exportFramePNG") &&
    exportSource.includes("get_export_capabilities") &&
    /exportFramePNG\s*:/.test(exportSource);
  const frameExportHasMethodGuards =
    /typeof\s+seq\.exportFramePNG\s*===\s*"function"/.test(exportSource);
  checks.push(contractCheck({
    id: "frame_capture_export_capability",
    area: "frame_capture",
    status: frameExportHasCapabilityReport && frameExportHasMethodGuards ? "pass" : "known_gap",
    severity: "high",
    title: "Frame capture/export tools are covered by capability reporting and method guards.",
    evidence: frameExportHasCapabilityReport && frameExportHasMethodGuards
      ? "src/tools/export.ts reports and guards exportFramePNG."
      : "src/tools/export.ts uses exportFramePNG without both capability reporting and typeof guards.",
    expected: "get_export_capabilities should report exportFramePNG, and export_frame/capture_frame should guard it before writing files.",
    recommendation: "Runtime agent should add read-only exportFramePNG capability reporting and guard frame export calls.",
  }));

  const knownGaps = checks.filter((check) => check.status === "known_gap").length;
  const unexpectedFailures = checks.filter((check) => check.status === "fail").length;
  return {
    ok: knownGaps === 0 && unexpectedFailures === 0,
    knownGaps,
    unexpectedFailures,
    checks,
  };
}

function stepPlan(includeProject) {
  const steps = [
    { name: "fork_ping", source: "health", live: false },
    { name: "bridge_diagnostics", source: "health", live: false },
    { name: "ping", source: "health", live: true },
    { name: "get_premiere_runtime_diagnostics", source: "health", live: true },
  ];

  if (includeProject) {
    steps.push(
      { name: "get_full_project_overview", source: "inspection", live: true },
      { name: "get_timeline_summary", source: "inspection", live: true },
      { name: "get_offline_media", source: "inspection", live: true }
    );
  }

  return steps;
}

function summarizeResult(result) {
  if (!result || typeof result !== "object") {
    return "invalid result";
  }

  if (!result.success) {
    return result.error || "reported failure";
  }

  const data = result.data || {};
  if (data.premiereVersion || data.locale) {
    return `version=${data.premiereVersion || "unknown"} locale=${data.locale || "unknown"}`;
  }
  if (data.bridge) {
    return `tempDir=${data.bridge.tempDir} pending=${data.bridge.pendingCommandFiles + data.bridge.pendingResponseFiles}`;
  }
  if (typeof data.sequenceCount === "number") {
    return `sequences=${data.sequenceCount}`;
  }
  if (typeof data.totalItems === "number") {
    return `items=${data.totalItems} sequences=${data.sequenceCount}`;
  }
  if (typeof data.offlineCount === "number") {
    return `offline=${data.offlineCount}`;
  }

  return "ok";
}

async function importBuiltTools() {
  const healthPath = path.join(projectRoot, "dist", "tools", "health.js");
  const inspectionPath = path.join(projectRoot, "dist", "tools", "inspection.js");
  const captionsPath = path.join(projectRoot, "dist", "tools", "captions.js");
  const sequencePath = path.join(projectRoot, "dist", "tools", "sequence.js");
  const textPath = path.join(projectRoot, "dist", "tools", "text.js");
  const playheadPath = path.join(projectRoot, "dist", "tools", "playhead.js");
  const exportPath = path.join(projectRoot, "dist", "tools", "export.js");
  const scriptBuilderPath = path.join(projectRoot, "dist", "bridge", "script-builder.js");
  const fileBridgePath = path.join(projectRoot, "dist", "bridge", "file-bridge.js");
  const requiredPaths = [
    healthPath,
    inspectionPath,
    captionsPath,
    sequencePath,
    textPath,
    playheadPath,
    exportPath,
    scriptBuilderPath,
    fileBridgePath,
  ];

  if (requiredPaths.some((requiredPath) => !existsSync(requiredPath))) {
    throw new Error("dist/ is missing. Run npm run build before npm run diagnostics:sweep.");
  }

  const healthModule = await import(pathToFileURL(healthPath).href);
  const inspectionModule = await import(pathToFileURL(inspectionPath).href);
  const captionsModule = await import(pathToFileURL(captionsPath).href);
  const sequenceModule = await import(pathToFileURL(sequencePath).href);
  const textModule = await import(pathToFileURL(textPath).href);
  const playheadModule = await import(pathToFileURL(playheadPath).href);
  const exportModule = await import(pathToFileURL(exportPath).href);
  const scriptBuilderModule = await import(pathToFileURL(scriptBuilderPath).href);
  const fileBridgeModule = await import(pathToFileURL(fileBridgePath).href);

  return {
    getHealthTools: healthModule.getHealthTools,
    getInspectionTools: inspectionModule.getInspectionTools,
    getCaptionTools: captionsModule.getCaptionTools,
    getSequenceTools: sequenceModule.getSequenceTools,
    getTextTools: textModule.getTextTools,
    getPlayheadTools: playheadModule.getPlayheadTools,
    getExportTools: exportModule.getExportTools,
    buildToolScript: scriptBuilderModule.buildToolScript,
    escapeForExtendScript: scriptBuilderModule.escapeForExtendScript,
    sendCommand: fileBridgeModule.sendCommand,
  };
}

function printContractChecks(contractSummary) {
  console.log(`Static contract checks: ${contractSummary.checks.length} total, ${contractSummary.knownGaps} known gap(s).`);
  for (const check of contractSummary.checks) {
    const label = check.status === "pass" ? "PASS" : check.status === "known_gap" ? "KNOWN_GAP" : "FAIL";
    console.log(`- ${label} ${check.id}: ${check.title}`);
    if (check.status !== "pass") {
      console.log(`  evidence: ${check.evidence}`);
      console.log(`  next: ${check.recommendation}`);
    }
  }
}

async function runToolStep({ name, source, args = {}, readOnly = false, live = true }, toolMaps, options, results) {
  const tool = toolMaps[source][name];
  const startedAt = Date.now();

  try {
    const result = await tool.handler(args);
    const elapsedMs = Date.now() - startedAt;
    const ok = Boolean(result && result.success);

    results.push({
      name,
      source,
      readOnly,
      live,
      ok,
      elapsedMs,
      result,
    });

    if (!options.json) {
      console.log(`${ok ? "PASS" : "FAIL"} ${name} (${elapsedMs}ms): ${summarizeResult(result)}`);
    }
    return ok;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      source,
      readOnly,
      live,
      ok: false,
      elapsedMs,
      error: message,
    });

    if (!options.json) {
      console.log(`FAIL ${name} (${elapsedMs}ms): ${message}`);
    }
    return false;
  }
}

async function runCustomProbe(name, script, bridgeOptions, sendCommand, options, results) {
  const startedAt = Date.now();
  try {
    const result = await sendCommand(script, bridgeOptions);
    const elapsedMs = Date.now() - startedAt;
    const ok = Boolean(result && result.success);
    results.push({ name, source: "custom_probe", readOnly: true, live: true, ok, elapsedMs, result });
    if (!options.json) {
      console.log(`${ok ? "PASS" : "FAIL"} ${name} (${elapsedMs}ms): ${summarizeResult(result)}`);
    }
    return ok;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, source: "custom_probe", readOnly: true, live: true, ok: false, elapsedMs, error: message });
    if (!options.json) {
      console.log(`FAIL ${name} (${elapsedMs}ms): ${message}`);
    }
    return false;
  }
}

async function runLiveProbes(modules, bridgeOptions, options) {
  const captionTools = modules.getCaptionTools(bridgeOptions);
  const sequenceTools = modules.getSequenceTools(bridgeOptions);
  const textTools = modules.getTextTools(bridgeOptions);
  const playheadTools = modules.getPlayheadTools(bridgeOptions);
  const exportTools = modules.getExportTools(bridgeOptions);
  const toolMaps = {
    captions: captionTools,
    sequence: sequenceTools,
    text: textTools,
    playhead: playheadTools,
    export: exportTools,
  };
  const results = [];
  let failureCount = 0;
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const scratchName = `${SCRATCH_PREFIX}Sequence_${stamp}`;
  const reframeName = `${SCRATCH_PREFIX}AutoReframe_${stamp}`;
  const captionName = `${SCRATCH_PREFIX}Caption_${stamp}.srt`;
  const scratchDir = path.join(os.tmpdir(), "premiere-mcp-validation");
  const captionPath = path.join(scratchDir, captionName);
  mkdirSync(scratchDir, { recursive: true });
  writeFileSync(captionPath, "1\n00:00:00,000 --> 00:00:01,000\nMCP validation caption\n", "utf-8");

  if (!options.json) {
    console.error("WARNING: live probes will mutate the open Premiere project by creating MCP_TEST_VALIDATE_* scratch assets/sequences.");
    console.error("They will not save the project, export files, delete anything, or start Adobe Media Encoder.");
  }

  const steps = [
    { name: "create_sequence", source: "sequence", args: { name: scratchName }, readOnly: false },
    { name: "get_caption_api_capabilities", source: "captions", args: {}, readOnly: true },
    { name: "import_caption_file", source: "captions", args: { file_path: captionPath, suppress_ui: true }, readOnly: false },
    { name: "create_caption_track", source: "captions", args: { item_id: captionName, start_seconds: 0, caption_format: "subtitle" }, readOnly: false },
    { name: "set_in_out_points", source: "playhead", args: { in_seconds: 0, out_seconds: 1 }, readOnly: false },
    { name: "add_text_overlay", source: "text", args: { text: `${SCRATCH_PREFIX}Overlay`, start_seconds: 0, duration_seconds: 1, font_size: 48 }, readOnly: false },
    { name: "get_export_capabilities", source: "export", args: {}, readOnly: true },
  ];

  for (const step of steps) {
    const ok = await runToolStep(step, toolMaps, options, results);
    if (!ok) failureCount++;
  }

  const escapedScratchName = modules.escapeForExtendScript(scratchName);
  const escapedReframeName = modules.escapeForExtendScript(reframeName);
  const autoReframeScript = modules.buildToolScript(`
    var seq = __findSequence("${escapedScratchName}");
    if (!seq) return __error("Scratch sequence not found: ${escapedScratchName}");
    if (typeof seq.autoReframeSequence !== "function") {
      return __error("autoReframeSequence is not available in this Premiere ExtendScript runtime");
    }
    var result = seq.autoReframeSequence(9, 16, "Default", "${escapedReframeName}", false);
    return __result({
      reframed: true,
      sourceSequence: seq.name,
      newSequenceName: "${escapedReframeName}",
      result: result
    });
  `);
  const reframeOk = await runCustomProbe("probe_auto_reframe_documented_signature", autoReframeScript, bridgeOptions, modules.sendCommand, options, results);
  if (!reframeOk) failureCount++;

  const frameCapabilityScript = modules.buildToolScript(`
    var seq = app.project.activeSequence;
    return __result({
      readOnly: true,
      hasActiveSequence: !!seq,
      exportFramePNG: !!(seq && typeof seq.exportFramePNG === "function"),
      note: "Capability probe only; no frame was exported."
    });
  `);
  const frameOk = await runCustomProbe("probe_export_frame_png_capability", frameCapabilityScript, bridgeOptions, modules.sendCommand, options, results);
  if (!frameOk) failureCount++;

  return {
    ok: failureCount === 0,
    scratchPrefix: SCRATCH_PREFIX,
    scratchSequence: scratchName,
    scratchAutoReframeSequence: reframeName,
    scratchCaptionPath: captionPath,
    saved: false,
    exported: false,
    deleted: false,
    startedEncoder: false,
    failures: failureCount,
    results,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const plannedSteps = stepPlan(options.includeProject);
  const contractSummary = runStaticContractChecks();

  if (options.dryRun) {
    const payload = {
      readOnly: true,
      contactsPremiere: false,
      includeProject: options.includeProject,
      steps: plannedSteps,
      liveProbePlan: [
        "create MCP_TEST_VALIDATE_* scratch sequence",
        "import MCP_TEST_VALIDATE_* caption sidecar and attempt caption track creation",
        "set in/out points in seconds on scratch sequence",
        "attempt Auto Reframe on scratch sequence",
        "attempt add_text_overlay on scratch sequence",
        "probe exportFramePNG capability without exporting",
      ],
      contractSummary,
    };

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("Dry run: no dist import and no Premiere bridge contact.");
      for (const step of plannedSteps) {
        console.log(`- ${step.name} (${step.source}, ${step.live ? "live read-only" : "local"})`);
      }
      printContractChecks(contractSummary);
    }
    if (options.strictContract && !contractSummary.ok) {
      process.exit(1);
    }
    return;
  }

  const modules = await importBuiltTools();
  const { getHealthTools, getInspectionTools } = modules;
  const bridgeOptions = {
    tempDir: options.tempDir,
    timeoutMs: options.timeoutMs,
  };

  if (options.liveProbes) {
    const liveSummary = await runLiveProbes(modules, bridgeOptions, options);
    if (options.json) {
      console.log(JSON.stringify({
        ok: liveSummary.ok,
        mode: "live_probes",
        contractSummary,
        liveSummary,
      }, null, 2));
    }
    if (!liveSummary.ok) {
      process.exit(1);
    }
    return;
  }

  const healthTools = getHealthTools(bridgeOptions);
  const inspectionTools = getInspectionTools(bridgeOptions);
  const toolMaps = {
    health: healthTools,
    inspection: inspectionTools,
  };

  const results = [];
  let failureCount = 0;

  for (const step of plannedSteps) {
    const ok = await runToolStep({ ...step, args: {}, readOnly: true }, toolMaps, options, results);
    if (!ok) failureCount++;
  }

  const summary = {
    ok: failureCount === 0,
    readOnly: true,
    includeProject: options.includeProject,
    timeoutMs: options.timeoutMs,
    tempDir: options.tempDir || null,
    contractSummary,
    failures: failureCount,
    results,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  }

  if (failureCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
