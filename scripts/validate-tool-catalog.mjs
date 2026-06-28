#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const EXPECTED_TOOL_COUNT = 297;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const VALID_PROPERTY_TYPES = new Set(["string", "number", "boolean", "array", "object"]);

const moduleSpecs = [
  ["discovery", "getDiscoveryTools"],
  ["project", "getProjectTools"],
  ["media", "getMediaTools"],
  ["sequence", "getSequenceTools"],
  ["timeline", "getTimelineTools"],
  ["effects", "getEffectsTools"],
  ["transitions", "getTransitionsTools"],
  ["audio", "getAudioTools"],
  ["text", "getTextTools"],
  ["markers", "getMarkerTools"],
  ["tracks", "getTrackTools"],
  ["playhead", "getPlayheadTools"],
  ["metadata", "getMetadataTools"],
  ["export", "getExportTools"],
  ["advanced", "getAdvancedTools"],
  ["keyframes", "getKeyframeTools"],
  ["scripting", "getScriptingTools"],
  ["inspection", "getInspectionTools"],
  ["selection", "getSelectionTools"],
  ["clipboard", "getClipboardTools"],
  ["source-monitor", "getSourceMonitorTools"],
  ["track-targeting", "getTrackTargetingTools"],
  ["utility", "getUtilityTools"],
  ["health", "getHealthTools"],
  ["workspace", "getWorkspaceTools"],
  ["captions", "getCaptionTools"],
  ["playback", "getPlaybackTools"],
  ["project-manager", "getProjectManagerTools"],
];

function printHelp() {
  console.log(`Validate the built Premiere MCP tool catalog.

Usage:
  npm run validate:tools

This script imports dist/tools/*.js, so run npm run build first.
It validates tool names, duplicate names, handler shape, basic JSON-schema
parameters, required-property references, and the expected catalog size.`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

function failMissingBuild() {
  console.error("dist/ is missing. Run npm run build before npm run validate:tools.");
  process.exit(1);
}

function addError(errors, location, message) {
  errors.push(`${location}: ${message}`);
}

function validateParameters(errors, toolName, parameters) {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    addError(errors, toolName, "parameters must be an object");
    return;
  }

  const params = parameters;
  const properties = params.properties || {};
  const required = params.required || [];

  if (params.type !== undefined && params.type !== "object") {
    addError(errors, toolName, `parameters.type must be "object" when present, got ${String(params.type)}`);
  }

  if (properties && (typeof properties !== "object" || Array.isArray(properties))) {
    addError(errors, toolName, "parameters.properties must be an object when present");
    return;
  }

  if (!Array.isArray(required)) {
    addError(errors, toolName, "parameters.required must be an array when present");
    return;
  }

  for (const requiredName of required) {
    if (typeof requiredName !== "string") {
      addError(errors, toolName, "parameters.required values must be strings");
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(properties, requiredName)) {
      addError(errors, toolName, `required property "${requiredName}" is not defined`);
    }
  }

  for (const [propertyName, property] of Object.entries(properties)) {
    const propertyLocation = `${toolName}.${propertyName}`;

    if (!property || typeof property !== "object" || Array.isArray(property)) {
      addError(errors, propertyLocation, "property schema must be an object");
      continue;
    }

    if (!VALID_PROPERTY_TYPES.has(property.type)) {
      addError(errors, propertyLocation, `invalid type "${String(property.type)}"`);
    }

    if (typeof property.description !== "string" || property.description.trim().length === 0) {
      addError(errors, propertyLocation, "description must be a non-empty string");
    }

    if (property.enum !== undefined) {
      if (!Array.isArray(property.enum) || property.enum.length === 0) {
        addError(errors, propertyLocation, "enum must be a non-empty array when present");
      } else if (property.type === "string") {
        for (const value of property.enum) {
          if (typeof value !== "string") {
            addError(errors, propertyLocation, "string enum values must be strings");
          }
        }
      }
    }
  }
}

async function main() {
  const packagePath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
  const bridgeOptions = {
    tempDir: path.join(projectRoot, ".tmp", "tool-validation-bridge"),
    timeoutMs: 1000,
  };

  const errors = [];
  const seenToolNames = new Map();
  const moduleCounts = [];

  for (const [moduleName, getterName] of moduleSpecs) {
    const modulePath = path.join(projectRoot, "dist", "tools", `${moduleName}.js`);
    if (!existsSync(modulePath)) failMissingBuild();

    const imported = await import(pathToFileURL(modulePath).href);
    const getter = imported[getterName];
    if (typeof getter !== "function") {
      addError(errors, moduleName, `missing getter ${getterName}`);
      continue;
    }

    const tools = getter(bridgeOptions);
    if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
      addError(errors, moduleName, "getter must return a tool map object");
      continue;
    }

    const names = Object.keys(tools);
    moduleCounts.push({ moduleName, count: names.length });

    for (const [toolName, tool] of Object.entries(tools)) {
      const location = `${moduleName}.${toolName}`;

      if (!TOOL_NAME_PATTERN.test(toolName)) {
        addError(errors, location, "tool name must be snake_case");
      }

      if (seenToolNames.has(toolName)) {
        addError(errors, location, `duplicate tool name; first seen in ${seenToolNames.get(toolName)}`);
      } else {
        seenToolNames.set(toolName, moduleName);
      }

      if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
        addError(errors, location, "tool definition must be an object");
        continue;
      }

      if (typeof tool.description !== "string" || tool.description.trim().length === 0) {
        addError(errors, location, "description must be a non-empty string");
      }

      validateParameters(errors, location, tool.parameters);

      if (typeof tool.handler !== "function") {
        addError(errors, location, "handler must be a function");
      }
    }
  }

  const totalTools = moduleCounts.reduce((sum, item) => sum + item.count, 0);
  if (totalTools !== EXPECTED_TOOL_COUNT) {
    addError(errors, "catalog", `expected ${EXPECTED_TOOL_COUNT} tools, found ${totalTools}`);
  }

  if (errors.length > 0) {
    console.error(`Tool catalog validation failed with ${errors.length} issue(s):`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${totalTools} tools across ${moduleCounts.length} modules for ${packageJson.name} ${packageJson.version}.`);
  for (const { moduleName, count } of moduleCounts) {
    console.log(`- ${moduleName}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
