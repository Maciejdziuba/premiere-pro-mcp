export const LUMETRI_CONTROL_PARAMETERS = {
  exposure: { type: "number", description: "Lumetri Exposure adjustment, typically -4.0 to 4.0" },
  contrast: { type: "number", description: "Lumetri Contrast adjustment, typically -100 to 100" },
  highlights: { type: "number", description: "Lumetri Highlights adjustment, typically -100 to 100" },
  shadows: { type: "number", description: "Lumetri Shadows adjustment, typically -100 to 100" },
  whites: { type: "number", description: "Lumetri Whites adjustment, typically -100 to 100" },
  blacks: { type: "number", description: "Lumetri Blacks adjustment, typically -100 to 100" },
  temperature: { type: "number", description: "Lumetri Temperature adjustment" },
  tint: { type: "number", description: "Lumetri Tint adjustment" },
  saturation: { type: "number", description: "Lumetri Saturation value, typically 0 to 200 with 100 as normal" },
  vibrance: { type: "number", description: "Lumetri Creative Vibrance adjustment, if Premiere exposes it" },
  sharpen: { type: "number", description: "Lumetri Creative Sharpen adjustment, if Premiere exposes it" },
  vignette_amount: { type: "number", description: "Lumetri Vignette Amount adjustment, if Premiere exposes it" },
  vignette_midpoint: { type: "number", description: "Lumetri Vignette Midpoint adjustment, if Premiere exposes it" },
  vignette_roundness: { type: "number", description: "Lumetri Vignette Roundness adjustment, if Premiere exposes it" },
  vignette_feather: { type: "number", description: "Lumetri Vignette Feather adjustment, if Premiere exposes it" },
} as const;

export type LumetriControlKey = keyof typeof LUMETRI_CONTROL_PARAMETERS;
export type LumetriControlArgs = Partial<Record<LumetriControlKey, number>>;

const LUMETRI_CONTROL_KEYS = Object.keys(LUMETRI_CONTROL_PARAMETERS) as LumetriControlKey[];

const LUMETRI_PROPERTY_SPECS = [
  {
    key: "input_lut",
    label: "Input LUT",
    helperKey: "inputLut",
    matchNames: ["ADBE Lumetri Input LUT"],
    localizedNames: ["Input LUT"],
  },
  {
    key: "creative_lut",
    label: "Creative Look/LUT",
    matchNames: ["ADBE Lumetri Creative Look", "ADBE Lumetri Look"],
    localizedNames: ["Creative Look", "Look"],
    path: [
      { matchNames: ["ADBE Lumetri Creative"], localizedNames: ["Creative"] },
      { matchNames: ["ADBE Lumetri Creative Look", "ADBE Lumetri Look"], localizedNames: ["Look", "Creative Look"] },
    ],
  },
  {
    key: "exposure",
    label: "Exposure",
    helperKey: "exposure",
    matchNames: ["ADBE Lumetri Exposure"],
    localizedNames: ["Exposure"],
  },
  {
    key: "contrast",
    label: "Contrast",
    helperKey: "contrast",
    matchNames: ["ADBE Lumetri Contrast"],
    localizedNames: ["Contrast"],
  },
  {
    key: "highlights",
    label: "Highlights",
    helperKey: "highlights",
    matchNames: ["ADBE Lumetri Highlights"],
    localizedNames: ["Highlights"],
  },
  {
    key: "shadows",
    label: "Shadows",
    helperKey: "shadows",
    matchNames: ["ADBE Lumetri Shadows"],
    localizedNames: ["Shadows"],
  },
  {
    key: "whites",
    label: "Whites",
    helperKey: "whites",
    matchNames: ["ADBE Lumetri Whites"],
    localizedNames: ["Whites"],
  },
  {
    key: "blacks",
    label: "Blacks",
    helperKey: "blacks",
    matchNames: ["ADBE Lumetri Blacks"],
    localizedNames: ["Blacks"],
  },
  {
    key: "temperature",
    label: "Temperature",
    helperKey: "temperature",
    matchNames: ["ADBE Lumetri Temperature"],
    localizedNames: ["Temperature"],
  },
  {
    key: "tint",
    label: "Tint",
    helperKey: "tint",
    matchNames: ["ADBE Lumetri Tint"],
    localizedNames: ["Tint"],
  },
  {
    key: "saturation",
    label: "Saturation",
    helperKey: "saturation",
    matchNames: ["ADBE Lumetri Saturation"],
    localizedNames: ["Saturation"],
  },
  {
    key: "vibrance",
    label: "Vibrance",
    matchNames: ["ADBE Lumetri Vibrance"],
    localizedNames: ["Vibrance"],
    path: [
      { matchNames: ["ADBE Lumetri Creative"], localizedNames: ["Creative"] },
      { matchNames: ["ADBE Lumetri Vibrance"], localizedNames: ["Vibrance"] },
    ],
  },
  {
    key: "sharpen",
    label: "Sharpen",
    matchNames: ["ADBE Lumetri Sharpen"],
    localizedNames: ["Sharpen"],
    path: [
      { matchNames: ["ADBE Lumetri Creative"], localizedNames: ["Creative"] },
      { matchNames: ["ADBE Lumetri Sharpen"], localizedNames: ["Sharpen"] },
    ],
  },
  {
    key: "vignette_amount",
    label: "Vignette Amount",
    matchNames: ["ADBE Lumetri Vignette Amount"],
    localizedNames: ["Vignette Amount"],
    path: [
      { matchNames: ["ADBE Lumetri Vignette"], localizedNames: ["Vignette"] },
      { matchNames: ["ADBE Lumetri Vignette Amount"], localizedNames: ["Amount", "Vignette Amount"] },
    ],
  },
  {
    key: "vignette_midpoint",
    label: "Vignette Midpoint",
    matchNames: ["ADBE Lumetri Vignette Midpoint"],
    localizedNames: ["Vignette Midpoint"],
    path: [
      { matchNames: ["ADBE Lumetri Vignette"], localizedNames: ["Vignette"] },
      { matchNames: ["ADBE Lumetri Vignette Midpoint"], localizedNames: ["Midpoint", "Vignette Midpoint"] },
    ],
  },
  {
    key: "vignette_roundness",
    label: "Vignette Roundness",
    matchNames: ["ADBE Lumetri Vignette Roundness"],
    localizedNames: ["Vignette Roundness"],
    path: [
      { matchNames: ["ADBE Lumetri Vignette"], localizedNames: ["Vignette"] },
      { matchNames: ["ADBE Lumetri Vignette Roundness"], localizedNames: ["Roundness", "Vignette Roundness"] },
    ],
  },
  {
    key: "vignette_feather",
    label: "Vignette Feather",
    matchNames: ["ADBE Lumetri Vignette Feather"],
    localizedNames: ["Vignette Feather"],
    path: [
      { matchNames: ["ADBE Lumetri Vignette"], localizedNames: ["Vignette"] },
      { matchNames: ["ADBE Lumetri Vignette Feather"], localizedNames: ["Feather", "Vignette Feather"] },
    ],
  },
];

export function collectLumetriAdjustments(args: LumetriControlArgs): Record<string, number> {
  const values: Record<string, number> = {};

  for (const key of LUMETRI_CONTROL_KEYS) {
    const value = args[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      values[key] = value;
    }
  }

  return values;
}

export function extendScriptLiteral(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function buildLumetriExtendScriptHelpers(): string {
  return `
    var __MCP_LUMETRI_PROPERTY_SPECS = ${extendScriptLiteral(LUMETRI_PROPERTY_SPECS)};
    var __MCP_LUMETRI_EFFECT_MATCH_NAMES = ["AE.ADBE Lumetri", "ADBE Lumetri"];
    var __MCP_LUMETRI_EFFECT_LOCALIZED_NAMES = ["Lumetri Color"];
    var __MCP_LUMETRI_LIVE_VALIDATION_NOTE = "Optional Lumetri Creative and Vignette controls use best-effort matchName and nested group aliases and need live validation across Premiere versions/locales.";

    function __mcpLumetriObjectKeys(obj) {
      var keys = [];
      if (!obj) return keys;
      for (var key in obj) {
        try {
          if (obj.hasOwnProperty(key)) keys.push(key);
        } catch(e) {}
      }
      return keys;
    }

    function __mcpLumetriArrayContains(arr, value) {
      if (!arr) return false;
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i]) === String(value)) return true;
      }
      return false;
    }

    function __mcpLumetriSpecByKey(key) {
      for (var i = 0; i < __MCP_LUMETRI_PROPERTY_SPECS.length; i++) {
        if (__MCP_LUMETRI_PROPERTY_SPECS[i].key === key) return __MCP_LUMETRI_PROPERTY_SPECS[i];
      }
      return null;
    }

    function __mcpValidateLumetriKeys(keys) {
      var unknown = [];
      if (!keys) return unknown;
      for (var i = 0; i < keys.length; i++) {
        if (!__mcpLumetriSpecByKey(keys[i])) unknown.push(keys[i]);
      }
      return unknown;
    }

    function __mcpLumetriKeyAllowed(key, keys) {
      if (!keys || keys.length === 0) return true;
      return __mcpLumetriArrayContains(keys, key);
    }

    function __mcpFindLumetriProperty(component, spec) {
      var prop = null;
      if (!component || !spec) return null;

      if (spec.helperKey) {
        try { prop = __findKnownProperty(component, "lumetri", spec.helperKey); } catch(e) {}
      }
      if (!prop && spec.path) {
        try { prop = __findNestedProperty(component, spec.path); } catch(e) {}
      }
      if (!prop) {
        try { prop = __findPropertyDeep(component, spec.matchNames, spec.localizedNames, 8); } catch(e) {}
      }
      return prop;
    }

    function __mcpGetLumetriPropertyValue(prop) {
      var value = null;
      try {
        value = prop.getValue(0, 0);
        return { ok: true, value: value };
      } catch(e1) {}
      try {
        value = prop.getValue();
        return { ok: true, value: value };
      } catch(e2) {
        return { ok: false, error: e2.toString() };
      }
    }

    function __mcpSetLumetriPropertyValue(prop, spec, value) {
      try {
        prop.setValue(value, true);
        return { ok: true };
      } catch(e) {
        return {
          ok: false,
          error: "Failed to set Lumetri property " + spec.key + " (" + spec.label + "): " + e.toString()
        };
      }
    }

    function __mcpEnsureLumetriComponent(result) {
      if (!result || !result.clip) return { ok: false, error: "Clip not found" };

      var lumetri = __findLumetriComponent(result.clip);
      if (lumetri) return { ok: true, component: lumetri, applied: false };

      if (result.trackType !== "video") {
        return { ok: false, error: "Lumetri Color can only be applied to video clips" };
      }

      try { app.enableQE(); } catch(e) {}

      var qeSeq = null;
      try { qeSeq = qe.project.getActiveSequence(); } catch(e) {}
      if (!qeSeq) return { ok: false, error: "No active sequence (QE) while applying Lumetri Color" };

      var qeTrack = null;
      try { qeTrack = qeSeq.getVideoTrackAt(result.trackIndex); } catch(e) {}
      if (!qeTrack) return { ok: false, error: "QE video track not found while applying Lumetri Color" };

      var qeClip = null;
      try { qeClip = qeTrack.getItemAt(result.clipIndex); } catch(e) {}
      if (!qeClip) return { ok: false, error: "QE clip not found while applying Lumetri Color" };

      var qeEffect = __findVideoEffect(__MCP_LUMETRI_EFFECT_MATCH_NAMES, __MCP_LUMETRI_EFFECT_LOCALIZED_NAMES);
      if (!qeEffect) {
        return { ok: false, error: "Lumetri Color effect is unavailable or not exposed by QE effect lookup" };
      }

      try {
        qeClip.addVideoEffect(qeEffect);
      } catch(e) {
        return { ok: false, error: "Failed to apply Lumetri Color effect: " + e.toString() };
      }

      var refreshed = null;
      try { refreshed = __findClip(result.clip.nodeId); } catch(e) {}
      if (refreshed) result = refreshed;

      lumetri = __findLumetriComponent(result.clip);
      if (!lumetri) {
        return {
          ok: false,
          error: "Lumetri Color was applied but its component is not exposed by the standard DOM; live Premiere validation is needed"
        };
      }

      return { ok: true, component: lumetri, applied: true };
    }

    function __mcpApplyLumetriValues(result, values, failOnMissing, applyIfMissing) {
      if (!values) values = {};

      var ensure = null;
      if (applyIfMissing === false) {
        var existing = __findLumetriComponent(result.clip);
        if (!existing) {
          return { ok: false, error: "Lumetri Color is not present on the clip and apply_if_missing is false" };
        }
        ensure = { ok: true, component: existing, applied: false };
      } else {
        ensure = __mcpEnsureLumetriComponent(result);
      }

      if (!ensure.ok) return ensure;

      var changes = {};
      var skipped = [];
      for (var i = 0; i < __MCP_LUMETRI_PROPERTY_SPECS.length; i++) {
        var spec = __MCP_LUMETRI_PROPERTY_SPECS[i];
        if (!values.hasOwnProperty(spec.key)) continue;

        var prop = __mcpFindLumetriProperty(ensure.component, spec);
        if (!prop) {
          var unsupported = { property: spec.key, label: spec.label };
          skipped.push(unsupported);
          if (failOnMissing !== false) {
            return {
              ok: false,
              error: "Unsupported or unavailable Lumetri property: " + spec.key + " (" + spec.label + ")"
            };
          }
          continue;
        }

        var setResult = __mcpSetLumetriPropertyValue(prop, spec, values[spec.key]);
        if (!setResult.ok) return setResult;
        changes[spec.key] = values[spec.key];
      }

      return {
        ok: true,
        appliedLumetri: ensure.applied === true,
        changes: changes,
        skipped: skipped,
        liveValidationNeeded: __MCP_LUMETRI_LIVE_VALIDATION_NOTE
      };
    }

    function __mcpReadLumetriGrade(result, propertyKeys, failOnMissing) {
      var component = __findLumetriComponent(result.clip);
      if (!component) return { ok: false, error: "Lumetri Color effect not found on source clip" };

      var requested = propertyKeys && propertyKeys.length > 0;
      var properties = {};
      var unsupported = [];
      var copiedKeys = [];

      for (var i = 0; i < __MCP_LUMETRI_PROPERTY_SPECS.length; i++) {
        var spec = __MCP_LUMETRI_PROPERTY_SPECS[i];
        if (!__mcpLumetriKeyAllowed(spec.key, propertyKeys)) continue;

        var prop = __mcpFindLumetriProperty(component, spec);
        if (!prop) {
          var missing = { property: spec.key, label: spec.label };
          unsupported.push(missing);
          if (requested && failOnMissing !== false) {
            return {
              ok: false,
              error: "Unsupported or unavailable Lumetri property on source: " + spec.key + " (" + spec.label + ")"
            };
          }
          continue;
        }

        var valueResult = __mcpGetLumetriPropertyValue(prop);
        if (!valueResult.ok) {
          var unreadable = { property: spec.key, label: spec.label, error: valueResult.error };
          unsupported.push(unreadable);
          if (requested && failOnMissing !== false) {
            return {
              ok: false,
              error: "Could not read Lumetri property on source: " + spec.key + " (" + spec.label + "): " + valueResult.error
            };
          }
          continue;
        }

        properties[spec.key] = valueResult.value;
        copiedKeys.push(spec.key);
      }

      return {
        ok: true,
        grade: {
          format: "premiere-mcp-lumetri-grade",
          version: 1,
          sourceClip: result.clip.name,
          properties: properties,
          propertyKeys: copiedKeys,
          unsupported: unsupported,
          liveValidationNeeded: __MCP_LUMETRI_LIVE_VALIDATION_NOTE
        },
        unsupported: unsupported,
        liveValidationNeeded: __MCP_LUMETRI_LIVE_VALIDATION_NOTE
      };
    }

    function __mcpNormalizeLumetriGrade(grade) {
      var source = grade;
      if (grade && grade.properties) source = grade.properties;

      var values = {};
      var unknown = [];
      if (!source) return { values: values, unknown: unknown };

      for (var key in source) {
        try {
          if (!source.hasOwnProperty(key)) continue;
        } catch(e) {
          continue;
        }

        if (__mcpLumetriSpecByKey(key)) {
          values[key] = source[key];
        } else {
          unknown.push(key);
        }
      }

      return { values: values, unknown: unknown };
    }
  `;
}
