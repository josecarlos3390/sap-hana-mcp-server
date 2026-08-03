/**
 * Simple keyword search over the local knowledge base cases.
 */

const fs = require('fs');
const path = require('path');
const { listCases } = require('./index-manager');

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenize(text) {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function search(query, limit = 10) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const cases = listCases();
  const results = [];

  for (const c of cases) {
    const filepath = c.filepath;
    const content = fs.readFileSync(filepath, 'utf8');
    const haystack = normalize(content);

    let score = 0;
    for (const token of queryTokens) {
      const regex = new RegExp(token, 'g');
      const matches = haystack.match(regex);
      if (matches) {
        score += matches.length;
        // Boost title matches
        if (normalize(c.title || '').includes(token)) {
          score += 5;
        }
      }
    }

    if (score > 0) {
      results.push({
        filename: c.filename,
        title: c.title,
        date: c.date,
        status: c.status,
        tags: c.tags,
        score,
        excerpt: haystack.slice(0, 200).replace(/\s+/g, ' ') + '...'
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = { search };
