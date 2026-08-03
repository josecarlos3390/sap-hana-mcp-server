const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const hana = require('@sap/hana-client');
const fs = require('fs');

const bpCode = process.argv[2] || 'T1IVCL156626';
const outputFile = path.resolve(__dirname, '..', `bp-balance-capture-${Date.now()}.txt`);

function buildConnectionParams() {
  const params = {
    serverNode: `${process.env.HANA_HOST}:${process.env.HANA_PORT}`,
    uid: process.env.HANA_USER,
    pwd: process.env.HANA_PASSWORD,
    encrypt: process.env.HANA_ENCRYPT !== 'false',
    sslValidateCertificate: process.env.HANA_VALIDATE_CERT !== 'false'
  };
  if (process.env.HANA_DATABASE_NAME) {
    params.databaseName = process.env.HANA_DATABASE_NAME;
  }
  return params;
}

function execQuery(conn, sql, description) {
  return new Promise((resolve) => {
    const start = Date.now();
    let statement;
    try {
      statement = conn.prepare(sql);
    } catch (err) {
      return resolve({ description, elapsedMs: Date.now() - start, error: err.message, rows: [] });
    }
    statement.execQuery([], (err, rs) => {
      const elapsed = Date.now() - start;
      if (err) {
        statement.drop();
        return resolve({ description, elapsedMs: elapsed, error: err.message, rows: [] });
      }
      const rows = [];
      try {
        while (rs.next()) {
          rows.push(rs.getValues());
        }
      } catch (innerErr) {
        statement.drop();
        return resolve({ description, elapsedMs: elapsed, error: innerErr.message, rows });
      }
      statement.drop();
      resolve({ description, elapsedMs: elapsed, rows });
    });
  });
}

async function main() {
  const conn = hana.createConnection();
  const params = buildConnectionParams();

  await new Promise((resolve, reject) => {
    conn.connect(params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  console.error(`[capture] Connected to ${params.serverNode} as ${params.uid}`);
  console.error(`[capture] Looking for BP code: ${bpCode}`);

  const results = [];

  // 0. Check expensive statement trace configuration
  results.push(await execQuery(conn,
    `SELECT FILE_NAME, SECTION, KEY, VALUE
     FROM M_INIFILE_CONTENTS
     WHERE FILE_NAME = 'indexserver.ini'
       AND SECTION = 'expensive_statement'
     ORDER BY KEY`,
    'EXPENSIVE_STATEMENT_CONFIG'
  ));

  // 1. Recent expensive statements (all users, excluding monitoring queries)
  results.push(await execQuery(conn,
    `SELECT TOP 100
       STATEMENT_ID,
       START_TIME,
       DB_USER,
       APP_USER,
       APPLICATION_NAME,
       APPLICATION_SOURCE,
       DURATION_MICROSEC,
       OPERATION,
       OBJECT_NAME,
       STATEMENT_HASH,
       LEFT(STATEMENT_STRING, 2000) AS STATEMENT_STRING
     FROM M_EXPENSIVE_STATEMENTS
     WHERE STATEMENT_STRING NOT LIKE '%M_EXPENSIVE_STATEMENTS%'
       AND STATEMENT_STRING NOT LIKE '%M_ACTIVE_STATEMENTS%'
       AND STATEMENT_STRING NOT LIKE '%M_SQL_PLAN_CACHE%'
       AND STATEMENT_STRING NOT LIKE '%M_PREPARED_STATEMENTS%'
       AND STATEMENT_STRING NOT LIKE '%M_INIFILE_CONTENTS%'
     ORDER BY START_TIME DESC`,
    'RECENT_EXPENSIVE_STATEMENTS'
  ));

  // 2. Expensive statements containing BP code
  results.push(await execQuery(conn,
    `SELECT TOP 20
       STATEMENT_ID,
       START_TIME,
       DB_USER,
       APP_USER,
       APPLICATION_NAME,
       DURATION_MICROSEC,
       LEFT(STATEMENT_STRING, 2000) AS STATEMENT_STRING
     FROM M_EXPENSIVE_STATEMENTS
     WHERE STATEMENT_STRING LIKE '%${bpCode}%'
     ORDER BY START_TIME DESC`,
    'EXPENSIVE_STATEMENTS_WITH_BP_CODE'
  ));

  // 3. Active statements containing BP code
  results.push(await execQuery(conn,
    `SELECT TOP 20
       STATEMENT_ID,
       LAST_EXECUTED_TIME,
       CONNECTION_ID,
       STATEMENT_STATUS,
       APPLICATION_SOURCE,
       LEFT(STATEMENT_STRING, 2000) AS STATEMENT_STRING
     FROM M_ACTIVE_STATEMENTS
     WHERE STATEMENT_STRING LIKE '%${bpCode}%'
     ORDER BY LAST_EXECUTED_TIME DESC`,
    'ACTIVE_STATEMENTS_WITH_BP_CODE'
  ));

  // 4. SQL plan cache containing BP code
  results.push(await execQuery(conn,
    `SELECT TOP 20
       LAST_EXECUTION_TIMESTAMP,
       USER_NAME,
       SESSION_USER_NAME,
       APPLICATION_NAME,
       APPLICATION_SOURCE,
       STATEMENT_HASH,
       LEFT(STATEMENT_STRING, 2000) AS STATEMENT_STRING,
       EXECUTION_COUNT,
       TOTAL_EXECUTION_TIME
     FROM M_SQL_PLAN_CACHE
     WHERE STATEMENT_STRING LIKE '%${bpCode}%'
     ORDER BY LAST_EXECUTION_TIMESTAMP DESC`,
    'SQL_PLAN_CACHE_WITH_BP_CODE'
  ));

  // 5. SQL plan cache containing B1 balance tables and BP code
  results.push(await execQuery(conn,
    `SELECT TOP 30
       LAST_EXECUTION_TIMESTAMP,
       USER_NAME,
       APPLICATION_NAME,
       APPLICATION_SOURCE,
       STATEMENT_HASH,
       LEFT(STATEMENT_STRING, 2000) AS STATEMENT_STRING,
       EXECUTION_COUNT,
       TOTAL_EXECUTION_TIME
     FROM M_SQL_PLAN_CACHE
     WHERE (STATEMENT_STRING LIKE '%JDT1%' OR STATEMENT_STRING LIKE '%OACT%' OR STATEMENT_STRING LIKE '%OCRD%')
       AND (STATEMENT_STRING LIKE '%${bpCode}%' OR STATEMENT_STRING LIKE '%CardCode%' OR STATEMENT_STRING LIKE '%ShortName%')
     ORDER BY LAST_EXECUTION_TIMESTAMP DESC`,
    'SQL_PLAN_CACHE_BALANCE_TABLES'
  ));

  // 6. Prepared statements containing BP code
  results.push(await execQuery(conn,
    `SELECT TOP 20
       STATEMENT_ID,
       LAST_EXECUTED_TIME,
       CONNECTION_ID,
       STATEMENT_STATUS,
       APPLICATION_SOURCE,
       LEFT(STATEMENT_STRING, 2000) AS STATEMENT_STRING
     FROM M_PREPARED_STATEMENTS
     WHERE STATEMENT_STRING LIKE '%${bpCode}%'
     ORDER BY LAST_EXECUTED_TIME DESC`,
    'PREPARED_STATEMENTS_WITH_BP_CODE'
  ));

  conn.disconnect();

  // Write full output
  const lines = [];
  lines.push(`BP Balance Query Capture`);
  lines.push(`Timestamp: ${new Date().toISOString()}`);
  lines.push(`BP Code: ${bpCode}`);
  lines.push(`Host: ${params.serverNode}`);
  lines.push(`User: ${params.uid}`);
  lines.push(`Database: ${params.databaseName || '(default)'}`);
  lines.push(`=`.repeat(80));

  for (const section of results) {
    lines.push(`\n## ${section.description} (${section.rows.length} rows, ${section.elapsedMs}ms)`);
    if (section.error) {
      lines.push(`ERROR: ${section.error}`);
    }
    lines.push(`-`.repeat(80));
    for (const row of section.rows) {
      for (const [key, value] of Object.entries(row)) {
        const text = value == null ? 'NULL' : String(value);
        lines.push(`${key}: ${text.replace(/\r?\n/g, ' ')}`);
      }
      lines.push(`-`.repeat(80));
    }
  }

  fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');
  console.error(`[capture] Full output written to: ${outputFile}`);

  // Print concise summary to stdout
  for (const section of results) {
    console.error(`\n[${section.description}] ${section.rows.length} rows${section.error ? ' (ERROR: ' + section.error + ')' : ''}`);
    for (let i = 0; i < Math.min(5, section.rows.length); i++) {
      const row = section.rows[i];
      const time = row.START_TIME || row.LAST_EXECUTION_TIMESTAMP || row.LAST_EXECUTED_TIME || '';
      const sql = row.STATEMENT_STRING || row.SQL_STRING || '(no statement)';
      console.error(`  #${i + 1} [${time}]: ${sql.substring(0, 300)}...`);
    }
  }
}

main().catch(err => {
  console.error(`[capture] Error: ${err.message}`);
  process.exit(1);
});
