# Feature Matrix

This fork already has a broad Premiere MCP surface. The next work should make that surface safer to extend: clear module ownership, locale-resilient helpers, honest diagnostics, and validation that does not require opening Premiere unless a live check is explicitly planned.

Current source of truth:

- `src/server.ts` registers tools by spreading 28 `get*Tools()` modules.
- `tests/tools/tool-modules.test.ts` asserts the same 28 modules and a total of 267 tools.
- `README.md` and `package.json` still advertise 269 tools; treat that as documentation drift to reconcile in a separate metadata/docs pass.

## Current Module Inventory

| Module | Tools | Existing category | Primary owner | Notes |
|---|---:|---|---|---|
| `src/tools/advanced.ts` | 27 | QE timeline edits, speed, sequence utilities, selected effect/color helpers | C, with D/F coordination | Mixed file; coordinate before touching `set_color_value`, `remove_all_effects`, or export/project helpers. |
| `src/tools/audio.ts` | 3 | Dedicated audio levels/keyframes/mute | E | Small surface; audio property lookup needs shared helper support. |
| `src/tools/captions.ts` | 1 | Caption track creation | F | Caption import/edit/export remains thin. |
| `src/tools/clipboard.ts` | 6 | Effect copy, batch effects, clip media replace, blend mode | F, with D for color-grade behavior | Uses display-name matching; helper migration is a likely conflict. |
| `src/tools/discovery.ts` | 10 | Project, item, sequence, clip discovery | G | Read-oriented foundation for safe planning. |
| `src/tools/effects.ts` | 8 | Video/audio effects, Lumetri basics, LUT, stabilization | F, with D owning Lumetri/color | Highest D/F overlap; do not mix generic effects and Lumetri changes in one branch. |
| `src/tools/export.ts` | 12 | Export, frame capture, interchange, AME/proxy operations | F | Some operations need live AME/Premiere validation beyond unit tests. |
| `src/tools/health.ts` | 2 | Fork ping and bridge health | G | `fork_ping` is no-Premiere; `ping` touches the bridge. |
| `src/tools/inspection.ts` | 10 | Deep read-only project/sequence/clip reports | G | Best place for diagnostics and live-read sweep outputs. |
| `src/tools/keyframes.ts` | 8 | Effect property and keyframe CRUD | D, with B helper dependency | Partly uses `matchName`; property lookup still needs shared helper coverage. |
| `src/tools/markers.ts` | 4 | Sequence and clip markers | C/G | Editing behavior is C; reporting/diagnostics is G. |
| `src/tools/media.ts` | 16 | Import, bins, relink, proxy, interpretation | F | Project-panel destructive tools need clear errors and tests. |
| `src/tools/metadata.ts` | 9 | Metadata, labels, XMP, footage interpretation, color space | F/G | Data mutation is F; reporting/diagnostics is G. |
| `src/tools/playback.ts` | 4 | Timeline/source playback | C | Uses QE for timeline playback. |
| `src/tools/playhead.ts` | 6 | CTI, work area, sequence in/out | C | Shared by editing and export workflows. |
| `src/tools/project-manager.ts` | 1 | Consolidate/transfer | F | High-risk live operation; keep mocked tests plus explicit live notes. |
| `src/tools/project.ts` | 25 | Project lifecycle, bins, ingest, import, scratch disks | F/G | Several operations affect files/global-like project state; document live-test needs. |
| `src/tools/scripting.ts` | 6 | Custom ExtendScript, DOM inspection, state snapshots | G, with B safety constraints | Raw script paths must remain explicit opt-in. |
| `src/tools/selection.ts` | 7 | Clip selection utilities | C | Selection state is shared mutable Premiere state; re-query after edits. |
| `src/tools/sequence.ts` | 11 | Sequence creation/settings/nesting/interchange helpers | C/F | C owns timeline behavior; F owns export/interchange-facing helpers. |
| `src/tools/source-monitor.ts` | 7 | Source monitor and 3-point edits | C | Depends on target-track behavior. |
| `src/tools/text.ts` | 3 | Text overlays and MOGRT import | F | Graphics/MOGRT properties may need helper lookup. |
| `src/tools/timeline.ts` | 10 | Add/remove/move/trim/split/duplicate/enable/replace/speed | C | Core editing surface. |
| `src/tools/track-targeting.ts` | 31 | Track targeting, clip transforms/audio props, batch operations, version info | C, with D/E/G coordination | Largest mixed module; Motion/Opacity/Volume property lookup should wait for B helpers. |
| `src/tools/tracks.ts` | 4 | Track add/delete/lock/visibility | C | Track delete/visibility should keep explicit errors. |
| `src/tools/transitions.ts` | 5 | Video/audio transition add/list/batch | F/E | Audio transition behavior coordinates with E. |
| `src/tools/utility.ts` | 29 | Project cleanup, adjustment layers, freeze frame, sequence settings, markers, navigation, nesting | C/G/F split | Mixed catch-all; prefer moving new broad features to a better-owned module. |
| `src/tools/workspace.ts` | 2 | Workspace list/switch | G | Diagnostics/workflow support. |

Total: 267 tools across 28 modules.

## Missing Target Categories

| Target | Desired result | Primary owner | Current gap |
|---|---|---|---|
| Locale-resilient component/property lookup | Shared helpers that match by `matchName` first, localized display name second, including nested property groups | B | Current modules often hard-code English `displayName` values such as Motion, Opacity, Volume, Lumetri Color, and Blend Mode. |
| Timeline/sequence breadth | Safer move/trim/split/duplicate/link/ripple/gap/work-area/in-out/track flows with re-query guidance | C | Broad coverage exists, but QE/index-based operations need clearer failure modes and live-validation notes. |
| Lumetri/color breadth | Fuller Lumetri controls, LUT handling, grade copy/paste, batch color application | D | Current coverage is basic `color_correct`, `apply_lut`, `set_color_value`, and generic keyframe/property tools. |
| Audio breadth | Clip gain/volume/fades/pan/keyframes, audio effects, audio transitions, normalization/diagnostics where feasible | E | Dedicated `audio.ts` has 3 tools; additional audio behavior is scattered in `track-targeting.ts`, `effects.ts`, `transitions.ts`, and `export.ts`. |
| Effects/transitions/captions/export breadth | Match-name-aware effect lookup, safer batch effects/transitions, caption edit/export, AME/export diagnostics | F | Existing tools cover basics, but many paths need helper lookup and live validation. |
| Diagnostics/testing/docs | Bridge/version/locale readouts, safe read-only runtime sweep, schema validation, live-test notes | G | Structural tests are mocked; live coverage must be explicit and should not start Premiere automatically. |
| Architecture map | Keep counts, ownership, helper assignments, and conflict boundaries current | A | This file is the coordination point; update it when tools/modules are added. |

## Helper Workstreams

| Agent | Branch/worktree | Files owned first | Validation | Stop condition |
|---|---|---|---|---|
| A - Feature matrix + architecture | `agent-a-matrix-architecture` | `FEATURE_MATRIX.md`, docs sections only | `npm run build` | Matrix lists current counts, categories, ownership, helpers, validation, and merge risks. |
| B - Locale/helper layer | `agent-b-locale-helpers` | `src/bridge/script-builder.ts`, `tests/bridge/*`, optional helper docs | `npm run build && npm test` | Shared ES3 helpers are implemented, tested, and ready for tool modules to consume. |
| C - Timeline/sequence/track tools | `agent-c-timeline-tools` | `timeline.ts`, `sequence.ts`, `advanced.ts`, `selection.ts`, `playhead.ts`, `tracks.ts`, `track-targeting.ts`, `source-monitor.ts`, `playback.ts` | `npm run build && npm test` | Editing tools are improved or blocked with clear unsupported/live-validation notes. |
| D - Lumetri/color tools | `agent-d-lumetri-color` | Lumetri/color paths in `effects.ts`, `keyframes.ts`, `clipboard.ts`, `advanced.ts`, `track-targeting.ts` | `npm run build && npm test` | Color controls work through helper lookup or limitations are documented. |
| E - Audio tools | `agent-e-audio-tools` | `audio.ts`, audio paths in `track-targeting.ts`, `effects.ts`, `transitions.ts`, `export.ts` | `npm run build && npm test` | Feasible audio tools are added; unsupported APIs return clear errors. |
| F - Effects/media/export/captions | `agent-f-effects-export` | `effects.ts` non-Lumetri paths, `transitions.ts`, `captions.ts`, `export.ts`, `media.ts`, `project.ts`, `project-manager.ts`, `text.ts`, `metadata.ts` | `npm run build && npm test` | Feature group improves without taking over Lumetri/audio-specific behavior. |
| G - Diagnostics/testing/docs | `agent-g-diagnostics-docs` | `health.ts`, `inspection.ts`, `discovery.ts`, `scripting.ts`, `workspace.ts`, `tests/`, `scripts/`, docs | `npm run build && npm test` plus any new validation script | Diagnostics/docs/validation pass; live-test needs are listed without starting Premiere automatically. |

## Safe Extension Patterns

- Add tools to the closest existing module. Add a new module only when the behavior has a distinct ownership boundary, then update `src/server.ts`, `tests/tools/tool-modules.test.ts`, this matrix, and any public count docs together.
- Keep every generated ExtendScript snippet ES3-compatible: `var`, classic functions, manual loops, no `let`, `const`, arrow functions, optional chaining, or modern array helpers.
- Use `buildToolScript()` for Premiere commands and return `__result(...)` or `__error(...)` from the script. Use `sendCommand()` for validated bridge execution.
- Escape every user-controlled string with `escapeForExtendScript()` before embedding it in ExtendScript. Do not build scripts with raw interpolation unless the value is numeric/boolean and already validated.
- Reserve `sendRawCommand()` for the explicit scripting escape hatch. New normal tools should not bypass script validation.
- Prefer `matchName`-first component/property lookup once B lands the shared helpers. Until then, tools that depend on English display names should say so in errors or docs.
- Mark QE DOM tools in descriptions, call `app.enableQE()` inside the script, and re-query project/sequence state after QE/index-based edits.
- Return honest unsupported-state errors instead of silently succeeding. If an API requires a live Premiere/AME check, mark it as needing live validation.
- Keep no-Premiere helpers such as `fork_ping` direct and deterministic; all Premiere-mutating tools should go through the bridge.
- Do not start Premiere, run CEP install scripts, or modify global MCP/Adobe config from automated validation.

## Conflict Boundaries

- No helper edits `src/server.ts` unless adding a brand-new module; pause for orchestrator review first.
- B owns `src/bridge/script-builder.ts`; C/D/E/F should consume helper names only after B lands.
- D owns Lumetri/color behavior inside shared files; F owns generic effects/transitions/export/captions/media behavior.
- E owns dedicated audio behavior; F may touch audio transitions/export only with E coordination.
- `advanced.ts`, `effects.ts`, `track-targeting.ts`, and `utility.ts` are mixed-ownership files. Avoid simultaneous edits and merge them with extra review.
- G owns broad tests/docs/scripts. Any test touching another agent's module should coordinate with that owner and must not weaken coverage.
- Do not delete, skip, weaken, or narrow tests. When tool counts change, increase the expected total and module minimums deliberately.
- Unsupported Premiere APIs should return clear errors and be tagged in docs or tests as `needs live validation`.

## Validation Commands

| Scope | Command | Notes |
|---|---|---|
| A docs/matrix-only pass | `npm run build` | Required for this branch; confirms TypeScript still compiles after doc-only changes. |
| Source tool/helper changes | `npm run build && npm test` | Unit tests mock bridge I/O and do not require Premiere. |
| New module registration | `npm run build && npm test` | Also update `src/server.ts`, `tests/tools/tool-modules.test.ts`, this matrix, and count docs. |
| Live Premiere/AME behavior | Manual live checklist only after explicit approval | Do not start Premiere or install CEP from helper automation. |

## Merge Risks

- Count drift: code/tests currently say 267 tools, while README/package metadata say 269.
- Shared helper order: B should land before D/E/F migrate property/effect lookup, or those branches will duplicate lookup code.
- Mixed files: `advanced.ts`, `effects.ts`, `track-targeting.ts`, and `utility.ts` can conflict across C/D/E/F/G.
- QE DOM behavior is version-sensitive and stateful; mocked tests do not prove live Premiere behavior.
- `project.ts`, `project-manager.ts`, export, scratch-disk, proxy, and cleanup tools can affect files or project state; live validation should use disposable projects only.
