const { randomUUID } = require('crypto');
const { BrowserWindow } = require('electron');
const channels = require('../../shared/ipc/channels');

/** In-memory call log. Entries are never written to disk. */
let logs = [];

function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send(channels.LOG_UPDATE, { logs });
    } catch (err) {
      console.warn('[log-service] broadcast failed for a window:', err?.message || String(err));
    }
  }
}

/**
 * Add a log entry. Caller should pass a partial object; this function stamps
 * the id and timestamp, then broadcasts to all open windows.
 *
 * AI Tool Call shape:
 *   { type:"ai", status:"success"|"error", model, query, reasoningEffort,
 *     maxTokens, promptTokens, completionTokens, totalTokens, cost,
 *     response, durationMs, error? }
 *
 * Web Tool Call shape:
 *   { type:"web", status:"success"|"error", query, response,
 *     durationMs, error? }
 */
function addLog(item) {
  const entry = {
    id: randomUUID(),
    timestamp: Date.now(),
    ...item,
  };
  logs.push(entry);
  broadcast();
  return entry.id;
}

function getLogs() {
  return logs.slice();
}

function clearLogs() {
  logs = [];
  broadcast();
  console.log('[log-service] logs cleared');
}

module.exports = { addLog, getLogs, clearLogs };
