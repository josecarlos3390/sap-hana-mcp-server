#!/usr/bin/env node
/**
 * Mock cloud server for license validation and remote KB sync.
 * For local testing only. Do not deploy.
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.MOCK_CLOUD_PORT || 3456;
const LICENSED_HWIDS = (process.env.MOCK_LICENSED_HWIDS || '').split(',').filter(Boolean);

// Simple in-memory remote KB repository
const REMOTE_KB = [
  {
    path: 'sap-b1/service-layer-crash.md',
    name: 'Service Layer heap corruption KBA 3733425',
    version: '1.0',
    checksum: null,
    content: `---
date: 2026-07-04
category: service-layer
status: resolved
severity: critical
sap_note: 3733425
tags:
  - service-layer
  - heap-corruption
  - kba-3733425
---

# Service Layer worker process termination due to heap corruption

## Síntoma
Apache worker processes terminate with SIGABRT during child process shutdown under high load.

## Causa raíz
Race condition during Apache worker process shutdown causing a double free in the CAsyncLogger destructor.

## Solución
Edit \`/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf\` and change the prefork block to:

\`\`\`apache
StartServers             8
MaxSpareServers          8
MinSpareServers          8
MaxConnectionsPerChild   1024
MaxRequestWorkers        8
\`\`\`

Then restart the Service Layer.
`
  },
  {
    path: 'hana/connection-tuning.md',
    name: 'HANA connection tuning',
    version: '1.0',
    checksum: null,
    content: `---
date: 2026-07-01
category: hana-performance
status: resolved
severity: medium
tags:
  - hana
  - connections
---

# Reducing excessive HANA connections

## Síntoma
Too many open connections in SYS.M_CONNECTIONS.

## Solución
Tune Service Layer connection pool and session timeout settings in b1s.conf.
`
  }
];

REMOTE_KB.forEach(item => {
  item.checksum = require('crypto').createHash('sha256').update(item.content).digest('hex');
});

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/markdown; charset=utf-8' });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/license/validate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const active = LICENSED_HWIDS.length === 0 || LICENSED_HWIDS.includes(payload.hwid);
        sendJson(res, 200, {
          active,
          hwid: payload.hwid,
          plan: active ? 'enterprise' : 'none',
          features: active ? ['hana', 'knowledge-base'] : [],
          message: active ? 'License valid' : 'Hardware ID not licensed'
        });
      } catch (err) {
        sendJson(res, 400, { active: false, message: 'Invalid payload' });
      }
    });
    return;
  }

  if (pathname === '/api/kb/list' && req.method === 'GET') {
    const list = REMOTE_KB.map(item => ({
      path: item.path,
      name: item.name,
      version: item.version,
      checksum: item.checksum,
      downloadUrl: `http://localhost:${PORT}/api/kb/download/${encodeURIComponent(item.path)}`
    }));
    sendJson(res, 200, list);
    return;
  }

  if (pathname.startsWith('/api/kb/download/') && req.method === 'GET') {
    const filePath = decodeURIComponent(pathname.replace('/api/kb/download/', ''));
    const item = REMOTE_KB.find(i => i.path === filePath);
    if (item) {
      sendText(res, 200, item.content);
    } else {
      sendJson(res, 404, { error: 'File not found' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Mock cloud server running at http://localhost:${PORT}`);
  console.log('Licensed HWIDs:', LICENSED_HWIDS.length > 0 ? LICENSED_HWIDS : '(any HWID allowed)');
});
