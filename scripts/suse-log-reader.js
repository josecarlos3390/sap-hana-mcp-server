#!/usr/bin/env node
/**
 * Connect to the SUSE server via SSH and read relevant logs.
 * Requires: npm install ssh2
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
      stream.on('close', (code, signal) => {
        resolve({ code, signal, stdout: stdout.trim(), stderr: stderr.trim() });
      });
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

  console.log(`Connected to ${HOST} as ${USER}\n`);

  // Basic system info
  console.log('=== Uptime / load ===');
  const uptime = await exec(conn, 'uptime');
  console.log(uptime.stdout || uptime.stderr);

  // List relevant log directories
  console.log('\n=== /var/log files ===');
  const varlog = await exec(conn, 'ls -lh /var/log/ | grep -E "messages|warn|syslog|secure|audit"');
  console.log(varlog.stdout || varlog.stderr || '(no matching files)');

  // Recent system log entries
  console.log('\n=== Last 50 lines of /var/log/messages ===');
  const messages = await exec(conn, 'tail -n 50 /var/log/messages 2>/dev/null || echo "FILE_NOT_FOUND"');
  console.log(messages.stdout || messages.stderr);

  console.log('\n=== Last 50 lines of /var/log/warn ===');
  const warn = await exec(conn, 'tail -n 50 /var/log/warn 2>/dev/null || echo "FILE_NOT_FOUND"');
  console.log(warn.stdout || warn.stderr);

  // httpd / apache processes and logs
  console.log('\n=== httpd processes ===');
  const httpdProcs = await exec(conn, 'ps aux | grep -E "[h]ttpd|[a]pache" | head -n 20');
  console.log(httpdProcs.stdout || httpdProcs.stderr || '(no httpd processes)');

  console.log('\n=== SAP Business One Service Layer error logs ===');
  const b1ErrorLogs = await exec(conn, 'ls -lht /usr/sap/SAPBusinessOne/ServiceLayer/logs/error_* 2>/dev/null | head -n 20');
  console.log(b1ErrorLogs.stdout || b1ErrorLogs.stderr || '(no B1 Service Layer error logs)');

  console.log('\n=== Last 100 lines of latest Service Layer error log ===');
  const latestB1Err = await exec(conn, 'LATEST=$(ls -t /usr/sap/SAPBusinessOne/ServiceLayer/logs/error_* 2>/dev/null | head -n 1); [ -n "$LATEST" ] && tail -n 100 "$LATEST" || echo "NO_B1_ERROR_LOG"');
  console.log(latestB1Err.stdout || latestB1Err.stderr);

  // HANA trace directory
  console.log('\n=== HANA trace directories ===');
  const hanaTraceDirs = await exec(conn, 'find /usr/sap/NDB -maxdepth 4 -type d -name trace 2>/dev/null');
  console.log(hanaTraceDirs.stdout || hanaTraceDirs.stderr || '(no HANA trace dirs found)');

  console.log('\n=== HANA indexserver trace files ===');
  const hanaTrace = await exec(conn, 'find /usr/sap/NDB -type f -name "indexserver_*.trc" 2>/dev/null | xargs ls -lht 2>/dev/null | head -n 5');
  console.log(hanaTrace.stdout || hanaTrace.stderr || '(no indexserver trace files found)');

  console.log('\n=== Last 50 lines of latest HANA indexserver trace ===');
  const latestTrace = await exec(conn, 'LATEST=$(find /usr/sap/NDB -type f -name "indexserver_*.trc" 2>/dev/null | head -n 1); [ -n "$LATEST" ] && tail -n 50 "$LATEST" || echo "FILE_NOT_FOUND"');
  console.log(latestTrace.stdout || latestTrace.stderr);

  // SAP Business One / Service Layer / B1i logs if present
  console.log('\n=== SAP Business One log directories ===');
  const b1Dirs = await exec(conn, 'find /usr/sap -maxdepth 4 -type d 2>/dev/null | grep -iE "log|trace" | head -n 30');
  console.log(b1Dirs.stdout || b1Dirs.stderr || '(no B1 log dirs found)');

  conn.end();
}

run().catch(err => {
  console.error('SSH connection failed:', err.message);
  process.exit(1);
});
