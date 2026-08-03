#!/usr/bin/env node

/**
 * HANA MCP Server - Main Entry Point
 *
 * This is a thin wrapper that starts the modular MCP server.
 * The actual implementation is in src/server/index.js
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

// Start the modular server
require('./src/server/index.js');
