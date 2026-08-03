#!/usr/bin/env node
/**
 * Install optional dependencies required by advanced MCP features.
 *
 * For the executable distribution this is usually not needed (everything is
 * bundled). Run this if you want to enable:
 *   - Automatic SAP Note download (requires Python + Playwright).
 *
 * Usage:
 *   node scripts/install-requirements.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE_DIR = process.pkg ? path.dirname(process.execPath) : process.cwd();

function log(msg) {
  console.log(`[install-requirements] ${msg}`);
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Ejecutando: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      cwd: BASE_DIR,
      ...options
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

function findPython() {
  const candidates = process.platform === 'win32'
    ? ['python.exe', 'python3.exe', 'py']
    : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      require('child_process').execSync(`${cmd} --version`, { stdio: 'pipe' });
      return cmd;
    } catch (_) {
      // try next
    }
  }
  return null;
}

async function installPlaywright() {
  const python = findPython();
  if (!python) {
    log('⚠️  Python no encontrado. No se puede instalar Playwright automáticamente.');
    log('   Descargar Python desde https://www.python.org/downloads/ y reintentar.');
    return false;
  }
  log(`Python encontrado: ${python}`);

  try {
    await runCommand(python, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  } catch (err) {
    log('Advertencia: no se pudo actualizar pip. Continuando...');
  }

  try {
    await runCommand(python, ['-m', 'pip', 'install', 'playwright']);
  } catch (err) {
    log('❌ Error instalando playwright con pip.');
    throw err;
  }

  try {
    await runCommand(python, ['-m', 'playwright', 'install', 'chromium']);
  } catch (err) {
    log('❌ Error instalando navegador Chromium para Playwright.');
    throw err;
  }

  return true;
}

async function main() {
  console.log('========================================');
  console.log('  Instalación de requisitos opcionales');
  console.log('========================================\n');

  if (process.pkg) {
    log('Detectado paquete ejecutable (.exe). Las dependencias principales ya están incluidas.');
    log('Solo se instalarán dependencias opcionales (Python + Playwright para SAP Notes).\n');
  }

  const python = findPython();
  if (!python) {
    log('Python no encontrado. La descarga automática de SAP Notes no estará disponible.');
    log('Para habilitarla, instalar Python y volver a ejecutar este script.\n');
    process.exit(0);
  }

  log('Se instalará Playwright para permitir la descarga automática de SAP Notes.');
  const ok = await installPlaywright();
  if (ok) {
    log('\n✅ Playwright instalado correctamente.');
    log('   Asegurate de configurar SAP_USER y SAP_PASS en el .env para usar hana_fetch_sap_note.');
  }

  console.log('\n========================================');
  console.log('  Instalación finalizada');
  console.log('========================================\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
