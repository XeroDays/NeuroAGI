const { ipcMain, BrowserWindow } = require("electron");
const path = require("path");
const channels = require("../../shared/ipc/channels");
const { GetModelsConfig, UpdateModelsConfig } = require("../middlewares/cookie-middleware");
const { SendAdvanceChat, CancelAdvanceChat } = require("../middlewares/advance-middleware");
const usageTracker = require("../services/usage-tracker");
const logService = require("../services/log-service");
const credentialsStore = require("../services/credentials-store");
const modelConfigService = require("../services/model-config-service");
const { probeModel } = require("../services/latency-benchmark-service");
const { testOpenRouterKey, testTavilyKey } = require("../services/credential-test-service");
const SoftwareLicensingService = require("../services/software-licensing-service");
const profilesService = require("../services/profiles-service");

let ipcHandlersRegistered = false;
let benchmarkInFlight = false;

function broadcastBenchmarkProgress(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channels.BENCHMARK_PROGRESS, payload);
    } catch (err) {
      console.warn("[ipc] BENCHMARK_PROGRESS broadcast failed:", err?.message || String(err));
    }
  }
}

function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.handle(channels.GET_USAGE_TOTALS, () => usageTracker.getTotals());

  ipcMain.handle(channels.RESET_USAGE_TOTALS, () => {
    usageTracker.resetTotals();
    return { ok: true };
  });

  ipcMain.handle(channels.OPEN_DEV_TOOLS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.toggleDevTools();
    return { ok: true };
  });

  ipcMain.handle(channels.GET_CREDENTIALS, () => credentialsStore.readCredentials());

  ipcMain.handle(channels.UPDATE_CREDENTIALS, (_event, payload) => {
    return credentialsStore.writeCredentials(payload || {});
  });

  ipcMain.handle(channels.TEST_OPENROUTER_KEY, (_event, payload) => {
    return testOpenRouterKey(payload || {});
  });

  ipcMain.handle(channels.TEST_TAVILY_KEY, (_event, payload) => {
    return testTavilyKey(payload || {});
  });

  ipcMain.handle(channels.GET_MODELS_CONFIG, () => {
    return GetModelsConfig();
  });

  ipcMain.handle(channels.UPDATE_MODELS_CONFIG, (_event, payload) => {
    return UpdateModelsConfig(payload || {});
  });

  ipcMain.handle(channels.ADD_MODEL, (_event, payload) => {
    return modelConfigService.addCustomModel(payload || {});
  });

  ipcMain.handle(channels.DELETE_MODEL, (_event, payload) => {
    return modelConfigService.deleteModel(payload?.name);
  });

  ipcMain.handle(channels.BENCHMARK_MODELS, async (_event, payload) => {
    if (benchmarkInFlight) {
      return { ok: false, error: "A latency test is already running." };
    }

    const type = payload?.type;
    if (type !== "Free" && type !== "Paid") {
      return { ok: false, error: "Invalid type." };
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "OPENROUTER_API_KEY is not set." };
    }

    const entries = modelConfigService.getCatalogEntriesByType(type);
    const total = entries.length;
    if (total === 0) {
      return { ok: true, tested: 0 };
    }

    benchmarkInFlight = true;
    try {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const index = i + 1;
        broadcastBenchmarkProgress({
          name: entry.name,
          type: entry.type,
          status: "running",
          index,
          total,
        });

        const result = await probeModel(entry, apiKey);
        if (result.status === "ok") {
          modelConfigService.recordBenchmarkResult(
            entry.name,
            result.latency,
            result.throughput
          );
          broadcastBenchmarkProgress({
            name: entry.name,
            type: entry.type,
            status: "ok",
            latency: result.latency,
            throughput: result.throughput,
            index,
            total,
            note: result.note,
          });
        } else {
          modelConfigService.recordProbeError(entry.name, result.note);
          broadcastBenchmarkProgress({
            name: entry.name,
            type: entry.type,
            status: "error",
            index,
            total,
            note: result.note,
          });
        }
      }
      return { ok: true, tested: total };
    } finally {
      benchmarkInFlight = false;
    }
  });

  ipcMain.handle(channels.GET_LOGS, () => logService.getLogs());

  ipcMain.handle(channels.CLEAR_LOGS, () => {
    logService.clearLogs();
    return { ok: true };
  });

  ipcMain.handle(channels.ADVANCE_SEND, async (event, payload) => {
    return SendAdvanceChat(payload || {}, event.sender);
  });

  ipcMain.handle(channels.ADVANCE_CANCEL, (event, payload) => {
    return CancelAdvanceChat(event.sender, payload || {});
  });

  ipcMain.handle(channels.REGISTER_SOFTWARE_LICENSE, async () => {
    return SoftwareLicensingService.getCachedUpdate();
  });

  ipcMain.handle(channels.GET_LICENSE_UPDATE, async () => {
    return SoftwareLicensingService.getCachedUpdate();
  });

  ipcMain.handle(channels.CHECK_SOFTWARE_INSTALLER, (_event, payload) => {
    return SoftwareLicensingService.checkInstaller(payload?.fileName);
  });

  ipcMain.handle(channels.DOWNLOAD_SOFTWARE_UPDATE, async (event, payload) => {
    const url = typeof payload?.url === "string" ? payload.url : "";
    const fileName = typeof payload?.fileName === "string" ? payload.fileName : "";
    const sender = event.sender;
    return SoftwareLicensingService.downloadInstaller(url, fileName, (progress) => {
      if (sender && !sender.isDestroyed()) {
        sender.send(channels.SOFTWARE_DOWNLOAD_PROGRESS, {
          percent: progress?.percent ?? 0,
          received: progress?.received ?? 0,
          total: progress?.total ?? 0,
          filename: progress?.filename ?? fileName,
          path: progress?.path ?? null,
        });
      }
    });
  });

  ipcMain.handle(channels.INSTALL_SOFTWARE_UPDATE, async (_event, payload) => {
    const fileName = typeof payload?.fileName === "string"
      ? payload.fileName
      : typeof payload?.filePath === "string"
        ? path.basename(payload.filePath)
        : "";
    return SoftwareLicensingService.installInstaller(fileName);
  });

  ipcMain.handle(channels.GET_PROFILES, () => profilesService.getProfiles());
  ipcMain.handle(channels.RECORD_PROFILE_ISSUE, (_event, payload) => (
    profilesService.recordIssue(payload)
  ));
  ipcMain.handle(channels.DELETE_PROFILE, (_event, payload) => (
    profilesService.removeById(payload?.id)
  ));
}

module.exports = { registerIpcHandlers };
