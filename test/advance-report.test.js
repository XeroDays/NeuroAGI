'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('parseReport reads badges and ignores conversational replies', async () => {
  const { parseReport } = await import('../src/renderer/scripts/advance-report.js');

  assert.equal(parseReport('Just a follow-up answer.'), null);

  const report = parseReport([
    '> **EMERGENCY**',
    '# Pre-doctor Clinical Analysis',
    '## Summary',
    'Burning after meals.',
    '## Diagnostic Confidence',
    'Moderate confidence because the history is short.',
    '## Urgency Classification',
    '- **Soon** — within 1-2 weeks',
    'See https://example.com/reflux for background.',
  ].join('\n'));

  assert.equal(report.emergency, true);
  assert.equal(report.confidence, 'Moderate');
  assert.equal(report.urgency, 'Soon');
  assert.equal(report.sections.some((s) => s.title === 'Summary'), true);
  assert.deepEqual(report.sources, ['https://example.com/reflux']);
});
