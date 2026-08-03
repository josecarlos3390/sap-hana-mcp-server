/**
 * License manager for the HANA MCP Server.
 *
 * Supports two license formats:
 *  1. Short alphanumeric license key (e.g. ABCD-EFGH-IJKL-MNOP) validated online
 *     against a license server (HANA_LICENSE_SERVER_URL).
 *  2. Legacy signed JWT token validated locally with the bundled public key.
 *
 * If no license is provided, the server runs in demo mode for 7 days.
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { getHardwareId } = require('./hardware-id');
const { logger } = require('../utils/logger');
const { redactSecrets } = require('../utils/sensitive-redact');

const PUBLIC_KEY_PATH = path.join(__dirname, 'public-key.pem');
const LICENSE_FILE = path.join(process.cwd(), '.hana-license');
const LICENSE_CACHE_FILE = path.join(process.cwd(), '.hana-license-cache.json');
const DEMO_DAYS = 7;

class LicenseManager {
  constructor() {
    this.publicKey = null;
    this.license = null;
    this.status = 'UNVERIFIED';
    this.details = {};
    this.onlineValidated = false;
  }

  loadPublicKey() {
    try {
      this.publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    } catch (err) {
      throw new Error(`License public key not found at ${PUBLIC_KEY_PATH}`);
    }
  }

  getLicenseToken() {
    if (process.env.HANA_LICENSE_KEY) {
      return process.env.HANA_LICENSE_KEY.trim();
    }
    if (fs.existsSync(LICENSE_FILE)) {
      return fs.readFileSync(LICENSE_FILE, 'utf8').trim();
    }
    return null;
  }

  getHardwareId() {
    return getHardwareId();
  }

  isJwt(token) {
    return typeof token === 'string' && token.split('.').length === 3 && token.length > 100;
  }

  verifyToken(token) {
    return jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
  }

  decodeUnsafe(token) {
    return jwt.decode(token);
  }

  readLicenseCache() {
    try {
      if (fs.existsSync(LICENSE_CACHE_FILE)) {
        return JSON.parse(fs.readFileSync(LICENSE_CACHE_FILE, 'utf8'));
      }
    } catch (err) {
      logger.warn('Failed to read license cache:', err.message);
    }
    return null;
  }

  writeLicenseCache(cache) {
    try {
      fs.writeFileSync(LICENSE_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
      logger.warn('Failed to write license cache:', err.message);
    }
  }

  async validateOnline(licenseKey) {
    const url = process.env.HANA_LICENSE_SERVER_URL;
    if (!url) {
      throw new Error('HANA_LICENSE_SERVER_URL is required for short license keys');
    }

    const validateUrl = url.replace(/\/$/, '') + '/api/license/validate';

    const response = await axios.post(
      validateUrl,
      {
        license_key: licenseKey,
        hwid: this.getHardwareId(),
        product_code: process.env.HANA_LICENSE_PRODUCT_CODE || 'hana-b1'
      },
      {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (!response.data || response.data.active !== true) {
      throw new Error(response.data?.message || 'Online license validation returned inactive');
    }

    this.onlineValidated = true;

    // Cache successful online response for offline grace period
    this.writeLicenseCache({
      timestamp: Date.now(),
      data: response.data
    });

    return response.data;
  }

  canUseCachedLicense() {
    const cache = this.readLicenseCache();
    if (!cache || !cache.timestamp || !cache.data) return false;

    const maxAgeHours = parseFloat(process.env.HANA_LICENSE_OFFLINE_GRACE_HOURS || '72');
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    return Date.now() - cache.timestamp < maxAgeMs;
  }

  applyOnlinePayload(payload) {
    const expiresAt = payload.expires_at ? new Date(payload.expires_at) : null;
    const now = new Date();
    const expired = expiresAt && expiresAt < now;

    this.details.plan = payload.plan || 'standard';
    this.details.exp = expiresAt ? Math.floor(expiresAt.getTime() / 1000) : null;
    this.details.features = Array.isArray(payload.features) ? payload.features : ['hana'];
    this.details.licenseKey = payload.license_key;
    this.details.hwid = payload.hwid;
    this.details.productCode = payload.product_code;

    if (expired) {
      this.status = 'EXPIRED';
      this.details.message = `License expired on ${expiresAt.toISOString()}. Running in offline knowledge-base mode.`;
      logger.warn(this.details.message);
    } else {
      this.status = 'VALID';
      this.details.message = `License valid. Plan: ${this.details.plan}. Expires: ${expiresAt ? expiresAt.toISOString() : 'never'}`;
      logger.info(this.details.message);
    }
  }

  async validate() {
    const licenseKey = this.getLicenseToken();
    const onlineUrl = process.env.HANA_LICENSE_SERVER_URL;

    // If no license token, enter demo mode
    if (!licenseKey) {
      const demoExpiry = new Date();
      demoExpiry.setDate(demoExpiry.getDate() + DEMO_DAYS);
      this.status = 'DEMO';
      this.details.plan = 'trial';
      this.details.exp = Math.floor(demoExpiry.getTime() / 1000);
      this.details.features = ['hana'];
      this.details.message = `No license found. Running in demo mode until ${demoExpiry.toISOString()}`;
      logger.warn(this.details.message);
      return this.getStatus();
    }

    // Legacy JWT token: validate locally
    if (this.isJwt(licenseKey)) {
      this.loadPublicKey();
      const hwid = this.getHardwareId();
      this.details.hwid = hwid;

      try {
        const payload = this.verifyToken(licenseKey);
        this.license = payload;

        if (payload.hwid && payload.hwid !== hwid) {
          throw new Error('License is not valid for this machine (hardware ID mismatch)');
        }

        const now = Math.floor(Date.now() / 1000);
        const expired = payload.exp && payload.exp < now;

        this.details.plan = payload.plan || 'standard';
        this.details.exp = payload.exp;
        this.details.features = Array.isArray(payload.features) ? payload.features : ['hana'];

        if (expired) {
          this.status = 'EXPIRED';
          this.details.message = `License expired on ${new Date(payload.exp * 1000).toISOString()}. Running in offline knowledge-base mode.`;
          logger.warn(this.details.message);
        } else {
          this.status = 'VALID';
          this.details.message = `License valid. Plan: ${this.details.plan}. Expires: ${new Date(payload.exp * 1000).toISOString()}`;
          logger.info(this.details.message);
        }
      } catch (err) {
        this.status = 'INVALID';
        this.details.error = err.message;
        this.details.message = `Invalid license: ${err.message}`;
        logger.error(this.details.message);
        throw new Error(this.details.message);
      }

      return this.getStatus();
    }

    // Short alphanumeric license key: validate online
    try {
      const payload = await this.validateOnline(licenseKey);
      this.applyOnlinePayload(payload);
    } catch (onlineErr) {
      // If online validation fails, check if we have a recent cached validation
      if (this.canUseCachedLicense()) {
        logger.warn('Online license validation failed, using cached validation:', redactSecrets(onlineErr.message));
        const cache = this.readLicenseCache();
        this.applyOnlinePayload(cache.data);
        this.onlineValidated = true;
      } else {
        this.status = 'INVALID';
        this.details.error = onlineErr.message;
        this.details.message = `License validation failed: ${onlineErr.message}`;
        logger.error(this.details.message);
        throw new Error(this.details.message);
      }
    }

    // Schedule periodic re-validation if online URL is configured and license is valid
    if (onlineUrl && this.status === 'VALID') {
      this.scheduleRevalidation(licenseKey);
    }

    return this.getStatus();
  }

  scheduleRevalidation(licenseKey) {
    const hours = parseFloat(process.env.HANA_LICENSE_CHECK_INTERVAL_HOURS || '24');
    const intervalMs = hours * 60 * 60 * 1000;

    setInterval(async () => {
      try {
        const payload = await this.validateOnline(licenseKey);
        this.applyOnlinePayload(payload);
        logger.info('Periodic online license validation succeeded');
      } catch (err) {
        logger.error('Periodic online license validation failed:', err.message);
      }
    }, intervalMs);
  }

  getStatus() {
    return {
      status: this.status,
      hwid: this.details.hwid,
      plan: this.details.plan,
      exp: this.details.exp,
      features: this.details.features,
      onlineValidated: this.onlineValidated,
      message: this.details.message,
      error: this.details.error
    };
  }

  hasFeature(feature) {
    if (this.status === 'DEMO') {
      return feature === 'hana';
    }
    if (this.status === 'EXPIRED') {
      // Offline mode: keep local knowledge base readable
      return feature === 'knowledge-base';
    }
    return this.status === 'VALID' && this.details.features.includes(feature);
  }

  isValid() {
    return this.status === 'VALID' || this.status === 'DEMO';
  }

  isExpired() {
    return this.status === 'EXPIRED';
  }
}

module.exports = new LicenseManager();
