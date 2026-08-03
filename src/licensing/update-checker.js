/**
 * Client-side update checker.
 *
 * Compares the local package version against the latest release published
 * on the vendor license server. Updates are never applied automatically;
 * the user must explicitly confirm via the hana_apply_update tool.
 *
 * The local knowledge base (docs/kb/cases) and configuration files are
 * preserved during an update.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { spawn } = require('child_process');
const { logger } = require('../utils/logger');

const CURRENT_VERSION = require('../../package.json').version;
const PRODUCT = process.env.HANA_LICENSE_PRODUCT_CODE || 'hana-b1';
const UPDATE_CACHE_DIR = path.join(process.cwd(), '.update-cache');
const PENDING_UPDATE_FILE = path.join(process.cwd(), '.pending-update.json');

let cachedRelease = null;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function compareVersions(a, b) {
  const parse = (v) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const ai = av[i] || 0;
    const bi = bv[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

function getVersionUrl() {
  const baseUrl = process.env.HANA_LICENSE_SERVER_URL;
  if (!baseUrl) {
    return null;
  }
  const url = new URL(baseUrl);
  url.pathname = path.posix.join(url.pathname, '..', '..', 'version');
  url.searchParams.set('product', PRODUCT);
  return url.toString();
}

async function fetchLatestRelease() {
  const url = getVersionUrl();
  if (!url) {
    throw new Error('HANA_LICENSE_SERVER_URL is not configured');
  }
  const response = await axios.get(url, { timeout: 15000 });
  return response.data;
}

async function checkForUpdates() {
  try {
    const release = await fetchLatestRelease();
    cachedRelease = release;

    if (!release || !release.version) {
      return { updateAvailable: false };
    }

    const comparison = compareVersions(release.version, CURRENT_VERSION);
    if (comparison <= 0) {
      return {
        updateAvailable: false,
        currentVersion: CURRENT_VERSION,
        latestVersion: release.version
      };
    }

    logger.info(`Update available: ${CURRENT_VERSION} -> ${release.version}`);

    return {
      updateAvailable: true,
      currentVersion: CURRENT_VERSION,
      latestVersion: release.version,
      downloadUrl: release.download_url,
      checksum: release.checksum,
      mandatory: release.is_mandatory,
      releaseNotes: release.release_notes
    };
  } catch (err) {
    logger.warn('Update check failed:', err.message);
    return { updateAvailable: false, error: err.message };
  }
}

async function downloadUpdate(release) {
  ensureDir(UPDATE_CACHE_DIR);
  const filename = path.basename(new URL(release.download_url).pathname) || `update-${release.version}.zip`;
  const localPath = path.join(UPDATE_CACHE_DIR, filename);

  logger.info(`Downloading update ${release.version} from ${release.download_url}`);
  const response = await axios.get(release.download_url, {
    responseType: 'stream',
    timeout: 120000
  });

  const writer = fs.createWriteStream(localPath);
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  if (release.checksum) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
    if (hash !== release.checksum) {
      fs.unlinkSync(localPath);
      throw new Error('Update checksum mismatch');
    }
  }

  return localPath;
}

function writePendingUpdate(packagePath, release) {
  fs.writeFileSync(PENDING_UPDATE_FILE, JSON.stringify({
    version: release.version,
    packagePath,
    appliedAt: null,
    createdAt: new Date().toISOString()
  }, null, 2), 'utf8');
}

function launchUpdater(packagePath) {
  const isWindows = process.platform === 'win32';
  const updater = isWindows
    ? path.join(__dirname, '..', '..', 'scripts', 'update-client.ps1')
    : path.join(__dirname, '..', '..', 'scripts', 'update-client.sh');

  if (!fs.existsSync(updater)) {
    throw new Error('Updater script not found; update cannot be applied automatically.');
  }

  logger.info('Launching updater and exiting to release locked files...');
  const child = isWindows
    ? spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', updater, '-PackagePath', packagePath], {
        detached: true,
        stdio: 'ignore'
      })
    : spawn('bash', [updater, packagePath], { detached: true, stdio: 'ignore' });

  child.unref();
}

async function applyUpdate({ confirm } = {}) {
  if (!confirm) {
    throw new Error('Update not confirmed. Call hana_apply_update with confirm: true.');
  }

  const release = cachedRelease || await fetchLatestRelease();
  if (!release || compareVersions(release.version, CURRENT_VERSION) <= 0) {
    throw new Error('No newer update is available.');
  }

  const packagePath = await downloadUpdate(release);
  writePendingUpdate(packagePath, release);
  launchUpdater(packagePath);

  return {
    success: true,
    message: `Update ${release.version} downloaded and updater launched. The MCP will close and restart automatically.`,
    packagePath
  };
}

module.exports = {
  checkForUpdates,
  applyUpdate,
  compareVersions,
  CURRENT_VERSION
};
