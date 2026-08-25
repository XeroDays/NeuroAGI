const path = require("path");
const fs = require("fs");
const { app } = require("electron");

let catalogPath = "";
let statePath = "";

let catalog = [];        // [{ name, type, ... }] — loaded once from JSON
let customModels = [];   // [{ name, type }] — user-added rows in userData
let activeModels = null; // Set<string> of enabled catalog/custom names
let masterModel = "";    // catalog name of the starred master merge model
let latencies = {};      // { [name]: "3.65s" } — overlay on catalog latency
let throughputs = {};    // { [name]: "99tps" } — overlay on catalog throughput
let probeErrors = {};    // { [name]: note } — last Test latency failure
let removedModels = new Set(); // catalog names hidden by user Delete

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

function allEntries() {
  return catalog.concat(customModels);
}

function listedNameSet() {
  return new Set(allEntries().map((m) => m.name));
}

function findEntry(name) {
  return allEntries().find((m) => m.name === name) || null;
}

function sanitizeCustomModels(raw, catalogNames) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item.name !== "string" || typeof item.type !== "string") continue;
    const name = item.name.trim();
    const type = item.type;
    if (!name || (type !== "Free" && type !== "Paid")) continue;
    if (catalogNames.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, type });
  }
  return out;
}

function toUiRow(m) {
  return {
    name: m.name,
    type: m.type,
    latency: latencies[m.name] ?? (typeof m.latency === "string" ? m.latency : ""),
    throughput: throughputs[m.name] ?? (typeof m.throughput === "string" ? m.throughput : ""),
    price: typeof m.price === "string" ? m.price : "",
    labels: typeof m.labels === "string" ? m.labels : "",
    enabled: activeModels.has(m.name),
    isMaster: m.name === masterModel,
    probeError: typeof probeErrors[m.name] === "string" ? probeErrors[m.name] : "",
  };
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
  delete probeErrors[name];
}

function saveState() {
  resolvePaths();
  try {
    const data = {
      activeModels: Array.from(activeModels),
      masterModel,
      latencies,
      throughputs,
      probeErrors,
      removedModels: Array.from(removedModels),
      customModels,
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

  // Load persisted activation + master + benchmark overlays + custom rows
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const state = JSON.parse(raw);

    customModels = sanitizeCustomModels(state.customModels, catalogNames);
    const listedNames = listedNameSet();

    if (Array.isArray(state.activeModels)) {
      const valid = state.activeModels.filter((n) => listedNames.has(n));
      activeModels = new Set(valid);
    } else {
      throw new Error("state.activeModels is not an array");
    }

    const savedMaster =
      typeof state.masterModel === "string" ? state.masterModel : "";
    masterModel = listedNames.has(savedMaster) ? savedMaster : "";

    latencies = sanitizeOverlayMap(state.latencies, listedNames);
    throughputs = sanitizeOverlayMap(state.throughputs, listedNames);
    probeErrors = sanitizeOverlayMap(state.probeErrors, listedNames);

    removedModels = new Set(
      Array.isArray(state.removedModels)
        ? state.removedModels.filter((n) => typeof n === "string" && listedNames.has(n))
        : []
    );
    pruneRemovedFromActivation();

    console.log(
      `[model-config] Loaded state: ${activeModels.size} active model(s), master=${masterModel || "(none)"}, custom=${customModels.length}, removed=${removedModels.size}`
    );
  } catch (_err) {
    activeModels = new Set();
    masterModel = "";
    latencies = {};
    throughputs = {};
    probeErrors = {};
    removedModels = new Set();
    customModels = [];
    console.log("[model-config] No state file — starting with no active models or master");
  }
}

function isListed(name) {
  return !removedModels.has(name);
}

/**
 * Visible listed rows of one type, excluding user-deleted catalog names.
 * @param {"Free"|"Paid"} type
 * @returns {{ name: string, type: string }[]}
 */
function getCatalogEntriesByType(type) {
  if (!activeModels) init();
  return allEntries().filter((m) => m.type === type && isListed(m.name));
}

/**
 * Returns the full model list with per-model enabled/master state for the popup UI.
 * Removed models are omitted. Latency/throughput overlays from a Test latency run
 * win over catalog defaults.
 * @returns {{ name: string, type: string, latency: string, throughput: string, price: string, labels: string, enabled: boolean, isMaster: boolean, probeError: string }[]}
 */
function getModelsWithState() {
  if (!activeModels) init();
  const catalogRows = catalog.filter((m) => isListed(m.name)).map(toUiRow);
  const customRows = customModels
    .filter((m) => isListed(m.name) && !catalogNameSet().has(m.name))
    .map(toUiRow);
  return catalogRows.concat(customRows);
}

/**
 * Returns runtime model IDs (with :free suffix where applicable) for all
 * currently enabled catalog entries.
 * @returns {string[]}
 */
function getActiveModelIds() {
  if (!activeModels) init();
  return allEntries()
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
  const entry = findEntry(masterModel);
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
  if (typeof name !== "string" || !listedNameSet().has(name) || !isListed(name)) return;
  if (typeof latency === "string") latencies[name] = latency;
  if (typeof throughput === "string") throughputs[name] = throughput;
  delete probeErrors[name];
  saveState();
}

/**
 * Persist a failed latency probe note. Keeps the row visible.
 * @param {string} name
 * @param {string} note
 */
function recordProbeError(name, note) {
  if (!activeModels) init();
  if (typeof name !== "string" || !listedNameSet().has(name) || !isListed(name)) return;
  probeErrors[name] = typeof note === "string" && note.trim() ? note : "Probe failed.";
  saveState();
}

/**
 * User-initiated hide. Does not rewrite the catalog file.
 * Custom rows are dropped from customModels; catalog names go into removedModels.
 * @param {string} name
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function deleteModel(name) {
  if (!activeModels) init();
  if (typeof name !== "string" || !name || !listedNameSet().has(name) || !isListed(name)) {
    return { ok: false, error: "Model not in the list." };
  }

  activeModels.delete(name);
  if (masterModel === name) masterModel = "";
  dropOverlays(name);

  const customIndex = customModels.findIndex((m) => m.name === name);
  if (customIndex >= 0) {
    customModels.splice(customIndex, 1);
  } else if (catalogNameSet().has(name)) {
    removedModels.add(name);
  }

  saveState();
  console.log(`[model-config] Deleted model: ${name}`);
  return { ok: true };
}

/**
 * Persist activation set and/or starred master model.
 * @param {{ activeModels?: string[], masterModel?: string }} payload
 */
function updateState({ activeModels: activeNames, masterModel: newMaster } = {}) {
  if (!activeModels) init();

  const visibleNames = new Set(
    allEntries().filter((m) => isListed(m.name)).map((m) => m.name)
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

/**
 * Add a user-pasted OpenRouter model id to the visible Free/Paid list.
 * Persists immediately. Does not rewrite the catalog file. New rows start disabled.
 * @param {{ name?: string, type?: string }} payload
 * @returns {{ ok: true, model: object } | { ok: false, error: string }}
 */
function addCustomModel({ name: rawName, type } = {}) {
  if (!activeModels) init();

  if (type !== "Free" && type !== "Paid") {
    return { ok: false, error: "Invalid type." };
  }

  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) {
    return { ok: false, error: "Model name is empty." };
  }

  const inCatalog = catalogNameSet().has(name);
  const inCustom = customModels.some((m) => m.name === name);
  const listed = isListed(name) && (inCatalog || inCustom);

  if (listed) {
    return { ok: false, error: "Model already in the list." };
  }

  if (removedModels.has(name)) {
    removedModels.delete(name);
    if (!inCatalog && !inCustom) {
      customModels.push({ name, type });
    }
    saveState();
    const entry = findEntry(name);
    console.log(`[model-config] Restored model: ${name}`);
    return { ok: true, model: entry ? toUiRow(entry) : toUiRow({ name, type }) };
  }

  customModels.push({ name, type });
  saveState();
  console.log(`[model-config] Added custom model: ${name} (${type})`);
  return { ok: true, model: toUiRow({ name, type }) };
}

module.exports = {
  init,
  getModelsWithState,
  getActiveModelIds,
  getMasterModelRuntimeId,
  getCatalogEntriesByType,
  recordBenchmarkResult,
  recordProbeError,
  deleteModel,
  addCustomModel,
  updateState,
};
