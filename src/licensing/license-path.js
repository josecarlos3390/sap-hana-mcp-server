/**
 * Deterministic license file path.
 *
 * Resolution order:
 *   1. HANA_LICENSE_FILE environment variable (absolute path).
 *   2. Next to the packaged executable when running as a pkg binary.
 *   3. The current working directory (legacy / source install behaviour).
 *
 * This ensures that the license menu and the server read/write .hana-license
 * from the same location regardless of how the host launches the MCP.
 */

const path = require('path');

function getLicenseFilePath() {
  if (process.env.HANA_LICENSE_FILE) {
    return path.resolve(process.env.HANA_LICENSE_FILE);
  }

  if (process.pkg) {
    // Running from the pkg executable; keep the license next to the .exe.
    return path.join(path.dirname(process.execPath), '.hana-license');
  }

  return path.join(process.cwd(), '.hana-license');
}

module.exports = { getLicenseFilePath };
