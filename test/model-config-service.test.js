'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installElectronStub, freshService, removeDir } = require('./helpers/electron-stub');

/** A Paid catalog entry that exists in models-catalog.json. */
const CATALOG_PAID = 'z-ai/glm-4-32b';
/** A Free catalog entry; its name already carries the `:free` variant tag. */
const CATALOG_FREE = 'openai/gpt-oss-20b:free';

function loadService() {
  const { documents, userData } = installElectronStub();
  const service = freshService('services/model-config-service.js');
  service.init();
  return { service, documents, userData };
}

test('a fresh install starts with no enabled models and no master', () => {
  const { service, documents, userData } = loadService();
  try {
    const rows = service.getModelsWithState();
    assert.ok(rows.length > 0, 'the shipped catalog loads');
    assert.equal(rows.some((m) => m.enabled), false);
    assert.equal(rows.some((m) => m.isMaster), false);
    assert.deepEqual(service.getActiveModelIds(), []);
    assert.equal(service.getMasterModelRuntimeId(), null);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('updateState only accepts listed model names', () => {
  const { service, documents, userData } = loadService();
  try {
    service.updateState({
      activeModels: [CATALOG_PAID, 'totally/made-up'],
      masterModel: CATALOG_PAID,
    });

    assert.deepEqual(service.getActiveModelIds(), [CATALOG_PAID]);
    assert.equal(service.getMasterModelRuntimeId(), CATALOG_PAID);

    service.updateState({ masterModel: 'also/made-up' });
    assert.equal(
      service.getMasterModelRuntimeId(),
      CATALOG_PAID,
      'an unknown master is ignored rather than clearing the current one',
    );

    service.updateState({ masterModel: '' });
    assert.equal(service.getMasterModelRuntimeId(), null, 'an empty string clears the master');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('Free catalog names keep their existing variant tag', () => {
  const { service, documents, userData } = loadService();
  try {
    service.updateState({ activeModels: [CATALOG_FREE] });
    assert.deepEqual(service.getActiveModelIds(), [CATALOG_FREE]);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('a custom Free model gains the :free suffix at runtime', () => {
  const { service, documents, userData } = loadService();
  try {
    const added = service.addCustomModel({ name: 'vendor/custom-a', type: 'Free' });
    assert.equal(added.ok, true);
    assert.equal(added.model.enabled, false, 'new rows start disabled');

    service.updateState({ activeModels: ['vendor/custom-a'] });
    assert.deepEqual(service.getActiveModelIds(), ['vendor/custom-a:free']);
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('addCustomModel rejects bad input and duplicates', () => {
  const { service, documents, userData } = loadService();
  try {
    assert.deepEqual(service.addCustomModel({ name: 'x', type: 'Bogus' }), {
      ok: false,
      error: 'Invalid type.',
    });
    assert.deepEqual(service.addCustomModel({ name: '   ', type: 'Free' }), {
      ok: false,
      error: 'Model name is empty.',
    });
    assert.deepEqual(service.addCustomModel({ name: CATALOG_PAID, type: 'Paid' }), {
      ok: false,
      error: 'Model already in the list.',
    });

    service.addCustomModel({ name: 'vendor/custom-a', type: 'Free' });
    assert.deepEqual(service.addCustomModel({ name: 'vendor/custom-a', type: 'Free' }), {
      ok: false,
      error: 'Model already in the list.',
    });
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('deleting a catalog model hides it and clears its state', () => {
  const { service, documents, userData } = loadService();
  try {
    service.updateState({ activeModels: [CATALOG_PAID], masterModel: CATALOG_PAID });
    service.recordBenchmarkResult(CATALOG_PAID, '1.23s', '99tps');

    assert.deepEqual(service.deleteModel(CATALOG_PAID), { ok: true });

    const names = service.getModelsWithState().map((m) => m.name);
    assert.equal(names.includes(CATALOG_PAID), false, 'hidden from the popup list');
    assert.deepEqual(service.getActiveModelIds(), [], 'enablement is cleared');
    assert.equal(service.getMasterModelRuntimeId(), null, 'master is cleared');
    assert.deepEqual(service.deleteModel(CATALOG_PAID), {
      ok: false,
      error: 'Model not in the list.',
    });
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('deleting a custom model removes the row outright', () => {
  const { service, documents, userData } = loadService();
  try {
    service.addCustomModel({ name: 'vendor/custom-a', type: 'Paid' });
    service.deleteModel('vendor/custom-a');

    const names = service.getModelsWithState().map((m) => m.name);
    assert.equal(names.includes('vendor/custom-a'), false);

    const readded = service.addCustomModel({ name: 'vendor/custom-a', type: 'Paid' });
    assert.equal(readded.ok, true, 'a removed custom name can be added again');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('re-adding a deleted catalog name un-removes it', () => {
  const { service, documents, userData } = loadService();
  try {
    service.deleteModel(CATALOG_PAID);
    const restored = service.addCustomModel({ name: CATALOG_PAID, type: 'Paid' });

    assert.equal(restored.ok, true);
    const names = service.getModelsWithState().map((m) => m.name);
    assert.equal(names.filter((n) => n === CATALOG_PAID).length, 1, 'not duplicated');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('benchmark results and probe errors overlay the catalog row', () => {
  const { service, documents, userData } = loadService();
  try {
    service.recordBenchmarkResult(CATALOG_PAID, '2.50s', '80tps');
    let row = service.getModelsWithState().find((m) => m.name === CATALOG_PAID);
    assert.equal(row.latency, '2.50s');
    assert.equal(row.throughput, '80tps');
    assert.equal(row.probeError, '');

    service.recordProbeError(CATALOG_PAID, 'HTTP 429');
    row = service.getModelsWithState().find((m) => m.name === CATALOG_PAID);
    assert.equal(row.probeError, 'HTTP 429');
    assert.equal(row.latency, '2.50s', 'a failed probe keeps the previous reading');

    service.recordProbeError(CATALOG_PAID, '   ');
    row = service.getModelsWithState().find((m) => m.name === CATALOG_PAID);
    assert.equal(row.probeError, 'Probe failed.', 'blank notes get a default message');

    service.recordBenchmarkResult(CATALOG_PAID, '1.00s', '120tps');
    row = service.getModelsWithState().find((m) => m.name === CATALOG_PAID);
    assert.equal(row.probeError, '', 'a later success clears the error chip');
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('getCatalogEntriesByType returns only the visible rows of one type', () => {
  const { service, documents, userData } = loadService();
  try {
    service.addCustomModel({ name: 'vendor/custom-paid', type: 'Paid' });

    const paid = service.getCatalogEntriesByType('Paid');
    assert.equal(paid.every((m) => m.type === 'Paid'), true);
    assert.equal(paid.some((m) => m.name === 'vendor/custom-paid'), true, 'custom rows are probed too');

    service.deleteModel('vendor/custom-paid');
    assert.equal(
      service.getCatalogEntriesByType('Paid').some((m) => m.name === 'vendor/custom-paid'),
      false,
    );
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});

test('state survives a reload from models-state.json', () => {
  const { service, documents, userData } = loadService();
  try {
    service.addCustomModel({ name: 'vendor/custom-a', type: 'Free' });
    service.updateState({
      activeModels: [CATALOG_PAID, 'vendor/custom-a'],
      masterModel: CATALOG_PAID,
    });
    service.deleteModel(CATALOG_FREE);

    installElectronStub({ documents, userData });
    const reloaded = freshService('services/model-config-service.js');
    reloaded.init();

    assert.deepEqual(reloaded.getActiveModelIds().sort(), [CATALOG_PAID, 'vendor/custom-a:free'].sort());
    assert.equal(reloaded.getMasterModelRuntimeId(), CATALOG_PAID);
    assert.equal(
      reloaded.getModelsWithState().some((m) => m.name === CATALOG_FREE),
      false,
      'removedModels persists',
    );
  } finally {
    removeDir(documents);
    removeDir(userData);
  }
});
