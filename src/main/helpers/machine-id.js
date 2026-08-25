const crypto = require('crypto');
const { execSync } = require('child_process');

/** @type {string | null} */
let cachedMachineId = null;

/** @type {string | null} */
let cachedFallbackUuid = null;

function getOrCreateFallbackUuid() {
  if (!cachedFallbackUuid) {
    cachedFallbackUuid = crypto.randomUUID();
  }
  return cachedFallbackUuid;
}

/**
 * Read Windows MachineGuid from the registry, with in-memory UUID fallback.
 * @returns {{ ok: true, machineId: string } | { ok: false, error: string }}
 */
function getMachineId() {
  if (cachedMachineId) {
    return { ok: true, machineId: cachedMachineId };
  }

  if (process.platform === 'win32') {
    try {
      const stdout = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: 'utf8', windowsHide: true },
      );
      const match = stdout.match(/MachineGuid\s+REG_SZ\s+([^\s\r\n]+)/i);
      const machineId = (match?.[1]?.trim() ?? '').toUpperCase();
      if (machineId) {
        cachedMachineId = machineId;
        return { ok: true, machineId };
      }
    } catch (err) {
      console.warn('[machine-id] failed to read MachineGuid:', err?.message || err);
    }
  } else {
    console.warn('[machine-id] MachineGuid is Windows-only; using in-memory fallback UUID');
  }

  const fallback = getOrCreateFallbackUuid().toUpperCase();
  cachedMachineId = fallback;
  return { ok: true, machineId: fallback };
}

module.exports = { getMachineId };
