#!/usr/bin/env node
/**
 * Menú interactivo de licencias para el cliente.
 *
 * Permite:
 *   1. Ver el Hardware ID de la máquina.
 *   2. Canjear un voucher o activar una licencia directa.
 *   3. Transferir la licencia a otra máquina conservando los días restantes.
 *   4. Ver información de la licencia activa (plan, vencimiento, días restantes).
 *
 * Uso:
 *   node scripts/license-menu.js
 *
 * El script guarda la licencia activa en el archivo .hana-license del directorio
 * de trabajo. Ese archivo es leído por el MCP al iniciar.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');
const axios = require('axios');

require('dotenv').config();

const { getHardwareId } = require('../src/licensing/hardware-id');
const { getLicenseFilePath } = require('../src/licensing/license-path');

const LICENSE_FILE = getLicenseFilePath();
const SERVER_URL = (process.env.HANA_LICENSE_SERVER_URL || 'https://licencias-mcp.onrender.com').replace(/\/$/, '');
const PRODUCT_CODE = process.env.HANA_LICENSE_PRODUCT_CODE || 'hana-b1';

function clearConsole() {
  if (process.stdin.isTTY) {
    process.stdout.write(process.platform === 'win32' ? '\x1Bc' : '\x1B[2J\x1B[3J\x1B[H');
  }
}

function printHeader() {
  console.log('============================================');
  console.log('   SAP HANA MCP - Gestión de Licencias');
  console.log('============================================');
  console.log('');
}

function copyToClipboard(text) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }
    const proc = exec(`echo ${text} | clip`, (err) => {
      resolve(!err);
    });
    proc.stdin?.end();
  });
}

async function createInputReader() {
  if (process.stdin.isTTY) {
    // Interactive mode: create a persistent readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    return {
      ask: (question) => new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
      }),
      close: () => rl.close()
    };
  }

  // Non-interactive mode (e.g. piped input): read all lines upfront
  const lines = await new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve(text.split(/\r?\n/));
    });
    process.stdin.on('error', reject);
  });

  let index = 0;
  return {
    ask: async (question) => {
      process.stdout.write(question);
      if (index < lines.length) {
        const answer = lines[index++];
        process.stdout.write(answer + '\n');
        return answer.trim();
      }
      return '';
    },
    close: () => {}
  };
}

async function showHardwareId(reader) {
  const hwid = getHardwareId();
  console.log('\n--- Tu Hardware ID ---');
  console.log(hwid);
  console.log('');
  console.log('Envía este código por WhatsApp a tu proveedor para solicitar la licencia.');

  const copied = await copyToClipboard(hwid);
  if (copied) {
    console.log('(El Hardware ID se ha copiado al portapapeles)');
  }

  await reader.ask('\nPresiona Enter para volver al menú...');
}

async function activateLicenseDirect(reader) {
  const hwid = getHardwareId();
  console.log('\n--- Activar Licencia Directa ---');
  const licenseKey = await reader.ask('Ingresa la clave de activación: ');

  if (!licenseKey) {
    console.log('Clave vacía. Cancelando.');
    await reader.ask('\nPresiona Enter para volver al menú...');
    return;
  }

  try {
    const response = await axios.post(
      `${SERVER_URL}/api/license/validate`,
      {
        license_key: licenseKey,
        hwid,
        product_code: PRODUCT_CODE
      },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.data || response.data.active !== true) {
      console.log('\nLa clave no es válida para esta máquina.');
      await reader.ask('\nPresiona Enter para volver al menú...');
      return;
    }

    fs.writeFileSync(LICENSE_FILE, licenseKey.trim().toUpperCase(), 'utf8');

    console.log('\n✅ Licencia activada correctamente.');
    console.log(`   Clave:    ${response.data.license_key}`);
    console.log(`   Plan:     ${response.data.plan}`);
    console.log(`   Vence:    ${response.data.expires_at}`);
    console.log(`   Hardware: ${response.data.hwid}`);
  } catch (err) {
    const message = err.response?.data?.message || err.response?.data?.error || err.message;
    console.log(`\n❌ Error al activar la licencia: ${message}`);
  }

  await reader.ask('\nPresiona Enter para volver al menú...');
}

async function redeemVoucher(reader) {
  const hwid = getHardwareId();
  console.log('\n--- Canjear Voucher ---');
  console.log('Ingresa el voucher que te envió el proveedor.');
  console.log('El sistema generará automáticamente una licencia atada a esta máquina.\n');

  const voucherCode = await reader.ask('Código de voucher: ');

  if (!voucherCode) {
    console.log('Código vacío. Cancelando.');
    await reader.ask('\nPresiona Enter para volver al menú...');
    return;
  }

  try {
    const response = await axios.post(
      `${SERVER_URL}/api/license/redeem`,
      {
        voucher_code: voucherCode,
        hwid,
        product_code: PRODUCT_CODE
      },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );

    const data = response.data;
    fs.writeFileSync(LICENSE_FILE, data.license_key, 'utf8');

    console.log('\n✅ Voucher canjeado correctamente.');
    console.log(`   Voucher:  ${voucherCode.trim().toUpperCase()}`);
    console.log(`   Licencia: ${data.license_key}`);
    console.log(`   Plan:     ${data.plan}`);
    console.log(`   Días:     ${data.days}`);
    console.log(`   Vence:    ${data.expires_at}`);
    console.log(`   Hardware: ${data.hwid}`);
  } catch (err) {
    const message = err.response?.data?.error || err.message;
    console.log(`\n❌ Error al canjear el voucher: ${message}`);
  }

  await reader.ask('\nPresiona Enter para volver al menú...');
}

async function activateLicenseMenu(reader) {
  let inSubmenu = true;
  while (inSubmenu) {
    clearConsole();
    printHeader();
    console.log('--- Activar Licencia ---');
    console.log('');
    console.log('1. Canjear voucher (código de un solo uso)');
    console.log('2. Activar licencia directa');
    console.log('0. Volver al menú principal');
    console.log('');

    const choice = await reader.ask('Selecciona una opción: ');

    switch (choice) {
      case '1':
        await redeemVoucher(reader);
        break;
      case '2':
        await activateLicenseDirect(reader);
        break;
      case '0':
      case '':
        inSubmenu = false;
        break;
      default:
        console.log('\nOpción no válida.');
        await reader.ask('\nPresiona Enter para continuar...');
    }
  }
}

async function showLicenseInfo(reader) {
  const hwid = getHardwareId();
  console.log('\n--- Información de tu Licencia ---');

  let licenseKey = null;
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      licenseKey = fs.readFileSync(LICENSE_FILE, 'utf8').trim();
    }
  } catch (err) {
    console.log('No se pudo leer el archivo .hana-license.');
  }

  if (!licenseKey) {
    console.log('No se encontró una licencia guardada en esta máquina.');
    console.log('Selecciona "Activar Licencia" para canjear un voucher o ingresar una clave.');
    await reader.ask('\nPresiona Enter para volver al menú...');
    return;
  }

  try {
    const response = await axios.post(
      `${SERVER_URL}/api/license/validate`,
      {
        license_key: licenseKey,
        hwid,
        product_code: PRODUCT_CODE
      },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );

    const data = response.data;

    if (!data || data.active !== true) {
      console.log('\n⚠️  La licencia guardada no está activa.');
      console.log(`   Motivo: ${data.message || 'Desconocido'}`);
      await reader.ask('\nPresiona Enter para volver al menú...');
      return;
    }

    const expiresAt = new Date(data.expires_at);
    const now = new Date();
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

    console.log('\n✅ Licencia activa.');
    console.log(`   Clave:         ${data.license_key}`);
    console.log(`   Plan:          ${data.plan}`);
    console.log(`   Características: ${(data.features || []).join(', ')}`);
    console.log(`   Hardware:      ${data.hwid}`);
    console.log(`   Vence:         ${data.expires_at}`);
    console.log(`   Días restantes: ${remainingDays}`);

    if (remainingDays <= 3) {
      console.log('\n⚠️  Tu licencia está por vencer. Contacta a tu proveedor para renovarla.');
    }
  } catch (err) {
    const message = err.response?.data?.message || err.response?.data?.error || err.message;
    console.log(`\n❌ Error al consultar la licencia: ${message}`);
  }

  await reader.ask('\nPresiona Enter para volver al menú...');
}

async function transferLicense(reader) {
  const oldHwid = getHardwareId();
  console.log('\n--- Transferir Licencia ---');
  console.log('Esta máquina es la máquina ANTIGUA (origen).');
  console.log(`Hardware ID antiguo: ${oldHwid}`);
  console.log('');
  console.log('En la máquina NUEVA ejecuta este menú y selecciona "Ver mi Hardware ID" para obtener el nuevo ID.\n');

  const newHwid = await reader.ask('Ingresa el Hardware ID de la máquina nueva: ');
  if (!newHwid) {
    console.log('Hardware ID vacío. Cancelando.');
    await reader.ask('\nPresiona Enter para volver al menú...');
    return;
  }

  if (newHwid.trim() === oldHwid) {
    console.log('El Hardware ID nuevo es igual al actual. No es necesario transferir.');
    await reader.ask('\nPresiona Enter para volver al menú...');
    return;
  }

  const licenseKey = await reader.ask('Ingresa la clave de licencia actual: ');
  if (!licenseKey) {
    console.log('Clave vacía. Cancelando.');
    await reader.ask('\nPresiona Enter para volver al menú...');
    return;
  }

  try {
    const response = await axios.post(
      `${SERVER_URL}/api/license/transfer`,
      {
        old_hwid: oldHwid,
        new_hwid: newHwid.trim(),
        license_key: licenseKey,
        product_code: PRODUCT_CODE
      },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );

    const data = response.data;
    fs.writeFileSync(LICENSE_FILE, data.new_license_key, 'utf8');

    console.log('\n✅ Licencia transferida correctamente.');
    console.log(`   Clave anterior:  ${data.old_license_key}`);
    console.log(`   Clave nueva:     ${data.new_license_key}`);
    console.log(`   Días restantes:  ${data.remaining_days}`);
    console.log(`   Vence:           ${data.expires_at}`);
    console.log('');
    console.log('Ahora debes copiar el archivo .hana-license de esta máquina a la máquina nueva,');
    console.log('o anota la clave nueva e ingrésala en la máquina nueva seleccionando "Activar Licencia".');
  } catch (err) {
    const message = err.response?.data?.error || err.message;
    console.log(`\n❌ Error al transferir la licencia: ${message}`);
  }

  await reader.ask('\nPresiona Enter para volver al menú...');
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--show-hwid':
      case '-h':
        result.showHwid = true;
        break;
      case '--redeem':
      case '-r':
        result.redeem = args[++i];
        break;
      case '--activate':
      case '-a':
        result.activate = args[++i];
        break;
      case '--hwid':
        result.hwid = args[++i];
        break;
      case '--license-info':
      case '-i':
        result.licenseInfo = true;
        break;
      case '--help':
        result.help = true;
        break;
    }
  }
  return result;
}

async function runCliMode() {
  const args = parseCliArgs();

  if (args.help) {
    console.log('Uso: node scripts/license-menu.js [opciones]');
    console.log('');
    console.log('Opciones:');
    console.log('  --show-hwid, -h          Mostrar el Hardware ID de esta máquina');
    console.log('  --redeem <voucher>, -r   Canjear un voucher');
    console.log('  --activate <key>, -a     Activar una licencia directa');
    console.log('  --license-info, -i       Ver información de la licencia guardada');
    console.log('  --hwid <hwid>            HWID a usar (solo con --redeem, default: HWID actual)');
    console.log('  --help                   Mostrar esta ayuda');
    console.log('');
    console.log('Sin opciones se abre el menú interactivo.');
    return;
  }

  if (args.showHwid) {
    console.log(getHardwareId());
    return;
  }

  if (args.licenseInfo) {
    let licenseKey = null;
    try {
      if (fs.existsSync(LICENSE_FILE)) {
        licenseKey = fs.readFileSync(LICENSE_FILE, 'utf8').trim();
      }
    } catch (err) {
      console.error('❌ No se pudo leer .hana-license.');
      process.exit(1);
    }

    if (!licenseKey) {
      console.error('❌ No se encontró una licencia guardada.');
      process.exit(1);
    }

    try {
      const response = await axios.post(
        `${SERVER_URL}/api/license/validate`,
        {
          license_key: licenseKey,
          hwid: args.hwid || getHardwareId(),
          product_code: PRODUCT_CODE
        },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );

      const data = response.data;
      if (!data || data.active !== true) {
        console.error(`❌ Licencia inactiva: ${data.message || 'Desconocido'}`);
        process.exit(1);
      }

      const expiresAt = new Date(data.expires_at);
      const now = new Date();
      const remainingMs = expiresAt.getTime() - now.getTime();
      const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

      console.log('Licencia activa');
      console.log(`  Clave:           ${data.license_key}`);
      console.log(`  Plan:            ${data.plan}`);
      console.log(`  Características: ${(data.features || []).join(', ')}`);
      console.log(`  Hardware:        ${data.hwid}`);
      console.log(`  Vence:           ${data.expires_at}`);
      console.log(`  Días restantes:  ${remainingDays}`);
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error || err.message;
      console.error(`❌ Error al consultar la licencia: ${message}`);
      process.exit(1);
    }
    return;
  }

  if (args.redeem) {
    const hwid = args.hwid || getHardwareId();
    try {
      const response = await axios.post(
        `${SERVER_URL}/api/license/redeem`,
        {
          voucher_code: args.redeem,
          hwid,
          product_code: PRODUCT_CODE
        },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );

      const data = response.data;
      fs.writeFileSync(LICENSE_FILE, data.license_key, 'utf8');

      console.log('✅ Voucher canjeado correctamente.');
      console.log(`   Licencia: ${data.license_key}`);
      console.log(`   Plan:     ${data.plan}`);
      console.log(`   Días:     ${data.days}`);
      console.log(`   Vence:    ${data.expires_at}`);
      console.log(`   Hardware: ${data.hwid}`);
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      console.error(`❌ Error al canjear el voucher: ${message}`);
      process.exit(1);
    }
    return;
  }

  if (args.activate) {
    const hwid = args.hwid || getHardwareId();
    try {
      const response = await axios.post(
        `${SERVER_URL}/api/license/validate`,
        {
          license_key: args.activate,
          hwid,
          product_code: PRODUCT_CODE
        },
        { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.data || response.data.active !== true) {
        console.error('❌ La clave no es válida para esta máquina.');
        process.exit(1);
      }

      fs.writeFileSync(LICENSE_FILE, args.activate.trim().toUpperCase(), 'utf8');
      console.log('✅ Licencia activada correctamente.');
      console.log(`   Clave: ${response.data.license_key}`);
      console.log(`   Plan:  ${response.data.plan}`);
      console.log(`   Vence: ${response.data.expires_at}`);
    } catch (err) {
      const message = err.response?.data?.message || err.response?.data?.error || err.message;
      console.error(`❌ Error al activar la licencia: ${message}`);
      process.exit(1);
    }
    return;
  }

  // No CLI args matched; fall through to interactive menu
  return false;
}

async function mainMenu() {
  const cliHandled = await runCliMode();
  if (cliHandled !== false) {
    return;
  }

  const reader = await createInputReader();

  let running = true;
  while (running) {
    clearConsole();
    printHeader();
    console.log('1. Ver mi Hardware ID');
    console.log('2. Activar Licencia');
    console.log('3. Transferir Licencia');
    console.log('4. Ver Información de mi Licencia');
    console.log('5. Salir');
    console.log('');
    console.log(`Servidor: ${SERVER_URL}`);
    console.log(`Producto: ${PRODUCT_CODE}`);
    console.log('');

    const choice = await reader.ask('Selecciona una opción: ');

    switch (choice) {
      case '1':
        await showHardwareId(reader);
        break;
      case '2':
        await activateLicenseMenu(reader);
        break;
      case '3':
        await transferLicense(reader);
        break;
      case '4':
        await showLicenseInfo(reader);
        break;
      case '5':
        running = false;
        break;
      default:
        console.log('\nOpción no válida.');
        await reader.ask('\nPresiona Enter para continuar...');
    }
  }

  reader.close();
  console.log('\nHasta luego.');
}

mainMenu().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
