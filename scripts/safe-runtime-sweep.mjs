#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const DEFAULT_TIMEOUT_MS = 5000;

function printHelp() {
  console.log(`Run a safe, read-only Premiere diagnostics sweep.

Usage:
  npm run diagnostics:sweep
  npm run diagnostics:sweep -- --include-project
  npm run diagnostics:sweep -- --dry-run

Options:
  --temp-dir <path>        Bridge temp dir. Defaults to PREMIERE_TEMP_DIR or OS bridge default.
  --timeout-ms <number>    Per-command timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.
  --include-project        Also run read-only project/timeline inspection tools.
  --json                   Print machine-readable JSON instead of text lines.
  --dry-run                Print the planned read-only tools and do not import dist or contact Premiere.
  -h, --help               Show this help.

The default sweep only runs local bridge diagnostics plus lightweight Premiere
version/locale/runtime checks. It does not install CEP, change global config,
enable QE, save projects, edit timelines, enqueue exports, or modify media.`);
}

function parseArgs(argv) {
  const options = {
    tempDir: process.env.PREMIERE_TEMP_DIR,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    includeProject: false,
    json: false,
    dryRun: false,
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

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer");
  }

  return options;
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

  if (!existsSync(healthPath) || !existsSync(inspectionPath)) {
    throw new Error("dist/ is missing. Run npm run build before npm run diagnostics:sweep.");
  }

  const healthModule = await import(pathToFileURL(healthPath).href);
  const inspectionModule = await import(pathToFileURL(inspectionPath).href);

  return {
    getHealthTools: healthModule.getHealthTools,
    getInspectionTools: inspectionModule.getInspectionTools,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const plannedSteps = stepPlan(options.includeProject);

  if (options.dryRun) {
    const payload = {
      readOnly: true,
      contactsPremiere: false,
      includeProject: options.includeProject,
      steps: plannedSteps,
    };

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("Dry run: no dist import and no Premiere bridge contact.");
      for (const step of plannedSteps) {
        console.log(`- ${step.name} (${step.source}, ${step.live ? "live read-only" : "local"})`);
      }
    }
    return;
  }

  const { getHealthTools, getInspectionTools } = await importBuiltTools();
  const bridgeOptions = {
    tempDir: options.tempDir,
    timeoutMs: options.timeoutMs,
  };
  const healthTools = getHealthTools(bridgeOptions);
  const inspectionTools = getInspectionTools(bridgeOptions);
  const toolMaps = {
    health: healthTools,
    inspection: inspectionTools,
  };

  const results = [];
  let failureCount = 0;

  for (const step of plannedSteps) {
    const tool = toolMaps[step.source][step.name];
    const startedAt = Date.now();

    try {
      const result = await tool.handler({});
      const elapsedMs = Date.now() - startedAt;
      const ok = Boolean(result && result.success);

      if (!ok) failureCount++;

      results.push({
        name: step.name,
        source: step.source,
        readOnly: true,
        live: step.live,
        ok,
        elapsedMs,
        result,
      });

      if (!options.json) {
        console.log(`${ok ? "PASS" : "FAIL"} ${step.name} (${elapsedMs}ms): ${summarizeResult(result)}`);
      }
    } catch (error) {
      failureCount++;
      const elapsedMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name: step.name,
        source: step.source,
        readOnly: true,
        live: step.live,
        ok: false,
        elapsedMs,
        error: message,
      });

      if (!options.json) {
        console.log(`FAIL ${step.name} (${elapsedMs}ms): ${message}`);
      }
    }
  }

  const summary = {
    ok: failureCount === 0,
    readOnly: true,
    includeProject: options.includeProject,
    timeoutMs: options.timeoutMs,
    tempDir: options.tempDir || null,
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
