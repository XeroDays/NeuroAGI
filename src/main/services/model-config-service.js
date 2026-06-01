const path = require("path");
const fs = require("fs");
const { app } = require("electron");

let catalogPath = "";
let statePath = "";

let catalog = [];        // [{ name, type, ... }] — loaded once from JSON
let activeModels = null; // Set<string> of enabled catalog names
let masterModel = "";    // catalog name of the starred master merge model

function resolvePaths() {
  if (catalogPath && statePath) return;

  catalogPath = app.isPackaged
    ? path.join(process.resourcesPath, "models-catalog.json")
    : path.join(__dirname, "../../../models-catalog.json");

  statePath = path.join(app.getPath("userData"), "models-state.json");
}

/**
 * Reconstruct the full OpenRouter model ID from a catalog entry.
 * Convention: Free models use the ":free" variant suffix. If the catalog
 * name already contains ":" it already includes a variant tag and is used
 * as-is. Paid models are used without any suffix.
 */
function toRuntimeId(entry) {
  if (entry.name.includes(":")) return entry.name;
  return entry.type === "Free" ? `${entry.name}:free` : entry.name;
}

function saveState() {
  resolvePaths();
  try {
    const data = {
      activeModels: Array.from(activeModels),
      masterModel,
    };
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[model-config] Failed to save state:", err.message);
  }
}

/**
 * Load catalog and activation state. Called once on app start from main/index.js.
 * Safe to call multiple times (re-initialises each time).
 */
function init() {
  resolvePaths();

  // Load catalog
  try {
    const raw = fs.readFileSync(catalogPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      catalog = parsed.filter(
        (m) => m && typeof m.name === "string" && typeof m.type === "string"
      );
    }
    console.log(`[model-config] Loaded catalog: ${catalog.length} model(s)`);
  } catch (err) {
    console.error("[model-config] Failed to load catalog:", err.message);
    catalog = [];
  }

  const catalogNames = new Set(catalog.map((m) => m.name));

  // Load persisted activation + master state
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);
    if (Array.isArray(state.activeModels)) {
      const valid = state.activeModels.filter((n) => catalogNames.has(n));
      activeModels = new Set(valid);
    } else {
      throw new Error("state.activeModels is not an array");
    }

    const savedMaster =
      typeof state.masterModel === "string" ? state.masterModel : "";
    masterModel = catalogNames.has(savedMaster) ? savedMaster : "";

    console.log(
      `[model-config] Loaded state: ${activeModels.size} active model(s), master=${masterModel || "(none)"}`
    );
  } catch (_err) {
    activeModels = new Set();
    masterModel = "";
    console.log("[model-config] No state file — starting with no active models or master");
  }
}

/**
 * Returns the full model list with per-model enabled/master state for the popup UI.
 * @returns {{ name: string, type: string, latency: string, throughput: string, price: string, labels: string, enabled: boolean, isMaster: boolean }[]}
 */
function getModelsWithState() {
  if (!activeModels) init();
  return catalog.map((m) => ({
    name: m.name,
    type: m.type,
    latency: typeof m.latency === "string" ? m.latency : "",
    throughput: typeof m.throughput === "string" ? m.throughput : "",
    price: typeof m.price === "string" ? m.price : "",
    labels: typeof m.labels === "string" ? m.labels : "",
    enabled: activeModels.has(m.name),
    isMaster: m.name === masterModel,
  }));
}

/**
 * Returns runtime model IDs (with :free suffix where applicable) for all
 * currently enabled catalog entries.
 * @returns {string[]}
 */
function getActiveModelIds() {
  if (!activeModels) init();
  return catalog
    .filter((m) => activeModels.has(m.name))
    .map(toRuntimeId);
}

/**
 * Returns the runtime OpenRouter ID for the starred master model, or null if unset.
 * @returns {string|null}
 */
function getMasterModelRuntimeId() {
  if (!activeModels) init();
  if (!masterModel) return null;
  const entry = catalog.find((m) => m.name === masterModel);
  if (!entry) return null;
  return toRuntimeId(entry);
}

/**
 * Persist activation set and/or starred master model.
 * @param {{ activeModels?: string[], masterModel?: string }} payload
 */
function updateState({ activeModels: activeNames, masterModel: newMaster } = {}) {
  if (!activeModels) init();

  const catalogNames = new Set(catalog.map((m) => m.name));

  if (Array.isArray(activeNames)) {
    const validated = activeNames.filter((n) => catalogNames.has(n));
    activeModels = new Set(validated);
  }

  if (newMaster !== undefined) {
    if (typeof newMaster === "string" && (newMaster === "" || catalogNames.has(newMaster))) {
      masterModel = newMaster;
    }
  }

  saveState();
  console.log(
    `[model-config] State updated: ${activeModels.size} active model(s), master=${masterModel || "(none)"}`
  );
}

module.exports = {
  init,
  getModelsWithState,
  getActiveModelIds,
  getMasterModelRuntimeId,
  updateState,
};
