#!/usr/bin/env node
/**
 * Comparative health check snapshot for HANA MCP Server.
 * Produces key metrics that can be compared against a previous run.
 */

const { connectionManager } = require('../src/database/connection-manager');
const QueryExecutor = require('../src/database/query-executor');
const { config } = require('../src/utils/config');

function formatBytes(bytes) {
  if (bytes == null || bytes === '') return 'N/A';
  const n = Number(bytes);
  if (Number.isNaN(n)) return String(bytes);
  if (n >= 1099511627776) return `${(n / 1099511627776).toFixed(2)} TB`;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}

async function safeQuery(name, fn) {
  try {
    const result = await fn();
    return { name, ok: true, data: result };
  } catch (err) {
    return { name, ok: false, error: err.message };
  }
}

async function runSnapshot() {
  const hana = config.getHanaConfig();

  if (!config.isHanaConfigured()) {
    console.error('ERROR: HANA configuration is incomplete.');
    process.exit(1);
  }

  const testResult = await connectionManager.testConnection();
  if (!testResult.success) {
    console.error(`ERROR: Connection failed - ${testResult.error}`);
    process.exit(1);
  }

  const checks = await Promise.all([
    safeQuery('db_info', () => QueryExecutor.executeQuery('SELECT DATABASE_NAME, VERSION, SYSTEM_ID, USAGE FROM SYS.M_DATABASE')),
    safeQuery('host_memory', () => QueryExecutor.executeQuery("SELECT VALUE FROM SYS.M_HOST_INFORMATION WHERE KEY IN ('mem_phys','mem_swap','cpu_cores','cpu_summary')")),
    safeQuery('indexserver_memory', () => QueryExecutor.executeQuery("SELECT NAME, VALUE FROM SYS.M_MEMORY WHERE PORT = '30003' AND NAME IN ('SYSTEM_MEMORY_SIZE','SYSTEM_MEMORY_FREE_SIZE','TOTAL_MEMORY_SIZE_IN_USE','HEAP_MEMORY_USED_SIZE','PROCESS_RESIDENT_SIZE')")),
    safeQuery('service_memory', () => QueryExecutor.executeQuery("SELECT SERVICE_NAME, TOTAL_MEMORY_USED_SIZE FROM SYS.M_SERVICE_MEMORY ORDER BY TOTAL_MEMORY_USED_SIZE DESC")),
    safeQuery('top_tables', () => QueryExecutor.executeQuery(`SELECT TABLE_NAME, RECORD_COUNT, TABLE_SIZE FROM SYS.M_TABLES WHERE SCHEMA_NAME = ? ORDER BY TABLE_SIZE DESC LIMIT 5`, [hana.schema])),
    safeQuery('top_rows', () => QueryExecutor.executeQuery(`SELECT TABLE_NAME, RECORD_COUNT FROM SYS.M_TABLES WHERE SCHEMA_NAME = ? ORDER BY RECORD_COUNT DESC LIMIT 5`, [hana.schema])),
    safeQuery('no_pk_count', () => QueryExecutor.executeScalarQuery(`SELECT COUNT(*) FROM SYS.TABLES WHERE SCHEMA_NAME = ? AND HAS_PRIMARY_KEY = 'FALSE'`, [hana.schema])),
    safeQuery('expensive', () => QueryExecutor.executeQuery(`SELECT STATEMENT_HASH, DB_USER, DURATION_MICROSEC, CPU_TIME, MEMORY_SIZE, RECORDS, SUBSTRING(STATEMENT_STRING, 1, 120) AS STATEMENT_PREVIEW FROM SYS.M_EXPENSIVE_STATEMENTS ORDER BY DURATION_MICROSEC DESC LIMIT 5`)),
    safeQuery('blocked', () => QueryExecutor.executeScalarQuery('SELECT COUNT(*) FROM SYS.M_BLOCKED_TRANSACTIONS')),
    safeQuery('record_locks', () => QueryExecutor.executeScalarQuery('SELECT COUNT(*) FROM SYS.M_RECORD_LOCKS')),
    safeQuery('events_unack', () => QueryExecutor.executeScalarQuery("SELECT COUNT(*) FROM SYS.M_EVENTS WHERE ACKNOWLEDGED = 'FALSE'")),
    safeQuery('events_error', () => QueryExecutor.executeScalarQuery("SELECT COUNT(*) FROM SYS.M_EVENTS WHERE STATE = 'ERROR'")),
    safeQuery('disabled_users', () => QueryExecutor.executeQuery("SELECT USER_NAME FROM SYS.USERS WHERE USER_DEACTIVATED = 'TRUE' ORDER BY USER_NAME")),
    safeQuery('table_count', () => QueryExecutor.executeScalarQuery(`SELECT COUNT(*) FROM SYS.TABLES WHERE SCHEMA_NAME = ?`, [hana.schema]))
  ]);

  const snapshot = {
    timestamp: new Date().toISOString(),
    schema: hana.schema
  };

  for (const check of checks) {
    if (!check.ok) {
      snapshot[check.name] = { error: check.error };
      continue;
    }
    snapshot[check.name] = check.data;
  }

  console.log(JSON.stringify(snapshot, null, 2));

  await connectionManager.disconnect();
}

runSnapshot().catch(err => {
  console.error('Snapshot failed:', err.message);
  process.exit(1);
});
