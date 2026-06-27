/**
 * Builds ExtendScript strings with helper functions prepended.
 * All generated code must be ES3-compatible (var, no arrow functions, no let/const).
 */

const HELPERS = `
// === MCP Bridge Helpers (auto-prepended) ===

var TICKS_PER_SECOND = 254016000000;

function __ticksToSeconds(ticks) {
  return parseFloat(ticks) / TICKS_PER_SECOND;
}

function __secondsToTicks(seconds) {
  return Math.round(parseFloat(seconds) * TICKS_PER_SECOND);
}

function __ticksToTimecode(ticks, fps) {
  var totalSeconds = __ticksToSeconds(ticks);
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var secs = Math.floor(totalSeconds % 60);
  var frames = Math.floor((totalSeconds % 1) * fps);
  return __pad(hours) + ":" + __pad(minutes) + ":" + __pad(secs) + ":" + __pad(frames);
}

function __pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

function __findSequence(idOrName) {
  var project = app.project;
  for (var i = 0; i < project.sequences.numSequences; i++) {
    var seq = project.sequences[i];
    if (seq.sequenceID === idOrName || seq.name === idOrName) {
      return seq;
    }
  }
  return null;
}

function __findProjectItem(nodeIdOrName, rootItem) {
  if (!rootItem) rootItem = app.project.rootItem;
  for (var i = 0; i < rootItem.children.numItems; i++) {
    var item = rootItem.children[i];
    if (item.nodeId === nodeIdOrName || item.name === nodeIdOrName) {
      return item;
    }
    if (item.type === 2) { // Bin
      var found = __findProjectItem(nodeIdOrName, item);
      if (found) return found;
    }
  }
  return null;
}

function __findClip(nodeId) {
  var seq = app.project.activeSequence;
  if (!seq) return null;

  // Search video tracks
  for (var t = 0; t < seq.videoTracks.numTracks; t++) {
    var track = seq.videoTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      var clip = track.clips[c];
      if (clip.nodeId === nodeId) {
        return { clip: clip, trackIndex: t, clipIndex: c, trackType: "video" };
      }
    }
  }

  // Search audio tracks
  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var track = seq.audioTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      var clip = track.clips[c];
      if (clip.nodeId === nodeId) {
        return { clip: clip, trackIndex: t, clipIndex: c, trackType: "audio" };
      }
    }
  }

  return null;
}

function __asLookupArray(value) {
  if (value === null || value === undefined || value === "") return [];
  if (value instanceof Array) return value;
  return [value];
}

function __appendLookupValues(target, values) {
  var arr = __asLookupArray(values);
  for (var i = 0; i < arr.length; i++) {
    target.push(arr[i]);
  }
}

function __localizedLookupArray(matchNames, localizedNames) {
  var names = __asLookupArray(localizedNames);
  if (names.length === 0) {
    names = __asLookupArray(matchNames);
  }
  return names;
}

function __lookupSpec(matchNames, localizedNames) {
  return {
    matchNames: __asLookupArray(matchNames),
    localizedNames: __localizedLookupArray(matchNames, localizedNames)
  };
}

function __lookupSpecFromStep(step) {
  if (step === null || step === undefined) {
    return __lookupSpec([], []);
  }
  if (typeof step === "string" || typeof step === "number") {
    return __lookupSpec(step, step);
  }

  var matchNames = [];
  var localizedNames = [];
  __appendLookupValues(matchNames, step.matchName);
  __appendLookupValues(matchNames, step.matchNames);
  __appendLookupValues(localizedNames, step.localizedName);
  __appendLookupValues(localizedNames, step.localizedNames);
  __appendLookupValues(localizedNames, step.displayName);
  __appendLookupValues(localizedNames, step.displayNames);
  __appendLookupValues(localizedNames, step.name);
  __appendLookupValues(localizedNames, step.names);
  return __lookupSpec(matchNames, localizedNames);
}

function __getCollectionLength(collection) {
  if (!collection) return 0;
  try {
    if (collection.numItems !== undefined && collection.numItems !== null) {
      return collection.numItems;
    }
  } catch(e) {}
  try {
    if (collection.length !== undefined && collection.length !== null) {
      return collection.length;
    }
  } catch(e) {}
  return 0;
}

function __getCollectionItem(collection, index) {
  if (!collection) return null;
  try {
    if (collection[index]) return collection[index];
  } catch(e) {}
  try {
    if (collection.getItemAt) return collection.getItemAt(index);
  } catch(e) {}
  try {
    if (collection.item) return collection.item(index);
  } catch(e) {}
  return null;
}

function __getStringField(item, fieldName) {
  if (!item) return null;
  try {
    if (item[fieldName] !== undefined && item[fieldName] !== null) {
      return String(item[fieldName]);
    }
  } catch(e) {}
  return null;
}

function __nameInList(name, names) {
  if (name === null || name === undefined) return false;
  var arr = __asLookupArray(names);
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] !== null && arr[i] !== undefined && String(arr[i]) === String(name)) {
      return true;
    }
  }
  return false;
}

function __matchesLocalizedName(item, localizedNames) {
  return __nameInList(__getStringField(item, "displayName"), localizedNames) ||
    __nameInList(__getStringField(item, "name"), localizedNames);
}

function __findByMatchNameThenName(collection, matchNames, localizedNames) {
  var stableNames = __asLookupArray(matchNames);
  var names = __localizedLookupArray(matchNames, localizedNames);
  var count = __getCollectionLength(collection);

  // First pass: stable matchName values survive UI localization.
  for (var i = 0; i < count; i++) {
    var matchItem = __getCollectionItem(collection, i);
    if (__nameInList(__getStringField(matchItem, "matchName"), stableNames)) {
      return matchItem;
    }
  }

  // Second pass: displayName/name values are localized UI labels.
  for (var j = 0; j < count; j++) {
    var namedItem = __getCollectionItem(collection, j);
    if (__matchesLocalizedName(namedItem, names)) {
      return namedItem;
    }
  }

  return null;
}

function __getPropertiesCollection(container) {
  if (!container) return null;
  try {
    if (container.properties) return container.properties;
  } catch(e) {}
  return null;
}

function __findComponent(clip, matchNames, localizedNames) {
  if (!clip) return null;
  return __findByMatchNameThenName(clip.components, matchNames, localizedNames);
}

function __findProperty(container, matchNames, localizedNames) {
  return __findByMatchNameThenName(__getPropertiesCollection(container), matchNames, localizedNames);
}

function __findPropertyGroup(container, matchNames, localizedNames) {
  return __findProperty(container, matchNames, localizedNames);
}

function __findNestedProperty(container, path) {
  var current = container;
  var steps = __asLookupArray(path);
  for (var i = 0; i < steps.length; i++) {
    var spec = __lookupSpecFromStep(steps[i]);
    current = __findProperty(current, spec.matchNames, spec.localizedNames);
    if (!current) return null;
  }
  return current;
}

function __findPropertyDeep(container, matchNames, localizedNames, maxDepth) {
  if (!container) return null;
  if (maxDepth === undefined || maxDepth === null) maxDepth = 8;

  var found = __findProperty(container, matchNames, localizedNames);
  if (found) return found;
  if (maxDepth <= 0) return null;

  var props = __getPropertiesCollection(container);
  var count = __getCollectionLength(props);
  for (var i = 0; i < count; i++) {
    var child = __getCollectionItem(props, i);
    if (__getPropertiesCollection(child)) {
      var nested = __findPropertyDeep(child, matchNames, localizedNames, maxDepth - 1);
      if (nested) return nested;
    }
  }
  return null;
}

function __findEffect(effectList, matchNames, localizedNames) {
  return __findByMatchNameThenName(effectList, matchNames, localizedNames);
}

function __enableQeIfAvailable() {
  try {
    if (app.enableQE) app.enableQE();
  } catch(e) {}
}

function __findQeProjectItemByLocalizedName(methodName, localizedNames) {
  var names = __asLookupArray(localizedNames);
  for (var i = 0; i < names.length; i++) {
    try {
      if (qe && qe.project && qe.project[methodName]) {
        var item = qe.project[methodName](String(names[i]));
        if (item) return item;
      }
    } catch(e) {}
  }
  return null;
}

function __findVideoEffect(matchNames, localizedNames) {
  __enableQeIfAvailable();
  var names = __localizedLookupArray(matchNames, localizedNames);
  var found = null;
  try {
    found = __findEffect(qe.project.getVideoEffectList(), matchNames, names);
  } catch(e) {}
  if (found) return found;
  return __findQeProjectItemByLocalizedName("getVideoEffectByName", names);
}

function __findAudioEffect(matchNames, localizedNames) {
  __enableQeIfAvailable();
  var names = __localizedLookupArray(matchNames, localizedNames);
  var found = null;
  try {
    found = __findEffect(qe.project.getAudioEffectList(), matchNames, names);
  } catch(e) {}
  if (found) return found;
  return __findQeProjectItemByLocalizedName("getAudioEffectByName", names);
}

function __findTransition(transitionList, matchNames, localizedNames) {
  return __findByMatchNameThenName(transitionList, matchNames, localizedNames);
}

function __findVideoTransition(matchNames, localizedNames) {
  __enableQeIfAvailable();
  var names = __localizedLookupArray(matchNames, localizedNames);
  var found = null;
  try {
    found = __findTransition(qe.project.getVideoTransitionList(), matchNames, names);
  } catch(e) {}
  if (found) return found;
  return __findQeProjectItemByLocalizedName("getVideoTransitionByName", names);
}

function __findAudioTransition(matchNames, localizedNames) {
  __enableQeIfAvailable();
  var names = __localizedLookupArray(matchNames, localizedNames);
  var found = null;
  try {
    found = __findTransition(qe.project.getAudioTransitionList(), matchNames, names);
  } catch(e) {}
  if (found) return found;
  return __findQeProjectItemByLocalizedName("getAudioTransitionByName", names);
}

var __MCP_COMPONENT_ALIASES = {
  motion: {
    matchNames: ["AE.ADBE Motion"],
    localizedNames: ["Motion"]
  },
  opacity: {
    matchNames: ["AE.ADBE Opacity"],
    localizedNames: ["Opacity"]
  },
  volume: {
    matchNames: ["audioVolume"],
    localizedNames: ["Volume"]
  },
  lumetri: {
    matchNames: ["AE.ADBE Lumetri", "ADBE Lumetri"],
    localizedNames: ["Lumetri Color"]
  },
  timeRemapping: {
    matchNames: ["AE.ADBE Time Remapping", "timeRemapping"],
    localizedNames: ["Time Remapping"]
  }
};

var __MCP_PROPERTY_ALIASES = {
  motion: {
    position: { matchNames: ["ADBE Position", "AE.ADBE Position"], localizedNames: ["Position"] },
    scale: { matchNames: ["ADBE Scale", "AE.ADBE Scale"], localizedNames: ["Scale"] },
    scaleWidth: { matchNames: ["ADBE Scale Width"], localizedNames: ["Scale Width"] },
    scaleHeight: { matchNames: ["ADBE Scale Height"], localizedNames: ["Scale Height"] },
    rotation: { matchNames: ["ADBE Rotation", "ADBE Rotate Z"], localizedNames: ["Rotation"] },
    anchorPoint: { matchNames: ["ADBE Anchor Point", "AE.ADBE Anchor Point"], localizedNames: ["Anchor Point"] },
    uniformScale: { matchNames: ["ADBE Uniform Scale"], localizedNames: ["Uniform Scale"] }
  },
  opacity: {
    opacity: { matchNames: ["ADBE Opacity", "AE.ADBE Opacity"], localizedNames: ["Opacity"] },
    blendMode: { matchNames: ["ADBE Blend Mode"], localizedNames: ["Blend Mode"] }
  },
  volume: {
    level: { matchNames: ["audioVolume", "ADBE Audio Volume"], localizedNames: ["Level"] }
  },
  lumetri: {
    inputLut: { matchNames: ["ADBE Lumetri Input LUT"], localizedNames: ["Input LUT"] },
    exposure: { matchNames: ["ADBE Lumetri Exposure"], localizedNames: ["Exposure"] },
    contrast: { matchNames: ["ADBE Lumetri Contrast"], localizedNames: ["Contrast"] },
    highlights: { matchNames: ["ADBE Lumetri Highlights"], localizedNames: ["Highlights"] },
    shadows: { matchNames: ["ADBE Lumetri Shadows"], localizedNames: ["Shadows"] },
    whites: { matchNames: ["ADBE Lumetri Whites"], localizedNames: ["Whites"] },
    blacks: { matchNames: ["ADBE Lumetri Blacks"], localizedNames: ["Blacks"] },
    temperature: { matchNames: ["ADBE Lumetri Temperature"], localizedNames: ["Temperature"] },
    tint: { matchNames: ["ADBE Lumetri Tint"], localizedNames: ["Tint"] },
    saturation: { matchNames: ["ADBE Lumetri Saturation"], localizedNames: ["Saturation"] }
  },
  timeRemapping: {
    speed: { matchNames: ["ADBE Time Remapping Speed", "timeRemappingSpeed"], localizedNames: ["Speed"] }
  }
};

function __componentAliases(key) {
  try {
    return __MCP_COMPONENT_ALIASES[key] || null;
  } catch(e) {}
  return null;
}

function __propertyAliases(componentKey, propertyKey) {
  try {
    if (__MCP_PROPERTY_ALIASES[componentKey]) {
      return __MCP_PROPERTY_ALIASES[componentKey][propertyKey] || null;
    }
  } catch(e) {}
  return null;
}

function __findKnownComponent(clip, key) {
  var aliases = __componentAliases(key);
  if (!aliases) return null;
  return __findComponent(clip, aliases.matchNames, aliases.localizedNames);
}

function __findKnownProperty(component, componentKey, propertyKey) {
  var aliases = __propertyAliases(componentKey, propertyKey);
  if (!aliases) return null;
  return __findPropertyDeep(component, aliases.matchNames, aliases.localizedNames, 8);
}

function __findMotionComponent(clip) {
  return __findKnownComponent(clip, "motion");
}

function __findOpacityComponent(clip) {
  return __findKnownComponent(clip, "opacity");
}

function __findVolumeComponent(clip) {
  return __findKnownComponent(clip, "volume");
}

function __findLumetriComponent(clip) {
  return __findKnownComponent(clip, "lumetri");
}

function __findTimeRemappingComponent(clip) {
  return __findKnownComponent(clip, "timeRemapping");
}

function __getAllClips(seq) {
  if (!seq) seq = app.project.activeSequence;
  if (!seq) return [];
  var clips = [];

  for (var t = 0; t < seq.videoTracks.numTracks; t++) {
    var track = seq.videoTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      var clip = track.clips[c];
      clips.push({
        nodeId: clip.nodeId,
        name: clip.name,
        trackIndex: t,
        trackType: "video",
        inPoint: __ticksToSeconds(clip.inPoint.ticks),
        outPoint: __ticksToSeconds(clip.outPoint.ticks),
        start: __ticksToSeconds(clip.start.ticks),
        end: __ticksToSeconds(clip.end.ticks),
        duration: __ticksToSeconds(clip.duration.ticks),
        mediaType: clip.mediaType
      });
    }
  }

  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var track = seq.audioTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      var clip = track.clips[c];
      clips.push({
        nodeId: clip.nodeId,
        name: clip.name,
        trackIndex: t,
        trackType: "audio",
        inPoint: __ticksToSeconds(clip.inPoint.ticks),
        outPoint: __ticksToSeconds(clip.outPoint.ticks),
        start: __ticksToSeconds(clip.start.ticks),
        end: __ticksToSeconds(clip.end.ticks),
        duration: __ticksToSeconds(clip.duration.ticks),
        mediaType: clip.mediaType
      });
    }
  }

  return clips;
}

function __jsonStringify(obj) {
  // ES3-compatible JSON stringify
  if (typeof JSON !== "undefined" && JSON.stringify) {
    return JSON.stringify(obj);
  }
  // Fallback for very old ExtendScript
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  if (typeof obj === "string") return '"' + obj.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"').replace(/\\n/g, "\\\\n") + '"';
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (obj instanceof Array) {
    var arr = [];
    for (var i = 0; i < obj.length; i++) {
      arr.push(__jsonStringify(obj[i]));
    }
    return "[" + arr.join(",") + "]";
  }
  if (typeof obj === "object") {
    var parts = [];
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
        parts.push(__jsonStringify(k) + ":" + __jsonStringify(obj[k]));
      }
    }
    return "{" + parts.join(",") + "}";
  }
  return String(obj);
}

function __result(data) {
  return __jsonStringify({ success: true, data: data });
}

function __error(msg) {
  return __jsonStringify({ success: false, error: String(msg) });
}

// === End MCP Bridge Helpers ===
`;

/**
 * Build a complete ExtendScript by wrapping user code in an IIFE with helpers.
 */
export function buildScript(code: string): string {
  return `${HELPERS}
(function() {
  try {
    ${code}
  } catch(e) {
    return __error(e.toString());
  }
})();`;
}

/**
 * Escape a string for safe embedding in ExtendScript.
 */
export function escapeForExtendScript(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Build a script that wraps code returning a value.
 * The code should use `return __result(...)` or `return __error(...)`.
 * @deprecated Use buildScript() directly. This is an alias kept for backward compatibility.
 */
export const buildToolScript = buildScript;
