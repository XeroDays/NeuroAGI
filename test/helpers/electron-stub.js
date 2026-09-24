'use strict';

/**
 * Minimal `electron` stand-in so main-process services can be unit tested
 * under plain Node. Services resolve `require('electron')` to the launcher
 * stub (a path string) outside Electron, so the module is replaced in the
 * require cache before the service under test is loaded.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const ENCRYPT_PREFIX = 'stub-cipher:';
const SRC_MAIN_FRAGMENT = `${path.sep}src${path.sep}main${path.sep}`;

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `neuroagi-${label}-`));
}

function buildStub({ documents, userData, encryptionAvailable }) {
  return {
    app: {
      isPackaged: false,
      getPath(name) {
        if (name === 'documents') return documents;
        if (name === 'downloads') return path.join(userData, 'Downloads');
        return userData;
      },
      getName: () => 'NeuroAGI',
      getVersion: () => '0.0.0-test',
      whenReady: () => Promise.resolve(),
      on() {},
      quit() {},
    },
    safeStorage: {
      isEncryptionAvailable: () => encryptionAvailable,
      encryptString(text) {
        if (!encryptionAvailable) throw new Error('Encryption is not available.');
        const body = Buffer.from(String(text), 'utf-8').toString('base64');
        return Buffer.from(`${ENCRYPT_PREFIX}${body}`, 'utf-8');
      },
      decryptString(buffer) {
        if (!encryptionAvailable) throw new Error('Encryption is not available.');
        const raw = Buffer.from(buffer).toString('utf-8');
        if (!raw.startsWith(ENCRYPT_PREFIX)) throw new Error('Unrecognised ciphertext.');
        return Buffer.from(raw.slice(ENCRYPT_PREFIX.length), 'base64').toString('utf-8');
      },
    },
    BrowserWindow: {
      getAllWindows: () => [],
      fromWebContents: () => null,
    },
    ipcMain: { handle() {}, on() {}, removeHandler() {} },
    Menu: { setApplicationMenu() {} },
    shell: { openPath: async () => '', openExternal: async () => {} },
    dialog: {
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true }),
    },
    Notification: class StubNotification {
      static isSupported() { return false; }
      show() {}
      on() {}
    },
  };
}

/**
 * Install the stub and return the temp directories it is backed by.
 * @param {{ documents?: string, userData?: string, encryptionAvailable?: boolean }} [options]
 */
function installElectronStub(options = {}) {
  const documents = options.documents || makeTempDir('documents');
  const userData = options.userData || makeTempDir('userdata');
  const encryptionAvailable = options.encryptionAvailable !== false;
  const stub = buildStub({ documents, userData, encryptionAvailable });

  const resolved = require.resolve('electron');
  const stubModule = new Module(resolved, null);
  stubModule.filename = resolved;
  stubModule.loaded = true;
  stubModule.exports = stub;
  require.cache[resolved] = stubModule;

  return { stub, documents, userData };
}

/** Drop every cached `src/main` module so service-level state resets. */
function purgeMainModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(SRC_MAIN_FRAGMENT)) delete require.cache[key];
  }
}

/** Load a main-process service with a clean module state. */
function freshService(relativePath) {
  purgeMainModules();
  return require(path.join(__dirname, '..', '..', 'src', 'main', relativePath));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort cleanup */
  }
}

module.exports = {
  ENCRYPT_PREFIX,
  installElectronStub,
  purgeMainModules,
  freshService,
  makeTempDir,
  removeDir,
};
