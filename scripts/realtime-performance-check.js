#!/usr/bin/env node
/**
 * Real-time performance diagnostics for SAP HANA.
 * Focuses on issues that can affect live database performance:
 * long-running transactions, hot/slow queries in plan cache, and connections.
 */

const QueryExecutor = require('../src/database/query-executor');

async function safeQuery(name, fn) {
  try {
    const result = await fn();
    return { name, ok: true, data: result };
  } catch (err) {
    return { name, ok: false, error: err.message };
  }
}

function fmtSec(micros) {
  if (micros == null) return 'N/A';
  return `${(Number(micros) / 1000000).toFixed(2)} s`;
}

(async () => {
  const checks = await Promise.all([
    safeQuery('Transacciones abiertas', () => QueryExecutor.executeQuery(
      `SELECT HOST,
              PORT,
              CONNECTION_ID,
              TRANSACTION_ID,
              START_TIME,
              SECONDS_BETWEEN(START_TIME, CURRENT_TIMESTAMP) AS DURATION_SEC,
              TRANSACTION_STATUS,
              TRANSACTION_TYPE,
              UPDATE_TRANSACTION_START_TIME,
              CURRENT_STATEMENT_ID
       FROM SYS.M_TRANSACTIONS
       WHERE TRANSACTION_STATUS = 'ACTIVE'
       ORDER BY START_TIME`
    )),

    safeQuery('Top 10 consultas por tiempo total acumulado', () => QueryExecutor.executeQuery(
      `SELECT STATEMENT_HASH,
              LEFT(STATEMENT_STRING, 160) AS STATEMENT_PREVIEW,
              EXECUTION_COUNT,
              TOTAL_EXECUTION_TIME,
              AVG_EXECUTION_TIME,
              MAX_EXECUTION_TIME,
              LAST_EXECUTION_TIMESTAMP,
              APPLICATION_NAME,
              USER_NAME
       FROM SYS.M_SQL_PLAN_CACHE
       ORDER BY TOTAL_EXECUTION_TIME DESC
       LIMIT 10`
    )),

    safeQuery('Top 10 consultas por frecuencia de ejecucion', () => QueryExecutor.executeQuery(
      `SELECT STATEMENT_HASH,
              LEFT(STATEMENT_STRING, 160) AS STATEMENT_PREVIEW,
              EXECUTION_COUNT,
              AVG_EXECUTION_TIME,
              TOTAL_EXECUTION_TIME,
              LAST_EXECUTION_TIMESTAMP,
              APPLICATION_NAME,
              USER_NAME
       FROM SYS.M_SQL_PLAN_CACHE
       ORDER BY EXECUTION_COUNT DESC
       LIMIT 10`
    )),

    safeQuery('Conexiones activas o inactivas largas', () => QueryExecutor.executeQuery(
      `SELECT HOST,
              PORT,
              CONNECTION_ID,
              USER_NAME,
              CLIENT_HOST,
              CLIENT_IP,
              CLIENT_HOST,
              CLIENT_IP,
              CLIENT_PID,
              CONNECTION_STATUS,
              LAST_ACTION,
              CURRENT_SCHEMA_NAME,
              START_TIME,
              SECONDS_BETWEEN(START_TIME, CURRENT_TIMESTAMP) AS CONNECTION_SECONDS
       FROM SYS.M_CONNECTIONS
       WHERE CONNECTION_STATUS != 'IDLE'
          OR (CONNECTION_STATUS = 'IDLE' AND IDLE_TIME > 600)
       ORDER BY CONNECTION_STATUS, START_TIME`
    )),

    safeQuery('Tablas column-store con mayor delta no mergeado', () => QueryExecutor.executeQuery(
      `SELECT HOST,
              PORT,
              SCHEMA_NAME,
              TABLE_NAME,
              MEMORY_SIZE_IN_DELTA,
              MEMORY_SIZE_IN_MAIN,
              MEMORY_SIZE_IN_TOTAL,
              RECORD_COUNT,
              LOADED
       FROM SYS.M_CS_TABLES
       WHERE SCHEMA_NAME = 'RETAIL'
       ORDER BY MEMORY_SIZE_IN_DELTA DESC
       LIMIT 15`
    )),

    safeQuery('Estadisticas de locks y esperas', () => QueryExecutor.executeQuery(
      `SELECT HOST,
              PORT,
              LOCK_OWNER_TRANSACTION_ID,
              BLOCKED_TRANSACTION_ID,
              BLOCKED_CONNECTION_ID,
              WAITING_SCHEMA_NAME,
              WAITING_TABLE_NAME,
              LOCK_TYPE,
              LOCK_MODE,
              BLOCKED_TIME
       FROM SYS.M_BLOCKED_TRANSACTIONS
       ORDER BY BLOCKED_TIME DESC`
    ))
  ]);

  for (const check of checks) {
    console.log(`\n=== ${check.name} ===`);
    if (!check.ok) {
      console.log(`ERROR: ${check.error}`);
      continue;
    }
    if (check.data.length === 0) {
      console.log('No hay datos.');
      continue;
    }

    // Format microsecond columns
    const formatted = check.data.map(row => {
      const obj = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'bigint' || (typeof v === 'number' && !Number.isNaN(v))) {
          if (k === 'DURATION_SEC') {
            obj[k] = `${Number(v).toLocaleString()} s`;
          } else if (k.includes('_TIME') || k.includes('DURATION') || k.includes('MICROS')) {
            obj[k] = fmtSec(v);
          } else {
            obj[k] = Number(v).toLocaleString();
          }
        } else {
          obj[k] = v == null ? 'NULL' : String(v);
        }
      }
      return obj;
    });

    console.table(formatted);
  }
})().catch(err => {
  console.error('Realtime performance check failed:', err.message);
  process.exit(1);
});
