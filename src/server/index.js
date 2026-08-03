#!/usr/bin/env node

/**
 * Main HANA MCP Server Entry Point
 */

const readline = require('readline');
const { logger } = require('../utils/logger');
const { redactSecrets } = require('../utils/sensitive-redact');
const { lifecycleManager } = require('./lifecycle-manager');
const MCPHandler = require('./mcp-handler');
const { ERROR_CODES } = require('../constants/mcp-constants');
const licenseManager = require('../licensing/license-manager');
const { syncRemoteKB, schedulePeriodicSync } = require('../knowledge-base/remote-sync');
const { generateIndex } = require('../knowledge-base/index-manager');
const { checkForUpdates } = require('../licensing/update-checker');
const telemetry = require('../telemetry/telemetry-client');

class MCPServer {
  constructor() {
    this.rl = null;
    this.isShuttingDown = false;
  }

  /**
   * Start the MCP server
   */
  async start() {
    try {
      // Validate license before starting the server
      const licenseStatus = await licenseManager.validate();
      logger.info(`License status: ${licenseStatus.status}`);

      if (licenseManager.isExpired()) {
        logger.warn('License expired. Server is running in offline knowledge-base mode. HANA tools are disabled.');
      }

      // Notify about available updates if licensed (user must confirm via hana_apply_update)
      if (licenseManager.isValid()) {
        const updateInfo = await checkForUpdates();
        if (updateInfo.updateAvailable) {
          const mandatoryNote = updateInfo.mandatory ? ' This update is mandatory.' : '';
          logger.warn(
            `Update available: ${updateInfo.currentVersion} -> ${updateInfo.latestVersion}.${mandatoryNote} ` +
            `Use the hana_apply_update tool with confirm=true to install it.`
          );
          if (updateInfo.mandatory) {
            logger.error('A mandatory update is available. The server will not start until it is applied.');
            process.exit(1);
          }
        }
      }

      // Sync remote knowledge base if licensed and active
      if (licenseManager.isValid() && licenseManager.hasFeature('knowledge-base')) {
        try {
          const syncResult = await syncRemoteKB();
          logger.info(`Remote KB sync: ${syncResult.synced} synced, ${syncResult.skipped} skipped, ${syncResult.removed} removed`);
          generateIndex();
          schedulePeriodicSync();
        } catch (kbErr) {
          logger.warn('Remote KB sync failed:', redactSecrets(kbErr.message));
        }
      }

      // Setup lifecycle management
      lifecycleManager.setupEventHandlers();
      await lifecycleManager.start();

      // Setup readline interface for STDIO
      this.setupReadline();

      // Start telemetry heartbeats
      telemetry.scheduleHeartbeats({
        version: require('../../package.json').version,
        getLicenseStatus: () => licenseManager.getStatus().status,
        getFeatures: () => licenseManager.getStatus().features
      });
      telemetry.sendEvent('server_start', { version: require('../../package.json').version });

      logger.info('Server ready for requests');
    } catch (error) {
      logger.error('Failed to start server:', redactSecrets(error.message));
      process.exit(1);
    }
  }

  /**
   * Setup readline interface for STDIO communication
   */
  setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    // Handle incoming lines
    this.rl.on('line', async (line) => {
      if (this.isShuttingDown) return;
      
      await this.handleLine(line);
    });

    // Handle readline close
    this.rl.on('close', async () => {
      if (!this.isShuttingDown) {
        logger.info('Readline closed, but keeping process alive');
      } else {
        logger.info('Server shutting down');
        await lifecycleManager.shutdown();
      }
    });
  }

  /**
   * Handle incoming line from STDIO
   */
  async handleLine(line) {
    try {
      const request = JSON.parse(line);
      const response = await this.handleRequest(request);
      
      if (response) {
        console.log(JSON.stringify(response));
      }
    } catch (error) {
      logger.error(`Parse error: ${redactSecrets(error.message)}`);
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: ERROR_CODES.PARSE_ERROR,
          message: 'Parse error'
        }
      };
      console.log(JSON.stringify(errorResponse));
    }
  }

  /**
   * Handle MCP request
   */
  async handleRequest(request) {
    // Validate request
    const validation = MCPHandler.validateRequest(request);
    if (!validation.valid) {
      return {
        jsonrpc: '2.0',
        id: request.id || null,
        error: {
          code: ERROR_CODES.INVALID_REQUEST,
          message: validation.error
        }
      };
    }

    // Handle request
    return await MCPHandler.handleRequest(request);
  }

  /**
   * Shutdown the server
   */
  async shutdown() {
    this.isShuttingDown = true;
    
    if (this.rl) {
      this.rl.close();
    }
    
    await lifecycleManager.shutdown();
  }
}

// Create and start server
const server = new MCPServer();

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Received SIGINT');
  await server.shutdown();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM');
  await server.shutdown();
});

// Start the server
server.start().catch(error => {
  logger.error('Failed to start server:', redactSecrets(error.message));
  process.exit(1);
}); 