/**
 * SUSE server diagnostic tools for the HANA MCP Server.
 *
 * These tools connect via SSH to the SUSE host where SAP Business One
 * Service Layer and/or HANA run, and perform read-only inspection of
 * logs, configuration files and process status.
 *
 * Credentials are read from environment variables:
 *   SUSE_HOST, SUSE_USER, SUSE_PASSWORD
 */

const { logger } = require('../utils/logger');
const SuseSshClient = require('../utils/suse-ssh-client');
const Formatters = require('../utils/formatters');

const DEFAULT_LINES = 50;
const CONFIG_FILE_PATH = '/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf';

function resolveLines(args) {
  const value = args && (args.lines != null ? args.lines : undefined);
  return Number(value) || DEFAULT_LINES;
}

function resolveBoolean(args, snakeKey, camelKey, defaultValue) {
  if (!args) return defaultValue;
  if (args[snakeKey] !== undefined) return args[snakeKey] !== false;
  if (args[camelKey] !== undefined) return args[camelKey] !== false;
  return defaultValue;
}

async function hanaSuseReadLogs(args = {}) {
  logger.tool('hana_suse_read_logs');

  const lines = resolveLines(args);
  const serviceLayer = resolveBoolean(args, 'service_layer', 'serviceLayer', true);
  const hana = resolveBoolean(args, 'hana', 'hana', true);

  const sections = await SuseSshClient.withConnection(async (conn) => {
    const result = {};

    result.uptime = await SuseSshClient.exec(conn, 'uptime');
    result.var_log_files = await SuseSshClient.exec(conn, 'varLogFiles');
    result.messages = await SuseSshClient.exec(conn, 'tailMessages', { lines });
    result.warn = await SuseSshClient.exec(conn, 'tailWarn', { lines });
    result.httpd_processes = await SuseSshClient.exec(conn, 'httpdProcesses');

    if (serviceLayer) {
      result.b1sl_error_log_files = await SuseSshClient.exec(conn, 'b1slErrorLogFiles');
      result.latest_b1sl_error_log = await SuseSshClient.exec(conn, 'latestB1slErrorLog', { lines });
    }

    if (hana) {
      result.hana_trace_dirs = await SuseSshClient.exec(conn, 'hanaTraceDirs');
      result.hana_indexserver_files = await SuseSshClient.exec(conn, 'hanaIndexserverFiles');
      result.latest_hana_indexserver_trace = await SuseSshClient.exec(conn, 'latestHanaIndexserverTrace', { lines });
    }

    result.b1_log_directories = await SuseSshClient.exec(conn, 'b1LogDirs');

    return result;
  });

  return Formatters.createStructuredResponse({
    host: process.env.SUSE_HOST,
    timestamp: new Date().toISOString(),
    lines,
    service_layer: serviceLayer,
    hana,
    sections
  }, 'SUSE Server Diagnostic Logs');
}

async function hanaSuseReadConfig(args = {}) {
  logger.tool('hana_suse_read_config');

  const result = await SuseSshClient.withConnection(async (conn) =>
    SuseSshClient.exec(conn, 'readSlMemberCommonConfig')
  );

  return Formatters.createStructuredResponse({
    host: process.env.SUSE_HOST,
    file_path: CONFIG_FILE_PATH,
    command: result.command,
    code: result.code,
    content: result.stdout,
    stderr: result.stderr
  }, 'Service Layer Prefork Member Config');
}

async function hanaSuseCheckServiceLayer(args = {}) {
  logger.tool('hana_suse_check_service_layer');

  const keys = [
    'slVersionFiles',
    'slVersionStrings',
    'b1VersionFiles',
    'b1sVersion',
    'b1sConf',
    'lbConfig',
    'worker50001Config',
    'httpdBinaryPath',
    'httpdCompileInfo',
    'httpdModules',
    'httpdLibraries',
    'slLoggerConfigFiles',
    'recentCrashes',
    'httpdProcessStatus'
  ];

  const sections = await SuseSshClient.withConnection(async (conn) => {
    const result = {};
    for (const key of keys) {
      result[key] = await SuseSshClient.exec(conn, key);
    }
    return result;
  });

  return Formatters.createStructuredResponse({
    host: process.env.SUSE_HOST,
    timestamp: new Date().toISOString(),
    sections
  }, 'Service Layer Version and Status');
}

module.exports = {
  hanaSuseReadLogs,
  hanaSuseReadConfig,
  hanaSuseCheckServiceLayer
};
