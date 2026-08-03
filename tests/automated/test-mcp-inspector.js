const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');

console.log('🔍 HANA MCP Server Inspector');
console.log('============================\n');

const serverScript = path.join(__dirname, '..', '..', 'hana-mcp-server.js');

// Generate a temporary RSA key pair so the inspector test can run without a
// real paid license. Production still validates against src/licensing/public-key.pem.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hana-mcp-test-'));
const testKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const publicKeyPath = path.join(tmpDir, 'public-key.pem');
fs.writeFileSync(publicKeyPath, testKeyPair.publicKey);

const { getHardwareId } = require('../../src/licensing/hardware-id');
const testHwid = getHardwareId();

const testToken = jwt.sign(
  {
    plan: 'test',
    features: ['hana', 'knowledge-base'],
    hwid: testHwid
  },
  testKeyPair.privateKey,
  { algorithm: 'RS256', expiresIn: '1h' }
);

const serverEnv = {
  ...process.env,
  HANA_LICENSE_KEY: process.env.HANA_LICENSE_KEY || testToken,
  HANA_LICENSE_PUBLIC_KEY_PATH: process.env.HANA_LICENSE_PUBLIC_KEY_PATH || publicKeyPath,
  HANA_LICENSE_CHECK_INTERVAL_HOURS: '9999',
  HANA_HOST: process.env.HANA_HOST || "your-hana-host.com",
  HANA_PORT: process.env.HANA_PORT || "443",
  HANA_USER: process.env.HANA_USER || "your-username",
  HANA_PASSWORD: process.env.HANA_PASSWORD || "your-password",
  HANA_SCHEMA: process.env.HANA_SCHEMA || "your-schema",
  HANA_SSL: process.env.HANA_SSL ?? "true",
  HANA_ENCRYPT: process.env.HANA_ENCRYPT ?? "true",
  HANA_VALIDATE_CERT: process.env.HANA_VALIDATE_CERT ?? "true",
  HANA_CONNECTION_TYPE: process.env.HANA_CONNECTION_TYPE || "auto",
  HANA_INSTANCE_NUMBER: process.env.HANA_INSTANCE_NUMBER || "",
  HANA_DATABASE_NAME: process.env.HANA_DATABASE_NAME || "",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  ENABLE_FILE_LOGGING: process.env.ENABLE_FILE_LOGGING ?? "true",
  ENABLE_CONSOLE_LOGGING: process.env.ENABLE_CONSOLE_LOGGING ?? "false"
};

const server = spawn(process.execPath, [serverScript], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: path.join(__dirname, '..', '..'),
  env: serverEnv
});

// Handle server output
server.stdout.on('data', (data) => {
  try {
    const response = JSON.parse(data.toString().trim());
    console.log('📤 Response:', JSON.stringify(response, null, 2));
  } catch (error) {
    console.log('🔧 Server Log:', data.toString().trim());
  }
});

server.stderr.on('data', (data) => {
  console.log('🔧 Server Log:', data.toString().trim());
});

// Send request function
function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };
  
  server.stdin.write(JSON.stringify(request) + '\n');
}

// Test functions
async function testInitialize() {
  console.log('\n🧪 Testing: Initialize');
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function testToolsList() {
  console.log('\n🧪 Testing: Tools List');
  sendRequest('tools/list', {});
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function testShowConfig() {
  console.log('\n🧪 Testing: Show Config');
  sendRequest('tools/call', {
    name: "hana_show_config",
    arguments: {}
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function testListSchemas() {
  console.log('\n🧪 Testing: List Schemas');
  sendRequest('tools/call', {
    name: "hana_list_schemas",
    arguments: {}
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function testListTables() {
  console.log('\n🧪 Testing: List Tables');
  sendRequest('tools/call', {
    name: "hana_list_tables",
    arguments: { schema_name: "SYSTEM" }
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function testExecuteQuery() {
  console.log('\n🧪 Testing: Execute Query');
  sendRequest('tools/call', {
    name: "hana_execute_query",
    arguments: {
      query: "SELECT 1 as test_value FROM DUMMY"
    }
  });
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// Main test runner
async function runTests() {
  try {
    await testInitialize();
    await testToolsList();
    await testShowConfig();
    await testListSchemas();
    await testListTables();
    await testExecuteQuery();
    
    console.log('\n✅ Tests completed!');
    
    // Close server
    server.stdin.end();
    server.kill();
    
  } catch (error) {
    console.error('❌ Test error:', error);
    server.kill();
  }
}

// Handle server exit
server.on('close', (code) => {
  console.log(`\n🔚 Server closed with code ${code}`);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {
    // ignore cleanup errors
  }
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

// Start tests
runTests().catch((err) => {
  console.error(err);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
  process.exit(1);
});