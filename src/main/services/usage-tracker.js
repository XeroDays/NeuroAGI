const { BrowserWindow } = require("electron");
const channels = require("../../shared/ipc/channels");

let totalUSD = 0;
let totalTokens = 0;

function broadcast() {
  const payload = { totalUSD, totalTokens };
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channels.USAGE_UPDATE, payload);
    } catch (err) {
      console.warn(
        "[usage] broadcast failed for a window:",
        err?.message || String(err)
      );
    }
  }
}

function recordUsage(usage) {
  if (!usage || typeof usage !== "object") return;

  let deltaUSD = 0;
  let deltaTokens = 0;

  const cost = usage.cost;
  if (typeof cost === "number" && Number.isFinite(cost)) {
    deltaUSD = cost;
    totalUSD += cost;
  }

  const tokens = usage.total_tokens;
  if (typeof tokens === "number" && Number.isFinite(tokens)) {
    deltaTokens = tokens;
    totalTokens += tokens;
  }

  if (deltaUSD === 0 && deltaTokens === 0) return;

  console.log(
    `[usage] +${deltaUSD} / +${deltaTokens} → totals USD ${totalUSD}, tokens ${totalTokens}`
  );

  broadcast();
}

function getTotals() {
  return { totalUSD, totalTokens };
}

function resetTotals() {
  totalUSD = 0;
  totalTokens = 0;
  console.log("[usage] reset → totals USD 0, tokens 0");
  broadcast();
}

module.exports = {
  recordUsage,
  getTotals,
  resetTotals,
};
