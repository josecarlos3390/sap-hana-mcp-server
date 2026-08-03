/**
 * Knowledge base tools for the HANA MCP Server.
 */

const fs = require('fs');
const path = require('path');
const knowledgeBase = require('../knowledge-base');
const { CASES_DIR } = require('../knowledge-base/case-writer');
const { REMOTE_DIR } = require('../knowledge-base/remote-sync');
const licenseManager = require('../licensing/license-manager');

const OFFLINE_MODE_NOTICE = 'Running in offline mode (license expired). Knowledge base is read-only.';

function checkKbLicense() {
  if (!licenseManager.hasFeature('knowledge-base')) {
    throw new Error('Knowledge base feature is not included in the current license. Please upgrade your license.');
  }
}

function checkKbWriteLicense() {
  if (licenseManager.status !== 'VALID' || !licenseManager.details.features.includes('knowledge-base')) {
    throw new Error('Saving knowledge cases requires an active license with the knowledge-base feature.');
  }
}

function getLicenseModeMeta() {
  return licenseManager.isExpired()
    ? { licenseMode: 'offline', notice: OFFLINE_MODE_NOTICE }
    : { licenseMode: 'active' };
}

async function saveKnowledgeCase(args) {
  checkKbWriteLicense();

  const required = ['title'];
  for (const field of required) {
    if (!args[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const { title, symptom, cause, solution, evidence, scripts, lessons, ...meta } = args;

  const result = knowledgeBase.saveCase({
    title,
    symptom,
    cause,
    solution,
    evidence,
    scripts: Array.isArray(scripts) ? scripts : [],
    lessons,
    ...meta
  });

  // Update index automatically
  knowledgeBase.generateIndex();

  return {
    success: true,
    message: `Knowledge case saved to ${result.filepath}`,
    filename: result.filename,
    filepath: result.filepath
  };
}

async function readKnowledgeCase(args) {
  checkKbLicense();

  const { filename } = args || {};
  if (!filename) {
    throw new Error('Missing required field: filename');
  }

  // Search local and remote directories for the requested case
  const candidates = [
    path.join(CASES_DIR, filename),
    path.join(REMOTE_DIR, filename)
  ];

  for (const filepath of candidates) {
    if (fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
      const content = fs.readFileSync(filepath, 'utf8');
      return {
        success: true,
        filename,
        filepath,
        source: path.dirname(filepath) === CASES_DIR ? 'local' : 'remote',
        content,
        ...getLicenseModeMeta()
      };
    }
  }

  throw new Error(`Knowledge case not found: ${filename}`);
}

async function searchKnowledgeBase(args) {
  checkKbLicense();

  const { query, limit = 10 } = args;
  if (!query) {
    throw new Error('Missing required field: query');
  }

  const results = knowledgeBase.search(query, Number(limit));
  return {
    success: true,
    query,
    count: results.length,
    results,
    ...getLicenseModeMeta()
  };
}

async function generateKnowledgeIndex(args) {
  checkKbLicense();

  const result = knowledgeBase.generateIndex();
  return {
    success: true,
    message: `Knowledge base index updated at ${result.indexPath}`,
    casesCount: result.casesCount,
    cases: result.cases.map(c => ({
      filename: c.filename,
      title: c.title,
      date: c.date,
      status: c.status,
      tags: c.tags
    })),
    ...getLicenseModeMeta()
  };
}

async function showLicenseInfo(args) {
  return licenseManager.getStatus();
}

module.exports = {
  saveKnowledgeCase,
  readKnowledgeCase,
  searchKnowledgeBase,
  generateKnowledgeIndex,
  showLicenseInfo
};
