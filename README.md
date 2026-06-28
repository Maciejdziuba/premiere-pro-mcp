> **Note:** This is a temporary fork for a bug fix PR. See the original at [leancoderkavy/premiere-pro-mcp](https://github.com/leancoderkavy/premiere-pro-mcp).

<div align="center">

# Premiere Pro MCP Server

**Give AI full control over Adobe Premiere Pro.**

301 tools across 28 modules — the most comprehensive MCP server for video editing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-1.27-purple.svg)](https://modelcontextprotocol.io)
[![npm](https://img.shields.io/npm/v/premiere-pro-mcp.svg)](https://www.npmjs.com/package/premiere-pro-mcp)
[![Fly.io](https://img.shields.io/badge/Fly.io-deployed-7C3AED.svg)](https://premiere-pro-mcp.fly.dev)
[![Premiere Pro](https://img.shields.io/badge/Premiere%20Pro-2020--2025%2B-9999FF.svg)](https://www.adobe.com/products/premiere.html)

</div>

---

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets AI assistants like **Claude**, **Windsurf**, **Cursor**, or any MCP-compatible client directly control Adobe Premiere Pro — importing media, editing timelines, applying effects, managing keyframes, exporting, and more.

```
"Add the B-roll clips to V2, apply a cross dissolve between each, color correct them to match the A-roll, and export a 1080p ProRes."
```

The AI handles the workflow through 301 tools that cover nearly every ExtendScript and QE DOM API available in Premiere Pro, plus UXP sidecar routing for Text panel transcript operations.

---

## Quick Start

### 1. Install

**Option A — npm (recommended):**

```bash
npm install -g premiere-pro-mcp
```

**Option B — Clone from source:**

```bash
git clone https://github.com/ppmcp/premiere-pro-mcp.git
cd premiere-pro-mcp
npm install
npm run build
```

### 2. Install the CEP plugin

**If installed via npm:**

```bash
premiere-pro-mcp --install-cep
```

**If cloned from source:**

```bash
npm run install-cep
```

This symlinks the plugin into Premiere Pro's extensions folder and enables debug mode.

### 2b. Load the optional UXP panel

The CEP panel remains the MCP command bridge. A separate `uxp-panel/` can be
loaded when you need Premiere Pro 25+ Text panel transcript APIs that CEP cannot
call.

```bash
npm run install-uxp
```

Use `premiere-pro-mcp --install-uxp` when installed globally. This helper does
not load the panel by itself. Adobe UXP Developer Tool must load UXP plugins
manually: enable Developer Mode, click **Add Plugin**, select
`uxp-panel/manifest.json`, then click **Load** or **Load & Watch**.

<details>
<summary>Manual installation (macOS)</summary>

```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
ln -s "$(pwd)/cep-plugin" ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP

# Enable unsigned extensions (CSXS 9–14)
for v in 9 10 11 12 13 14; do
  defaults write com.adobe.CSXS.$v PlayerDebugMode 1
done
```

</details>

<details>
<summary>Manual installation (Windows)</summary>

1. Copy the `cep-plugin` folder to `%APPDATA%\Adobe\CEP\extensions\MCPBridgeCEP`
2. Open Registry Editor and set these DWORD values to `1`:
   - `HKEY_CURRENT_USER\Software\Adobe\CSXS.12\PlayerDebugMode`
   - (repeat for CSXS.9 through CSXS.14)

</details>

### 3. Configure your MCP client

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "premiere-pro": {
      "command": "node",
      "args": ["/absolute/path/to/premiere-pro-mcp/dist/index.js"],
      "env": {
        "PREMIERE_TEMP_DIR": "/tmp/premiere-mcp-bridge"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf / Cascade</strong></summary>

Add to your MCP server configuration:

```json
{
  "premiere-pro": {
    "command": "node",
    "args": ["/absolute/path/to/premiere-pro-mcp/dist/index.js"],
    "env": {
      "PREMIERE_TEMP_DIR": "/tmp/premiere-mcp-bridge"
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json` in your project or global config:

```json
{
  "mcpServers": {
    "premiere-pro": {
      "command": "node",
      "args": ["/absolute/path/to/premiere-pro-mcp/dist/index.js"],
      "env": {
        "PREMIERE_TEMP_DIR": "/tmp/premiere-mcp-bridge"
      }
    }
  }
}
```

</details>

### 4. Start the bridge in Premiere Pro

1. Open (or restart) Premiere Pro
2. Go to **Window > Extensions > MCP Bridge**
3. Set the **Temp Directory** to match your MCP client config (e.g., `/tmp/premiere-mcp-bridge`)
4. Click **Start Bridge** — you should see a green "Running" status
5. Ask your AI assistant: *"What's my current Premiere Pro project?"*

---

## Safe validation harness

This fork includes a conservative diagnostics harness for checking tool/runtime
claims without risking a real project.

```bash
npm run diagnostics:sweep
npm run diagnostics:sweep -- --dry-run
npm run diagnostics:sweep -- --dry-run --json
```

Dry-run is the default. It does not import `dist/`, contact the CEP bridge,
open Premiere, save, export, delete, enqueue AME jobs, or modify media. It
prints the planned checks plus static contract labels for known high-risk
areas: captions/transcript claims, in/out time units, Auto Reframe signature,
text overlay styling, frame-capture/export capability, and local UXP transcript
status.

UXP transcript status is read from a local JSON status file only. By default the
sweep checks `${PREMIERE_TEMP_DIR:-<os-temp>/premiere-mcp-bridge}/uxp-transcript-status.json`
and reports `ONLINE`, `OFFLINE`, `STALE`, or `INVALID` without calling Premiere
or Adobe UXP Developer Tool. This status-file hook is optional and offline-only;
the bundled minimal UXP panel does not write the file automatically. Use MCP
`get_uxp_bridge_status` for the live localhost sidecar state and `uxp_ping` for
a panel round trip.

```bash
npm run diagnostics:sweep -- --dry-run --uxp-status-file /path/to/uxp-transcript-status.json
```

To run read-only live bridge/runtime checks against an already open Premiere
project:

```bash
npm run build
npm run diagnostics:sweep -- --run-readonly
npm run diagnostics:sweep -- --run-readonly --include-project
```

Read-only live mode checks bridge health, Premiere version/locale/runtime, and
optional project/timeline inspection. It does not edit timelines or media.

Live probes are intentionally harder to run because they mutate the currently
open project. Use a disposable scratch project only:

```bash
npm run build
npm run diagnostics:sweep -- --live-probes --confirm-live-probes
```

Live probes create only `MCP_TEST_VALIDATE_*` scratch assets/sequences and
attempt caption creation, in/out seconds, Auto Reframe, text overlay, and frame
capture capability probes. They never save the project, export files, delete
items, or start Adobe Media Encoder. The script refuses `--live-probes` unless
`--confirm-live-probes` is present.

---

## Architecture

**Local (stdio):**
```
┌───────────────┐   stdio (MCP)   ┌──────────────┐   File-based IPC   ┌──────────────┐
│  AI Client    │ ◄──────────────► │  MCP Server  │ ◄────────────────► │  CEP Plugin  │
│  (Claude,     │                  │  (Node.js /  │   .jsx commands    │  (runs inside │
│   Windsurf,   │                  │   TypeScript) │   .json responses  │   Premiere)   │
│   Cursor)     │                  └──────────────┘                    └──────┬────────┘
└───────────────┘                                                             │ evalScript()
                                                                              ▼
                                                                       ┌──────────────┐
                                                                       │  Premiere Pro │
                                                                       │  ExtendScript │
                                                                       │  + QE DOM     │
                                                                       └──────────────┘
```

**Remote (HTTP/SSE — Fly.io):**
```
┌───────────────┐  HTTP+SSE (MCP)  ┌─────────────────────┐   File-based IPC   ┌──────────────┐
│  AI Client    │ ◄───────────────► │  MCP Server         │ ◄────────────────► │  CEP Plugin  │
│  (any MCP     │                   │  premiere-pro-mcp   │   .jsx / .json     │  (Premiere)  │
│   client)     │                   │  .fly.dev           │   shared volume    └──────────────┘
└───────────────┘                   └─────────────────────┘
```

1. AI client invokes an MCP tool (e.g., `add_to_timeline`)
2. MCP server generates ES3-compatible ExtendScript with helper functions prepended
3. Script is written to a `.jsx` command file in a shared temp directory
4. CEP plugin polls for command files, executes via `CSInterface.evalScript()`
5. Result JSON is written to a response file and returned to the AI

The file-based IPC bridge is simple, reliable, and works across macOS and Windows without network sockets.

---

## Tools (301)

### Discovery & Inspection (10 + 10)

| Tool | Description |
|------|-------------|
| `get_project_info` | Current project name, path, sequences, items |
| `get_active_sequence` | Detailed active sequence with all clips |
| `list_project_items` | All items in the project panel |
| `get_full_project_overview` | Comprehensive snapshot: bin tree, sequences, media types |
| `get_full_sequence_info` | Exhaustive sequence data: tracks, clips, effects, markers |
| `get_full_clip_info` | Everything about a clip: effects, keyframes, metadata |
| `get_timeline_summary` | Human-readable overview: duration, coverage %, effects |
| `search_project_items` | Filter by name, extension, offline status, color label |
| `get_premiere_state` | Full snapshot: project, sequence, playhead, selection |
| `inspect_dom_object` | Explore any Premiere Pro DOM object interactively |

### Project Management (26)

| Tool | Description |
|------|-------------|
| `save_project` / `save_project_as` / `open_project` | File operations |
| `create_project` / `close_project` | Project lifecycle |
| `import_media` / `import_folder` / `import_ae_comps` | Import media and AE comps |
| `create_bin` / `delete_bin` / `rename_bin` / `create_smart_bin` | Bin management |
| `import_sequences` / `import_fcp_xml` | Import from other projects |
| `create_bars_and_tone` | Generate bars & tone media |
| `set_scratch_disk_path` | Configure scratch disks |
| `consolidate_and_transfer` | Project Manager consolidation |

### Timeline & Editing (10 + 27 advanced)

| Tool | Description |
|------|-------------|
| `add_to_timeline` / `overwrite_clip` | Insert and overwrite edits |
| `ripple_delete` | Remove clip and close gap (QE) |
| `roll_edit` / `slide_edit` / `slip_edit` | Professional trim modes (QE) |
| `move_clip_to_track` | Move between tracks (QE) |
| `set_clip_speed_qe` / `reverse_clip` | Speed/reverse (QE) |
| `split_clip` / `trim_clip` / `move_clip` | Basic edits |
| `set_clip_properties` | Opacity, scale, rotation, position |
| `link_selection` / `unlink_selection` | Link/unlink A/V |

### Effects & Color (9)

| Tool | Description |
|------|-------------|
| `apply_effect` / `apply_audio_effect` | Apply by name (QE) |
| `remove_effect` / `remove_all_effects` | Remove effects |
| `color_correct` | Lumetri: exposure, contrast, temperature, tint, saturation, vibrance/sharpen/vignette where exposed |
| `apply_lut` | Apply input or Creative LUT files |
| `batch_color_correct` | Apply Lumetri corrections to selected clips, a video track, explicit node IDs, or all video clips |
| `stabilize_clip` | Warp Stabilizer with configurable settings |

### Keyframes (8)

| Tool | Description |
|------|-------------|
| `add_keyframe` / `get_keyframes` | Create and read keyframes |
| `remove_keyframe` / `remove_keyframe_range` | Delete keyframes |
| `set_keyframe_interpolation` | Linear / Hold / Bezier |
| `get_value_at_time` | Query interpolated value at any time |
| `set_color_value` | Set color properties on effects |

### Audio (10 dedicated)

| Tool | Description |
|------|-------------|
| `adjust_audio_levels` / `offset_audio_gain` | Set or offset clip Volume/Level in dB |
| `add_audio_keyframes` / `add_audio_fade` | Automate clip levels and fades |
| `set_audio_pan` | Set exposed clip pan/balance properties |
| `apply_common_audio_effect` | Apply common QE audio effects by alias |
| `add_audio_transition` | Add QE audio transitions at cut points |
| `diagnose_audio_clipping_and_normalization` | Read timeline level risk and report unsupported raw peak limits |
| `duck_audio_under_voiceover` | Add ducking keyframes under voiceover regions |
| `mute_track` | Mute or unmute audio tracks |

### Export & Encoding (14)

### Export & Encoding (16)

| Tool | Description |
|------|-------------|
| `export_sequence` | Export via Adobe Media Encoder |
| `get_export_capabilities` / `diagnose_export_preset` | AME/export diagnostics |
| `capture_frame` | Return a PNG frame as base64 when Premiere exposes a frame-export API; otherwise report unsupported capability |
| `export_as_fcp_xml` / `export_aaf` / `export_omf` | Interchange formats |
| `batch_export_sequences` / `batch_export_interchange` | Batch AME queueing and interchange exports |
| `encode_project_item` / `encode_file` | Direct encoding |
| `start_batch_encode` | Start render queue |

### Source Monitor & Playback (7 + 4)

| Tool | Description |
|------|-------------|
| `open_in_source` / `close_source_monitor` | Source monitor control |
| `insert_from_source` / `overwrite_from_source` | 3-point editing |
| `play_timeline` / `stop_playback` | Playback control (QE) |
| `play_source_monitor` | Play in source monitor |

### Selection & Clipboard (7 + 8)

| Tool | Description |
|------|-------------|
| `select_clips_by_name` / `select_clips_in_range` | Smart selection |
| `copy_effects_between_clips` | Copy effects via QE |
| `copy_lumetri_grade` / `paste_lumetri_grade` | Copy and paste serializable Lumetri grades |
| `batch_apply_effect` | Apply effect to multiple clips |
| `set_blend_mode` | 27 blend modes |

### Media Properties (16)

| Tool | Description |
|------|-------------|
| `set_offline` / `has_proxy` / `detach_proxy` | Offline/proxy management |
| `set_override_frame_rate` | Override FPS |
| `set_scale_to_frame_size` | Auto-scale to sequence frame |
| `get_xmp_metadata` / `set_xmp_metadata` | Raw XMP access |
| `get_color_space` | Color space info |

### Sequence Management (11)

| Tool | Description |
|------|-------------|
| `create_sequence` / `create_sequence_from_preset` | Create sequences |
| `duplicate_sequence` / `delete_sequence` | Manage sequences |
| `auto_reframe_sequence` | Auto-reframe for social media by deriving Premiere's aspect-ratio signature from target dimensions |
| `attach_custom_property` | FCP XML custom properties |
| `unnest_sequence` | Replace nested sequence with its clips |

### Text, MOGRTs & Caption-Like Overlays (4)

| Tool | Description |
|------|-------------|
| `add_text_overlay` | Create a single caption-like transparent PNG text overlay and place it on a video track |
| `add_caption_text_overlays` | Batch-create timed single-line bottom text overlays from caption-style entries |
| `import_mogrt` / `import_mogrt_from_library` | Import Motion Graphics Templates |

Use real caption tools when you need editable Premiere caption/subtitle tracks from sidecar files. Use `add_text_overlay` or `add_caption_text_overlays` when you need visible styled bottom yellow text and can accept graphics overlays instead of real caption-track items. Target an empty upper video track for these overlays; the tools refuse occupied target ranges by default.

### Workspace & Captions (2 + 14)

| Tool | Description |
|------|-------------|
| `get_workspaces` / `set_workspace` | Switch workspace layouts |
| `parse_srt_file` / `write_srt_file` | Local SRT helper utilities |
| `parse_transcript_json_file` / `write_transcript_json_file` | Validate local Adobe Text panel transcript JSON |
| `convert_srt_to_transcript_json_file` | Convert SRT captions to Adobe transcript JSON |
| `export_transcript_json_to_srt_file` | Convert Adobe transcript JSON to SRT |
| `import_caption_file` | Import caption sidecar files |
| `get_caption_api_capabilities` | Report caption API availability |
| `create_caption_track` | Create caption/subtitle tracks |
| `has_text_panel_transcript` | Check clip Text panel transcript state through the UXP sidecar bridge |
| `import_text_panel_transcript` / `export_text_panel_transcript` | Import/export clip Text panel transcript JSON through the UXP sidecar bridge |
| `create_captions_from_text_panel_transcript` | Return explicit UXP/UI-required unsupported errors under the CEP bridge |
| `auto_transcribe_sequence` | Return explicit unsupported error; Speech-to-Text auto-transcribe is not public ExtendScript |

#### Captions and Text panel transcripts

Premiere has two separate surfaces here:

- **CEP/ExtendScript sidecar captions:** this MCP bridge can import local caption sidecar files such as `.srt`, `.vtt`, `.scc`, `.mcc`, and `.stl` into the project, then call `Sequence.createCaptionTrack(projectItem, startTime, captionFormat)` when the active Premiere runtime exposes it. This path creates a sequence caption track from an imported caption ProjectItem, but it does not provide reliable Text panel transcript readback, caption style readback, or Speech-to-Text.
- **UXP Text panel transcripts:** Premiere Pro 25+ exposes transcript operations in UXP through `Transcript.exportToJSON`, `Transcript.importFromJSON`, `Transcript.createImportTextSegmentsAction`, `Transcript.querySupportedLanguages`, and sometimes `Transcript.hasTranscript`; 26.2 types also declare callback-based `TextSegments.importFromJSON`. MCP exposes `uxp_ping`, `get_uxp_bridge_status`, `get_uxp_bridge_capabilities`, `has_text_panel_transcript`, `import_text_panel_transcript`, and `export_text_panel_transcript` through one MCP connector and a local sidecar command bridge. Start it with `PREMIERE_UXP_BRIDGE_ENABLED=true`; the UXP panel polls `GET /uxp/poll` and posts results to `POST /uxp/result`. The panel's manual bridge check uses `GET /uxp/status` so it cannot consume queued commands. `export_text_panel_transcript` calls `Transcript.exportToJSON` directly and returns runtime capability diagnostics naming missing methods if export is not available; it does not require `Transcript.hasTranscript`.
- **Local transcript files:** the transcript JSON helpers use Adobe's public transcript schema shape (`language`, `speakers`, `segments`, timed `words`) so an external UXP panel or manual Text panel workflow can use those files.

### Scripting (6)

| Tool | Description |
|------|-------------|
| `execute_extendscript` | Run arbitrary ExtendScript (ES3) |
| `evaluate_expression` | Quick one-line eval |
| `send_raw_script` | Bypass security validation (advanced) |

### ...and 100+ more

Track targeting, batch operations, markers, audio levels, motion/transform, metadata, sequence settings, navigation, project analysis, and more. Run `get_project_info` to get started — the AI will discover what it needs.

---

## MCP Resources

The server exposes two LLM context resources:

| Resource URI | Description |
|-------------|-------------|
| `config://premiere-instructions` | Best practices: workflow order, timeline rules, effect tips, error handling |
| `config://extendscript-reference` | Complete ExtendScript API reference for writing custom scripts |

These are automatically available to MCP clients that support resources, giving the AI deep context about how to drive Premiere Pro effectively.

---

## Remote Deployment (Fly.io)

The server includes an HTTP/SSE transport (`src/http-server.ts`) for remote access via [mcp-remote](https://github.com/geelen/mcp-remote) or any MCP client that supports Streamable HTTP.

A live instance is running at **https://premiere-pro-mcp.fly.dev**.

### Connect via mcp-remote

```json
{
  "mcpServers": {
    "premiere-pro": {
      "command": "npx",
      "args": ["mcp-remote", "https://premiere-pro-mcp.fly.dev/mcp"]
    }
  }
}
```

### Self-host on Fly.io

```bash
# Clone and deploy your own instance
git clone https://github.com/ppmcp/premiere-pro-mcp.git
cd premiere-pro-mcp
fly apps create your-app-name
fly deploy --remote-only

# Optional: add bearer token auth
fly secrets set MCP_AUTH_TOKEN=your-secret-token
```

Then connect with:
```json
{
  "mcpServers": {
    "premiere-pro": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-app-name.fly.dev/mcp",
               "--header", "Authorization: Bearer your-secret-token"]
    }
  }
}
```

> **Note:** The file bridge still requires the CEP plugin to share the same `PREMIERE_TEMP_DIR`. For cloud deployments this means running a sync agent or using `fly proxy` / WireGuard to reach your local machine.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|--------|
| `PREMIERE_TEMP_DIR` | Shared temp directory for MCP ↔ CEP communication | OS temp dir + `/premiere-mcp-bridge` |
| `PREMIERE_TIMEOUT_MS` | Command timeout in milliseconds | `30000` |
| `PORT` | HTTP port (HTTP/SSE transport only) | `3000` |
| `MCP_AUTH_TOKEN` | Bearer token for HTTP transport auth (optional) | unset |

---

## Project Structure

```
premiere-pro-mcp/
├── src/
│   ├── index.ts                 # Entry point — stdio transport setup
│   ├── http-server.ts           # Entry point — HTTP/SSE transport (Fly.io / remote)
│   ├── server.ts                # MCP server — registers all 301 tools + 2 resources
│   ├── bridge/
│   │   ├── file-bridge.ts       # File-based IPC (write .jsx, poll .json)
│   │   ├── uxp-bridge.ts        # Optional localhost UXP sidecar poll/result bridge
│   │   └── script-builder.ts    # ExtendScript generator with ES3 helpers
│   ├── tools/                   # 28 tool modules
│   │   ├── discovery.ts         # Project discovery and queries
│   │   ├── project.ts           # Project management and import
│   │   ├── media.ts             # Media and proxy management
│   │   ├── sequence.ts          # Sequence creation and settings
│   │   ├── timeline.ts          # Timeline clip operations
│   │   ├── effects.ts           # Effect application and color correction
│   │   ├── transitions.ts       # Transition management (QE DOM)
│   │   ├── audio.ts             # Audio levels, gain, fades, effects, transitions, diagnostics
│   │   ├── text.ts              # Text overlays, caption-like PNG overlays, and MOGRTs
│   │   ├── markers.ts           # Sequence and clip markers
│   │   ├── tracks.ts            # Track add/delete/lock/visibility
│   │   ├── playhead.ts          # Playhead, work area, in/out points
│   │   ├── metadata.ts          # Metadata, XMP, color labels
│   │   ├── export.ts            # Export, frame capture, encoding
│   │   ├── advanced.ts          # QE DOM: ripple, roll, slide, slip, speed
│   │   ├── keyframes.ts         # Keyframe CRUD and interpolation
│   │   ├── scripting.ts         # Execute arbitrary ExtendScript
│   │   ├── inspection.ts        # Deep project/sequence/clip inspection
│   │   ├── selection.ts         # Clip selection utilities
│   │   ├── clipboard.ts         # Copy effects, batch operations
│   │   ├── source-monitor.ts    # Source monitor control
│   │   ├── track-targeting.ts   # Track targeting, motion, audio props
│   │   ├── utility.ts           # Batch ops, analysis, navigation
│   │   ├── health.ts            # CEP and UXP bridge diagnostics
│   │   ├── workspace.ts         # Workspace layout switching
│   │   ├── captions.ts          # Caption sidecars, transcript JSON helpers, and capability diagnostics
│   │   ├── playback.ts          # Timeline/source playback control
│   │   └── project-manager.ts   # Project consolidation/transfer
│   └── resources/
│       └── extendscript-reference.ts  # API reference for LLM context
├── cep-plugin/                  # CEP panel that runs inside Premiere Pro
│   ├── CSXS/manifest.xml        # Extension manifest (PPRO 14.0+)
│   ├── index.html               # Panel UI
│   ├── main.js                  # Bridge polling and script execution
│   ├── host.jsx                 # ExtendScript entry point
│   └── CSInterface.js           # Adobe CEP interface library
├── uxp-panel/                   # Optional Premiere UXP transcript sidecar panel
├── scripts/
│   ├── install-cep.sh           # CEP plugin installer (symlink + debug mode)
│   ├── install-uxp.sh           # UDT loading helper for uxp-panel/manifest.json
│   └── safe-runtime-sweep.mjs   # Safe CEP/UXP status diagnostics
├── Dockerfile                   # Multi-stage Docker build for Fly.io
├── fly.toml                     # Fly.io deployment config
├── RESEARCH.md                  # API research and implementation status
├── CONTRIBUTING.md              # Contribution guidelines
├── CHANGELOG.md                 # Version history
└── LICENSE                      # MIT License
```

---

## Technical Details

### Why CEP instead of UXP?

CEP (Common Extensibility Platform) provides full ExtendScript access in Premiere Pro, including the undocumented **QE DOM** — which is the only way to apply effects by name, perform ripple deletes, and do advanced trim operations. UXP in Premiere Pro now exposes some newer surfaces, including Text panel transcript import/export, that CEP cannot call. This fork uses one MCP server with two panels when transcript work is needed: CEP for ExtendScript/QE tools, and a manually loaded `uxp-panel/` for UXP-only transcript commands. CEP works across **Premiere Pro 2020–2025+**.

### ExtendScript Compatibility

All generated scripts use **ES3 syntax** (`var`, manual `for` loops, no arrow functions, no `let`/`const`) since ExtendScript is based on ECMAScript 3. The `buildToolScript()` function prepends a library of helper functions to every script.

### Security

- Scripts are validated before execution — blocks `eval()`, `new Function()`, `System.callSystem()`
- 500KB script size limit
- `send_raw_script` bypasses validation for advanced users (with explicit opt-in)
- Temp directory created with restricted permissions (mode 700)

### QE DOM

Many tools use the undocumented QE DOM (enabled via `app.enableQE()`). These tools are marked with "Uses QE DOM" in their descriptions. The QE DOM provides capabilities unavailable through the standard ExtendScript API:

- Apply effects and transitions by name
- Ripple delete, roll/slide/slip edits
- Set clip speed and reverse
- Frame blending and time interpolation
- Remove all effects from a clip

---

## Troubleshooting

<details>
<summary><strong>CEP plugin doesn't appear in Premiere Pro</strong></summary>

1. Verify debug mode: `defaults read com.adobe.CSXS.12 PlayerDebugMode` should return `1`
2. Check the plugin exists: `ls ~/Library/Application\ Support/Adobe/CEP/extensions/MCPBridgeCEP`
3. Completely restart Premiere Pro (not just close/reopen the project)
4. Check the CSXS version matches your Premiere Pro version

</details>

<details>
<summary><strong>Commands timeout or hang</strong></summary>

1. Verify the CEP panel shows "Running" with a green dot
2. Ensure temp directories match between MCP client config and CEP panel
3. Check if Premiere Pro is busy (rendering, modal dialog open)
4. Increase timeout: set `PREMIERE_TIMEOUT_MS` to `60000` or higher
5. Try `ping` tool to test basic connectivity

</details>

<details>
<summary><strong>AI client can't see tools</strong></summary>

1. Restart the AI client after editing config
2. Verify the path to `dist/index.js` is absolute and correct
3. Run `node dist/index.js` in a terminal to check for startup errors
4. Ensure `npm run build` completed without errors

</details>

<details>
<summary><strong>QE DOM tools fail</strong></summary>

1. QE tools require an active sequence — open one first
2. Some QE operations are index-based and can fail if clips have been reordered
3. Re-query the sequence structure after QE operations

</details>

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[MIT](LICENSE) — free for personal and commercial use.
