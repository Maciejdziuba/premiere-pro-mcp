# MCP Transcript UXP Bridge

Minimal Premiere Pro UXP panel for Text panel transcript commands only.

## Load in UXP Developer Tool

1. Start the MCP server with the UXP sidecar enabled:
   `PREMIERE_UXP_BRIDGE_ENABLED=true premiere-pro-mcp`
2. Open Adobe UXP Developer Tool.
3. Click **Add Plugin** and select this folder: `uxp-panel/`.
4. Select **MCP Transcript UXP Bridge**, choose Premiere Pro as the host, then click **Load**.
5. In Premiere Pro, open the panel from the UXP plugin menu if it is not already visible.
6. Set the local bridge URL, for example `http://127.0.0.1:17777`, then click **Start**.

The panel manifest requests `requiredPermissions.network.domains: "all"`, the
reliable UXP form for reaching a local HTTP sidecar (it matches Adobe's own UXP
oauth sample). This works for any `PREMIERE_UXP_BRIDGE_PORT` without editing the
manifest.

### Troubleshooting: panel errors before any commands

If the panel shows `Error after 0 command(s)` and the sidecar is reachable
(`GET http://127.0.0.1:17777/uxp/status` responds, but
`get_uxp_bridge_status` still reports `panelOnline: false` / `lastPollAt: null`),
the panel's outbound `fetch` is being blocked by a stale network permission.
After any change to `manifest.json` network permissions, **unload and reload**
the plugin in UXP Developer Tool (a reload alone may not re-read permissions),
then click **Start** again.

## Protocol

The panel connects outward to the localhost bridge. It does not expose a server.

- Poll: `GET /uxp/poll?clientId=<clientId>`
- Result: `POST /uxp/result`
- Status: `GET /uxp/status`

Use the panel's manual status button only for a non-consuming bridge check. Real
bridge health from MCP is reported by `get_uxp_bridge_status`; live panel
round-trip health is reported by `uxp_ping`.

Supported command names:

- `ping`
- `capabilities`
- `textPanel.hasTranscript` (`has_transcript` is also accepted)
- `textPanel.exportTranscript` (`export_transcript_json` is also accepted)
- `textPanel.importTranscript` (`import_transcript_json` is also accepted)

Transcript commands target the selected Project panel clip by default. They can
also target a named clip with `clipName` or a project item ID with
`clipProjectItemId`. `import_transcript_json` expects transcript JSON content in
the command payload as `transcriptJson`, `transcript_json`, `transcript`, or
`json`.

`npm run diagnostics:sweep -- --dry-run` can optionally read a local
`uxp-transcript-status.json` file, but this minimal panel does not write that
file. Missing status-file output is an offline diagnostics label, not proof that
the MCP UXP bridge is down.
