#!/usr/bin/env node
/**
 * License manager unit tests.
 * Mocks JWT/fs to exercise DEMO, VALID, EXPIRED and INVALID states.
 */

const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const jwtPath = require.resolve(path.join(root, 'node_modules', 'jsonwebtoken'));
const lmPath = require.resolve(path.join(root, 'src', 'licensing', 'license-manager.js'));
const hwidPath = require.resolve(path.join(root, 'src', 'licensing', 'hardware-id.js'));

function clearStack() {
  delete require.cache[lmPath];
  delete require.cache[jwtPath];
  delete require.cache[hwidPath];
}

function withMocks({ token, verifyResult, verifyError, fsExists = {} }, fn) {
  clearStack();

  require.cache[hwidPath] = {
    id: hwidPath,
    exports: { getHardwareId: () => 'DEMO-HWID' },
    loaded: true
  };

  const verifyCalls = [];
  require.cache[jwtPath] = {
    id: jwtPath,
    exports: {
      verify: (t, key, opts) => {
        verifyCalls.push({ token: t, key, opts });
        if (verifyError) throw verifyError;
        return verifyResult;
      },
      decode: (t) => verifyResult
    },
    loaded: true
  };

  const writtenFiles = {};
  require.cache[lmPath] = {
    id: lmPath,
    exports: (() => {
      const originalModule = require(lmPath);
      // Override file reads for public key and license file
      const LicenseManager = originalModule.constructor;
      const instance = new LicenseManager();
      instance.publicKey = 'MOCK-PUBLIC-KEY';
      instance.getLicenseToken = () => token;
      return instance;
    })(),
    loaded: true
  };

  const licenseManager = require(lmPath);
  return fn(licenseManager, { verifyCalls, writtenFiles });
}

console.log('license manager tests\n');

(async () => {
  // 1. No token -> DEMO
  await withMocks({ token: null }, async (lm) => {
    const status = await lm.validate();
    assert.strictEqual(status.status, 'DEMO');
    assert.strictEqual(status.plan, 'trial');
    assert.deepStrictEqual(status.features, ['hana']);
    assert(lm.hasFeature('hana'));
    assert(!lm.hasFeature('knowledge-base'));
    console.log('  ok: no token -> DEMO with hana feature only');
  });

  // 2. Valid token -> VALID
  const futureExp = Math.floor(Date.now() / 1000) + 86400;
  await withMocks(
    {
      token: 'VALID-TOKEN',
      verifyResult: { hwid: 'DEMO-HWID', exp: futureExp, features: ['hana', 'knowledge-base'], plan: 'pro' }
    },
    async (lm) => {
      const status = await lm.validate();
      assert.strictEqual(status.status, 'VALID');
      assert.strictEqual(status.plan, 'pro');
      assert.deepStrictEqual(status.features, ['hana', 'knowledge-base']);
      assert(lm.hasFeature('hana'));
      assert(lm.hasFeature('knowledge-base'));
      assert(lm.isValid());
      assert(!lm.isExpired());
      console.log('  ok: valid token -> VALID with all features');
    }
  );

  // 3. Expired token -> EXPIRED (server must not exit)
  const pastExp = Math.floor(Date.now() / 1000) - 86400;
  await withMocks(
    {
      token: 'EXPIRED-TOKEN',
      verifyResult: { hwid: 'DEMO-HWID', exp: pastExp, features: ['hana', 'knowledge-base'], plan: 'pro' }
    },
    async (lm) => {
      const status = await lm.validate();
      assert.strictEqual(status.status, 'EXPIRED');
      assert.strictEqual(status.plan, 'pro');
      assert.deepStrictEqual(status.features, ['hana', 'knowledge-base']);
      assert(!lm.isValid());
      assert(lm.isExpired());
      assert(lm.hasFeature('knowledge-base'));
      assert(!lm.hasFeature('hana'));
      console.log('  ok: expired token -> EXPIRED offline mode with KB read-only');
    }
  );

  // 4. Invalid signature -> INVALID (server must exit)
  await withMocks(
    {
      token: 'BAD-TOKEN',
      verifyError: new Error('invalid signature')
    },
    async (lm) => {
      let threw = false;
      try {
        await lm.validate();
      } catch (e) {
        threw = true;
        assert.strictEqual(lm.status, 'INVALID');
        assert(/invalid signature/i.test(e.message));
      }
      assert(threw, 'validate should throw for invalid signature');
      console.log('  ok: invalid signature -> INVALID and throws');
    }
  );

  // 5. HWID mismatch -> INVALID
  await withMocks(
    {
      token: 'HWID-TOKEN',
      verifyResult: { hwid: 'OTHER-HWID', exp: futureExp, features: ['hana'], plan: 'standard' }
    },
    async (lm) => {
      let threw = false;
      try {
        await lm.validate();
      } catch (e) {
        threw = true;
        assert(/hardware ID mismatch/i.test(e.message));
      }
      assert(threw, 'validate should throw for HWID mismatch');
      console.log('  ok: HWID mismatch -> INVALID and throws');
    }
  );

  console.log('\nDone.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
