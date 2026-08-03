/**
 * Knowledge base index manager.
 * Scans docs/kb/cases (local) and docs/kb/remote (downloaded from cloud)
 * and generates docs/kb/index.md.
 */

const fs = require('fs');
const path = require('path');
const { CASES_DIR, KB_DIR } = require('./case-writer');
const { REMOTE_DIR } = require('./remote-sync');

function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const lines = match[1].split('\n');
  const meta = {};
  let currentKey = null;

  for (const line of lines) {
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey) {
      meta[currentKey].push(arrayMatch[1].replace(/^"(.*)"$/, '$1'));
      continue;
    }

    const kvMatch = line.match(/^([^:]+):\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      let value = kvMatch[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value);
        } catch (_) {
          value = value.slice(1, -1).split(',').map(s => s.trim());
        }
      }
      meta[key] = Array.isArray(value) ? value : value;
      currentKey = Array.isArray(value) ? key : null;
    }
  }

  return { meta, body: match[2] };
}

function listCasesInDir(dir, sourceLabel) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  return files.map(filepath => {
    const content = fs.readFileSync(filepath, 'utf8');
    const { meta, body } = parseFrontMatter(content);
    const titleMatch = body.match(/^#\s+(.+)$/m);
    // Relative path under docs/kb/<source>/
    const relative = path.relative(dir, filepath).replace(/\\/g, '/');
    return {
      filename: relative,
      filepath,
      source: sourceLabel,
      title: titleMatch ? titleMatch[1] : relative,
      ...meta
    };
  });
}

function listCases() {
  const localCases = listCasesInDir(CASES_DIR, 'local');
  const remoteCases = listCasesInDir(REMOTE_DIR, 'remote');
  return [...localCases, ...remoteCases].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function generateIndex() {
  const cases = listCases();
  const indexPath = path.join(KB_DIR, 'index.md');

  const localCases = cases.filter(c => c.source === 'local');
  const remoteCases = cases.filter(c => c.source === 'remote');

  const lines = [
    '# Base de conocimiento',
    '',
    `Última actualización: ${new Date().toISOString()}`,
    '',
    `Total de casos: ${cases.length} (${localCases.length} locales, ${remoteCases.length} remotos)`,
    '',
    '## Índice de casos locales',
    ''
  ];

  if (localCases.length === 0) {
    lines.push('_No hay casos locales documentados aún._');
  } else {
    for (const c of localCases) {
      const tags = Array.isArray(c.tags) && c.tags.length > 0 ? ` 🏷️ ${c.tags.join(', ')}` : '';
      const status = c.status ? ` [${c.status}]` : '';
      const severity = c.severity ? ` (${c.severity})` : '';
      const sapNote = c.sap_note ? ` — SAP Note: ${c.sap_note}` : '';
      lines.push(`- **${c.date}** — [${c.title}](cases/${c.filename})${status}${severity}${sapNote}${tags}`);
    }
  }

  lines.push('', '## Índice de casos remotos (de la nube)', '');

  if (remoteCases.length === 0) {
    lines.push('_No hay casos remotos sincronizados aún._');
  } else {
    for (const c of remoteCases) {
      const tags = Array.isArray(c.tags) && c.tags.length > 0 ? ` 🏷️ ${c.tags.join(', ')}` : '';
      const status = c.status ? ` [${c.status}]` : '';
      const severity = c.severity ? ` (${c.severity})` : '';
      const sapNote = c.sap_note ? ` — SAP Note: ${c.sap_note}` : '';
      lines.push(`- **${c.date}** — [${c.title}](remote/${c.filename})${status}${severity}${sapNote}${tags}`);
    }
  }

  lines.push('', '---', '');
  lines.push('Este índice se regenera automáticamente al guardar un nuevo caso, sincronizar KB remota o ejecutar `hana_generate_kb_index`.');

  fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');
  return { indexPath, casesCount: cases.length, cases };
}

module.exports = { listCases, generateIndex, parseFrontMatter };
