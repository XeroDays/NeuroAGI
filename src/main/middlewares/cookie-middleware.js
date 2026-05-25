const modelConfigService = require('../services/model-config-service');

/**
 * Returns the full model catalog with per-model enabled state.
 * Called by the GET_MODELS_CONFIG IPC handler so the renderer can
 * populate the Models popup.
 *
 * @returns {{ name: string, type: string, enabled: boolean }[]}
 */
function GetModelsConfig() {
  console.log('[cookie] GetModelsConfig');
  return modelConfigService.getModelsWithState();
}

/**
 * Persists a new model activation set.
 * Called by the UPDATE_MODELS_CONFIG IPC handler when the user clicks
 * "Update" in the Models popup.
 *
 * @param {{ activeModels: string[] }} payload
 * @returns {{ ok: boolean }}
 */
function UpdateModelsConfig({ activeModels } = {}) {
  console.log('[cookie] UpdateModelsConfig:', { count: Array.isArray(activeModels) ? activeModels.length : 'invalid' });
  modelConfigService.updateActivation(activeModels);
  return { ok: true };
}

module.exports = { GetModelsConfig, UpdateModelsConfig };
