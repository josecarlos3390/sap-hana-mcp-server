#!/usr/bin/env node
/**
 * Read the Service Layer prefork config file targeted by KBA 3733425.
 */

const { Client } = require('ssh2');

// Connection details can be overridden via environment variables.
// In production / shared environments, set SUSE_HOST, SUSE_USER and SUSE_PASSWORD
// instead of relying on the defaults.
const HOST = process.env.SUSE_HOST || 'hanaroda25.gruporoda.com';
const USER = process.env.SUSE_USER || 'root';
const PASSWORD = process.env.SUSE_PASSWORD || 'B1Admin1$';

function exec(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => resolve({ code, signal, stdout: stdout.trim(), stderr: stderr.trim() }));
      stream.on('data', data => { stdout += data; });
      stream.stderr.on('data', data => { stderr += data; });
    });
  });
}

async function run() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({
      host: HOST,
      username: USER,
      password: PASSWORD,
      readyTimeout: 30000,
      algorithms: {
        kex: ['diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1']
      }
    });
  });

  const file = '/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf';
  console.log(`=== ${file} ===`);
  const result = await exec(conn, `cat ${file} 2>/dev/null || echo FILE_NOT_FOUND`);
  console.log(result.stdout || result.stderr || '(empty)');
  conn.end();
}

run().catch(err => {
  console.error('SSH connection failed:', err.message);
  process.exit(1);
});
