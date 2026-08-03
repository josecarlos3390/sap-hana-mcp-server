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
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : process.cwd();
const SERVER_URL = (process.env.HANA_LICENSE_SERVER_URL || 'https://licencias-mcp.onrender.com').replace(/\/$/, '');
const PRODUCT_CODE = process.env.HANA_LICENSE_PRODUCT_CODE || 'hana-b1';

// Agent configuration templates embedded so the wizard works from the packaged
// executable without external template files.
const AGENT_TEMPLATES = {
  claude: {
    filename: 'claude-desktop-config.json',
    targetPath: '%APDATA%\\Claude\\claude_desktop_config.json',
    json: {
      mcpServers: {
        hana: {
          command: 'C:\\\\hana-mcp-client\\\\hana-mcp-server.exe',
          args: [],
          env: {}
        }
      }
    },
    applyEnv: (cfg, env) => { cfg.mcpServers.hana.env = env; }
  },
  kimi: {
    filename: 'kimi-code-config.json',
    targetPath: '%USERPROFILE%\\.kimi\\mcp.json',
    json: {
      mcpServers: {
        hana: {
          type: 'stdio',
          command: 'C:\\\\hana-mcp-client\\\\hana-mcp-server.exe',
          args: [],
          env: {}
        }
      }
    },
    applyEnv: (cfg, env) => { cfg.mcpServers.hana.env = env; }
  },
  vscode: {
    filename: 'vscode-mcp-config.json',
    targetPath: 'Tu settings.json de VS Code (Ctrl+Shift+P -> Preferences: Open Settings JSON)',
    json: {
      mcp: {
        servers: {
          hana: {
            type: 'stdio',
            command: 'C:\\\\hana-mcp-client\\\\hana-mcp-server.exe',
            args: [],
            env: {}
          }
        }
      }
    },
    applyEnv: (cfg, env) => { cfg.mcp.servers.hana.env = env; }
  },
  opencode: {
    filename: 'opencode-config.json',
    targetPath: '%USERPROFILE%\\.opencode\\config.json',
    json: {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        hana: {
          type: 'local',
          command: ['C:\\\\hana-mcp-client\\\\hana-mcp-server.exe'],
          enabled: true,
          env: {}
        }
      }
    },
    applyEnv: (cfg, env) => { cfg.mcp.hana.env = env; }
  }
};

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

async function askWithDefault(reader, question, defaultValue) {
  const answer = await reader.ask(`${question} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

function runExternalScript(scriptName) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const script = path.join(BASE_DIR, 'scripts', scriptName);
    const cmd = process.pkg
      ? path.join(BASE_DIR, 'hana-mcp-server.exe')
      : process.execPath;
    const args = process.pkg ? [`--${scriptName.replace(/\.js$/, '')}`] : [script];
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      cwd: BASE_DIR,
      shell: false
    });
    child.on('close', resolve);
  });
}

async function runFirstRunWizard(reader) {
  clearConsole();
  printHeader();
  console.log('--- Configuración inicial guiada ---');
  console.log('');
  console.log('Este asistente te ayudará a configurar el MCP paso a paso.');
  await reader.ask('\nPresiona Enter para continuar...');

  // 1. Check requirements
  clearConsole();
  printHeader();
  console.log('Paso 1 de 5: Verificando requisitos...\n');
  await runExternalScript('check-requirements.js');
  await reader.ask('\nPresiona Enter para continuar...');

  // 2. Configure .env if missing
  const envPath = path.join(BASE_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    clearConsole();
    printHeader();
    console.log('Paso 2 de 5: Configuración de HANA\n');
    await runSetupWizard(reader);
  } else {
    clearConsole();
    printHeader();
    console.log('Paso 2 de 5: Archivo .env ya existe. Saltando configuración de HANA.\n');
    await reader.ask('Presiona Enter para continuar...');
  }

  // 3. Show Hardware ID
  clearConsole();
  printHeader();
  console.log('Paso 3 de 5: Tu Hardware ID\n');
  const hwid = getHardwareId();
  console.log(hwid);
  console.log('\nEnvía este código a tu proveedor para solicitar la licencia.');
  const copied = await copyToClipboard(hwid);
  if (copied) {
    console.log('(El Hardware ID se ha copiado al portapapeles)');
  }
  await reader.ask('\nPresiona Enter para continuar...');

  // 4. Activate license if missing
  const licensePath = getLicenseFilePath();
  const hasLicenseKey = process.env.HANA_LICENSE_KEY;
  if (!hasLicenseKey && !fs.existsSync(licensePath)) {
    clearConsole();
    printHeader();
    console.log('Paso 4 de 5: Activar licencia\n');
    const activate = await reader.ask('¿Querés activar una licencia ahora? (s/n): ');
    if (activate.toLowerCase().startsWith('s')) {
      await activateLicenseMenu(reader);
    }
  } else {
    clearConsole();
    printHeader();
    console.log('Paso 4 de 5: Licencia ya detectada. Saltando activación.\n');
    await reader.ask('Presiona Enter para continuar...');
  }

  // 5. Optional requirements
  clearConsole();
  printHeader();
  console.log('Paso 5 de 5: Requisitos opcionales\n');
  const install = await reader.ask('¿Querés instalar Playwright para descarga automática de SAP Notes? (s/n): ');
  if (install.toLowerCase().startsWith('s')) {
    await runExternalScript('install-requirements.js');
  }

  // Summary
  clearConsole();
  printHeader();
  console.log('--- Configuración inicial finalizada ---\n');
  console.log('Resumen:');
  console.log(`  .env:          ${fs.existsSync(envPath) ? '✅' : '❌'}`);
  console.log(`  Licencia:      ${(hasLicenseKey || fs.existsSync(licensePath)) ? '✅' : '❌'}`);
  console.log(`  Hardware ID:   ${getHardwareId()}`);
  console.log('\nPara usar el MCP:');
  console.log('  1. Copiar el archivo de configuración de tu agente (config/*.json.example).');
  console.log('  2. Reiniciar tu agente de IA.');
  console.log('\nPara gestionar la licencia más tarde, ejecutar license-menu.bat.');
  await reader.ask('\nPresiona Enter para volver al menú...');
}

async function runRequirementsMenu(reader) {
  let inSubmenu = true;
  while (inSubmenu) {
    clearConsole();
    printHeader();
    console.log('--- Requisitos del sistema ---');
    console.log('');
    console.log('1. Verificar requisitos');
    console.log('2. Instalar requisitos opcionales (Python + Playwright para SAP Notes)');
    console.log('0. Volver al menú principal');
    console.log('');

    const choice = await reader.ask('Selecciona una opción: ');

    switch (choice) {
      case '1':
        await runExternalScript('check-requirements.js');
        await reader.ask('\nPresiona Enter para volver al menú...');
        break;
      case '2':
        await runExternalScript('install-requirements.js');
        await reader.ask('\nPresiona Enter para volver al menú...');
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

async function runSetupWizard(reader) {
  console.log('\n--- Asistente de configuración ---');
  console.log('Este asistente crea los archivos de configuración necesarios para conectar');
  console.log('el MCP con tu base de datos SAP HANA y tu agente de IA preferido.\n');

  const host = await reader.ask('Host de SAP HANA: ');
  const port = await askWithDefault(reader, 'Puerto', '30015');
  const user = await reader.ask('Usuario de HANA: ');
  const password = await reader.ask('Contraseña de HANA: ');
  const schema = await reader.ask('Schema por defecto: ');
  const connectionType = await askWithDefault(reader, 'Tipo de conexión (auto/single_container/mdc_tenant/mdc_system)', 'auto');

  const sslAnswer = await askWithDefault(reader, '¿Usar SSL? (s/n)', 'n');
  const useSsl = sslAnswer.toLowerCase().startsWith('s') ? 'true' : 'false';
  const encryptAnswer = await askWithDefault(reader, '¿Usar encriptación? (s/n)', 'n');
  const useEncrypt = encryptAnswer.toLowerCase().startsWith('s') ? 'true' : 'false';
  const validateAnswer = await askWithDefault(reader, '¿Validar certificado SSL? (s/n)', 'n');
  const useValidate = validateAnswer.toLowerCase().startsWith('s') ? 'true' : 'false';

  const installDir = process.pkg
    ? path.dirname(process.execPath)
    : await askWithDefault(reader, 'Directorio de instalación', 'C:\\hana-mcp-client');

  const licenseFile = path.join(installDir, '.hana-license');

  const env = {
    HANA_LICENSE_FILE: licenseFile,
    HANA_LICENSE_SERVER_URL: SERVER_URL,
    HANA_LICENSE_PRODUCT_CODE: PRODUCT_CODE,
    HANA_KB_REMOTE_URL: `${SERVER_URL}/api/kb`,
    HANA_HOST: host,
    HANA_PORT: port,
    HANA_USER: user,
    HANA_PASSWORD: password,
    HANA_SCHEMA: schema,
    HANA_CONNECTION_TYPE: connectionType,
    HANA_SSL: useSsl,
    HANA_ENCRYPT: useEncrypt,
    HANA_VALIDATE_CERT: useValidate,
    LOG_LEVEL: 'info',
    ENABLE_FILE_LOGGING: 'true',
    ENABLE_CONSOLE_LOGGING: 'false'
  };

  // Write .env
  const envLines = [
    '# HANA MCP Server - Configuración generada por el asistente',
    '# No compartas este archivo ni lo commitees.',
    ''
  ];
  for (const [key, value] of Object.entries(env)) {
    envLines.push(`${key}=${value}`);
  }
  const envPath = path.join(BASE_DIR, '.env');
  fs.writeFileSync(envPath, envLines.join('\n') + '\n', 'utf8');
  console.log(`\n✅ Archivo .env guardado en: ${envPath}`);

  // Ask agent
  console.log('\n--- Selecciona tu agente de IA ---');
  console.log('1. Claude Desktop');
  console.log('2. Kimi Code');
  console.log('3. VS Code (extensión MCP)');
  console.log('4. OpenCode');
  const agentChoice = await reader.ask('Opción: ');
  const agentMap = { '1': 'claude', '2': 'kimi', '3': 'vscode', '4': 'opencode' };
  const agentKey = agentMap[agentChoice];

  if (agentKey && AGENT_TEMPLATES[agentKey]) {
    const template = AGENT_TEMPLATES[agentKey];
    const cfg = JSON.parse(JSON.stringify(template.json));
    template.applyEnv(cfg, env);

    // Adjust command path to installation directory
    function updateCommand(obj) {
      if (typeof obj === 'string') {
        return obj.replace(/C:\\\\hana-mcp-client/g, installDir);
      }
      if (Array.isArray(obj)) {
        return obj.map(updateCommand);
      }
      if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          obj[key] = updateCommand(obj[key]);
        }
      }
      return obj;
    }
    updateCommand(cfg);

    const cfgPath = path.join(BASE_DIR, template.filename);
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

    console.log(`\n✅ Configuración para ${agentKey.toUpperCase()} guardada en: ${cfgPath}`);
    console.log(`   Copia el contenido de este archivo en:`);
    console.log(`   ${template.targetPath}`);
  } else {
    console.log('\n⚠️  No se generó configuración de agente. Puedes usar .env con cualquier cliente MCP.');
  }

  console.log('\n--- Resumen ---');
  console.log(`Directorio de instalación: ${installDir}`);
  console.log(`Archivo de licencia:       ${licenseFile}`);
  console.log('Pasos siguientes:');
  console.log('  1. Activa la licencia con la opción "Activar Licencia" del menú principal.');
  console.log('  2. Copia el archivo de configuración generado a la ubicación de tu agente.');
  console.log('  3. Reinicia tu agente de IA.');

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
      case '--first-run':
        result.firstRun = true;
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
    console.log('  --first-run              Ejecutar la configuración inicial guiada');
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

  if (args.firstRun) {
    const reader = await createInputReader();
    await runFirstRunWizard(reader);
    reader.close();
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
    console.log('0. Configuración inicial guiada (first-run)');
    console.log('1. Ver mi Hardware ID');
    console.log('2. Activar Licencia');
    console.log('3. Transferir Licencia');
    console.log('4. Ver Información de mi Licencia');
    console.log('5. Configurar conexión a HANA (asistente)');
    console.log('6. Verificar/instalar requisitos');
    console.log('7. Salir');
    console.log('');
    console.log(`Servidor: ${SERVER_URL}`);
    console.log(`Producto: ${PRODUCT_CODE}`);
    console.log('');

    const choice = await reader.ask('Selecciona una opción: ');

    switch (choice) {
      case '0':
        await runFirstRunWizard(reader);
        break;
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
        await runSetupWizard(reader);
        break;
      case '6':
        await runRequirementsMenu(reader);
        break;
      case '7':
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
