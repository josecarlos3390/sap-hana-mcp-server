#!/usr/bin/env node
/**
 * Verify that the environment has everything needed for all MCP features.
 *
 * Checks:
 *   - Node.js version
 *   - .env file presence and required HANA variables
 *   - License file or HANA_LICENSE_KEY
 *   - SUSE SSH credentials (only needed for SUSE diagnostic tools)
 *   - Python + Playwright (only needed for automatic SAP Note download)
 *
 * Usage:
 *   node scripts/check-requirements.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

require('dotenv').config();

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : process.cwd();

const checks = {
  ok: [],
  missing: [],
  optional: []
};

function addOk(text) {
  checks.ok.push(text);
}

function addMissing(text) {
  checks.missing.push(text);
}

function addOptional(text) {
  checks.optional.push(text);
}

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  if (major >= 18) {
    addOk(`Node.js ${version} (>= 18)`);
  } else {
    addMissing(`Node.js ${version} — se requiere Node.js 18 o superior`);
  }
}

function checkEnvFile() {
  const envPath = path.join(BASE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    addOk('Archivo .env encontrado');
  } else {
    addMissing('Archivo .env no encontrado. Copiar .env.example a .env y completar los valores.');
  }
}

function checkHanaConfig() {
  const required = ['HANA_HOST', 'HANA_USER', 'HANA_PASSWORD', 'HANA_SCHEMA'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length === 0) {
    addOk('Variables de conexión HANA configuradas');
  } else {
    addMissing(`Faltan variables de HANA: ${missing.join(', ')}`);
  }
}

function checkLicense() {
  const licenseKey = process.env.HANA_LICENSE_KEY;
  const licenseFile = process.env.HANA_LICENSE_FILE
    ? path.resolve(process.env.HANA_LICENSE_FILE)
    : path.join(BASE_DIR, '.hana-license');

  if (licenseKey || fs.existsSync(licenseFile)) {
    addOk('Licencia configurada (.hana-license o HANA_LICENSE_KEY)');
  } else {
    addMissing('Licencia no encontrada. Activar mediante el menú de licencias.');
  }
}

function checkSuseCredentials() {
  if (process.env.SUSE_HOST && process.env.SUSE_USER && process.env.SUSE_PASSWORD) {
    addOk('Credenciales SUSE SSH configuradas (tools de diagnóstico SUSE disponibles)');
  } else {
    addOptional('Credenciales SUSE SSH no configuradas. Las tools hana_suse_* estarán deshabilitadas. Set SUSE_HOST, SUSE_USER, SUSE_PASSWORD para habilitarlas.');
  }
}

function checkPython() {
  try {
    const out = execSync('python --version 2>&1 || python3 --version 2>&1', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    addOk(`Python disponible: ${out.trim()}`);
    return true;
  } catch (err) {
    addOptional('Python no encontrado. La descarga automática de SAP Notes requiere Python + Playwright.');
    return false;
  }
}

function checkPlaywright() {
  try {
    execSync('python -c "import playwright" 2>&1 || python3 -c "import playwright" 2>&1', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    addOk('Playwright para Python instalado');
  } catch (err) {
    addOptional('Playwright para Python no encontrado. La descarga automática de SAP Notes no estará disponible. Ejecutar install-requirements para instalarlo.');
  }
}

function run() {
  console.log('========================================');
  console.log('  Verificación de requisitos del MCP');
  console.log('========================================\n');

  checkNodeVersion();
  checkEnvFile();
  checkHanaConfig();
  checkLicense();
  checkSuseCredentials();
  const hasPython = checkPython();
  if (hasPython) {
    checkPlaywright();
  }

  console.log('\n✅ OK:');
  if (checks.ok.length === 0) {
    console.log('  (ninguno)');
  } else {
    checks.ok.forEach((c) => console.log(`  - ${c}`));
  }

  console.log('\n⚠️  Opcional / no crítico:');
  if (checks.optional.length === 0) {
    console.log('  (ninguno)');
  } else {
    checks.optional.forEach((c) => console.log(`  - ${c}`));
  }

  console.log('\n❌ Requerido y faltante:');
  if (checks.missing.length === 0) {
    console.log('  (ninguno)');
  } else {
    checks.missing.forEach((c) => console.log(`  - ${c}`));
  }

  console.log('\n========================================');
  if (checks.missing.length === 0) {
    console.log('El MCP está listo para usar.');
  } else {
    console.log('Corregir los items faltantes antes de usar el MCP.');
    process.exit(1);
  }
  console.log('========================================\n');
}

run();
