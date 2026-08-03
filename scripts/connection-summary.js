#!/usr/bin/env node
/**
 * Aggregate summary of current HANA connections.
 */

const QueryExecutor = require('../src/database/query-executor');

(async () => {
  const statusSummary = await QueryExecutor.executeQuery(
    `SELECT CONNECTION_STATUS, COUNT(*) AS CONNECTION_COUNT
     FROM SYS.M_CONNECTIONS
     GROUP BY CONNECTION_STATUS
     ORDER BY CONNECTION_COUNT DESC`
  );
  console.log('=== Conexiones por estado ===');
  console.table(statusSummary);

  const userSummary = await QueryExecutor.executeQuery(
    `SELECT USER_NAME, COUNT(*) AS CONNECTION_COUNT
     FROM SYS.M_CONNECTIONS
     GROUP BY USER_NAME
     ORDER BY CONNECTION_COUNT DESC
     LIMIT 15`
  );
  console.log('\n=== Top usuarios por cantidad de conexiones ===');
  console.table(userSummary);

  const oldConnections = await QueryExecutor.executeQuery(
    `SELECT HOST, PORT, CONNECTION_ID, USER_NAME, CLIENT_HOST, CLIENT_IP, CONNECTION_STATUS, START_TIME,
            SECONDS_BETWEEN(START_TIME, CURRENT_TIMESTAMP) AS AGE_SECONDS
     FROM SYS.M_CONNECTIONS
     WHERE CONNECTION_STATUS = '' OR CONNECTION_STATUS IS NULL OR CONNECTION_STATUS = 'IDLE'
     ORDER BY START_TIME
     LIMIT 20`
  );
  console.log('\n=== Conexiones más antiguas (vacías/IDLE) ===');
  console.table(oldConnections.map(r => ({
    ...r,
    AGE_SECONDS: Number(r.AGE_SECONDS).toLocaleString()
  })));
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
