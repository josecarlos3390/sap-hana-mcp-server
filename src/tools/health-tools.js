/**
 * Health monitoring tools for HANA MCP Server.
 */

const { logger } = require('../utils/logger');
const { config } = require('../utils/config');
const QueryExecutor = require('../database/query-executor');
const Formatters = require('../utils/formatters');

class HealthTools {
  static _formatBytes(bytes) {
    if (bytes == null || bytes === '') return null;
    const n = Number(bytes);
    if (Number.isNaN(n)) return String(bytes);
    if (n >= 1099511627776) return `${(n / 1099511627776).toFixed(2)} TB`;
    if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
    if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
    return `${n} B`;
  }

  static async _safeQuery(name, fn) {
    try {
      const data = await fn();
      return { name, ok: true, data };
    } catch (err) {
      logger.warn(`Health section "${name}" failed: ${err.message}`);
      return { name, ok: false, error: err.message };
    }
  }

  static _resolveSchema(args) {
    return (args && args.schema_name) || config.getHanaConfig().schema || '';
  }

  static async healthCheck(args = {}) {
    logger.tool('hana_health_check');
    const schema = HealthTools._resolveSchema(args);

    const db = await HealthTools._safeQuery('database_info', () =>
      QueryExecutor.executeQuery('SELECT DATABASE_NAME, VERSION, SYSTEM_ID, USAGE FROM SYS.M_DATABASE')
    );

    const services = await HealthTools._safeQuery('services', () =>
      QueryExecutor.executeQuery('SELECT SERVICE_NAME, PORT, ACTIVE_STATUS FROM SYS.M_SERVICES ORDER BY SERVICE_NAME')
    );

    const mem = await HealthTools._safeQuery('memory', () =>
      QueryExecutor.executeQuery(
        "SELECT NAME, VALUE FROM SYS.M_MEMORY WHERE PORT = '30003' AND NAME IN ('SYSTEM_MEMORY_SIZE','TOTAL_MEMORY_SIZE_IN_USE','GLOBAL_ALLOCATION_LIMIT','EFFECTIVE_PROCESS_ALLOCATION_LIMIT')"
      )
    );

    const topTables = await HealthTools._safeQuery('top_tables_by_size', () =>
      QueryExecutor.executeQuery(
        'SELECT SCHEMA_NAME, TABLE_NAME, RECORD_COUNT, TABLE_SIZE FROM SYS.M_TABLES WHERE SCHEMA_NAME = ? ORDER BY TABLE_SIZE DESC LIMIT 5',
        [schema]
      )
    );

    const blocked = await HealthTools._safeQuery('blocked_transactions', () =>
      QueryExecutor.executeQuery('SELECT COUNT(*) AS C FROM SYS.M_BLOCKED_TRANSACTIONS')
    );

    const result = {
      schema,
      timestamp: new Date().toISOString(),
      database_info: HealthTools._getSection([db], 'database_info'),
      services: HealthTools._getSection([services], 'services'),
      memory: HealthTools._getSection([mem], 'memory'),
      top_tables_by_size: HealthTools._getSection([topTables], 'top_tables_by_size'),
      blocked_transactions: HealthTools._getSection([blocked], 'blocked_transactions')
    };

    return Formatters.createStructuredResponse(result, 'HANA Health Check');
  }

  static _getSection(checks, name) {
    const check = checks.find(c => c.name === name);
    if (!check) return { ok: false, error: 'Section not found' };
    if (!check.ok) return { ok: false, error: check.error };
    return { ok: true, data: check.data };
  }

  static async memoryMonitor(args = {}) {
    logger.tool('hana_memory_monitor');

    const saveHistory = args && args.save_history === true;
    const outputFile = args && args.output_file ? String(args.output_file) : null;

    const memoryRows = await QueryExecutor.executeQuery(
      `SELECT NAME, VALUE FROM SYS.M_MEMORY WHERE PORT = '30003' AND NAME IN (
        'SYSTEM_MEMORY_SIZE', 'SYSTEM_MEMORY_FREE_SIZE', 'PROCESS_RESIDENT_SIZE',
        'HEAP_MEMORY_USED_SIZE', 'TOTAL_MEMORY_SIZE_IN_USE',
        'COMPACTORS_SIZE', 'COMPACTORS_FREEABLE_SIZE'
      )`
    );

    const memMap = {};
    for (const row of memoryRows) {
      memMap[row.NAME] = Number(row.VALUE);
    }

    const limitRows = await QueryExecutor.executeQuery(
      `SELECT NAME, VALUE FROM SYS.M_MEMORY WHERE PORT = '30003' AND NAME IN (
        'GLOBAL_ALLOCATION_LIMIT', 'EFFECTIVE_PROCESS_ALLOCATION_LIMIT'
      )`
    );
    const limitMap = {};
    for (const row of limitRows) {
      limitMap[row.NAME] = Number(row.VALUE);
    }

    const serviceRows = await QueryExecutor.executeQuery(
      "SELECT TOTAL_MEMORY_USED_SIZE FROM SYS.M_SERVICE_MEMORY WHERE SERVICE_NAME = 'indexserver'"
    );
    const serviceTotalUsed = serviceRows.length > 0 ? Number(serviceRows[0].TOTAL_MEMORY_USED_SIZE) : null;

    const totalUsed = memMap.TOTAL_MEMORY_SIZE_IN_USE || 0;
    const globalLimit = limitMap.GLOBAL_ALLOCATION_LIMIT || 1;
    const effectiveLimit = limitMap.EFFECTIVE_PROCESS_ALLOCATION_LIMIT || 1;
    const usedPctGlobal = globalLimit > 0 ? Number(((totalUsed / globalLimit) * 100).toFixed(2)) : 0;
    const usedPctEffective = effectiveLimit > 0 ? Number(((totalUsed / effectiveLimit) * 100).toFixed(2)) : 0;

    let alert = null;
    if (usedPctEffective > 85) {
      alert = { level: 'critical', message: 'Memory usage exceeds 85% of the effective allocation limit.' };
    } else if (usedPctEffective > 70) {
      alert = { level: 'warning', message: 'Memory usage is between 70% and 85%. Monitor closely.' };
    } else {
      alert = { level: 'ok', message: 'Memory usage is within acceptable ranges.' };
    }

    const result = {
      timestamp: new Date().toISOString(),
      metrics: {
        system_memory_size: memMap.SYSTEM_MEMORY_SIZE,
        system_memory_size_formatted: HealthTools._formatBytes(memMap.SYSTEM_MEMORY_SIZE),
        system_memory_free_size: memMap.SYSTEM_MEMORY_FREE_SIZE,
        system_memory_free_size_formatted: HealthTools._formatBytes(memMap.SYSTEM_MEMORY_FREE_SIZE),
        process_resident_size: memMap.PROCESS_RESIDENT_SIZE,
        process_resident_size_formatted: HealthTools._formatBytes(memMap.PROCESS_RESIDENT_SIZE),
        heap_memory_used_size: memMap.HEAP_MEMORY_USED_SIZE,
        heap_memory_used_size_formatted: HealthTools._formatBytes(memMap.HEAP_MEMORY_USED_SIZE),
        total_memory_in_use: totalUsed,
        total_memory_in_use_formatted: HealthTools._formatBytes(totalUsed),
        compactors_size: memMap.COMPACTORS_SIZE,
        compactors_size_formatted: HealthTools._formatBytes(memMap.COMPACTORS_SIZE),
        compactors_freeable_size: memMap.COMPACTORS_FREEABLE_SIZE,
        compactors_freeable_size_formatted: HealthTools._formatBytes(memMap.COMPACTORS_FREEABLE_SIZE),
        global_allocation_limit: limitMap.GLOBAL_ALLOCATION_LIMIT,
        global_allocation_limit_formatted: HealthTools._formatBytes(limitMap.GLOBAL_ALLOCATION_LIMIT),
        effective_allocation_limit: limitMap.EFFECTIVE_PROCESS_ALLOCATION_LIMIT,
        effective_allocation_limit_formatted: HealthTools._formatBytes(limitMap.EFFECTIVE_PROCESS_ALLOCATION_LIMIT),
        service_total_memory_used: serviceTotalUsed,
        service_total_memory_used_formatted: HealthTools._formatBytes(serviceTotalUsed)
      },
      usage_percent: {
        global: usedPctGlobal,
        effective: usedPctEffective
      },
      alert
    };

    if (saveHistory) {
      const file = outputFile || process.env.HANA_MEMORY_HISTORY_FILE || require('path').join(process.cwd(), 'memory-history.csv');
      HealthTools._appendMemoryHistory(file, result);
      result.history_file = file;
    }

    return Formatters.createStructuredResponse(result, 'HANA Memory Monitor');
  }

  static _appendMemoryHistory(file, result) {
    const fs = require('fs');
    const header = 'timestamp,system_memory_size,system_memory_free_size,process_resident_size,heap_memory_used_size,total_memory_in_use,compactors_size,compactors_freeable_size,global_allocation_limit,effective_allocation_limit,service_total_memory_used,used_pct_global,used_pct_effective\n';
    const line = [
      result.timestamp,
      result.metrics.system_memory_size,
      result.metrics.system_memory_free_size,
      result.metrics.process_resident_size,
      result.metrics.heap_memory_used_size,
      result.metrics.total_memory_in_use,
      result.metrics.compactors_size,
      result.metrics.compactors_freeable_size,
      result.metrics.global_allocation_limit,
      result.metrics.effective_allocation_limit,
      result.metrics.service_total_memory_used,
      result.usage_percent.global,
      result.usage_percent.effective
    ].join(',') + '\n';

    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, header, { encoding: 'utf8' });
    }
    fs.appendFileSync(file, line, { encoding: 'utf8' });
  }

  static async realtimePerformance(args = {}) {
    logger.tool('hana_realtime_performance');
    const schema = HealthTools._resolveSchema(args);

    const openTx = await HealthTools._safeQuery('open_transactions', () =>
      QueryExecutor.executeQuery(
        `SELECT HOST, PORT, CONNECTION_ID, TRANSACTION_ID, START_TIME,
                SECONDS_BETWEEN(START_TIME, CURRENT_TIMESTAMP) AS DURATION_SEC,
                TRANSACTION_STATUS, TRANSACTION_TYPE
         FROM SYS.M_TRANSACTIONS
         WHERE TRANSACTION_STATUS = 'ACTIVE'
         ORDER BY START_TIME LIMIT 10`
      )
    );

    const topTime = await HealthTools._safeQuery('top_queries_by_total_time', () =>
      QueryExecutor.executeQuery(
        `SELECT STATEMENT_HASH,
                LEFT(STATEMENT_STRING, 120) AS STATEMENT_PREVIEW,
                EXECUTION_COUNT, TOTAL_EXECUTION_TIME, AVG_EXECUTION_TIME,
                APPLICATION_NAME, USER_NAME
         FROM SYS.M_SQL_PLAN_CACHE
         ORDER BY TOTAL_EXECUTION_TIME DESC LIMIT 5`
      )
    );

    const topFreq = await HealthTools._safeQuery('top_queries_by_frequency', () =>
      QueryExecutor.executeQuery(
        `SELECT STATEMENT_HASH,
                LEFT(STATEMENT_STRING, 120) AS STATEMENT_PREVIEW,
                EXECUTION_COUNT, AVG_EXECUTION_TIME, TOTAL_EXECUTION_TIME,
                APPLICATION_NAME, USER_NAME
         FROM SYS.M_SQL_PLAN_CACHE
         ORDER BY EXECUTION_COUNT DESC LIMIT 5`
      )
    );

    const longConn = await HealthTools._safeQuery('long_connections', () =>
      QueryExecutor.executeQuery(
        `SELECT HOST, PORT, CONNECTION_ID, USER_NAME, CLIENT_HOST, CLIENT_IP,
                CONNECTION_STATUS, LAST_ACTION, START_TIME,
                SECONDS_BETWEEN(START_TIME, CURRENT_TIMESTAMP) AS CONNECTION_SECONDS
         FROM SYS.M_CONNECTIONS
         WHERE CONNECTION_STATUS != 'IDLE'
            OR (CONNECTION_STATUS = 'IDLE' AND IDLE_TIME > 600)
         ORDER BY CONNECTION_STATUS, START_TIME LIMIT 10`
      )
    );

    const deltas = await HealthTools._safeQuery('column_store_deltas', () =>
      QueryExecutor.executeQuery(
        `SELECT HOST, PORT, SCHEMA_NAME, TABLE_NAME, MEMORY_SIZE_IN_DELTA,
                MEMORY_SIZE_IN_MAIN, MEMORY_SIZE_IN_TOTAL, RECORD_COUNT, LOADED
         FROM SYS.M_CS_TABLES
         WHERE SCHEMA_NAME = ?
         ORDER BY MEMORY_SIZE_IN_DELTA DESC LIMIT 5`,
        [schema]
      )
    );

    const blocked = await HealthTools._safeQuery('blocked_transactions', () =>
      QueryExecutor.executeQuery(
        `SELECT HOST, PORT, LOCK_OWNER_TRANSACTION_ID, BLOCKED_TRANSACTION_ID,
                BLOCKED_CONNECTION_ID, WAITING_SCHEMA_NAME, WAITING_TABLE_NAME,
                LOCK_TYPE, LOCK_MODE, BLOCKED_TIME
         FROM SYS.M_BLOCKED_TRANSACTIONS
         ORDER BY BLOCKED_TIME DESC LIMIT 5`
      )
    );

    const result = {
      schema,
      timestamp: new Date().toISOString(),
      open_transactions: HealthTools._getSection([openTx], 'open_transactions'),
      top_queries_by_total_time: HealthTools._getSection([topTime], 'top_queries_by_total_time'),
      top_queries_by_frequency: HealthTools._getSection([topFreq], 'top_queries_by_frequency'),
      long_connections: HealthTools._getSection([longConn], 'long_connections'),
      column_store_deltas: HealthTools._getSection([deltas], 'column_store_deltas'),
      blocked_transactions: HealthTools._getSection([blocked], 'blocked_transactions')
    };

    return Formatters.createStructuredResponse(result, 'HANA Realtime Performance');
  }
}

module.exports = HealthTools;
