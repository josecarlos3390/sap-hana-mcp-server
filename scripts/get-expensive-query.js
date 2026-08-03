#!/usr/bin/env node
/**
 * Show execution history of the most expensive statement hash from M_EXPENSIVE_STATEMENTS
 * plus plan-cache stats (execution count, last execution, average time, etc.).
 */

const QueryExecutor = require('../src/database/query-executor');

const STATEMENT_HASH = 'f3e139844a2ef10c36874d679b13987a';

function fmtSec(micros) {
  if (micros == null) return 'N/A';
  return `${(Number(micros) / 1000000).toFixed(2)} s`;
}

(async () => {
  // 1. All occurrences in M_EXPENSIVE_STATEMENTS (when it was slow enough to be recorded)
  const expensiveRows = await QueryExecutor.executeQuery(
    `SELECT STATEMENT_HASH, DB_USER, APPLICATION_NAME, START_TIME,
            DURATION_MICROSEC, CPU_TIME, MEMORY_SIZE, RECORDS
     FROM SYS.M_EXPENSIVE_STATEMENTS
     WHERE STATEMENT_HASH = ?
     ORDER BY START_TIME DESC`,
    [STATEMENT_HASH]
  );

  console.log('=== Apariciones en SYS.M_EXPENSIVE_STATEMENTS ===');
  console.log(`Total de ejecuciones registradas como costosas: ${expensiveRows.length}\n`);

  for (const r of expensiveRows.slice(0, 20)) {
    console.log(
      `- ${r.START_TIME} | ${fmtSec(r.DURATION_MICROSEC)} | ` +
      `CPU ${fmtSec(r.CPU_TIME)} | User ${r.DB_USER} | App ${r.APPLICATION_NAME}`
    );
  }

  if (expensiveRows.length > 0) {
    console.log(`\nÚltima ejecución costosa: ${expensiveRows[0].START_TIME}`);
  }

  // 2. Plan cache stats (overall executions, last execution, average time)
  const planRows = await QueryExecutor.executeQuery(
    `SELECT STATEMENT_HASH,
            STATEMENT_STRING,
            EXECUTION_COUNT,
            LAST_EXECUTION_TIMESTAMP,
            LAST_PREPARATION_TIMESTAMP,
            TOTAL_EXECUTION_TIME,
            AVG_EXECUTION_TIME,
            MIN_EXECUTION_TIME,
            MAX_EXECUTION_TIME,
            TOTAL_RESULT_RECORD_COUNT,
            TOTAL_LOCK_WAIT_DURATION
     FROM SYS.M_SQL_PLAN_CACHE
     WHERE STATEMENT_HASH = ?`,
    [STATEMENT_HASH]
  );

  console.log('\n=== Estadísticas del plan cache (SYS.M_SQL_PLAN_CACHE) ===');
  if (planRows.length === 0) {
    console.log('No se encontró el hash en el plan cache actual (puede haber sido desalojado).');
  } else {
    const p = planRows[0];
    console.log(`Hash:                     ${p.STATEMENT_HASH}`);
    console.log(`Ejecuciones totales:      ${Number(p.EXECUTION_COUNT).toLocaleString()}`);
    console.log(`Última ejecución:         ${p.LAST_EXECUTION_TIMESTAMP}`);
    console.log(`Última preparación:       ${p.LAST_PREPARATION_TIMESTAMP}`);
    console.log(`Tiempo total acumulado:   ${fmtSec(p.TOTAL_EXECUTION_TIME)}`);
    console.log(`Tiempo promedio:          ${fmtSec(p.AVG_EXECUTION_TIME)}`);
    console.log(`Tiempo máximo:            ${fmtSec(p.MAX_EXECUTION_TIME)}`);
    console.log(`Tiempo mínimo:            ${fmtSec(p.MIN_EXECUTION_TIME)}`);
    console.log(`Registros totales:        ${Number(p.TOTAL_RESULT_RECORD_COUNT).toLocaleString()}`);
    console.log(`Lock wait total:          ${fmtSec(p.TOTAL_LOCK_WAIT_DURATION)}`);
  }
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
