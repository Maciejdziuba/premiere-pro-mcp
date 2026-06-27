# Feature Matrix

This fork already has a large Premiere MCP surface. The next step is not just “more tools” — it is safer helpers, clearer ownership, and honest diagnostics so new tools are reliable.

## Current tool map

| Category | Module/file | Current coverage | Owner |
|---|---|---:|---|
| Discovery/project state | `src/tools/discovery.ts`, `inspection.ts`, `scripting.ts`, `health.ts` | 28 tools | G |
| Project/media/bins | `src/tools/project.ts`, `media.ts`, `metadata.ts`, `project-manager.ts` | 51 tools | G/F as needed |
| Sequence/timeline/editing | `src/tools/sequence.ts`, `timeline.ts`, `advanced.ts`, `selection.ts`, `playhead.ts`, `tracks.ts`, `track-targeting.ts`, `source-monitor.ts` | 108 tools | C |
| Effects/transitions | `src/tools/effects.ts`, `transitions.ts`, `clipboard.ts`, parts of `advanced.ts` | 19 tools | F/D split |
| Lumetri/color | `src/tools/effects.ts`, `clipboard.ts`, `keyframes.ts` | basic tools only | D |
| Audio | `src/tools/audio.ts`, audio parts of `effects.ts`, `transitions.ts`, `export.ts` | 3 dedicated tools | E |
| Text/captions | `src/tools/text.ts`, `captions.ts` | 4 tools | F |
| Export/render/interchange | `src/tools/export.ts`, `sequence.ts` | 12 tools | F |
| Bridge/runtime helpers | `src/bridge/file-bridge.ts`, `script-builder.ts`, `cep-plugin/` | command bridge + helper prelude | B/G |
| Docs/tests/scripts | `tests/`, `scripts/`, `FORK_DEV_NOTES.md`, `README.md` | Vitest + install scripts | A/G |

## Missing target categories

| Target | Desired result | Primary owner | Notes |
|---|---|---|---|
| Locale-resilient property lookup | Match by `matchName` first, localized display name second; nested groups supported | B | Must land before D/E/F depend on it. Avoid touching tool modules unless needed for examples/tests. |
| Timeline/sequence breadth | Safer add/move/trim/split/duplicate/enable/link/ripple/gap/work-area/in-out/track ops | C | Owns timeline/sequence/advanced/selection/playhead/tracks/track-targeting/source-monitor. |
| Lumetri/color breadth | Fuller Lumetri controls, LUTs, grade copy/paste, batch application | D | Owns color/effect additions. Do not edit generic transition/audio modules. |
| Audio breadth | Clip gain/volume/fades/pan/keyframes, audio effects, normalization/diagnostics where feasible | E | Owns `src/tools/audio.ts` and audio-specific tests/docs sections. |
| Effects/transitions/captions/export | Lookup, batch effects/transitions, SRT/caption, AME/export/interchange improvements | F | Owns `effects.ts`, `transitions.ts`, `captions.ts`, `export.ts`, with D owning Lumetri-specific logic. |
| Diagnostics/testing/docs | Bridge health, locale/version readouts, safe runtime sweep, schema validation, notes | G | Owns diagnostics additions, scripts, docs. Coordinate before touching shared tests. |
| Architecture map | Keep this matrix current and document extension rules | A | Owns `FEATURE_MATRIX.md`; may touch docs only. |

## Helper workstreams

| Agent | Branch/worktree | Files owned first | Validation | Stop condition |
|---|---|---|---|---|
| A — Feature matrix + architecture | `agent-a-matrix-architecture` | `FEATURE_MATRIX.md`, docs sections only | `npm run build` | Matrix complete, extension patterns documented, build passes. |
| B — Locale-resilient helper layer | `agent-b-locale-helpers` | `src/bridge/script-builder.ts`, `tests/bridge/*`, optional helper docs | `npm run build && npm test` | Shared helpers implemented/tested/docs updated. |
| C — Timeline/sequence/track tools | `agent-c-timeline-tools` | `src/tools/timeline.ts`, `sequence.ts`, `advanced.ts`, `selection.ts`, `playhead.ts`, `tracks.ts`, `track-targeting.ts`, `source-monitor.ts` | `npm run build && npm test` | Feasible editing tools added/improved or documented as blocked. |
| D — Lumetri/color tools | `agent-d-lumetri-color` | `src/tools/effects.ts`, `tests/tools/*` for color assertions | `npm run build && npm test` | Color controls implemented or limitations documented. |
| E — Audio tools | `agent-e-audio-tools` | `src/tools/audio.ts`, audio-specific docs/tests | `npm run build && npm test` | Feasible audio tools added; unsupported APIs return honest errors. |
| F — Effects/transitions/captions/export | `agent-f-effects-export` | `src/tools/transitions.ts`, `captions.ts`, `export.ts`; generic non-Lumetri effects only | `npm run build && npm test` | Feature group improved or blockers documented. |
| G — Diagnostics/testing/docs | `agent-g-diagnostics-docs` | `src/tools/health.ts`, `src/tools/inspection.ts`, `scripts/`, `tests/`, `FORK_DEV_NOTES.md` | `npm run build && npm test` plus any new validation script | Diagnostics/docs/validation pass; live-test needs listed. |

## Conflict boundaries

- No helper edits `src/server.ts` unless adding a brand-new module; if needed, pause and ask orchestrator first.
- B owns `src/bridge/script-builder.ts`; other agents can use helper names only after B lands.
- D owns Lumetri/color behavior inside `effects.ts`; F owns transitions/export/captions and generic effect lookup.
- E owns `audio.ts`; F may touch audio transitions/export only, not audio effects implementation.
- G owns broad docs/tests/scripts; G must coordinate with any agent before changing tests covering that agent's modules.
- Agents must not edit the same file simultaneously. Use separate worktrees/branches and merge only after orchestrator review.
- Do not weaken tests or remove existing tools. Unsupported Premiere APIs should return clear errors and be marked `needs live validation`.

## Merge plan

1. Land B first if it changes shared ExtendScript helpers.
2. Land A/G docs updates around the current architecture.
3. Land C, D, E, and F as independent feature groups with `npm run build && npm test` after each merge.
4. Run final `npm run build && npm test`, then safe read-only Premiere checks only if the bridge is still connected.
