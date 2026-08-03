/**
 * Remote knowledge base synchronization.
 *
 * Downloads Markdown files from a remote repository endpoint on startup
 * and stores them under docs/kb/remote/.
 *
 * Expected remote API:
 *   GET <HANA_KB_REMOTE_URL>/list
 *   Response: [
 *     { path: 'hana/performance.md', name: 'HANA Performance Tuning', version: '1.2', checksum: 'abc...', downloadUrl: '...' },
 *     ...
 *   ]
 *
 *   GET <downloadUrl>
 *   Response: raw Markdown content
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { logger } = require('../utils/logger');

const REMOTE_DIR = path.join(process.cwd(), 'docs', 'kb', 'remote');
const REMOTE_META_FILE = path.join(REMOTE_DIR, '.remote-meta.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function loadRemoteMeta() {
  try {
    if (fs.existsSync(REMOTE_META_FILE)) {
      return JSON.parse(fs.readFileSync(REMOTE_META_FILE, 'utf8'));
    }
  } catch (err) {
    logger.warn('Failed to read remote KB meta:', err.message);
  }
  return { files: {}, lastSync: null };
}

function saveRemoteMeta(meta) {
  try {
    fs.writeFileSync(REMOTE_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  } catch (err) {
    logger.warn('Failed to write remote KB meta:', err.message);
  }
}

function buildUrl(base, ...parts) {
  const url = new URL(base);
  url.pathname = path.posix.join(url.pathname, ...parts);
  return url.toString();
}

async function fetchRemoteList() {
  const baseUrl = process.env.HANA_KB_REMOTE_URL;
  if (!baseUrl) {
    return null;
  }

  const product = process.env.HANA_LICENSE_PRODUCT_CODE || 'hana-b1';
  const listUrl = new URL(baseUrl);
  listUrl.pathname = path.posix.join(listUrl.pathname, 'list');
  listUrl.searchParams.set('product', product);

  const headers = {};
  if (process.env.HANA_KB_REMOTE_API_KEY) {
    headers['X-API-Key'] = process.env.HANA_KB_REMOTE_API_KEY;
  }

  const response = await axios.get(listUrl, { headers, timeout: 15000 });
  return Array.isArray(response.data) ? response.data : [];
}

async function downloadFile(downloadUrl) {
  const headers = {};
  if (process.env.HANA_KB_REMOTE_API_KEY) {
    headers['X-API-Key'] = process.env.HANA_KB_REMOTE_API_KEY;
  }

  const response = await axios.get(downloadUrl, { headers, timeout: 15000, responseType: 'text' });
  return response.data;
}

async function syncRemoteKB() {
  ensureDir(REMOTE_DIR);

  const baseUrl = process.env.HANA_KB_REMOTE_URL;
  if (!baseUrl) {
    logger.info('No remote KB URL configured; skipping remote sync.');
    return { synced: 0, skipped: 0, removed: 0 };
  }

  logger.info('Syncing remote knowledge base from', baseUrl);

  const remoteList = await fetchRemoteList();
  const meta = loadRemoteMeta();
  const syncedFiles = [];
  const skippedFiles = [];
  const currentPaths = new Set();

  for (const item of remoteList) {
    const filePath = item.path || item.name;
    if (!filePath) continue;

    currentPaths.add(filePath);

    const localPath = path.join(REMOTE_DIR, filePath);
    ensureDir(path.dirname(localPath));

    const downloadUrl = item.downloadUrl || buildUrl(baseUrl, 'download', filePath);

    try {
      const content = await downloadFile(downloadUrl);
      const checksum = sha256(content);

      const previous = meta.files[filePath];
      if (previous && previous.checksum === checksum && fs.existsSync(localPath)) {
        skippedFiles.push(filePath);
        continue;
      }

      fs.writeFileSync(localPath, content, 'utf8');
      meta.files[filePath] = {
        version: item.version || null,
        checksum,
        syncedAt: new Date().toISOString()
      };
      syncedFiles.push(filePath);
    } catch (err) {
      logger.error(`Failed to download remote KB file ${filePath}:`, err.message);
    }
  }

  // Remove local remote files that are no longer in the list
  const removedFiles = [];
  for (const localFile of Object.keys(meta.files)) {
    if (!currentPaths.has(localFile)) {
      const localPath = path.join(REMOTE_DIR, localFile);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
      delete meta.files[localFile];
      removedFiles.push(localFile);
    }
  }

  meta.lastSync = new Date().toISOString();
  saveRemoteMeta(meta);

  logger.info(`Remote KB sync complete: ${syncedFiles.length} synced, ${skippedFiles.length} skipped, ${removedFiles.length} removed`);

  return {
    synced: syncedFiles.length,
    skipped: skippedFiles.length,
    removed: removedFiles.length,
    syncedFiles,
    skippedFiles,
    removedFiles
  };
}

function schedulePeriodicSync() {
  const hours = parseFloat(process.env.HANA_KB_SYNC_INTERVAL_HOURS || '24');
  const intervalMs = hours * 60 * 60 * 1000;

  setInterval(async () => {
    try {
      await syncRemoteKB();
    } catch (err) {
      logger.error('Periodic remote KB sync failed:', err.message);
    }
  }, intervalMs);
}

module.exports = {
  syncRemoteKB,
  schedulePeriodicSync,
  REMOTE_DIR
};
