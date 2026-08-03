/**
 * Knowledge base case writer.
 * Stores user-generated incidents as Markdown files under docs/kb/user.
 * Vendor-shipped cases live in docs/kb/bundled and remote cases in docs/kb/remote.
 */

const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(process.cwd(), 'docs', 'kb');
const USER_DIR = path.join(KB_DIR, 'user');
const BUNDLED_DIR = path.join(KB_DIR, 'bundled');
const REMOTE_DIR = path.join(KB_DIR, 'remote');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function formatDate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function formatDateTime(date = new Date()) {
  return date.toISOString();
}

function escapeYaml(value) {
  if (typeof value !== 'string') return value;
  if (value.includes(':') || value.includes('\n') || value.includes('"') || value.includes("'")) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function buildFrontMatter(meta) {
  const lines = ['---'];
  const fields = [
    ['date', meta.date || formatDate()],
    ['datetime', meta.datetime || formatDateTime()],
    ['category', meta.category || 'general'],
    ['status', meta.status || 'open'],
    ['severity', meta.severity || 'low'],
    ['component', meta.component || ''],
    ['sap_note', meta.sap_note || ''],
    ['tags', meta.tags || []]
  ];

  for (const [key, value] of fields) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${escapeYaml(item)}`);
      }
    } else if (value) {
      lines.push(`${key}: ${escapeYaml(value)}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

function saveCase({
  title,
  symptom = '',
  cause = '',
  solution = '',
  evidence = '',
  scripts = [],
  lessons = '',
  ...meta
}) {
  ensureDir(USER_DIR);

  const date = formatDate();
  const slug = slugify(title || 'untitled-case');
  const filename = `${date}-${slug}.md`;
  const filepath = path.join(USER_DIR, filename);

  const frontMatter = buildFrontMatter({ ...meta, date });

  const sections = [
    `# ${title || 'Untitled case'}`,
    '',
    '## Síntoma',
    symptom || '_No documentado_',
    '',
    '## Causa raíz',
    cause || '_No documentada_',
    '',
    '## Solución',
    solution || '_No documentada_',
    '',
    '## Evidencia',
    evidence || '_No documentada_',
    '',
    '## Scripts / herramientas usadas',
    scripts.length > 0 ? scripts.map(s => `- ${s}`).join('\n') : '_Ninguno_',
    '',
    '## Lecciones aprendidas',
    lessons || '_No documentadas_',
    ''
  ];

  const content = `${frontMatter}\n\n${sections.join('\n')}`;
  fs.writeFileSync(filepath, content, 'utf8');

  return { filepath, filename };
}

module.exports = { saveCase, KB_DIR, USER_DIR, BUNDLED_DIR, REMOTE_DIR };
