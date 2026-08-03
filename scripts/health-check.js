#!/usr/bin/env node
/**
 * Health check script for HANA MCP Server.
 * Runs a set of read-only diagnostic queries against the configured HANA instance.
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

function formatNumber(n) {
  if (n == null) return 'N/A';
  return Number(n).toLocaleString();
}

async function safeQuery(name, fn) {
  try {
    const result = await fn();
    return { name, ok: true, data: result };
  } catch (err) {
    return { name, ok: false, error: err.message };
  }
}

async function runHealthCheck() {
  const hana = config.getHanaConfig();

  console.log('=================================================');
  console.log('     SAP HANA MCP Server - Health Check');
  console.log('=================================================\n');

  console.log('Connection configuration:');
  console.log(`  Host: ${hana.host || 'NOT SET'}`);
  console.log(`  Port: ${hana.port || 'NOT SET'}`);
  console.log(`  User: ${hana.user || 'NOT SET'}`);
  console.log(`  Password: ${hana.password ? 'SET (hidden)' : 'NOT SET'}`);
  console.log(`  Schema: ${hana.schema || 'NOT SET'}`);
  console.log(`  SSL: ${hana.ssl}`);
  console.log(`  Encrypt: ${hana.encrypt}`);
  console.log(`  Validate Cert: ${hana.validateCert}`);
  console.log(`  Detected Type: ${config.getHanaDatabaseType()}\n`);

  if (!config.isHanaConfigured()) {
    console.error('ERROR: HANA configuration is incomplete. Set HANA_HOST, HANA_USER and HANA_PASSWORD.');
    process.exit(1);
  }

  // Test connection
  console.log('Testing connection...');
  const testResult = await connectionManager.testConnection();
  if (!testResult.success) {
    console.error(`ERROR: Connection failed - ${testResult.error}`);
    process.exit(1);
  }
  console.log('  Connection OK\n');

  // Run diagnostic queries in parallel where possible
  const checks = await Promise.all([
    safeQuery('Database info', () => QueryExecutor.executeQuery('SELECT DATABASE_NAME, VERSION, SYSTEM_ID, USAGE FROM SYS.M_DATABASE')),
    safeQuery('Host info', () => QueryExecutor.executeQuery('SELECT HOST, KEY, VALUE FROM SYS.M_HOST_INFORMATION ORDER BY HOST, KEY')),
    safeQuery('Services', () => QueryExecutor.executeQuery('SELECT SERVICE_NAME, PORT, ACTIVE_STATUS, SQL_PORT FROM SYS.M_SERVICES ORDER BY SERVICE_NAME')),
    safeQuery('Memory overview', () => QueryExecutor.executeQuery('SELECT * FROM SYS.M_MEMORY')),
    safeQuery('Service memory', () => QueryExecutor.executeQuery('SELECT HOST, PORT, SERVICE_NAME, LOGICAL_MEMORY_SIZE, PHYSICAL_MEMORY_SIZE, TOTAL_MEMORY_USED_SIZE, HEAP_MEMORY_USED_SIZE, SHARED_MEMORY_USED_SIZE, ALLOCATION_LIMIT FROM SYS.M_SERVICE_MEMORY ORDER BY TOTAL_MEMORY_USED_SIZE DESC')),
    safeQuery('Top tables by size', () => QueryExecutor.executeQuery(`SELECT SCHEMA_NAME, TABLE_NAME, RECORD_COUNT, TABLE_SIZE FROM SYS.M_TABLES WHERE SCHEMA_NAME = ? ORDER BY TABLE_SIZE DESC LIMIT 20`, [hana.schema])),
    safeQuery('Top tables by row count', () => QueryExecutor.executeQuery(`SELECT SCHEMA_NAME, TABLE_NAME, RECORD_COUNT, TABLE_SIZE FROM SYS.M_TABLES WHERE SCHEMA_NAME = ? ORDER BY RECORD_COUNT DESC LIMIT 20`, [hana.schema])),
    safeQuery('Tables without primary key', () => QueryExecutor.executeQuery(`SELECT SCHEMA_NAME, TABLE_NAME, TABLE_TYPE, IS_COLUMN_TABLE FROM SYS.TABLES WHERE SCHEMA_NAME = ? AND HAS_PRIMARY_KEY = 'FALSE' ORDER BY TABLE_NAME`, [hana.schema])),
    safeQuery('Expensive statements', () => QueryExecutor.executeQuery(`SELECT STATEMENT_HASH, DB_USER, APPLICATION_NAME, START_TIME, DURATION_MICROSEC, CPU_TIME, MEMORY_SIZE, RECORDS, SUBSTRING(STATEMENT_STRING, 1, 200) AS STATEMENT_PREVIEW FROM SYS.M_EXPENSIVE_STATEMENTS ORDER BY DURATION_MICROSEC DESC LIMIT 10`)),
    safeQuery('Active statements', () => QueryExecutor.executeQuery('SELECT * FROM SYS.M_ACTIVE_STATEMENTS LIMIT 20')),
    safeQuery('Record locks', () => QueryExecutor.executeQuery('SELECT HOST, PORT, LOCK_OWNER_TRANSACTION_ID, SCHEMA_NAME, TABLE_NAME, LOCK_MODE, ACQUIRED_TIME FROM SYS.M_RECORD_LOCKS LIMIT 20')),
    safeQuery('Blocked transactions', () => QueryExecutor.executeQuery('SELECT HOST, PORT, BLOCKED_TRANSACTION_ID, BLOCKED_CONNECTION_ID, LOCK_OWNER_TRANSACTION_ID, LOCK_OWNER_CONNECTION_ID, BLOCKED_TIME, WAITING_SCHEMA_NAME, WAITING_TABLE_NAME, LOCK_TYPE, LOCK_MODE FROM SYS.M_BLOCKED_TRANSACTIONS LIMIT 20')),
    safeQuery('Users', () => QueryExecutor.executeQuery('SELECT USER_NAME, USER_DEACTIVATED, LAST_SUCCESSFUL_CONNECT, INVALID_CONNECT_ATTEMPTS FROM SYS.USERS ORDER BY USER_NAME')),
    safeQuery('Events', () => QueryExecutor.executeQuery('SELECT HOST, PORT, TYPE, ID, INFOTEXT, CREATE_TIME, STATE, ACKNOWLEDGED FROM SYS.M_EVENTS ORDER BY CREATE_TIME DESC LIMIT 20'))
  ]);

  // Print results
  for (const check of checks) {
    console.log(`\n--- ${check.name} ---`);
    if (!check.ok) {
      console.log(`ERROR: ${check.error}`);
      continue;
    }

    const rows = check.data;
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('No data returned.');
      continue;
    }

    // Print as a simple table
    const keys = Object.keys(rows[0]);
    const formattedRows = rows.map(row => {
      const obj = {};
      for (const key of keys) {
        let v = row[key];
        const ukey = key.toUpperCase();
        if (ukey.includes('BYTES') || (ukey.includes('SIZE') && !ukey.includes('TABLE_SIZE')) || ukey.includes('MEMORY')) {
          obj[key] = formatBytes(v);
        } else if (typeof v === 'number') {
          obj[key] = formatNumber(v);
        } else {
          obj[key] = v == null ? 'NULL' : String(v);
        }
      }
      return obj;
    });
    console.table(formattedRows);
  }

  // Print basic recommendations
  console.log('\n\n=================================================');
  console.log('     Basic Recommendations');
  console.log('=================================================');

  const dbInfo = checks.find(c => c.name === 'Database info');
  if (dbInfo?.ok && dbInfo.data.length > 0) {
    console.log(`Database: ${dbInfo.data[0].DATABASE_NAME} | Version: ${dbInfo.data[0].VERSION} | System ID: ${dbInfo.data[0].SYSTEM_ID} | Usage: ${dbInfo.data[0].USAGE}`);
  }

  const hostInfo = checks.find(c => c.name === 'Host info');
  if (hostInfo?.ok && hostInfo.data.length > 0) {
    const hostMap = {};
    for (const row of hostInfo.data) {
      if (!hostMap[row.HOST]) hostMap[row.HOST] = {};
      hostMap[row.HOST][row.KEY] = row.VALUE;
    }
    for (const [host, vals] of Object.entries(hostMap)) {
      const total = Number(vals.mem_phys) || 0;
      const free = Number(vals.mem_phys) - Number(vals.mem_swap) || 0; // rough
      const usedPct = total > 0 ? ((total - free) / total * 100).toFixed(1) : 0;
      console.log(`Host ${host}:`);
      console.log(`  CPUs: ${vals.cpu_cores || vals.cpu_sockets || 'N/A'} cores (${vals.cpu_summary || 'N/A'})`);
      console.log(`  Physical memory: ${formatBytes(total)} | Swap: ${formatBytes(vals.mem_swap)}`);
      if (usedPct > 90) {
        console.log('  ⚠️  Memory usage is very high.');
      }
    }
  }

  const services = checks.find(c => c.name === 'Services');
  if (services?.ok) {
    const inactive = services.data.filter(s => s.ACTIVE_STATUS !== 'YES');
    if (inactive.length > 0) {
      console.log(`  ⚠️  ${inactive.length} service(s) are not active: ${inactive.map(s => s.SERVICE_NAME).join(', ')}`);
    } else {
      console.log('  ✅ All reported services are active.');
    }
  }

  const memOverview = checks.find(c => c.name === 'Memory overview');
  if (memOverview?.ok && memOverview.data.length > 0) {
    const indexserver = memOverview.data.find(r => String(r.PORT) === '30003' && String(r.NAME) === 'SYSTEM_MEMORY_SIZE');
    if (indexserver) {
      console.log(`  Indexserver system memory: ${formatBytes(indexserver.VALUE)}`);
    }
  }

  const topTables = checks.find(c => c.name === 'Top tables by size');
  if (topTables?.ok && topTables.data.length > 0) {
    const largest = topTables.data[0];
    console.log(`  Largest table in ${hana.schema}: ${largest.TABLE_NAME} (${formatBytes(largest.TABLE_SIZE)}, ${formatNumber(largest.RECORD_COUNT)} rows)`);
  }

  const noPk = checks.find(c => c.name === 'Tables without primary key');
  if (noPk?.ok) {
    if (noPk.data.length > 0) {
      console.log(`  ⚠️  ${noPk.data.length} table(s) in schema ${hana.schema} have no primary key.`);
    } else {
      console.log(`  ✅ All tables in schema ${hana.schema} have a primary key.`);
    }
  }

  const expensive = checks.find(c => c.name === 'Expensive statements');
  if (expensive?.ok && expensive.data.length > 0) {
    const top = expensive.data[0];
    console.log(`  Most expensive statement: ${(Number(top.DURATION_MICROSEC) / 1000000).toFixed(2)}s | User: ${top.DB_USER}`);
  }

  const blocked = checks.find(c => c.name === 'Blocked transactions');
  if (blocked?.ok && blocked.data.length > 0) {
    console.log(`  ⚠️  ${blocked.data.length} blocked transaction(s) detected. Investigate locks and long-running transactions.`);
  } else if (blocked?.ok) {
    console.log('  ✅ No blocked transactions detected.');
  }

  const recordLocks = checks.find(c => c.name === 'Record locks');
  if (recordLocks?.ok && recordLocks.data.length > 0) {
    console.log(`  ⚠️  ${recordLocks.data.length} active record lock(s) detected.`);
  } else if (recordLocks?.ok) {
    console.log('  ✅ No active record locks detected.');
  }

  const events = checks.find(c => c.name === 'Events');
  if (events?.ok && events.data.length > 0) {
    const unack = events.data.filter(e => e.ACKNOWLEDGED === 'FALSE');
    const errors = events.data.filter(e => String(e.STATE).toUpperCase() === 'ERROR');
    if (errors.length > 0) {
      console.log(`  ⚠️  ${errors.length} recent ERROR event(s).`);
    }
    if (unack.length > 0) {
      console.log(`  ℹ️  ${unack.length} unacknowledged event(s).`);
    }
  }

  console.log('\nHealth check completed.');

  await connectionManager.disconnect();
}

runHealthCheck().catch(err => {
  console.error('Health check failed:', err.message);
  process.exit(1);
});
