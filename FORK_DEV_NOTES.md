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

## Local MCP Config Example

This tells an MCP client (such as Claude Code) how to launch the built server. A repo-local copy lives at [`.mcp.local.example.json`](.mcp.local.example.json).

```json
{
  "mcpServers": {
    "premiere-pro-local": {
      "command": "node",
      "args": [
        "/Users/maciejdziuba/Documents/Software /Premier Pro MCP Fork/dist/index.js"
      ],
      "env": {
        "PREMIERE_TEMP_DIR": "/tmp/premiere-mcp-bridge"
      }
    }
  }
}
```

Equivalent Claude Code command:

```bash
claude mcp add premiere-pro-local --env PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge -- node "/Users/maciejdziuba/Documents/Software /Premier Pro MCP Fork/dist/index.js"
```

Do not run the command unless you want to modify Claude Code's MCP config.

## CEP Bridge Install Later

CEP is Adobe's panel framework; the panel is what relays commands into Premiere. The bridge panel lives in `cep-plugin/`. Later, when ready for Premiere testing, run:

```bash
npm run install-cep
```

That script symlinks `cep-plugin/` into the Adobe CEP extensions folder and enables unsigned CEP extensions/debug mode. It changes user-level Adobe settings, so keep it out of automated setup.

## How Tools Are Wired

The flow is: MCP client → server → file bridge → CEP panel → ExtendScript in Premiere, and back.

- `src/index.ts` starts the stdio MCP server and passes `PREMIERE_TEMP_DIR`/`PREMIERE_TIMEOUT_MS` into the bridge.
- `src/server.ts` imports every `get*Tools()` module from `src/tools/`, merges their tool maps, converts JSON-schema-like parameters to Zod, and registers each tool with the MCP SDK.
- `src/bridge/file-bridge.ts` writes `cmd_<id>.jsx` files into the temp bridge directory, polls for `res_<id>.json`, validates script size/content, and cleans up command/response files.
- `src/bridge/script-builder.ts` prepends ES3 ExtendScript helpers and wraps generated code in an IIFE with try/catch.
- `cep-plugin/main.js` is the CEP-side poller. It reads `.jsx` command files, runs them through `CSInterface.evalScript()`, and writes JSON responses.
- `cep-plugin/host.jsx` is a small host-side ExtendScript file loaded by the panel.

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
- ExtendScript runs inside Premiere Pro and can modify open projects, files, timelines, media, and export queues.
- Generated scripts must stay ES3-compatible; modern JavaScript syntax can fail in ExtendScript.
- QE DOM calls use undocumented Premiere APIs. They enable key editing actions but can be version-sensitive, stateful, and harder to debug than the standard DOM.
- File-based IPC depends on both sides using the same `PREMIERE_TEMP_DIR`; stale command/response files or mismatched directories cause timeouts.
