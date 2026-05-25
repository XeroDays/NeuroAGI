const modelConfigService = require('../services/model-config-service');

/**
 * Returns the full model catalog with per-model enabled state.
 * Called by the GET_MODELS_CONFIG IPC handler so the renderer can
 * populate the Models popup.
 *
 * @returns {{ name: string, type: string, latency: string, throughput: string, enabled: boolean, isMaster: boolean }[]}
 */
function GetModelsConfig() {
  console.log('[cookie] GetModelsConfig');
  return modelConfigService.getModelsWithState();
}

/**
 * Persists model activation set and starred master model.
 * Called by the UPDATE_MODELS_CONFIG IPC handler when the user clicks
 * "Update" in the Models popup.
 *
 * @param {{ activeModels: string[], masterModel?: string }} payload
 * @returns {{ ok: boolean }}
 */
function UpdateModelsConfig({ activeModels, masterModel } = {}) {
  console.log('[cookie] UpdateModelsConfig:', {
    count: Array.isArray(activeModels) ? activeModels.length : 'invalid',
    masterModel: masterModel ?? '(unchanged)',
  });
  modelConfigService.updateState({ activeModels, masterModel });
  return { ok: true };
}

module.exports = { GetModelsConfig, UpdateModelsConfig };
