const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const hana = require('@sap/hana-client');

const hash = process.argv[2];
if (!hash) {
  console.error('Usage: node get-statement-by-hash.js <STATEMENT_HASH>');
  process.exit(1);
}

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

const conn = hana.createConnection();
conn.connect(params, (err) => {
  if (err) {
    console.error('Connect error:', err.message);
    process.exit(1);
  }

  const sql = `SELECT STATEMENT_HASH, USER_NAME, APPLICATION_NAME, LAST_EXECUTION_TIMESTAMP, STATEMENT_STRING
               FROM M_SQL_PLAN_CACHE
               WHERE STATEMENT_HASH = ?`;
  const stmt = conn.prepare(sql);
  stmt.execQuery([hash], (err, rs) => {
    if (err) {
      console.error('Query error:', err.message);
      conn.disconnect();
      process.exit(1);
    }
    while (rs.next()) {
      const row = rs.getValues();
      const out = [];
      out.push(`HASH: ${row.STATEMENT_HASH}`);
      out.push(`USER: ${row.USER_NAME}`);
      out.push(`APP: ${row.APPLICATION_NAME}`);
      out.push(`TIME: ${row.LAST_EXECUTION_TIMESTAMP}`);
      out.push('--- SQL ---');
      const sql = String(row.STATEMENT_STRING || '');
      // wrap to avoid console truncation
      for (let i = 0; i < sql.length; i += 150) {
        out.push(sql.substring(i, i + 150));
      }
      const text = out.join('\n');
      console.log(text);
      const file = path.resolve(__dirname, '..', `statement-${row.STATEMENT_HASH}.sql`);
      require('fs').writeFileSync(file, sql, 'utf8');
      console.error(`\n[Saved full SQL to ${file}]`);
    }
    stmt.drop();
    conn.disconnect();
  });
});
