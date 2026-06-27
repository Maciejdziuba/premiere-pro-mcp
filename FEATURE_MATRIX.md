# Feature Matrix

This fork already has a broad Premiere MCP surface. The goal now is safer extension: locale-resilient helpers, clear module ownership, diagnostics, and validation that does not require Premiere unless a live check is explicitly planned.

Current source of truth:

- `src/server.ts` registers tools by spreading 28 `get*Tools()` modules.
- `tests/tools/tool-modules.test.ts` and `npm run validate:tools` validate the catalog.
- After Agents D, E, and F, the implementation exposes 288 tools across 28 modules, matching README/package metadata.

## Current module inventory

| Module | Tools | Existing category | Primary owner | Notes |
|---|---:|---|---|---|
| `src/tools/advanced.ts` | 27 | QE timeline edits, speed, sequence utilities, selected effect/color helpers | C, with D/F coordination | Mixed file; coordinate before touching color/effect/export helpers. |
| `src/tools/audio.ts` | 10 | Dedicated audio levels/gain, fades, pan, keyframes, common effects, audio transitions, diagnostics, ducking, mute | E | Uses shared helper lookup for Volume/Level, QE helpers for audio effects/transitions, and honest errors for unsupported raw peak/normalization APIs. |
| `src/tools/captions.ts` | 5 | Caption/SRT helpers and caption track creation | F | Local SRT parse/write does not require Premiere; caption edit/export API exposure still needs live validation. |
| `src/tools/clipboard.ts` | 8 | Effect copy, Lumetri grade copy/paste, batch effects, clip media replace, blend mode | F, with D for color-grade behavior | Lumetri grade tools use helper lookup; generic effect copy still needs broader migration. |
| `src/tools/discovery.ts` | 10 | Project, item, sequence, clip discovery | G | Read-oriented foundation for safe planning. |
| `src/tools/effects.ts` | 9 | Video/audio effects, fuller Lumetri controls, LUT, batch color, stabilization | F, with D owning Lumetri/color | Highest D/F overlap; optional Lumetri Creative/Vignette controls need live validation. |
| `src/tools/export.ts` | 16 | Export, frame capture, interchange, AME/proxy operations, export diagnostics, batch export helpers | F | Queue details remain limited by AME/Premiere scripting APIs; needs live AME/Premiere validation beyond unit tests. |
| `src/tools/health.ts` | 4 | Fork ping, bridge diagnostics, live health/runtime diagnostics | G | `fork_ping` and `bridge_diagnostics` do not contact Premiere; `ping` and runtime diagnostics do. |
| `src/tools/inspection.ts` | 10 | Deep read-only project/sequence/clip reports | G | Used by safe runtime sweep. |
| `src/tools/keyframes.ts` | 8 | Effect property and keyframe CRUD | D, with B helper dependency | Property lookup should migrate to shared helpers. |
| `src/tools/markers.ts` | 4 | Sequence and clip markers | C/G | Editing behavior is C; reporting is G. |
| `src/tools/media.ts` | 16 | Import, bins, relink, proxy, interpretation | F | Project-panel destructive tools need clear live-test boundaries. |
| `src/tools/metadata.ts` | 9 | Metadata, labels, XMP, footage interpretation, color space | F/G | Data mutation is F; reporting is G. |
| `src/tools/playback.ts` | 4 | Timeline/source playback | C | Uses QE for timeline playback. |
| `src/tools/playhead.ts` | 6 | CTI, work area, sequence in/out | C | Shared by editing and export workflows. |
| `src/tools/project-manager.ts` | 1 | Consolidate/transfer | F | High-risk live operation; disposable projects only. |
| `src/tools/project.ts` | 25 | Project lifecycle, bins, ingest, import, scratch disks | F/G | Several operations affect files/project state. |
| `src/tools/scripting.ts` | 6 | Custom ExtendScript, DOM inspection, state snapshots | G, with B safety constraints | Raw script paths stay explicit opt-in. |
| `src/tools/selection.ts` | 7 | Clip selection utilities | C | Selection state is mutable; re-query after edits. |
| `src/tools/sequence.ts` | 11 | Sequence creation/settings/nesting/interchange helpers | C/F | C owns timeline behavior; F owns export-facing helpers. |
| `src/tools/source-monitor.ts` | 7 | Source monitor and 3-point edits | C | Depends on target-track behavior. |
| `src/tools/text.ts` | 3 | Text overlays and MOGRT import | F | Graphics/MOGRT properties may need helper lookup. |
| `src/tools/timeline.ts` | 10 | Add/remove/move/trim/split/duplicate/enable/replace/speed | C | Core editing surface. |
| `src/tools/track-targeting.ts` | 31 | Track targeting, clip transforms/audio props, batch operations, version info | C, with D/E/G coordination | Largest mixed module; Motion/Opacity/Volume lookup should use B helpers. |
| `src/tools/tracks.ts` | 4 | Track add/delete/lock/visibility | C | Track delete/visibility should keep explicit errors. |
| `src/tools/transitions.ts` | 6 | Video/audio transition lookup/add/list/batch | F/E | Video transition lookup now uses helper matchName/name resolution; audio transition behavior coordinates with E. |
| `src/tools/utility.ts` | 29 | Project cleanup, adjustment layers, freeze frame, sequence settings, markers, navigation, nesting | C/G/F split | Mixed catch-all; prefer better-owned modules for new broad features. |
| `src/tools/workspace.ts` | 2 | Workspace list/switch | G | Diagnostics/workflow support. |

Total: 288 tools across 28 modules.

## Missing target categories

| Target | Desired result | Primary owner | Current gap/status |
|---|---|---|---|
| Locale-resilient component/property lookup | Shared helpers that match by `matchName` first, localized display name second, including nested property groups | B | Added in `src/bridge/script-builder.ts` and documented in `LOCALE_HELPERS.md`; C/D/E/F should migrate tools to use it. |
| Timeline/sequence breadth | Safer add/move/trim/split/duplicate/link/ripple/gap/work-area/in-out/track flows with re-query guidance | C | Broad coverage exists; QE/index-based operations need clearer failure modes and live notes. |
| Lumetri/color breadth | Fuller Lumetri controls, LUT handling, grade copy/paste, batch color application | D | Added `batch_color_correct`, `copy_lumetri_grade`, and `paste_lumetri_grade`; expanded `color_correct`/`apply_lut`; migrated color/keyframe lookup to shared helpers where feasible. Optional Creative/Vignette aliases need live Premiere validation. |
| Audio breadth | Clip gain/volume/fades/pan/keyframes, audio effects, audio transitions, normalization/diagnostics where feasible | E | Dedicated `audio.ts` now covers feasible clip Volume/Level gain offsets, fades, pan, keyframes, common QE audio effects, QE audio transitions, timeline-level clipping/normalization diagnostics, and voiceover ducking. Raw waveform peak, LUFS, and destructive normalization remain unsupported through ExtendScript and return explicit diagnostics instead of fake success. |
| Effects/transitions/captions/export breadth | Match-name-aware effect lookup, safer batch effects/transitions, caption edit/export, AME/export diagnostics | F | Transition lookup uses helper matchName/name resolution; batch video transitions report per-cut results; local SRT parse/write and caption import/capability diagnostics added; export preset/capability diagnostics and batch AME/interchange helpers added. Live AME/caption/interchange validation remains outstanding. |
| Diagnostics/testing/docs | Bridge/version/locale readouts, safe read-only runtime sweep, schema validation, live-test notes | G | Added `bridge_diagnostics`, `get_premiere_runtime_diagnostics`, `validate:tools`, and `diagnostics:sweep`. |
| Architecture map | Keep counts, ownership, helper assignments, and conflict boundaries current | A | This file is the coordination point; update it when tools/modules are added. |

## Helper workstreams

| Agent | Branch/worktree | Files owned first | Validation | Stop condition |
|---|---|---|---|---|
| A - Feature matrix + architecture | `agent-a-matrix-architecture` | `FEATURE_MATRIX.md`, docs sections only | `npm run build` | Matrix lists current counts, categories, ownership, helpers, validation, and merge risks. |
| B - Locale/helper layer | `agent-b-locale-helpers` | `src/bridge/script-builder.ts`, `tests/bridge/*`, optional helper docs | `npm run build && npm test` | Shared ES3 helpers are implemented, tested, and ready for tool modules to consume. |
| C - Timeline/sequence/track tools | `agent-c-timeline-tools` | `timeline.ts`, `sequence.ts`, `advanced.ts`, `selection.ts`, `playhead.ts`, `tracks.ts`, `track-targeting.ts`, `source-monitor.ts`, `playback.ts` | `npm run build && npm test` | Editing tools are improved or blocked with clear unsupported/live-validation notes. |
| D - Lumetri/color tools | `agent-d-lumetri-color` | Lumetri/color paths in `effects.ts`, `keyframes.ts`, `clipboard.ts`, `advanced.ts`, `track-targeting.ts` | `npm run build && npm test` | Color controls work through helper lookup or limitations are documented. |
| E - Audio tools | `agent-e-audio-tools` | `audio.ts`, audio paths in `track-targeting.ts`, `effects.ts`, `transitions.ts`, `export.ts` | `npm run build && npm test` | Feasible audio tools are added; unsupported APIs return clear errors. |
| F - Effects/media/export/captions | `agent-f-effects-export` | `effects.ts` non-Lumetri paths, `transitions.ts`, `captions.ts`, `export.ts`, `media.ts`, `project.ts`, `project-manager.ts`, `text.ts`, `metadata.ts` | `npm run build && npm test` | Feature group improves without taking over Lumetri/audio-specific behavior. |
| G - Diagnostics/testing/docs | `agent-g-diagnostics-docs` | `health.ts`, `inspection.ts`, `discovery.ts`, `scripting.ts`, `workspace.ts`, `tests/`, `scripts/`, docs | `npm run build && npm test && npm run validate:tools && npm run diagnostics:sweep -- --dry-run` | Diagnostics/docs/validation pass; live-test needs are listed without starting Premiere automatically. |

## Diagnostics status

Static/runtime-safe diagnostics now cover:

- `fork_ping`: fork metadata without Premiere or CEP.
- `bridge_diagnostics`: package version, Node runtime, effective bridge temp directory, timeout, pending `cmd_`/`res_` files, and warnings without contacting Premiere.
- `ping`: live CEP/Premiere connectivity plus Premiere version/build, ExtendScript locale/OS, project, active sequence, and QE availability readout.
- `get_premiere_runtime_diagnostics`: read-only live runtime details for version/locale validation, BridgeTalk identifiers, project/sequence state, and capability probes without enabling QE.
- `npm run validate:tools`: built catalog validation for duplicate names, snake_case names, handler shape, required-property references, and basic JSON-schema metadata.
- `npm run diagnostics:sweep`: read-only live sweep. Defaults to local bridge diagnostics plus lightweight live version/locale/runtime checks; `--include-project` adds project overview, timeline summary, and offline-media reads.

Remaining live validation:

- Run `npm run diagnostics:sweep` with Premiere open, MCP Bridge running, and `PREMIERE_TEMP_DIR` matching the panel.
- Run `npm run diagnostics:sweep -- --include-project` on a small known project.
- Capture at least one non-English Premiere UI locale.
- Confirm `bridge_diagnostics` reports stale `cmd_`/`res_` files after a forced bridge interruption, then verify cleanup on restart.
- Live-check audio automation on a disposable sequence: Volume/Level keyframe time basis, Panner exposure on mono/stereo clips, QE common audio effect lookup, QE audio transition insertion, and voiceover ducking keyframe placement.

## Safe extension patterns

- Add tools to the closest existing module. Add a new module only when the behavior has a distinct ownership boundary; then update `src/server.ts`, `tests/tools/tool-modules.test.ts`, this matrix, and public count docs together.
- Keep every generated ExtendScript snippet ES3-compatible: `var`, classic functions, manual loops, no `let`, `const`, arrow functions, optional chaining, or modern array helpers.
- Use `buildToolScript()` for Premiere commands and return `__result(...)` or `__error(...)` from the script. Use `sendCommand()` for validated bridge execution.
- Escape every user-controlled string with `escapeForExtendScript()` before embedding it in ExtendScript.
- Reserve `sendRawCommand()` for the explicit scripting escape hatch. New normal tools should not bypass script validation.
- Prefer the B helper layer for component/property/effect/transition lookup: `matchName` first, localized display name second.
- Mark QE DOM tools in descriptions, call `app.enableQE()` inside the script, and re-query project/sequence state after QE/index-based edits.
- Return honest unsupported-state errors instead of silently succeeding. If an API requires a live Premiere/AME check, mark it as needing live validation.
- Keep no-Premiere helpers direct and deterministic; all Premiere-mutating tools should go through the bridge.
- Do not start Premiere, run CEP install scripts, or modify global MCP/Adobe config from automated validation.

## Conflict boundaries

- No helper edits `src/server.ts` unless adding a brand-new module; pause for orchestrator review first.
- B owns `src/bridge/script-builder.ts`; C/D/E/F should consume helper names only after B lands.
- D owns Lumetri/color behavior inside shared files; F owns generic effects/transitions/export/captions/media behavior.
- E owns dedicated audio behavior; F may touch audio transitions/export only with E coordination.
- `advanced.ts`, `effects.ts`, `track-targeting.ts`, and `utility.ts` are mixed-ownership files. Avoid simultaneous edits and merge them with extra review.
- G owns broad tests/docs/scripts. Any test touching another agent's module should coordinate with that owner and must not weaken coverage.
- Do not delete, skip, weaken, or narrow tests. When tool counts change, increase the expected total and module minimums deliberately.
- Unsupported Premiere APIs should return clear errors and be tagged in docs or tests as `needs live validation`.

## Validation commands

| Scope | Command | Notes |
|---|---|---|
| A docs/matrix-only pass | `npm run build` | Confirms TypeScript still compiles after doc-only changes. |
| Source tool/helper changes | `npm run build && npm test` | Unit tests mock bridge I/O and do not require Premiere. |
| Catalog/schema check | `npm run validate:tools` | Uses built `dist/`; run after `npm run build`. |
| Runtime-safe dry run | `npm run diagnostics:sweep -- --dry-run` | Verifies sweep wiring without contacting Premiere. |
| Live read-only check | `npm run diagnostics:sweep` | Only with Premiere/CEP already running and temp dir aligned. |
| Project read-only check | `npm run diagnostics:sweep -- --include-project` | Use a disposable/scratch project. |

## Merge risks

- Shared helper order: B should land before D/E/F migrate property/effect lookup, or those branches will duplicate lookup code.
- Mixed files: `advanced.ts`, `effects.ts`, `track-targeting.ts`, and `utility.ts` can conflict across C/D/E/F/G.
- QE DOM behavior is version-sensitive and stateful; mocked tests do not prove live Premiere behavior.
- `project.ts`, `project-manager.ts`, export, scratch-disk, proxy, and cleanup tools can affect files or project state; live validation should use disposable projects only.
