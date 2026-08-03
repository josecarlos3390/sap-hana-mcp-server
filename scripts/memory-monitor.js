#!/usr/bin/env node
/**
 * Memory monitor snapshot for HANA indexserver.
 * Appends one CSV line per run to memory-history.csv
 */

const fs = require('fs');
const path = require('path');
const { connectionManager } = require('../src/database/connection-manager');
const QueryExecutor = require('../src/database/query-executor');
const { config } = require('../src/utils/config');

const OUTPUT_FILE = process.env.MEMORY_MONITOR_OUTPUT || path.join(__dirname, 'memory-history.csv');

function formatBytes(bytes) {
  if (bytes == null) return '';
  const n = Number(bytes);
  if (Number.isNaN(n)) return String(bytes);
  if (n >= 1099511627776) return `${(n / 1099511627776).toFixed(2)} TB`;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${n} B`;
}

async function runSnapshot() {
  if (!config.isHanaConfigured()) {
    console.error('ERROR: HANA configuration is incomplete.');
    process.exit(1);
  }

  const testResult = await connectionManager.testConnection();
  if (!testResult.success) {
    console.error(`ERROR: Connection failed - ${testResult.error}`);
    process.exit(1);
  }

  // Get memory metrics for indexserver (port 30003)
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

  // Get allocation limits from memory view
  const limitRows = await QueryExecutor.executeQuery(
    `SELECT NAME, VALUE FROM SYS.M_MEMORY WHERE PORT = '30003' AND NAME IN (
      'GLOBAL_ALLOCATION_LIMIT', 'EFFECTIVE_PROCESS_ALLOCATION_LIMIT'
    )`
  );
  const limitMap = {};
  for (const row of limitRows) {
    limitMap[row.NAME] = Number(row.VALUE);
  }

  // Get service total used
  const serviceRows = await QueryExecutor.executeQuery(
    `SELECT TOTAL_MEMORY_USED_SIZE FROM SYS.M_SERVICE_MEMORY WHERE SERVICE_NAME = 'indexserver'`
  );

  const svc = serviceRows.length > 0 ? serviceRows[0] : {};

  const now = new Date().toISOString();
  const totalUsed = memMap.TOTAL_MEMORY_SIZE_IN_USE || 0;
  const globalLimit = Number(limitMap.GLOBAL_ALLOCATION_LIMIT) || 1;
  const effectiveLimit = Number(limitMap.EFFECTIVE_PROCESS_ALLOCATION_LIMIT) || 1;
  const usedPctGlobal = globalLimit > 0 ? ((totalUsed / globalLimit) * 100).toFixed(2) : 0;
  const usedPctEffective = effectiveLimit > 0 ? ((totalUsed / effectiveLimit) * 100).toFixed(2) : 0;

  const csvLine = [
    now,
    memMap.SYSTEM_MEMORY_SIZE || '',
    memMap.SYSTEM_MEMORY_FREE_SIZE || '',
    memMap.PROCESS_RESIDENT_SIZE || '',
    memMap.HEAP_MEMORY_USED_SIZE || '',
    totalUsed,
    memMap.COMPACTORS_SIZE || '',
    memMap.COMPACTORS_FREEABLE_SIZE || '',
    limitMap.GLOBAL_ALLOCATION_LIMIT || '',
    limitMap.EFFECTIVE_PROCESS_ALLOCATION_LIMIT || '',
    svc.TOTAL_MEMORY_USED_SIZE || '',
    usedPctGlobal,
    usedPctEffective
  ].join(',') + '\n';

  const header = 'timestamp,system_memory_size,system_memory_free_size,process_resident_size,heap_memory_used_size,total_memory_in_use,compactors_size,compactors_freeable_size,global_allocation_limit,effective_allocation_limit,service_total_memory_used,used_pct_global,used_pct_effective\n';

  // Write header if file doesn't exist
  if (!fs.existsSync(OUTPUT_FILE)) {
    fs.writeFileSync(OUTPUT_FILE, header, { encoding: 'utf8' });
  }

  fs.appendFileSync(OUTPUT_FILE, csvLine, { encoding: 'utf8' });

  // Print human-readable summary
  console.log('=================================================');
  console.log(`Memory snapshot: ${now}`);
  console.log('=================================================');
  console.log(`System memory total : ${formatBytes(memMap.SYSTEM_MEMORY_SIZE)}`);
  console.log(`System memory free  : ${formatBytes(memMap.SYSTEM_MEMORY_FREE_SIZE)}`);
  console.log(`Process resident    : ${formatBytes(memMap.PROCESS_RESIDENT_SIZE)}`);
  console.log(`Heap used           : ${formatBytes(memMap.HEAP_MEMORY_USED_SIZE)}`);
  console.log(`Total memory in use : ${formatBytes(totalUsed)}`);
  console.log(`Compactors size     : ${formatBytes(memMap.COMPACTORS_SIZE)}`);
  console.log(`Compactors freeable : ${formatBytes(memMap.COMPACTORS_FREEABLE_SIZE)}`);
  console.log(`Global alloc limit  : ${formatBytes(limitMap.GLOBAL_ALLOCATION_LIMIT)}`);
  console.log(`Effective alloc lim : ${formatBytes(limitMap.EFFECTIVE_PROCESS_ALLOCATION_LIMIT)}`);
  console.log(`Service total used  : ${formatBytes(svc.TOTAL_MEMORY_USED_SIZE)}`);
  console.log(`Used vs global limit: ${usedPctGlobal}%`);
  console.log(`Used vs effective   : ${usedPctEffective}%`);
  console.log('');
  console.log(`Saved to: ${OUTPUT_FILE}`);

  if (Number(usedPctEffective) > 85) {
    console.log('⚠️  ALERTA: Uso de memoria supera el 85% del límite efectivo.');
  } else if (Number(usedPctEffective) > 70) {
    console.log('🟡 AVISO: Uso de memoria entre 70% y 85%. Monitorear de cerca.');
  } else {
    console.log('✅ Uso de memoria dentro de rangos aceptables.');
  }

  await connectionManager.disconnect();
}

runSnapshot().catch(err => {
  console.error('Memory monitor failed:', err.message);
  process.exit(1);
});
