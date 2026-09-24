/**
 * Turns a Pre-doctor report into sections. Conversational replies return null
 * so the caller keeps the plain bubble.
 */

const TITLE = '# Pre-doctor Clinical Analysis';

const SECTION_TITLES = [
  'Summary',
  'Key Findings From Your Information',
  'Leading Clinical Impression',
  'Contributing Factors (If Applicable)',
  'Diagnostic Confidence',
  'Possible Explanations',
  'Medication Recommendations',
  'Urgency Classification',
];

export function parseReport(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n');
  if (!text.includes(TITLE)) return null;

  const emergency = /^>\s*\*\*EMERGENCY\*\*/m.test(text);
  const sections = [];
  const pattern = /^#{2,3}\s+(.+)$/gm;
  const marks = [];
  let match;
  while ((match = pattern.exec(text))) {
    marks.push({ title: match[1].trim(), index: match.index, end: pattern.lastIndex });
  }

  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].end;
    const stop = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(start, stop).trim();
    if (SECTION_TITLES.includes(marks[i].title) || marks[i].title) {
      sections.push({ title: marks[i].title, body, id: slug(marks[i].title) });
    }
  }

  const confidence = badgeFrom(sections, 'Diagnostic Confidence', ['High', 'Moderate', 'Low']);
  const urgency = badgeFrom(sections, 'Urgency Classification', ['Urgent', 'Soon', 'Routine']);
  const sources = [...text.matchAll(/https?:\/\/[^\s)]+/g)].map((item) => item[0]);

  return {
    emergency,
    confidence,
    urgency,
    sections: sections.filter((section) => SECTION_TITLES.includes(section.title)),
    sources: [...new Set(sources)],
    raw: text,
  };
}

function badgeFrom(sections, title, words) {
  const section = sections.find((item) => item.title === title);
  if (!section) return '';
  const hit = words.find((word) => new RegExp(`\\b${word}\\b`, 'i').test(section.body));
  return hit || '';
}

function slug(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function reportBadgeClass(kind, value) {
  const token = String(value || '').toLowerCase();
  return `adv-report-badge adv-report-badge--${kind} adv-report-badge--${token || 'none'}`;
}
