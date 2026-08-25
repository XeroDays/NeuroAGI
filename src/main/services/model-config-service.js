const path = require("path");
const fs = require("fs");
const { app } = require("electron");

let catalogPath = "";
let statePath = "";

let catalog = [];        // [{ name, type, ... }] — loaded once from JSON
let activeModels = null; // Set<string> of enabled catalog names
let masterModel = "";    // catalog name of the starred master merge model
let latencies = {};      // { [name]: "3.65s" } — overlay on catalog latency
let throughputs = {};    // { [name]: "99tps" } — overlay on catalog throughput
let removedModels = new Set(); // names dropped after a failed latency probe

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

function catalogNameSet() {
  return new Set(catalog.map((m) => m.name));
}

function sanitizeOverlayMap(raw, catalogNames) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (catalogNames.has(name) && typeof value === "string") {
      out[name] = value;
    }
  }
  return out;
}

function dropOverlays(name) {
  delete latencies[name];
  delete throughputs[name];
}

function saveState() {
  resolvePaths();
  try {
    const data = {
      activeModels: Array.from(activeModels),
      masterModel,
      latencies,
      throughputs,
      removedModels: Array.from(removedModels),
    };
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[model-config] Failed to save state:", err.message);
  }
}

function pruneRemovedFromActivation() {
  for (const name of Array.from(activeModels)) {
    if (removedModels.has(name)) activeModels.delete(name);
  }
  if (masterModel && removedModels.has(masterModel)) {
    masterModel = "";
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

  const catalogNames = catalogNameSet();

  // Load persisted activation + master + benchmark overlays
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

    latencies = sanitizeOverlayMap(state.latencies, catalogNames);
    throughputs = sanitizeOverlayMap(state.throughputs, catalogNames);

    removedModels = new Set(
      Array.isArray(state.removedModels)
        ? state.removedModels.filter((n) => typeof n === "string" && catalogNames.has(n))
        : []
    );
    pruneRemovedFromActivation();

    console.log(
      `[model-config] Loaded state: ${activeModels.size} active model(s), master=${masterModel || "(none)"}, removed=${removedModels.size}`
    );
  } catch (_err) {
    activeModels = new Set();
    masterModel = "";
    latencies = {};
    throughputs = {};
    removedModels = new Set();
    console.log("[model-config] No state file — starting with no active models or master");
  }
}

function isListed(name) {
  return !removedModels.has(name);
}

/**
 * Visible catalog rows of one type, excluding models removed by a failed probe.
 * @param {"Free"|"Paid"} type
 * @returns {{ name: string, type: string }[]}
 */
function getCatalogEntriesByType(type) {
  if (!activeModels) init();
  return catalog.filter((m) => m.type === type && isListed(m.name));
}

/**
 * Returns the full model list with per-model enabled/master state for the popup UI.
 * Removed models are omitted. Latency/throughput overlays from a Test latency run
 * win over catalog defaults.
 * @returns {{ name: string, type: string, latency: string, throughput: string, price: string, labels: string, enabled: boolean, isMaster: boolean }[]}
 */
function getModelsWithState() {
  if (!activeModels) init();
  return catalog.filter((m) => isListed(m.name)).map((m) => ({
    name: m.name,
    type: m.type,
    latency: latencies[m.name] ?? (typeof m.latency === "string" ? m.latency : ""),
    throughput: throughputs[m.name] ?? (typeof m.throughput === "string" ? m.throughput : ""),
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
    .filter((m) => isListed(m.name) && activeModels.has(m.name))
    .map(toRuntimeId);
}

/**
 * Returns the runtime OpenRouter ID for the starred master model, or null if unset.
 * @returns {string|null}
 */
function getMasterModelRuntimeId() {
  if (!activeModels) init();
  if (!masterModel || !isListed(masterModel)) return null;
  const entry = catalog.find((m) => m.name === masterModel);
  if (!entry) return null;
  return toRuntimeId(entry);
}

/**
 * Persist a successful latency probe as overlays on the catalog row.
 * @param {string} name
 * @param {string} latency
 * @param {string} throughput
 */
function recordBenchmarkResult(name, latency, throughput) {
  if (!activeModels) init();
  if (typeof name !== "string" || !catalogNameSet().has(name) || !isListed(name)) return;
  if (typeof latency === "string") latencies[name] = latency;
  if (typeof throughput === "string") throughputs[name] = throughput;
  saveState();
}

/**
 * Drop a model that failed a latency probe. Does not rewrite the catalog file.
 * @param {string} name
 */
function removeFailedModel(name) {
  if (!activeModels) init();
  if (typeof name !== "string" || !catalogNameSet().has(name)) return;
  removedModels.add(name);
  activeModels.delete(name);
  if (masterModel === name) masterModel = "";
  dropOverlays(name);
  saveState();
  console.log(`[model-config] Removed failed model: ${name}`);
}

/**
 * Persist activation set and/or starred master model.
 * @param {{ activeModels?: string[], masterModel?: string }} payload
 */
function updateState({ activeModels: activeNames, masterModel: newMaster } = {}) {
  if (!activeModels) init();

  const visibleNames = new Set(
    catalog.filter((m) => isListed(m.name)).map((m) => m.name)
  );

  if (Array.isArray(activeNames)) {
    const validated = activeNames.filter((n) => visibleNames.has(n));
    activeModels = new Set(validated);
  }

  if (newMaster !== undefined) {
    if (typeof newMaster === "string" && (newMaster === "" || visibleNames.has(newMaster))) {
      masterModel = newMaster;
    }
  }

  pruneRemovedFromActivation();
  saveState();
  console.log(
    `[model-config] State updated: master=${masterModel || "(none)"}, activeModels=[${Array.from(activeModels).join(", ")}]`
  );
}

module.exports = {
  init,
  getModelsWithState,
  getActiveModelIds,
  getMasterModelRuntimeId,
  getCatalogEntriesByType,
  recordBenchmarkResult,
  removeFailedModel,
  updateState,
};
