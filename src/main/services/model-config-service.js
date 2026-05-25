const path = require('path');
const fs = require('fs');

const CATALOG_PATH = path.join(__dirname, '../../../models-catalog.json');
const STATE_PATH = path.join(__dirname, '../../../models-state.json');

let catalog = [];        // [{ name, type }] — loaded once from JSON
let activeModels = null; // Set<string> of enabled catalog names

/**
 * Reconstruct the full OpenRouter model ID from a catalog entry.
 * Convention: Free models use the ":free" variant suffix. If the catalog
 * name already contains ":" it already includes a variant tag and is used
 * as-is. Paid models are used without any suffix.
 */
function toRuntimeId(entry) {
  if (entry.name.includes(':')) return entry.name;
  return entry.type === 'Free' ? `${entry.name}:free` : entry.name;
}

function saveState() {
  try {
    const data = { activeModels: Array.from(activeModels) };
    fs.writeFileSync(STATE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[model-config] Failed to save state:', err.message);
  }
}

/**
 * Load catalog and activation state. Called once on app start from main/index.js.
 * Safe to call multiple times (re-initialises each time).
 */
function init() {
  // Load catalog
  try {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      catalog = parsed.filter(
        (m) => m && typeof m.name === 'string' && typeof m.type === 'string'
      );
    }
    console.log(`[model-config] Loaded catalog: ${catalog.length} model(s)`);
  } catch (err) {
    console.error('[model-config] Failed to load catalog:', err.message);
    catalog = [];
  }

  const catalogNames = new Set(catalog.map((m) => m.name));

  // Load persisted activation state
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf-8');
    const state = JSON.parse(raw);
    if (Array.isArray(state.activeModels)) {
      // Accept only names that exist in the current catalog
      const valid = state.activeModels.filter((n) => catalogNames.has(n));
      activeModels = new Set(valid);
      console.log(`[model-config] Loaded state: ${activeModels.size} active model(s)`);
    } else {
      throw new Error('state.activeModels is not an array');
    }
  } catch (_err) {
    // No state file yet — start with nothing selected so the user explicitly
    // chooses which models to activate via the Models popup.
    activeModels = new Set();
    console.log('[model-config] No state file — starting with no active models');
  }
}

/**
 * Returns the full model list with per-model enabled state for the popup UI.
 * @returns {{ name: string, type: string, latency: string, enabled: boolean }[]}
 */
function getModelsWithState() {
  if (!activeModels) init();
  return catalog.map((m) => ({
    name: m.name,
    type: m.type,
    latency: typeof m.latency === 'string' ? m.latency : '',
    enabled: activeModels.has(m.name),
  }));
}

/**
 * Returns runtime model IDs (with :free suffix where applicable) for all
 * currently enabled catalog entries.
 * @returns {string[]}
 */
function getActiveModelIds() {
  if (!activeModels) init();
  const ids = catalog
    .filter((m) => activeModels.has(m.name))
    .map(toRuntimeId);

  return ids;
}

/**
 * Persist a new activation set. Unknown names are silently ignored.
 * An empty array is a valid selection (all models off).
 * @param {string[]} activeNames  Array of catalog model names to enable.
 */
function updateActivation(activeNames) {
  if (!Array.isArray(activeNames)) return;
  if (!activeModels) init();

  const catalogNames = new Set(catalog.map((m) => m.name));
  const validated = activeNames.filter((n) => catalogNames.has(n));

  activeModels = new Set(validated);

  saveState();
  console.log(`[model-config] Activation updated: ${activeModels.size} model(s) active`);
}

module.exports = { init, getModelsWithState, getActiveModelIds, updateActivation };
