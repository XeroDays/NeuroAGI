'use strict';

/**
 * The renderer runs as ES modules inside Electron, so `npm test` never loads
 * it. This parses every renderer script so a syntax error cannot ship, and
 * checks that each relative import actually resolves on disk.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPTS_DIR = path.join(__dirname, '..', 'src', 'renderer', 'scripts');
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"](\.[^'"]+)['"]/g;

function listScripts(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listScripts(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const scripts = listScripts(SCRIPTS_DIR);

test('renderer scripts are present', () => {
  assert.ok(scripts.length >= 10, `expected a populated scripts dir, saw ${scripts.length}`);
});

test('every renderer script parses as an ES module', () => {
  // `node --check` infers CommonJS from package.json, so copy to .mjs first.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neuroagi-syntax-'));
  const failures = [];

  try {
    for (const file of scripts) {
      const copy = path.join(tmp, `${path.basename(file, '.js')}-${failures.length}.mjs`);
      fs.copyFileSync(file, copy);
      try {
        execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' });
      } catch (err) {
        const detail = String(err.stderr || err.message).trim();
        failures.push(`${path.relative(SCRIPTS_DIR, file)}\n${detail}`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  assert.deepEqual(failures, []);
});

test('relative imports resolve to files that exist', () => {
  const missing = [];

  for (const file of scripts) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1];
      const resolved = path.resolve(path.dirname(file), specifier);
      if (!fs.existsSync(resolved)) {
        missing.push(`${path.relative(SCRIPTS_DIR, file)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
