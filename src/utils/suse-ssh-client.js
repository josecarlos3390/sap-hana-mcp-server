/**
 * Shared SSH client for SUSE diagnostic tools.
 *
 * Credentials are read exclusively from environment variables:
 *   SUSE_HOST, SUSE_USER, SUSE_PASSWORD
 *
 * Only a fixed set of read-only diagnostic commands is permitted.
 * Unknown commands and unsafe parameters are rejected to prevent injection.
 */

const { Client } = require('ssh2');
const { logger } = require('./logger');

const ALLOWED_KEX = [
  'diffie-hellman-group-exchange-sha256',
  'diffie-hellman-group14-sha256',
  'diffie-hellman-group14-sha1'
];

/**
 * Fixed catalogue of read-only diagnostic commands.
 * Each builder returns the exact shell command that will be executed.
 * The only dynamic value accepted is a positive integer line count.
 */
const READONLY_COMMANDS = {
  uptime: () => 'uptime',

  varLogFiles: () =>
    `ls -lh /var/log/ | grep -E "messages|warn|syslog|secure|audit"`,

  tailMessages: (lines) =>
    `tail -n ${lines} /var/log/messages 2>/dev/null || echo "FILE_NOT_FOUND"`,

  tailWarn: (lines) =>
    `tail -n ${lines} /var/log/warn 2>/dev/null || echo "FILE_NOT_FOUND"`,

  httpdProcesses: () =>
    `ps aux | grep -E "[h]ttpd|[a]pache" | head -n 20`,

  httpdProcessStatus: () =>
    `ps aux | grep -E "[h]ttpd" | head -n 20`,

  b1slErrorLogFiles: () =>
    `ls -lht /usr/sap/SAPBusinessOne/ServiceLayer/logs/error_* 2>/dev/null | head -n 20`,

  latestB1slErrorLog: (lines) =>
    `LATEST=$(ls -t /usr/sap/SAPBusinessOne/ServiceLayer/logs/error_* 2>/dev/null | head -n 1); ` +
    `[ -n "$LATEST" ] && tail -n ${lines} "$LATEST" || echo "NO_B1_ERROR_LOG"`,

  hanaTraceDirs: () =>
    `find /usr/sap/NDB -maxdepth 4 -type d -name trace 2>/dev/null`,

  hanaIndexserverFiles: () =>
    `find /usr/sap/NDB -type f -name "indexserver_*.trc" 2>/dev/null | xargs ls -lht 2>/dev/null | head -n 5`,

  latestHanaIndexserverTrace: (lines) =>
    `LATEST=$(find /usr/sap/NDB -type f -name "indexserver_*.trc" 2>/dev/null | head -n 1); ` +
    `[ -n "$LATEST" ] && tail -n ${lines} "$LATEST" || echo "FILE_NOT_FOUND"`,

  b1LogDirs: () =>
    `find /usr/sap -maxdepth 4 -type d 2>/dev/null | grep -iE "log|trace" | head -n 30`,

  readSlMemberCommonConfig: () =>
    `cat /usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf 2>/dev/null || echo "FILE_NOT_FOUND"`,

  slVersionFiles: () =>
    `find /usr/sap/SAPBusinessOne/ServiceLayer -maxdepth 2 -type f \\(` +
    ` -iname "*version*" -o -iname "*readme*" -o -iname "*.txt" -o -iname "*.properties" -o -iname "B1ServiceLayer*" \\) ` +
    `2>/dev/null | head -n 30`,

  slVersionStrings: () =>
    `grep -RihE "version|build|patch|release" /usr/sap/SAPBusinessOne/ServiceLayer 2>/dev/null | head -n 30`,

  b1VersionFiles: () =>
    `find /usr/sap/SAPBusinessOne -maxdepth 3 -type f \\(` +
    ` -iname "*version*" -o -iname "*patch*" -o -iname "*build*" \\) ` +
    `2>/dev/null | head -n 30`,

  b1sVersion: () =>
    `cd /usr/sap/SAPBusinessOne/ServiceLayer && ./b1s --version 2>&1 | head -n 50`,

  b1sConf: () =>
    `cat /usr/sap/SAPBusinessOne/ServiceLayer/conf/b1s.conf 2>/dev/null || echo "FILE_NOT_FOUND"`,

  lbConfig: () =>
    `cat /usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb.conf 2>/dev/null | head -n 100`,

  worker50001Config: () =>
    `cat /usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-50001.conf 2>/dev/null | head -n 100`,

  httpdBinaryPath: () =>
    `find /usr/sap/SAPBusinessOne/ServiceLayer -type f -name httpd 2>/dev/null`,

  httpdCompileInfo: () =>
    `/usr/sap/SAPBusinessOne/ServiceLayer/bin/httpd -V 2>/dev/null | head -n 30 || echo "httpd -V failed"`,

  httpdModules: () =>
    `/usr/sap/SAPBusinessOne/ServiceLayer/bin/httpd -M 2>/dev/null | grep -i service || echo "Could not list modules"`,

  httpdLibraries: () =>
    `ldd /usr/sap/SAPBusinessOne/ServiceLayer/bin/httpd 2>/dev/null | head -n 30 || echo "ldd failed"`,

  slLoggerConfigFiles: () =>
    `find /usr/sap/SAPBusinessOne/ServiceLayer -type f \\(` +
    ` -iname "*logger*" -o -iname "*logrotate*" -o -iname "*rotation*" \\) ` +
    `2>/dev/null | head -n 30`,

  recentCrashes: () =>
    `grep -E "malloc_consolidate|double free|SIGABRT|corruption" /usr/sap/SAPBusinessOne/ServiceLayer/logs/error_* 2>/dev/null | tail -n 20`
};

const VALID_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_LINES = 10000;

function validateCommandKey(key) {
  if (typeof key !== 'string' || !VALID_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid SSH diagnostic command key: ${key}`);
  }
  if (!READONLY_COMMANDS[key]) {
    throw new Error(`Unknown SSH diagnostic command: ${key}. Only read-only commands are permitted.`);
  }
}

function sanitizeLines(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LINES) {
    throw new Error(`lines must be an integer between 1 and ${MAX_LINES}`);
  }
  return n;
}

function execCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        return reject(err);
      }

      let stdout = '';
      let stderr = '';

      stream.on('close', (code, signal) => {
        resolve({
          command,
          code,
          signal,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      stream.on('data', (data) => {
        stdout += data;
      });

      stream.stderr.on('data', (data) => {
        stderr += data;
      });

      stream.on('error', (streamErr) => {
        reject(streamErr);
      });
    });
  });
}

class SuseSshClient {
  static _getConfig() {
    const host = process.env.SUSE_HOST;
    const username = process.env.SUSE_USER;
    const password = process.env.SUSE_PASSWORD;

    if (!host || !username || !password) {
      throw new Error(
        'SUSE SSH credentials are not configured. ' +
        'Set SUSE_HOST, SUSE_USER and SUSE_PASSWORD environment variables.'
      );
    }

    return {
      host,
      username,
      password,
      readyTimeout: 30000,
      algorithms: {
        kex: ALLOWED_KEX
      }
    };
  }

  static _connect() {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on('ready', () => resolve(conn));
      conn.on('error', (err) => reject(err));
      conn.connect(this._getConfig());
    });
  }

  /**
   * Open an SSH connection, run the supplied async function, and close it.
   */
  static async withConnection(fn) {
    const conn = await this._connect();
    try {
      return await fn(conn);
    } finally {
      try {
        conn.end();
      } catch (_) {
        // Ignore close errors.
      }
    }
  }

  /**
   * Build a read-only command from a fixed key.
   * Throws if the key is unknown or the parameters are unsafe.
   */
  static buildCommand(key, params = {}) {
    validateCommandKey(key);

    if (params.lines != null) {
      sanitizeLines(params.lines);
    }

    return READONLY_COMMANDS[key](params.lines);
  }

  /**
   * Execute a read-only diagnostic command by key.
   */
  static async exec(conn, key, params = {}) {
    const command = this.buildCommand(key, params);
    logger.debug(`Executing SUSE SSH command: ${key}`);
    return execCommand(conn, command);
  }
}

module.exports = SuseSshClient;
