import { afterEach, describe, expect, it } from "vitest";
import {
  sendUxpCommand,
  UxpBridge,
  UxpCommand,
  UxpCommandResult,
} from "../../src/bridge/uxp-bridge.js";

let bridge: UxpBridge | null = null;

afterEach(async () => {
  await bridge?.shutdown();
  bridge = null;
});

describe("UxpBridge", () => {
  it("reports disabled status and helper failure without starting a server", async () => {
    const result = await sendUxpCommand(null, "noop", {});

    expect(result).toEqual({
      success: false,
      error: "UXP bridge is disabled",
    });

    bridge = new UxpBridge();
    expect(bridge.getStatus()).toMatchObject({
      enabled: false,
      running: false,
      pendingCommands: 0,
      inFlightCommands: 0,
      panelOnline: false,
    });
  });

  it("reports offline when enabled but not started", async () => {
    bridge = new UxpBridge({ enabled: true, port: 0 });

    const result = await sendUxpCommand(bridge, "noop", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("offline");
  });

  it("queues a command, lets a UXP poll receive it, and resolves posted results", async () => {
    bridge = new UxpBridge({
      enabled: true,
      port: 0,
      commandTimeoutMs: 1000,
      pollTimeoutMs: 1000,
    });
    const status = await bridge.start();
    const baseUrl = status.url;
    if (!baseUrl) throw new Error("Expected UXP bridge URL");

    const commandResult = sendUxpCommand<{ clipNodeId: string }, { transcriptPath: string }>(
      bridge,
      "transcript.export",
      { clipNodeId: "clip-1" }
    );

    expect(bridge.getStatus()).toMatchObject({
      pendingCommands: 1,
      inFlightCommands: 1,
    });

    const pollResponse = await fetch(`${baseUrl}/uxp/poll`);
    expect(pollResponse.status).toBe(200);
    const pollBody = (await pollResponse.json()) as { command: UxpCommand<{ clipNodeId: string }> };
    expect(pollBody.command).toMatchObject({
      type: "transcript.export",
      payload: { clipNodeId: "clip-1" },
    });

    const resultResponse = await fetch(`${baseUrl}/uxp/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pollBody.command.id,
        success: true,
        data: { transcriptPath: "/tmp/transcript.json" },
      }),
    });
    expect(resultResponse.status).toBe(200);

    await expect(commandResult).resolves.toEqual({
      success: true,
      data: { transcriptPath: "/tmp/transcript.json" },
    });
    expect(bridge.getStatus()).toMatchObject({
      pendingCommands: 0,
      inFlightCommands: 0,
      panelOnline: true,
    });
  });

  it("delivers a command to an already waiting long poll", async () => {
    bridge = new UxpBridge({
      enabled: true,
      port: 0,
      commandTimeoutMs: 1000,
      pollTimeoutMs: 1000,
    });
    const status = await bridge.start();
    const baseUrl = status.url;
    if (!baseUrl) throw new Error("Expected UXP bridge URL");

    const pollPromise = fetch(`${baseUrl}/uxp/poll`);
    await waitFor(() => bridge?.getStatus().waitingPolls === 1);

    const commandResult = sendUxpCommand(bridge, "panel.ping", { value: 1 });
    const pollResponse = await pollPromise;
    const pollBody = (await pollResponse.json()) as { command: UxpCommand };
    expect(pollBody.command).toMatchObject({
      type: "panel.ping",
      payload: { value: 1 },
    });

    await fetch(`${baseUrl}/uxp/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pollBody.command.id,
        success: false,
        error: "panel failed",
      }),
    });

    const result = (await commandResult) as UxpCommandResult;
    expect(result).toEqual({
      success: false,
      error: "panel failed",
    });
  });

  it("preserves structured diagnostics posted with failed UXP results", async () => {
    bridge = new UxpBridge({
      enabled: true,
      port: 0,
      commandTimeoutMs: 1000,
      pollTimeoutMs: 1000,
    });
    const status = await bridge.start();
    const baseUrl = status.url;
    if (!baseUrl) throw new Error("Expected UXP bridge URL");

    const commandResult = sendUxpCommand(bridge, "textPanel.exportTranscript", {
      clipProjectItemId: "IMG_4216.MOV",
    });

    const pollResponse = await fetch(`${baseUrl}/uxp/poll`);
    const pollBody = (await pollResponse.json()) as { command: UxpCommand };

    await fetch(`${baseUrl}/uxp/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pollBody.command.id,
        success: false,
        error: "missing transcript export method",
        data: {
          missingMethods: ["premierepro.Transcript.exportToJSON"],
          runtimeTranscriptCapabilities: {
            transcriptMethods: { exportToJSON: "undefined" },
          },
        },
      }),
    });

    await expect(commandResult).resolves.toEqual({
      success: false,
      error: "missing transcript export method",
      data: {
        missingMethods: ["premierepro.Transcript.exportToJSON"],
        runtimeTranscriptCapabilities: {
          transcriptMethods: { exportToJSON: "undefined" },
        },
      },
    });
  });

  it("times out queued commands when no panel posts a result", async () => {
    bridge = new UxpBridge({
      enabled: true,
      port: 0,
      commandTimeoutMs: 30,
      pollTimeoutMs: 1000,
    });
    await bridge.start();

    const result = await sendUxpCommand(bridge, "slow.command", {});

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
    expect(bridge.getStatus()).toMatchObject({
      pendingCommands: 0,
      inFlightCommands: 0,
    });
  });

  it("rejects unknown or expired posted result ids", async () => {
    bridge = new UxpBridge({ enabled: true, port: 0 });
    const status = await bridge.start();
    const response = await fetch(`${status.url}/uxp/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "missing", success: true }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unknown or expired UXP command id",
    });
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
