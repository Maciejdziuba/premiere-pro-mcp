# Locale Helper Layer

`src/bridge/script-builder.ts` prepends a shared ES3 ExtendScript helper layer to every generated script. Tool modules can use these helpers to avoid hard-coding English UI labels where Premiere exposes stable `matchName` values.

## Lookup Order

All resolver helpers use this order:

1. Scan every item for `matchName` against the supplied stable names.
2. If no matchName hit is found, scan localized UI labels via `displayName` and `name`.
3. Return `null` when neither pass finds an item.

Passing only one string or array is allowed; in that case the same values are used as the localized fallback. Prefer passing both match names and localized names when a stable match name is known.

## Helper Functions

- `__findByMatchNameThenName(collection, matchNames, localizedNames)` - generic resolver for Premiere-style collections with `.numItems`, arrays, `.getItemAt()`, or `.item()`.
- `__findComponent(clip, matchNames, localizedNames)` - resolves a clip component/effect from `clip.components`.
- `__findProperty(container, matchNames, localizedNames)` - resolves a direct child property from `container.properties`.
- `__findPropertyGroup(container, matchNames, localizedNames)` - alias for group-oriented property lookup.
- `__findNestedProperty(container, path)` - walks a property path. Path steps can be strings or objects with `matchName`, `matchNames`, `localizedName`, `localizedNames`, `displayName`, `displayNames`, `name`, or `names`.
- `__findPropertyDeep(container, matchNames, localizedNames, maxDepth)` - searches direct and nested property groups, depth-limited to 8 by default.
- `__findEffect(effectList, matchNames, localizedNames)` - resolves an item from a QE effect list.
- `__findVideoEffect(matchNames, localizedNames)` / `__findAudioEffect(matchNames, localizedNames)` - enable QE, scan QE effect lists, then fall back to `qe.project.get*EffectByName()` with localized names.
- `__findTransition(transitionList, matchNames, localizedNames)` - resolves an item from a QE transition list.
- `__findVideoTransition(matchNames, localizedNames)` / `__findAudioTransition(matchNames, localizedNames)` - enable QE, scan QE transition lists, then fall back to `qe.project.get*TransitionByName()` with localized names.
- `__findKnownComponent(clip, key)` and `__findKnownProperty(component, componentKey, propertyKey)` - convenience wrappers over the alias maps.

## Built-In Coverage

Known component helpers:

- `__findMotionComponent(clip)` uses `AE.ADBE Motion`, then `Motion`.
- `__findOpacityComponent(clip)` uses `AE.ADBE Opacity`, then `Opacity`.
- `__findVolumeComponent(clip)` uses `audioVolume`, then `Volume`.
- `__findLumetriComponent(clip)` tries `AE.ADBE Lumetri` and `ADBE Lumetri`, then `Lumetri Color`.
- `__findTimeRemappingComponent(clip)` tries `AE.ADBE Time Remapping` and `timeRemapping`, then `Time Remapping`.

Known property aliases cover common controls under those components:

- Motion: Position, Scale, Scale Width, Scale Height, Rotation, Anchor Point, Uniform Scale.
- Opacity: Opacity, Blend Mode.
- Volume: Level.
- Lumetri: Input LUT, Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temperature, Tint, Saturation.
- Time Remapping: Speed.

## Transition Strategy

Transitions are resolved through QE because Premiere's standard DOM does not expose a complete transition application API. The helper scans `qe.project.getVideoTransitionList()` or `qe.project.getAudioTransitionList()` first so any exposed `matchName` can win. If QE only exposes localized `name` values, the helper falls back to `qe.project.getVideoTransitionByName()` or `qe.project.getAudioTransitionByName()`.

## Limitations

- This change only adds shared helpers and static coverage. Existing tools have not been migrated to call them yet.
- Exact `matchName` availability varies by Premiere version and by standard DOM vs QE DOM. Lumetri and Time Remapping aliases include best-effort candidates and keep localized-name fallback for safety.
- QE effect and transition lists commonly expose `name`; if they do not expose `matchName`, QE lookup is only locale-resilient when callers provide localized names for the running Premiere locale.
- Nested lookup assumes nested groups are exposed through a `.properties` collection. If a Premiere object hides children through a different API, callers need a small adapter before using these helpers.
- No live Premiere validation was run for this helper layer.
