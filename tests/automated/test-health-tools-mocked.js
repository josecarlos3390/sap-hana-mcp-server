#!/usr/bin/env node
/**
 * HealthTools tests with a mocked QueryExecutor.
 */

const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const qePath = require.resolve(path.join(root, 'src', 'database', 'query-executor.js'));
const htPath = require.resolve(path.join(root, 'src', 'tools', 'health-tools.js'));

function clearHealthStack() {
  delete require.cache[htPath];
  delete require.cache[qePath];
}

async function withMockExecutor(mockFn, fn) {
  clearHealthStack();
  require.cache[qePath] = {
    id: qePath,
    exports: { executeQuery: mockFn },
    loaded: true
  };
  const HealthTools = require(htPath);
  await fn(HealthTools);
}

console.log('health tools mocked tests\n');

(async () => {
  // 1. healthCheck returns structured sections
  await withMockExecutor(
    async (query) => {
      if (query.includes('M_DATABASE')) {
        return [{ DATABASE_NAME: 'HDB', VERSION: '2.00.000.00', SYSTEM_ID: 'HDB', USAGE: 'production' }];
      }
      if (query.includes('M_SERVICES')) {
        return [{ SERVICE_NAME: 'indexserver', PORT: 30003, ACTIVE_STATUS: 'YES' }];
      }
      if (query.includes('M_MEMORY WHERE PORT')) {
        return [
          { NAME: 'SYSTEM_MEMORY_SIZE', VALUE: '17179869184' },
          { NAME: 'TOTAL_MEMORY_SIZE_IN_USE', VALUE: '8589934592' },
          { NAME: 'GLOBAL_ALLOCATION_LIMIT', VALUE: '12884901888' },
          { NAME: 'EFFECTIVE_PROCESS_ALLOCATION_LIMIT', VALUE: '12884901888' }
        ];
      }
      if (query.includes('M_TABLES')) {
        return [{ SCHEMA_NAME: 'RETAIL', TABLE_NAME: 'TEST', RECORD_COUNT: 100, TABLE_SIZE: 1024 }];
      }
      if (query.includes('M_BLOCKED_TRANSACTIONS')) {
        return [{ C: 0 }];
      }
      return [];
    },
    async (HealthTools) => {
      const res = await HealthTools.healthCheck({ schema_name: 'RETAIL' });
      assert(res.structuredContent, 'healthCheck should return structuredContent');
      assert.strictEqual(res.structuredContent.schema, 'RETAIL');
      assert.strictEqual(res.structuredContent.database_info.ok, true);
      assert.strictEqual(res.structuredContent.database_info.data[0].DATABASE_NAME, 'HDB');
      assert.strictEqual(res.structuredContent.services.ok, true);
      assert.strictEqual(res.structuredContent.memory.ok, true);
    }
  );
  console.log('  ok: healthCheck returns structured sections');

  // 2. memoryMonitor computes usage and alert
  await withMockExecutor(
    async (query) => {
      if (query.includes('M_MEMORY WHERE PORT')) {
        return [
          { NAME: 'SYSTEM_MEMORY_SIZE', VALUE: '17179869184' },
          { NAME: 'SYSTEM_MEMORY_FREE_SIZE', VALUE: '8589934592' },
          { NAME: 'PROCESS_RESIDENT_SIZE', VALUE: '6442450944' },
          { NAME: 'HEAP_MEMORY_USED_SIZE', VALUE: '4294967296' },
          { NAME: 'TOTAL_MEMORY_SIZE_IN_USE', VALUE: '8589934592' },
          { NAME: 'COMPACTORS_SIZE', VALUE: '1073741824' },
          { NAME: 'COMPACTORS_FREEABLE_SIZE', VALUE: '536870912' },
          { NAME: 'GLOBAL_ALLOCATION_LIMIT', VALUE: '12884901888' },
          { NAME: 'EFFECTIVE_PROCESS_ALLOCATION_LIMIT', VALUE: '12884901888' }
        ];
      }
      if (query.includes("SERVICE_NAME = 'indexserver'")) {
        return [{ TOTAL_MEMORY_USED_SIZE: '9000000000' }];
      }
      return [];
    },
    async (HealthTools) => {
      const res = await HealthTools.memoryMonitor();
      assert(res.structuredContent, 'memoryMonitor should return structuredContent');
      assert.strictEqual(res.structuredContent.metrics.total_memory_in_use, 8589934592);
      assert.strictEqual(res.structuredContent.usage_percent.effective, 66.67);
      assert.strictEqual(res.structuredContent.alert.level, 'ok');
    }
  );
  console.log('  ok: memoryMonitor computes usage and alert');

  // 3. memoryMonitor critical alert when usage > 85%
  await withMockExecutor(
    async (query) => {
      if (query.includes('M_MEMORY WHERE PORT')) {
        return [
          { NAME: 'TOTAL_MEMORY_SIZE_IN_USE', VALUE: '12000000000' },
          { NAME: 'EFFECTIVE_PROCESS_ALLOCATION_LIMIT', VALUE: '12884901888' }
        ];
      }
      if (query.includes("SERVICE_NAME = 'indexserver'")) {
        return [{ TOTAL_MEMORY_USED_SIZE: '12000000000' }];
      }
      return [];
    },
    async (HealthTools) => {
      const res = await HealthTools.memoryMonitor();
      assert(res.structuredContent.alert.level === 'critical');
    }
  );
  console.log('  ok: memoryMonitor raises critical alert above 85%');

  // 4. realtimePerformance returns sections
  await withMockExecutor(
    async (query) => {
      if (query.includes('M_TRANSACTIONS')) {
        return [{ CONNECTION_ID: 1, TRANSACTION_ID: 100, TRANSACTION_STATUS: 'ACTIVE' }];
      }
      if (query.includes('M_SQL_PLAN_CACHE')) {
        return [{ STATEMENT_HASH: 'abc', EXECUTION_COUNT: 5, TOTAL_EXECUTION_TIME: 1000000 }];
      }
      if (query.includes('M_CONNECTIONS')) {
        return [{ CONNECTION_ID: 1, USER_NAME: 'B1ADMIN', CONNECTION_STATUS: 'RUNNING' }];
      }
      if (query.includes('M_CS_TABLES')) {
        return [{ SCHEMA_NAME: 'RETAIL', TABLE_NAME: 'TEST', MEMORY_SIZE_IN_DELTA: 1048576 }];
      }
      if (query.includes('M_BLOCKED_TRANSACTIONS')) {
        return [];
      }
      return [];
    },
    async (HealthTools) => {
      const res = await HealthTools.realtimePerformance({ schema_name: 'RETAIL' });
      assert(res.structuredContent, 'realtimePerformance should return structuredContent');
      assert.strictEqual(res.structuredContent.schema, 'RETAIL');
      assert.strictEqual(res.structuredContent.open_transactions.ok, true);
      assert.strictEqual(res.structuredContent.top_queries_by_total_time.ok, true);
    }
  );
  console.log('  ok: realtimePerformance returns structured sections');

  // 5. Partial failures are tolerated
  await withMockExecutor(
    async (query) => {
      if (query.includes('M_DATABASE')) return [{ DATABASE_NAME: 'HDB' }];
      if (query.includes('M_SERVICES')) throw new Error('services view unavailable');
      return [];
    },
    async (HealthTools) => {
      const res = await HealthTools.healthCheck({ schema_name: 'RETAIL' });
      assert.strictEqual(res.structuredContent.database_info.ok, true);
      assert.strictEqual(res.structuredContent.services.ok, false);
      assert(res.structuredContent.services.error.includes('services view unavailable'));
    }
  );
  console.log('  ok: healthCheck tolerates partial query failures');

  console.log('\nDone.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
