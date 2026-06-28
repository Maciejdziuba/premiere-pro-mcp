import http from "node:http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17777;
const DEFAULT_POLL_TIMEOUT_MS = 25000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30000;
const MAX_BODY_BYTES = 1024 * 1024;

export interface UxpBridgeOptions {
  enabled?: boolean;
  host?: string;
  port?: number;
  pollTimeoutMs?: number;
  commandTimeoutMs?: number;
}

export interface UxpBridgeStatus {
  enabled: boolean;
  running: boolean;
  host: string;
  port: number | null;
  url: string | null;
  pollPath: string;
  resultPath: string;
  pendingCommands: number;
  inFlightCommands: number;
  waitingPolls: number;
  panelOnline: boolean;
  lastPollAt: string | null;
  lastResultAt: string | null;
}

export interface UxpCommand<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  createdAt: string;
}

export interface UxpCommandResult<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: string;
}

export interface SendUxpCommandOptions {
  timeoutMs?: number;
}

interface PendingCommand {
  command: UxpCommand;
  resolve: (result: UxpCommandResult) => void;
  timer: NodeJS.Timeout;
}

type PollResponder = (command: UxpCommand | null) => void;

let commandCounter = 0;

export class UxpBridge {
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly pollTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private server: http.Server | null = null;
  private actualPort: number | null = null;
  private queue: PendingCommand[] = [];
  private inFlight = new Map<string, PendingCommand>();
  private waitingPolls: PollResponder[] = [];
  private lastPollAtMs: number | null = null;
  private lastResultAtMs: number | null = null;

  constructor(options: UxpBridgeOptions = {}) {
    this.enabled = options.enabled === true;
    this.host = options.host || DEFAULT_HOST;
    this.requestedPort = options.port ?? DEFAULT_PORT;
    this.pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  async start(): Promise<UxpBridgeStatus> {
    if (!this.enabled || this.server) {
      return this.getStatus();
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch(() => {
        if (!res.headersSent) {
          this.writeJson(res, 500, { error: "Internal UXP bridge error" });
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server?.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        const address = this.server?.address();
        this.actualPort = typeof address === "object" && address ? address.port : this.requestedPort;
        resolve();
      };

      this.server?.once("error", onError);
      this.server?.once("listening", onListening);
      this.server?.listen(this.requestedPort, this.host);
    });

    return this.getStatus();
  }

  async shutdown(): Promise<void> {
    for (const waiter of this.waitingPolls.splice(0)) {
      waiter(null);
    }

    const pending = [...this.queue, ...this.inFlight.values()];
    this.queue = [];
    this.inFlight.clear();
    for (const item of pending) {
      clearTimeout(item.timer);
      item.resolve({
        success: false,
        error: "UXP bridge shut down before the command completed",
      });
    }

    if (!this.server) return;

    const server = this.server;
    this.server = null;
    this.actualPort = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  sendCommand<TPayload = unknown, TData = unknown>(
    type: string,
    payload: TPayload,
    options: SendUxpCommandOptions = {}
  ): Promise<UxpCommandResult<TData>> {
    if (!this.enabled) {
      return Promise.resolve({
        success: false,
        error: "UXP bridge is disabled",
      });
    }

    if (!this.server || !this.actualPort) {
      return Promise.resolve({
        success: false,
        error: "UXP bridge is offline",
      });
    }

    const id = `${Date.now()}_${++commandCounter}`;
    const command: UxpCommand<TPayload> = {
      id,
      type,
      payload,
      createdAt: new Date().toISOString(),
    };

    return new Promise<UxpCommandResult<TData>>((resolve) => {
      const timeoutMs = options.timeoutMs ?? this.commandTimeoutMs;
      const pending: PendingCommand = {
        command,
        resolve: resolve as (result: UxpCommandResult) => void,
        timer: setTimeout(() => {
          this.removePending(id);
          resolve({
            success: false,
            error: `UXP command timed out after ${timeoutMs}ms. Is the UXP panel polling ${this.getStatus().pollPath}?`,
          });
        }, timeoutMs),
      };

      this.inFlight.set(id, pending);

      const waiter = this.waitingPolls.shift();
      if (waiter) {
        waiter(command);
      } else {
        this.queue.push(pending);
      }
    });
  }

  getStatus(): UxpBridgeStatus {
    const running = Boolean(this.server && this.actualPort);
    const lastPollAt = this.lastPollAtMs ? new Date(this.lastPollAtMs).toISOString() : null;
    const lastResultAt = this.lastResultAtMs ? new Date(this.lastResultAtMs).toISOString() : null;
    const panelOnline = this.lastPollAtMs !== null && Date.now() - this.lastPollAtMs <= this.pollTimeoutMs * 2 + 1000;
    const port = running ? this.actualPort : this.enabled ? this.requestedPort : null;
    const url = running && port ? `http://${this.host}:${port}` : null;

    return {
      enabled: this.enabled,
      running,
      host: this.host,
      port,
      url,
      pollPath: "/uxp/poll",
      resultPath: "/uxp/result",
      pendingCommands: this.queue.length,
      inFlightCommands: this.inFlight.size,
      waitingPolls: this.waitingPolls.length,
      panelOnline,
      lastPollAt,
      lastResultAt,
    };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.setCorsHeaders(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${this.host}`);

    if (req.method === "GET" && url.pathname === "/uxp/status") {
      this.writeJson(res, 200, this.getStatus());
      return;
    }

    if (req.method === "GET" && url.pathname === "/uxp/poll") {
      this.handlePoll(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/uxp/result") {
      await this.handleResult(req, res);
      return;
    }

    this.writeJson(res, 404, { error: "Not found" });
  }

  private handlePoll(res: http.ServerResponse): void {
    this.lastPollAtMs = Date.now();

    const queued = this.queue.shift();
    if (queued) {
      this.writeJson(res, 200, { ok: true, command: queued.command });
      return;
    }

    let completed = false;
    let responder: PollResponder;
    const removeWaiter = () => {
      const index = this.waitingPolls.indexOf(responder);
      if (index >= 0) this.waitingPolls.splice(index, 1);
    };
    const timeout = setTimeout(() => {
      completed = true;
      removeWaiter();
      res.writeHead(204);
      res.end();
    }, this.pollTimeoutMs);

    responder = (command) => {
      completed = true;
      clearTimeout(timeout);
      if (!command) {
        this.writeJson(res, 503, { error: "UXP bridge shutting down" });
        return;
      }
      this.writeJson(res, 200, { ok: true, command });
    };

    res.on("close", () => {
      if (completed) return;
      clearTimeout(timeout);
      removeWaiter();
    });

    this.waitingPolls.push(responder);
  }

  private async handleResult(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      this.writeJson(res, 400, {
        error: `Invalid JSON result body: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    const result = body as Partial<UxpCommandResult> & { id?: unknown };
    if (typeof result.id !== "string" || result.id.length === 0) {
      this.writeJson(res, 400, { error: "Result body must include a command id" });
      return;
    }

    const pending = this.inFlight.get(result.id);
    if (!pending) {
      this.writeJson(res, 404, { error: "Unknown or expired UXP command id" });
      return;
    }

    this.inFlight.delete(result.id);
    this.queue = this.queue.filter((item) => item.command.id !== result.id);
    clearTimeout(pending.timer);
    this.lastResultAtMs = Date.now();
    pending.resolve({
      success: result.success === true,
      data: result.data,
      error: typeof result.error === "string" ? result.error : undefined,
    });
    this.writeJson(res, 200, { ok: true });
  }

  private removePending(id: string): void {
    this.inFlight.delete(id);
    this.queue = this.queue.filter((item) => item.command.id !== id);
  }

  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  private writeJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }
}

export function getDisabledUxpBridgeStatus(): UxpBridgeStatus {
  return {
    enabled: false,
    running: false,
    host: DEFAULT_HOST,
    port: null,
    url: null,
    pollPath: "/uxp/poll",
    resultPath: "/uxp/result",
    pendingCommands: 0,
    inFlightCommands: 0,
    waitingPolls: 0,
    panelOnline: false,
    lastPollAt: null,
    lastResultAt: null,
  };
}

export function sendUxpCommand<TPayload = unknown, TData = unknown>(
  bridge: UxpBridge | null | undefined,
  type: string,
  payload: TPayload,
  options?: SendUxpCommandOptions
): Promise<UxpCommandResult<TData>> {
  if (!bridge) {
    return Promise.resolve({
      success: false,
      error: "UXP bridge is disabled",
    });
  }

  return bridge.sendCommand<TPayload, TData>(type, payload, options);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, "utf-8") > MAX_BODY_BYTES) {
      throw new Error("request body exceeds 1MB limit");
    }
  }

  return body;
}
