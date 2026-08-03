#!/usr/bin/env node
/**
 * Offline license mode tests.
 * Verifies that when the license is EXPIRED, only knowledge-base read tools work
 * and all HANA tools are blocked.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const lmPath = require.resolve(path.join(root, 'src', 'licensing', 'license-manager.js'));
const kbPath = require.resolve(path.join(root, 'src', 'knowledge-base', 'index.js'));
const kbWriterPath = require.resolve(path.join(root, 'src', 'knowledge-base', 'case-writer.js'));
const kbRemotePath = require.resolve(path.join(root, 'src', 'knowledge-base', 'remote-sync.js'));
const kbToolsPath = require.resolve(path.join(root, 'src', 'tools', 'kb-tools.js'));
const trPath = require.resolve(path.join(root, 'src', 'tools', 'index.js'));

const testCaseDir = path.join(root, 'docs', 'kb', 'user');
const testCaseFile = path.join(testCaseDir, 'test-offline-case.md');

function clearStack() {
  delete require.cache[trPath];
  delete require.cache[kbToolsPath];
  delete require.cache[kbPath];
  delete require.cache[kbWriterPath];
  delete require.cache[kbRemotePath];
  delete require.cache[lmPath];
}

function withExpiredLicense(fn) {
  clearStack();

  const mockLicenseManager = {
    status: 'EXPIRED',
    details: { features: ['hana', 'knowledge-base'] },
    isExpired: () => true,
    isValid: () => false,
    hasFeature: (feature) => feature === 'knowledge-base',
    getStatus: () => ({ status: 'EXPIRED', features: ['hana', 'knowledge-base'] })
  };

  require.cache[lmPath] = {
    id: lmPath,
    exports: mockLicenseManager,
    loaded: true
  };

  require.cache[kbPath] = {
    id: kbPath,
    exports: {
      search: (query, limit) => [
        { filename: 'test-offline-case.md', title: 'Offline Test Case', date: '2025-07-06' }
      ],
      generateIndex: () => ({ indexPath: path.join(root, 'docs', 'kb', 'index.md'), casesCount: 1, cases: [] }),
      saveCase: () => ({ filename: 'test-offline-case.md', filepath: testCaseFile }),
      listCases: () => []
    },
    loaded: true
  };

  require.cache[kbWriterPath] = {
    id: kbWriterPath,
    exports: {
      USER_DIR: testCaseDir,
      BUNDLED_DIR: path.join(root, 'docs', 'kb', 'bundled'),
      REMOTE_DIR: path.join(root, 'docs', 'kb', 'remote'),
      KB_DIR: path.join(root, 'docs', 'kb'),
      saveCase: () => ({ filename: 'test-offline-case.md', filepath: testCaseFile })
    },
    loaded: true
  };

  require.cache[kbRemotePath] = {
    id: kbRemotePath,
    exports: {
      REMOTE_DIR: path.join(root, 'docs', 'kb', 'remote')
    },
    loaded: true
  };

  const ToolRegistry = require(trPath);
  return fn(ToolRegistry);
}

console.log('offline license mode tests\n');

(async () => {
  // Ensure a test case file exists for read tests
  if (!fs.existsSync(testCaseDir)) {
    fs.mkdirSync(testCaseDir, { recursive: true });
  }
  fs.writeFileSync(testCaseFile, '# Offline Test Case\n\nThis is a test case for offline mode.\n', 'utf8');

  try {
    await withExpiredLicense(async (ToolRegistry) => {
      const search = await ToolRegistry.executeTool('hana_search_knowledge_base', { query: 'offline' });
      assert.strictEqual(search.success, true);
      assert.strictEqual(search.licenseMode, 'offline');
      console.log('  ok: hana_search_knowledge_base works offline');

      const index = await ToolRegistry.executeTool('hana_generate_kb_index', {});
      assert.strictEqual(index.success, true);
      assert.strictEqual(index.licenseMode, 'offline');
      console.log('  ok: hana_generate_kb_index works offline');

      const read = await ToolRegistry.executeTool('hana_read_kb_case', { filename: 'test-offline-case.md' });
      assert.strictEqual(read.success, true);
      assert(read.content.includes('Offline Test Case'));
      assert.strictEqual(read.licenseMode, 'offline');
      console.log('  ok: hana_read_kb_case works offline');

      const info = await ToolRegistry.executeTool('hana_show_license_info', {});
      assert.strictEqual(info.status, 'EXPIRED');
      console.log('  ok: hana_show_license_info works offline');

      let saveErr;
      try {
        await ToolRegistry.executeTool('hana_save_knowledge_case', { title: 'test' });
      } catch (e) {
        saveErr = e;
      }
      assert(saveErr && (/active license/i.test(saveErr.message) || /offline/i.test(saveErr.message)), 'save should be blocked when offline');
      console.log('  ok: hana_save_knowledge_case blocked offline');

      let queryErr;
      try {
        await ToolRegistry.executeTool('hana_execute_query', { query: 'SELECT 1' });
      } catch (e) {
        queryErr = e;
      }
      assert(queryErr && /offline/i.test(queryErr.message), 'hana_execute_query should be blocked in offline mode');
      console.log('  ok: hana_execute_query blocked offline');

      let healthErr;
      try {
        await ToolRegistry.executeTool('hana_health_check', {});
      } catch (e) {
        healthErr = e;
      }
      assert(healthErr && /offline/i.test(healthErr.message), 'hana_health_check should be blocked in offline mode');
      console.log('  ok: hana_health_check blocked offline');
    });

    console.log('\nDone.');
  } finally {
    try {
      fs.unlinkSync(testCaseFile);
    } catch (_) {
      // ignore cleanup errors
    }
  }
})().catch((e) => {
  console.error(e);
  try {
    fs.unlinkSync(testCaseFile);
  } catch (_) {}
  process.exit(1);
});
