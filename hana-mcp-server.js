#!/usr/bin/env node

/**
 * HANA MCP Server - Main Entry Point
 *
 * This is a thin wrapper that starts the modular MCP server.
 * The actual implementation is in src/server/index.js
 *
 * When invoked with license-management arguments the executable also acts as
 * the license menu, so clients can activate/transfer licenses without having
 * Node.js installed.
 */

const path = require('path');

// When packaged as an .exe with pkg, make all filesystem-relative paths
// (docs/kb, .env, scripts, license cache, audit logs, etc.) resolve next
// to the binary instead of the caller's working directory.
if (process.pkg) {
  process.chdir(path.dirname(process.execPath));
}

// Load environment variables from .env file early, before any other module
require('dotenv').config();

const licenseArgs = new Set([
  '--license-menu',
  '--show-hwid',
  '--redeem',
  '--activate',
  '--license-info',
  '--transfer',
  '-h',
  '-r',
  '-a',
  '-i'
]);

function isLicenseInvocation() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return false;
  }
  // Support both "hana-mcp-server.exe --license-menu" and direct license flags.
  if (args.includes('--license-menu')) {
    return true;
  }
  for (const arg of args) {
    if (licenseArgs.has(arg)) {
      return true;
    }
  }
  return false;
}

if (isLicenseInvocation()) {
  // Remove the --license-menu sentinel so license-menu.js sees the real flags.
  const args = process.argv.slice(2).filter((a) => a !== '--license-menu');
  process.argv = [process.argv[0], process.argv[1], ...args];
  require('./scripts/license-menu.js');
} else {
  // Start the modular server
  require('./src/server/index.js');
}
