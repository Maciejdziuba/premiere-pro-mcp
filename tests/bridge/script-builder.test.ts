import { describe, it, expect } from "vitest";
import { buildScript, escapeForExtendScript, buildToolScript } from "../../src/bridge/script-builder.js";

function helperPrelude() {
  const result = buildScript("");
  return result.slice(0, result.indexOf("(function() {"));
}

describe("buildScript", () => {
  it("wraps code in an IIFE with try/catch", () => {
    const result = buildScript("return __result({ ok: true });");
    expect(result).toContain("(function() {");
    expect(result).toContain("return __result({ ok: true });");
    expect(result).toContain("} catch(e) {");
    expect(result).toContain("return __error(e.toString());");
    expect(result).toContain("})();");
  });

  it("prepends helper functions", () => {
    const result = buildScript("return __result({});");
    expect(result).toContain("var TICKS_PER_SECOND = 254016000000;");
    expect(result).toContain("function __ticksToSeconds(ticks)");
    expect(result).toContain("function __secondsToTicks(seconds)");
    expect(result).toContain("function __ticksToTimecode(ticks, fps)");
    expect(result).toContain("function __pad(n)");
    expect(result).toContain("function __findSequence(idOrName)");
    expect(result).toContain("function __findProjectItem(nodeIdOrName, rootItem)");
    expect(result).toContain("function __findClip(nodeId)");
    expect(result).toContain("function __findByMatchNameThenName(collection, matchNames, localizedNames)");
    expect(result).toContain("function __findComponent(clip, matchNames, localizedNames)");
    expect(result).toContain("function __findProperty(container, matchNames, localizedNames)");
    expect(result).toContain("function __findNestedProperty(container, path)");
    expect(result).toContain("function __findPropertyDeep(container, matchNames, localizedNames, maxDepth)");
    expect(result).toContain("function __findEffect(effectList, matchNames, localizedNames)");
    expect(result).toContain("function __findTransition(transitionList, matchNames, localizedNames)");
    expect(result).toContain("function __getAllClips(seq)");
    expect(result).toContain("function __jsonStringify(obj)");
    expect(result).toContain("function __result(data)");
    expect(result).toContain("function __error(msg)");
  });

  it("preserves multi-line code blocks", () => {
    const code = `var x = 1;
    var y = 2;
    return __result({ sum: x + y });`;
    const result = buildScript(code);
    expect(result).toContain("var x = 1;");
    expect(result).toContain("var y = 2;");
    expect(result).toContain("return __result({ sum: x + y });");
  });

  it("handles empty code", () => {
    const result = buildScript("");
    expect(result).toContain("(function() {");
    expect(result).toContain("})();");
  });

  it("returns a string", () => {
    expect(typeof buildScript("")).toBe("string");
  });
});

describe("locale-resilient lookup helpers", () => {
  it("prepends shared lookup helpers for components, properties, effects, and transitions", () => {
    const result = buildScript("");
    expect(result).toContain("function __asLookupArray(value)");
    expect(result).toContain("function __lookupSpecFromStep(step)");
    expect(result).toContain("function __getCollectionLength(collection)");
    expect(result).toContain("function __getCollectionItem(collection, index)");
    expect(result).toContain("function __findByMatchNameThenName(collection, matchNames, localizedNames)");
    expect(result).toContain("function __findComponent(clip, matchNames, localizedNames)");
    expect(result).toContain("function __findProperty(container, matchNames, localizedNames)");
    expect(result).toContain("function __findPropertyGroup(container, matchNames, localizedNames)");
    expect(result).toContain("function __findNestedProperty(container, path)");
    expect(result).toContain("function __findPropertyDeep(container, matchNames, localizedNames, maxDepth)");
    expect(result).toContain("function __findEffect(effectList, matchNames, localizedNames)");
    expect(result).toContain("function __findVideoEffect(matchNames, localizedNames)");
    expect(result).toContain("function __findAudioEffect(matchNames, localizedNames)");
    expect(result).toContain("function __findTransition(transitionList, matchNames, localizedNames)");
    expect(result).toContain("function __findVideoTransition(matchNames, localizedNames)");
    expect(result).toContain("function __findAudioTransition(matchNames, localizedNames)");
  });

  it("searches stable matchName values before localized displayName/name values", () => {
    const result = helperPrelude();
    const matchNamePass = result.indexOf("// First pass: stable matchName values survive UI localization.");
    const localizedPass = result.indexOf("// Second pass: displayName/name values are localized UI labels.");
    expect(matchNamePass).toBeGreaterThan(-1);
    expect(localizedPass).toBeGreaterThan(-1);
    expect(matchNamePass).toBeLessThan(localizedPass);
    expect(result).toContain('__getStringField(matchItem, "matchName")');
    expect(result).toContain('__getStringField(item, "displayName")');
    expect(result).toContain('__getStringField(item, "name")');
  });

  it("normalizes nested lookup path steps from matchName and localized name fields", () => {
    const result = buildScript("");
    expect(result).toContain("__appendLookupValues(matchNames, step.matchName);");
    expect(result).toContain("__appendLookupValues(matchNames, step.matchNames);");
    expect(result).toContain("__appendLookupValues(localizedNames, step.localizedName);");
    expect(result).toContain("__appendLookupValues(localizedNames, step.localizedNames);");
    expect(result).toContain("__appendLookupValues(localizedNames, step.displayName);");
    expect(result).toContain("__appendLookupValues(localizedNames, step.displayNames);");
    expect(result).toContain("__appendLookupValues(localizedNames, step.name);");
    expect(result).toContain("__appendLookupValues(localizedNames, step.names);");
  });

  it("walks nested property groups through properties collections with a depth limit", () => {
    const result = buildScript("");
    expect(result).toContain("current = __findProperty(current, spec.matchNames, spec.localizedNames);");
    expect(result).toContain("if (maxDepth === undefined || maxDepth === null) maxDepth = 8;");
    expect(result).toContain("var props = __getPropertiesCollection(container);");
    expect(result).toContain("var nested = __findPropertyDeep(child, matchNames, localizedNames, maxDepth - 1);");
  });

  it("covers common intrinsic Premiere components and property aliases", () => {
    const result = buildScript("");
    expect(result).toContain("var __MCP_COMPONENT_ALIASES = {");
    expect(result).toContain('matchNames: ["AE.ADBE Motion"]');
    expect(result).toContain('matchNames: ["AE.ADBE Opacity"]');
    expect(result).toContain('matchNames: ["audioVolume"]');
    expect(result).toContain('matchNames: ["AE.ADBE Lumetri", "ADBE Lumetri"]');
    expect(result).toContain('matchNames: ["AE.ADBE Time Remapping", "timeRemapping"]');
    expect(result).toContain('localizedNames: ["Motion"]');
    expect(result).toContain('localizedNames: ["Opacity"]');
    expect(result).toContain('localizedNames: ["Volume"]');
    expect(result).toContain('localizedNames: ["Lumetri Color"]');
    expect(result).toContain('localizedNames: ["Time Remapping"]');
    expect(result).toContain("function __findMotionComponent(clip)");
    expect(result).toContain("function __findOpacityComponent(clip)");
    expect(result).toContain("function __findVolumeComponent(clip)");
    expect(result).toContain("function __findLumetriComponent(clip)");
    expect(result).toContain("function __findTimeRemappingComponent(clip)");
  });

  it("provides known property helpers for intrinsic component controls", () => {
    const result = buildScript("");
    expect(result).toContain("var __MCP_PROPERTY_ALIASES = {");
    expect(result).toContain('position: { matchNames: ["ADBE Position", "AE.ADBE Position"], localizedNames: ["Position"] }');
    expect(result).toContain('opacity: { matchNames: ["ADBE Opacity", "AE.ADBE Opacity"], localizedNames: ["Opacity"] }');
    expect(result).toContain('level: { matchNames: ["audioVolume", "ADBE Audio Volume"], localizedNames: ["Level"] }');
    expect(result).toContain('inputLut: { matchNames: ["ADBE Lumetri Input LUT"], localizedNames: ["Input LUT"] }');
    expect(result).toContain('speed: { matchNames: ["ADBE Time Remapping Speed", "timeRemappingSpeed"], localizedNames: ["Speed"] }');
    expect(result).toContain("function __findKnownProperty(component, componentKey, propertyKey)");
    expect(result).toContain("return __findPropertyDeep(component, aliases.matchNames, aliases.localizedNames, 8);");
  });

  it("uses QE list scans plus localized getByName fallbacks for effects and transitions", () => {
    const result = buildScript("");
    expect(result).toContain("qe.project.getVideoEffectList()");
    expect(result).toContain("qe.project.getAudioEffectList()");
    expect(result).toContain('"getVideoEffectByName"');
    expect(result).toContain('"getAudioEffectByName"');
    expect(result).toContain("qe.project.getVideoTransitionList()");
    expect(result).toContain("qe.project.getAudioTransitionList()");
    expect(result).toContain('"getVideoTransitionByName"');
    expect(result).toContain('"getAudioTransitionByName"');
    expect(result).toContain("function __findQeProjectItemByLocalizedName(methodName, localizedNames)");
  });

  it("keeps the helper prelude ES3-compatible", () => {
    const result = helperPrelude();
    expect(result).not.toMatch(/\b(let|const)\b|=>/);
  });
});

describe("buildToolScript (alias)", () => {
  it("is the same function as buildScript", () => {
    expect(buildToolScript).toBe(buildScript);
  });

  it("produces identical output to buildScript", () => {
    const code = "return __result({ test: true });";
    expect(buildToolScript(code)).toBe(buildScript(code));
  });
});

describe("escapeForExtendScript", () => {
  it("escapes backslashes", () => {
    expect(escapeForExtendScript("C:\\Users\\test")).toBe("C:\\\\Users\\\\test");
  });

  it("escapes double quotes", () => {
    expect(escapeForExtendScript('say "hello"')).toBe('say \\"hello\\"');
  });

  it("escapes single quotes", () => {
    expect(escapeForExtendScript("it's")).toBe("it\\'s");
  });

  it("escapes newlines", () => {
    expect(escapeForExtendScript("line1\nline2")).toBe("line1\\nline2");
  });

  it("escapes carriage returns", () => {
    expect(escapeForExtendScript("line1\rline2")).toBe("line1\\rline2");
  });

  it("escapes tabs", () => {
    expect(escapeForExtendScript("col1\tcol2")).toBe("col1\\tcol2");
  });

  it("handles empty strings", () => {
    expect(escapeForExtendScript("")).toBe("");
  });

  it("handles strings with no special characters", () => {
    expect(escapeForExtendScript("hello world")).toBe("hello world");
  });

  it("handles multiple escape characters in one string", () => {
    const input = 'C:\\path\\to\n"file"\t\'test\'';
    const result = escapeForExtendScript(input);
    expect(result).toBe('C:\\\\path\\\\to\\n\\"file\\"\\t\\\'test\\\'');
  });

  it("handles unicode characters (passes through)", () => {
    expect(escapeForExtendScript("日本語")).toBe("日本語");
  });
});

describe("generated script structure", () => {
  it("helpers appear before the IIFE", () => {
    const result = buildScript("return __result({});");
    const helpersEnd = result.indexOf("// === End MCP Bridge Helpers ===");
    const iifeStart = result.indexOf("(function() {");
    expect(helpersEnd).toBeLessThan(iifeStart);
    expect(helpersEnd).toBeGreaterThan(-1);
    expect(iifeStart).toBeGreaterThan(-1);
  });

  it("__findProjectItem recursively searches bins", () => {
    const result = buildScript("");
    expect(result).toContain("if (item.type === 2)");
    expect(result).toContain("var found = __findProjectItem(nodeIdOrName, item);");
  });

  it("__findClip searches both video and audio tracks", () => {
    const result = buildScript("");
    expect(result).toContain("seq.videoTracks.numTracks");
    expect(result).toContain("seq.audioTracks.numTracks");
    expect(result).toContain('trackType: "video"');
    expect(result).toContain('trackType: "audio"');
  });

  it("__jsonStringify handles all types", () => {
    const result = buildScript("");
    expect(result).toContain('if (obj === null) return "null"');
    expect(result).toContain('if (typeof obj === "string")');
    expect(result).toContain('if (typeof obj === "number"');
    expect(result).toContain("if (obj instanceof Array)");
    expect(result).toContain('if (typeof obj === "object")');
  });
});
