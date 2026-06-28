# Fork Development Notes

Notes for working on this fork: how to build it, how the pieces fit together, and how to add new tools. This MCP server lets an AI client drive Adobe Premiere Pro through a small bridge.

## Repo

- Fork URL: https://github.com/Maciejdziuba/premiere-pro-mcp
- Upstream URL: https://github.com/leancoderkavy/premiere-pro-mcp
- Local path: `/Users/maciejdziuba/Documents/Software /Premier Pro MCP Fork`
- Remotes:
  - `origin`: https://github.com/Maciejdziuba/premiere-pro-mcp.git
  - `upstream`: https://github.com/leancoderkavy/premiere-pro-mcp.git

## Install And Build

```bash
npm install
npm run build
npm test
```

`npm test` is a fast Vitest suite with bridge I/O mocked. It does not require Premiere Pro.

Additional diagnostics checks:

```bash
npm run validate:tools
npm run diagnostics:sweep -- --dry-run
```

`npm run validate:tools` imports the built `dist/tools/*.js` catalog, so run `npm run build` first. It validates the 301-tool catalog for duplicate names, snake_case names, handler shape, required-property references, and basic JSON-schema property metadata.

`npm run diagnostics:sweep -- --dry-run` verifies the runtime sweep command path without importing `dist/` or contacting Premiere. It also reports local UXP transcript status from `${PREMIERE_TEMP_DIR:-<os-temp>/premiere-mcp-bridge}/uxp-transcript-status.json`, or from `--uxp-status-file`.

## Hybrid CEP + UXP Setup

This branch keeps one MCP server and two Premiere panels:

- `cep-plugin/`: the existing MCP Bridge panel. It executes ExtendScript/QE through file IPC and owns the broad MCP tool surface.
- `uxp-panel/`: optional Premiere UXP panel. Load it manually with Adobe UXP Developer Tool when testing Premiere Pro 25+ Text panel transcript APIs.

Run the helpers separately:

```bash
npm run install-cep
npm run install-uxp
```

`install-uxp.sh` is only a UDT loading helper. It does not load the panel, edit Adobe settings, start Premiere, or mutate a project. In UXP Developer Tool, enable Developer Mode, choose **Add Plugin**, select `uxp-panel/manifest.json`, then use **Load** or **Load & Watch**.

Start the MCP server with `PREMIERE_UXP_BRIDGE_ENABLED=true` when you want the localhost UXP sidecar at `http://127.0.0.1:17777`.

## Local MCP Config Example

This tells an MCP client (such as Claude Code) how to launch the built server. A repo-local copy lives at [`.mcp.local.example.json`](.mcp.local.example.json).

Important: the temp dir must exactly match the directory shown in the MCP Bridge panel. On this Mac right now, Premiere's CEP panel is polling `/var/folders/5k/c8kmwpjx6q36r3bmh0tw2nyw0000gn/T/premiere-mcp-bridge`.

```json
{
  "mcpServers": {
    "premiere-pro-local": {
      "command": "node",
      "args": [
        "/Users/maciejdziuba/Documents/Software /Premier Pro MCP Fork/dist/index.js"
      ],
      "env": {
        "PREMIERE_TEMP_DIR": "/var/folders/5k/c8kmwpjx6q36r3bmh0tw2nyw0000gn/T/premiere-mcp-bridge"
      }
    }
  }
}
```

Equivalent Claude Code command:

```bash
claude mcp add premiere-pro-local --env PREMIERE_TEMP_DIR=/var/folders/5k/c8kmwpjx6q36r3bmh0tw2nyw0000gn/T/premiere-mcp-bridge -- node "/Users/maciejdziuba/Documents/Software /Premier Pro MCP Fork/dist/index.js"
```

Do not run the command unless you want to modify Claude Code's MCP config.

## Diagnostics And Live Validation

New read-only diagnostics tools:

- `fork_ping`: local fork metadata; no Premiere or CEP required.
- `bridge_diagnostics`: local file-bridge state, package version, Node runtime, effective temp directory, timeout, and pending `cmd_`/`res_` files; no Premiere or CEP required.
- `ping`: live CEP/Premiere connectivity with Premiere version/build, ExtendScript locale/OS, project, active sequence, and QE availability metadata.
- `get_premiere_runtime_diagnostics`: live read-only runtime detail for version/locale checks, BridgeTalk identifiers, project/sequence state, and capability probes. It does not enable QE.

Safe runtime sweep:

```bash
npm run build
PREMIERE_TEMP_DIR="/path/shown/in/MCP/Bridge/panel" npm run diagnostics:sweep
```

Use `--include-project` only when a small known project is open and project scans are acceptable:

```bash
PREMIERE_TEMP_DIR="/path/shown/in/MCP/Bridge/panel" npm run diagnostics:sweep -- --include-project
```

The sweep is read-only by default. It does not install CEP, change global Adobe settings, enable QE, save projects, edit timelines, enqueue exports, relink media, or write project/media files. If Premiere or the CEP panel is not running, the live steps should fail with bridge timeout errors; that is a connectivity result, not a destructive test.

Remaining live-test needs:

- Run the default sweep with Premiere open and the MCP Bridge CEP panel polling the same `PREMIERE_TEMP_DIR`.
- Run `--include-project` on a small sample project and confirm project overview, timeline summary, and offline-media reads are complete and read-only.
- Capture at least one non-English UI locale to confirm `$.locale`, `app.isoLanguage` where exposed, and localized names are reported clearly.
- Interrupt the bridge once to leave stale `cmd_`/`res_` files, confirm `bridge_diagnostics` reports them, then verify normal cleanup on the next server start.

## CEP Bridge Install Later

CEP is Adobe's panel framework; the panel is what relays commands into Premiere. The bridge panel lives in `cep-plugin/`. Later, when ready for Premiere testing, run:

```bash
npm run install-cep
```

That script symlinks `cep-plugin/` into the Adobe CEP extensions folder and enables unsigned CEP extensions/debug mode. It changes user-level Adobe settings, so keep it out of automated setup.

## UXP Panel Load Later

UXP is Adobe's newer panel runtime. It is required for Text panel transcript APIs that the CEP bridge cannot invoke. When `uxp-panel/manifest.json` exists, run:

```bash
npm run install-uxp
```

Then use Adobe UXP Developer Tool to add that manifest and click **Load** or **Load & Watch**. The helper prints the steps; Adobe UDT still performs the actual load.

## How Tools Are Wired

The flow is: MCP client → server → file bridge → CEP panel → ExtendScript in Premiere, and back.

- `src/index.ts` starts the stdio MCP server and passes `PREMIERE_TEMP_DIR`/`PREMIERE_TIMEOUT_MS` into the bridge.
- `src/server.ts` imports every `get*Tools()` module from `src/tools/`, merges their tool maps, converts JSON-schema-like parameters to Zod, and registers each tool with the MCP SDK.
- `src/bridge/file-bridge.ts` writes `cmd_<id>.jsx` files into the temp bridge directory, polls for `res_<id>.json`, validates script size/content, and cleans up command/response files.
- `src/bridge/script-builder.ts` prepends ES3 ExtendScript helpers and wraps generated code in an IIFE with try/catch.
- `cep-plugin/main.js` is the CEP-side poller. It reads `.jsx` command files, runs them through `CSInterface.evalScript()`, and writes JSON responses.
- `cep-plugin/host.jsx` is a small host-side ExtendScript file loaded by the panel.
- `src/bridge/uxp-bridge.ts` is the optional localhost UXP poll/result sidecar.
- `uxp-panel/` is a companion UXP panel for transcript-only Text panel commands. It should not replace CEP for ExtendScript/QE tools.

## Add A New Tool

1. Pick the closest module in `src/tools/` or add a focused module if needed.
2. Add a tool entry with `description`, `parameters`, and an async `handler`.
3. For Premiere operations, build ES3-compatible ExtendScript with `buildToolScript()` and execute it with `sendCommand()`.
4. Escape user strings with `escapeForExtendScript()`.
5. If adding a new module, import/spread it in `src/server.ts` and update `tests/tools/tool-modules.test.ts`.
6. Add or update tests, then run `npm run build` and `npm test`.

No-Premiere helper tools can return `{ success: true, data: ... }` directly from the handler, as `fork_ping` does.

## Sync And Publish

Pull upstream updates:

```bash
git fetch upstream
git merge upstream/main
npm install
npm run build
npm test
```

Push fork changes when ready:

```bash
git push origin main
```

## Risks

- CEP install scripts modify user-level Adobe CEP extension folders and unsigned-extension debug settings.
- UXP loading is manual through Adobe UXP Developer Tool; do not imply `install-uxp.sh` can load the panel automatically.
- ExtendScript runs inside Premiere Pro and can modify open projects, files, timelines, media, and export queues.
- Generated scripts must stay ES3-compatible; modern JavaScript syntax can fail in ExtendScript.
- QE DOM calls use undocumented Premiere APIs. They enable key editing actions but can be version-sensitive, stateful, and harder to debug than the standard DOM.
- File-based IPC depends on both sides using the same `PREMIERE_TEMP_DIR`; stale command/response files or mismatched directories cause timeouts.
