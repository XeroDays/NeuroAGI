const { execSync } = require('child_process');
const os = require('os');

/**
 * @param {string} arch
 * @returns {string}
 */
function mapOsArchitecture(arch) {
  const a = String(arch || '').toLowerCase();
  if (a === 'x64' || a === 'x86_64' || a === 'amd64') return 'X64';
  if (a === 'ia32' || a === 'x86' || a === 'i386') return 'X86';
  if (a === 'arm64' || a === 'aarch64') return 'ARM64';
  if (a === 'arm') return 'ARM';
  return String(arch || 'Unknown').toUpperCase();
}

/**
 * @param {number} bootMs
 * @returns {string}
 */
function formatRelativeBoot(bootMs) {
  if (!Number.isFinite(bootMs) || bootMs <= 0) return 'unknown';
  const elapsedMs = Math.max(0, Date.now() - bootMs);
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }
  return `${parts.join(' ')} ago`;
}

/**
 * Read a REG_SZ value from the Windows registry.
 * @param {string} keyPath
 * @param {string} valueName
 * @returns {string}
 */
function readRegSz(keyPath, valueName) {
  if (process.platform !== 'win32') return '';
  try {
    const stdout = execSync(`reg query "${keyPath}" /v ${valueName}`, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    const re = new RegExp(`${valueName}\\s+REG_SZ\\s+([^\\r\\n]+)`, 'i');
    const match = stdout.match(re);
    return match?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * @returns {{ processor: string, osName: string, osVersion: string, lastBootAgo: string }}
 */
function readSystemFacts() {
  const cpus = os.cpus();
  const processor = (cpus?.[0]?.model || '').trim() || 'Unknown';

  const productName = readRegSz(
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'ProductName',
  );
  const currentBuild = readRegSz(
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'CurrentBuild',
  );
  const displayVersion = readRegSz(
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
    'DisplayVersion',
  );

  // Match sample style: 10.0.19045 (major.minor.build)
  const release = os.release() || '';
  let osVersion = release;
  if (currentBuild && /^\d+\.\d+/.test(release)) {
    const majorMinor = release.split('.').slice(0, 2).join('.');
    osVersion = `${majorMinor}.${currentBuild}`;
  } else if (displayVersion) {
    osVersion = displayVersion;
  }

  const uptimeSec = os.uptime();
  const bootMs = Number.isFinite(uptimeSec)
    ? Date.now() - Math.floor(uptimeSec * 1000)
    : NaN;

  return {
    processor,
    osName: productName || 'Unknown',
    osVersion: osVersion || 'Unknown',
    lastBootAgo: formatRelativeBoot(bootMs),
  };
}

/**
 * @returns {{ width: number, height: number, monitors: number }}
 */
function readDisplayFacts() {
  try {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const width = primary?.size?.width || 0;
    const height = primary?.size?.height || 0;
    return {
      width,
      height,
      monitors: Array.isArray(displays) ? displays.length : 0,
    };
  } catch {
    return { width: 0, height: 0, monitors: 0 };
  }
}

/**
 * Build Softasium DeviceInfo string in the licensed-app sample format.
 * @param {string} deviceIdUpper Uppercase MachineGuid
 * @returns {string}
 */
function buildDeviceInfoString(deviceIdUpper) {
  const hostname = os.hostname() || 'Unknown';
  const deviceId = String(deviceIdUpper || '').trim().toUpperCase() || 'Unknown';
  const system = readSystemFacts();
  const display = readDisplayFacts();
  const resolution = display.width && display.height
    ? `${display.width} x ${display.height}`
    : 'Unknown';
  const monitors = display.monitors > 0 ? String(display.monitors) : 'Unknown';
  const arch = mapOsArchitecture(process.arch || os.arch());

  // Double-space separators; empty "Device Info:" value → two spaces before OS Name.
  return [
    `Name: ${hostname}`,
    `Device ID: ${deviceId}`,
    `Processor: ${system.processor}`,
    'Device Info:',
    `Operating System Name: ${system.osName}`,
    `Version: ${system.osVersion}`,
    `Last Boot Up Time: ${system.lastBootAgo}`,
    `Screen Resolution: ${resolution}`,
    `Number of Monitors: ${monitors}`,
    `OS Architecture: ${arch}`,
  ].join('  ');
}

module.exports = {
  buildDeviceInfoString,
  mapOsArchitecture,
  formatRelativeBoot,
};
