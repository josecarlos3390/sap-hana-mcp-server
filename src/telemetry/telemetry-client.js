/**
 * Telemetry client for the MCP.
 *
 * Sends heartbeats and usage events to the vendor license/telemetry server.
 * Events are sent asynchronously and failures are logged but do not block
 * normal MCP operation.
 */

const axios = require('axios');
const { logger } = require('../utils/logger');
const { getHardwareId } = require('../licensing/hardware-id');

const PRODUCT = process.env.HANA_LICENSE_PRODUCT_CODE || 'hana-b1';
const TELEMETRY_BASE_URL = process.env.HANA_LICENSE_SERVER_URL;
const HEARTBEAT_INTERVAL_MINUTES = parseFloat(process.env.HANA_TELEMETRY_HEARTBEAT_MINUTES || '30');
const TELEMETRY_DISABLED = process.env.HANA_DISABLE_TELEMETRY === 'true';

function getTelemetryUrl(path) {
  if (TELEMETRY_DISABLED || !TELEMETRY_BASE_URL) return null;
  const url = new URL(TELEMETRY_BASE_URL);
  url.pathname = url.pathname.replace(/\/license\/validate\/?$/, '') + path;
  return url.toString();
}

function getHardwareKey() {
  try {
    return getHardwareId();
  } catch (err) {
    return 'unknown';
  }
}

async function sendEvent(eventType, payload = {}) {
  const url = getTelemetryUrl('/telemetry/event');
  if (!url) return;

  try {
    await axios.post(url, {
      hwid: getHardwareKey(),
      product: PRODUCT,
      event_type: eventType,
      payload
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logger.debug('Telemetry event failed:', err.message);
  }
}

async function sendHeartbeat({ version, licenseStatus, features } = {}) {
  const url = getTelemetryUrl('/telemetry/heartbeat');
  if (!url) return;

  try {
    await axios.post(url, {
      hwid: getHardwareKey(),
      product: PRODUCT,
      version: version || require('../../package.json').version,
      license_status: licenseStatus || 'unknown',
      features: Array.isArray(features) ? features : []
    }, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logger.debug('Heartbeat failed:', err.message);
  }
}

function scheduleHeartbeats({ version, getLicenseStatus, getFeatures }) {
  const intervalMs = HEARTBEAT_INTERVAL_MINUTES * 60 * 1000;

  // Send one heartbeat immediately
  sendHeartbeat({
    version,
    licenseStatus: typeof getLicenseStatus === 'function' ? getLicenseStatus() : undefined,
    features: typeof getFeatures === 'function' ? getFeatures() : []
  });

  // Then periodically
  setInterval(() => {
    sendHeartbeat({
      version,
      licenseStatus: typeof getLicenseStatus === 'function' ? getLicenseStatus() : undefined,
      features: typeof getFeatures === 'function' ? getFeatures() : []
    });
  }, intervalMs);
}

module.exports = {
  sendEvent,
  sendHeartbeat,
  scheduleHeartbeats
};
