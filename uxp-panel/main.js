(function () {
  "use strict";

  var ppro = null;
  try {
    ppro = require("premierepro");
  } catch (error) {
    ppro = null;
  }

  var running = false;
  var pollTimer = null;
  var inFlight = false;
  var commandCount = 0;
  var DEFAULT_URL = "http://127.0.0.1:17777";
  var POLL_DELAY_MS = 250;
  var ERROR_DELAY_MS = 1500;
  var ALLOWED_COMMANDS = {
    ping: "ping",
    capabilities: "capabilities",
    has_transcript: "has_transcript",
    hasTranscript: "has_transcript",
    "textPanel.hasTranscript": "has_transcript",
    export_transcript_json: "export_transcript_json",
    exportTranscriptJSON: "export_transcript_json",
    "textPanel.exportTranscript": "export_transcript_json",
    import_transcript_json: "import_transcript_json",
    importTranscriptJSON: "import_transcript_json",
    "textPanel.importTranscript": "import_transcript_json"
  };

  var bridgeUrlInput = document.getElementById("bridgeUrl");
  var clientIdInput = document.getElementById("clientId");
  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var logEl = document.getElementById("log");
  var startButton = document.getElementById("startButton");
  var stopButton = document.getElementById("stopButton");
  var pingButton = document.getElementById("pingButton");

  function makeClientId() {
    return "premiere-uxp-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
  }

  function log(message, level) {
    var ts = new Date().toLocaleTimeString();
    var line = document.createElement("div");
    line.textContent = "[" + ts + "] " + message;
    if (level === "error") line.style.color = "#ff9b9b";
    if (level === "ok") line.style.color = "#9be7b0";
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    while (logEl.children.length > 100) logEl.removeChild(logEl.firstChild);
  }

  function setStatus(state, text) {
    statusDot.className = "dot" + (state ? " " + state : "");
    statusText.textContent = text;
  }

  function normalizeBaseUrl(value) {
    var trimmed = String(value || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(trimmed)) {
      throw new Error("Bridge URL must be http://127.0.0.1:<port> or http://localhost:<port>");
    }
    return trimmed;
  }

  function commandId(command) {
    return command.commandId || command.id || command.requestId || null;
  }

  function commandName(command) {
    return command.command || command.name || command.type || command.tool || "";
  }

  function commandArgs(command) {
    return command.args || command.params || command.payload || {};
  }

  function getArg(args, names) {
    for (var i = 0; i < names.length; i++) {
      if (Object.prototype.hasOwnProperty.call(args, names[i])) return args[names[i]];
    }
    return undefined;
  }

  function getTranscriptJson(args) {
    var value = getArg(args, ["transcriptJson", "transcript_json", "transcript", "json"]);
    if (value === undefined || value === null) {
      throw new Error("import_transcript_json requires transcript JSON content");
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  function requirePremierePro() {
    if (!ppro) {
      throw new Error('UXP module require("premierepro") is not available');
    }
    if (!ppro.Transcript) {
      throw new Error("premierepro.Transcript is not available in this Premiere Pro runtime");
    }
    return ppro;
  }

  async function getActiveProject() {
    var api = requirePremierePro();
    var project = await api.Project.getActiveProject();
    if (!project) throw new Error("No active Premiere Pro project");
    return project;
  }

  async function itemId(item) {
    if (item && typeof item.getId === "function") {
      return await item.getId();
    }
    return null;
  }

  async function clipSummary(clip) {
    return {
      name: clip && clip.name ? clip.name : "",
      id: await itemId(clip)
    };
  }

  async function selectedClipItems(project) {
    var api = requirePremierePro();
    if (!api.ProjectUtils || typeof api.ProjectUtils.getSelection !== "function") {
      return [];
    }

    var selection = await api.ProjectUtils.getSelection(project);
    if (!selection || typeof selection.getItems !== "function") return [];

    var items = await selection.getItems();
    var clips = [];
    for (var i = 0; i < items.length; i++) {
      var clip = api.ClipProjectItem.cast(items[i]);
      if (clip) clips.push(clip);
    }
    return clips;
  }

  async function walkProjectItems(project) {
    var api = requirePremierePro();
    var root = await project.getRootItem();
    var queue = await root.getItems();
    var clips = [];

    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      var clip = api.ClipProjectItem.cast(item);
      if (clip) {
        clips.push(clip);
        continue;
      }

      var folder = api.FolderItem && api.FolderItem.cast(item);
      if (folder && typeof folder.getItems === "function") {
        var children = await folder.getItems();
        for (var j = 0; j < children.length; j++) queue.push(children[j]);
      }
    }

    return clips;
  }

  async function resolveClip(args) {
    args = args || {};
    var project = await getActiveProject();
    var targetName = getArg(args, ["clipName", "clip_name", "clipProjectItemName", "clip_project_item_name"]);
    var targetId = getArg(args, ["clipId", "clip_id", "clipProjectItemId", "clip_project_item_id", "itemId", "item_id"]);

    if (targetName || targetId) {
      var allClips = await walkProjectItems(project);
      for (var i = 0; i < allClips.length; i++) {
        var id = await itemId(allClips[i]);
        var name = allClips[i].name;
        if (targetId && id !== null && id === String(targetId)) return { project: project, clip: allClips[i], selected: false };
        // The MCP tools only populate the id slot, but callers pass a clip name
        // or CEP node ID there. UXP getId() returns a GUID that never matches
        // those, so also match the supplied value against the clip name.
        if (targetId && name === String(targetId)) return { project: project, clip: allClips[i], selected: false };
        if (targetName && name === String(targetName)) return { project: project, clip: allClips[i], selected: false };
      }
      // No id/name match in the project walk. Fall through to the Project panel
      // selection so a user-selected clip still resolves.
    }

    var selected = await selectedClipItems(project);
    if (selected.length === 0) {
      if (targetName || targetId) {
        throw new Error("No clip matched '" + (targetName || targetId) + "' by ID or name, and no clip is selected in the Project panel");
      }
      throw new Error("Select a clip project item or pass clipName/clipProjectItemId");
    }
    return { project: project, clip: selected[0], selected: true, selectedCount: selected.length };
  }

  async function handlePing() {
    return {
      pong: true,
      premiereproModule: !!ppro,
      transcriptApi: !!(ppro && ppro.Transcript),
      clientId: clientIdInput.value
    };
  }

  async function handleCapabilities() {
    var languages = null;
    if (ppro && ppro.Transcript && typeof ppro.Transcript.querySupportedLanguages === "function") {
      languages = await ppro.Transcript.querySupportedLanguages();
    }

    return {
      bridge: "premiere-uxp-panel",
      protocol: {
        poll: "GET /uxp/poll?clientId=...",
        result: "POST /uxp/result"
      },
      commands: [
        "ping",
        "capabilities",
        "has_transcript",
        "export_transcript_json",
        "import_transcript_json"
      ],
      requiresPremierePro: true,
      requiresUxpPremiereProModule: true,
      transcriptApi: !!(ppro && ppro.Transcript),
      supportedLanguages: languages
    };
  }

  async function handleHasTranscript(args) {
    var api = requirePremierePro();
    var resolved = await resolveClip(args);
    var hasTranscript = api.Transcript.hasTranscript(resolved.clip);
    return {
      hasTranscript: !!hasTranscript,
      clip: await clipSummary(resolved.clip),
      selected: !!resolved.selected,
      selectedCount: resolved.selectedCount || 0
    };
  }

  async function handleExportTranscript(args) {
    var api = requirePremierePro();
    var resolved = await resolveClip(args);
    var transcriptJson = await api.Transcript.exportToJSON(resolved.clip);
    var transcript = transcriptJson;
    if (typeof transcriptJson === "string") {
      transcript = JSON.parse(transcriptJson);
    }
    return {
      transcript: transcript,
      clip: await clipSummary(resolved.clip),
      selected: !!resolved.selected
    };
  }

  async function handleImportTranscript(args) {
    var api = requirePremierePro();
    var resolved = await resolveClip(args);
    var transcriptJson = getTranscriptJson(args);
    var textSegments = api.Transcript.importFromJSON(transcriptJson);

    var success = resolved.project.lockedAccess(function () {
      return resolved.project.executeTransaction(function (compoundAction) {
        var action = api.Transcript.createImportTextSegmentsAction(textSegments, resolved.clip);
        compoundAction.addAction(action);
      }, "Import MCP Transcript JSON");
    });

    return {
      imported: !!success,
      transactionResult: success,
      clip: await clipSummary(resolved.clip),
      selected: !!resolved.selected
    };
  }

  async function dispatchCommand(command) {
    var rawName = commandName(command);
    var normalized = ALLOWED_COMMANDS[rawName];
    if (!normalized) {
      throw new Error("Unsupported UXP command: " + rawName);
    }

    var args = commandArgs(command);
    if (normalized === "ping") return handlePing();
    if (normalized === "capabilities") return handleCapabilities();
    if (normalized === "has_transcript") return handleHasTranscript(args);
    if (normalized === "export_transcript_json") return handleExportTranscript(args);
    if (normalized === "import_transcript_json") return handleImportTranscript(args);
    throw new Error("Unhandled UXP command: " + rawName);
  }

  async function postResult(baseUrl, command, success, payload) {
    var id = commandId(command);
    var body = {
      clientId: clientIdInput.value,
      id: id,
      commandId: id,
      command: commandName(command),
      success: success
    };

    if (success) {
      body.data = payload;
    } else {
      body.error = payload instanceof Error ? payload.message : String(payload);
    }

    var response = await fetch(baseUrl + "/uxp/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error("POST /uxp/result failed with HTTP " + response.status);
    }
  }

  async function processCommand(baseUrl, command) {
    var id = commandId(command);
    var name = commandName(command);
    try {
      var data = await dispatchCommand(command);
      await postResult(baseUrl, command, true, data);
      commandCount++;
      log("OK " + name + (id ? " #" + id : ""), "ok");
    } catch (error) {
      await postResult(baseUrl, command, false, error);
      log("ERR " + name + ": " + (error && error.message ? error.message : String(error)), "error");
    }
  }

  async function pollOnce() {
    if (!running || inFlight) return;
    inFlight = true;

    var delay = POLL_DELAY_MS;
    try {
      var baseUrl = normalizeBaseUrl(bridgeUrlInput.value);
      var url = baseUrl + "/uxp/poll?clientId=" + encodeURIComponent(clientIdInput.value);
      var response = await fetch(url, { method: "GET", cache: "no-store" });

      if (response.status === 204) return;
      if (!response.ok) throw new Error("GET /uxp/poll failed with HTTP " + response.status);

      var text = await response.text();
      if (!text) return;

      var payload = JSON.parse(text);
      var commands = payload;
      if (!Array.isArray(payload) && payload.commands) {
        commands = payload.commands;
      } else if (!Array.isArray(payload) && payload.command && typeof payload.command === "object") {
        commands = payload.command;
      }
      if (!Array.isArray(commands)) commands = [commands];

      for (var i = 0; i < commands.length; i++) {
        if (commands[i]) await processCommand(baseUrl, commands[i]);
      }
    } catch (error) {
      delay = ERROR_DELAY_MS;
      setStatus("error", "Error after " + commandCount + " command(s)");
      log(error && error.message ? error.message : String(error), "error");
    } finally {
      inFlight = false;
      if (running) pollTimer = setTimeout(pollOnce, delay);
    }
  }

  function start() {
    try {
      var baseUrl = normalizeBaseUrl(bridgeUrlInput.value);
      localStorage.setItem("mcp_transcript_bridge_url", baseUrl);
      localStorage.setItem("mcp_transcript_client_id", clientIdInput.value);
      running = true;
      startButton.disabled = true;
      stopButton.disabled = false;
      setStatus("running", "Polling " + baseUrl);
      log("Started. Client ID: " + clientIdInput.value);
      pollOnce();
    } catch (error) {
      setStatus("error", "Configuration error");
      log(error && error.message ? error.message : String(error), "error");
    }
  }

  function stop() {
    running = false;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus("", "Stopped after " + commandCount + " command(s)");
    log("Stopped");
  }

  async function pingBridge() {
    try {
      var baseUrl = normalizeBaseUrl(bridgeUrlInput.value);
      var response = await fetch(baseUrl + "/uxp/status", {
        method: "GET",
        cache: "no-store"
      });
      log("Bridge status endpoint returned HTTP " + response.status, response.ok ? "ok" : "error");
    } catch (error) {
      log(error && error.message ? error.message : String(error), "error");
    }
  }

  function init() {
    bridgeUrlInput.value = localStorage.getItem("mcp_transcript_bridge_url") || DEFAULT_URL;
    clientIdInput.value = localStorage.getItem("mcp_transcript_client_id") || makeClientId();
    startButton.addEventListener("click", start);
    stopButton.addEventListener("click", stop);
    pingButton.addEventListener("click", pingBridge);
    setStatus("", "Stopped");
    log("Panel loaded. premierepro module: " + (ppro ? "yes" : "no"));
  }

  init();
})();
