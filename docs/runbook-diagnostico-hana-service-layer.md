# Runbook: Diagnóstico de SAP HANA y Service Layer

Este documento resume los pasos, scripts y configuraciones utilizados para diagnosticar la inestabilidad del SAP Business One Service Layer en `hanaroda25.gruporoda.com` (caso KBA 3733425). Sirve para reproducir el diagnóstico desde otra computadora o para futuros incidentes similares.

---

## 1. Objetivo

Obtener una visión completa del estado de:

- SAP HANA (servicios, memoria, conexiones, queries costosas, locks, delta merge).
- SAP Business One Service Layer (procesos Apache, logs, configuración `mpm_prefork`).
- Notas SAP relevantes (vía navegación automatizada con Playwright).

---

## 2. Requisitos previos

### 2.1 Software base

- **Node.js** >= 18.0.0 (la ruta en `mcp.json` actual es `C:\Program Files\nodejs\node.exe`).
- **Python** >= 3.10 (solo para Playwright).
- Acceso de red al host `hanaroda25.gruporoda.com`:
  - Puerto `30015` para HANA.
  - Puerto `22` para SSH (usuario `root`).
  - Puertos `50000-50004` para Service Layer (opcional, para pruebas manuales).

### 2.2 Archivo `.env`

El servidor carga variables de entorno automáticamente desde un archivo `.env` en la raíz del proyecto. Copia `.env.example` a `.env` y completa los valores:

```powershell
copy .env.example .env
```

### 2.3 Credenciales necesarias

Establecer las siguientes variables de entorno (o en `.env`) antes de ejecutar los scripts:

```powershell
# HANA (usado por health-check, realtime-performance-check y el MCP server)
$env:HANA_HOST="hanaroda25.gruporoda.com"
$env:HANA_PORT="30015"
$env:HANA_USER="B1ADMIN"
$env:HANA_PASSWORD="RodaHana2016!."
$env:HANA_SCHEMA="RETAIL"
$env:HANA_SSL="false"
$env:HANA_ENCRYPT="false"
$env:HANA_VALIDATE_CERT="false"

# SSH al servidor SUSE (usado por suse-log-reader.js y suse-check-kba-config.js)
$env:SUSE_HOST="hanaroda25.gruporoda.com"
$env:SUSE_USER="root"
$env:SUSE_PASSWORD="B1Admin1$"

# SAP Support / SAP for Me (usado por fetch-sap-note-playwright.py)
$env:SAP_USER="hcortez@gruporoda.com"
$env:SAP_PASS="961015195Hcv@sap"
$env:SAP_NOTE="3733425"
```

> **Seguridad:** no commitear credenciales. Los scripts que aún contienen valores por defecto (`suse-log-reader.js`, `suse-check-kba-config.js`) deben ejecutarse preferentemente con las variables de entorno definidas.

### 2.3 Instalar dependencias del proyecto

```powershell
cd D:\ProyectosPython\sap-hana-mcp-server
npm install
```

Esto instala `@sap/hana-client`, `axios`, `jose`, `nodemon` y `ssh2`.

### 2.4 Entorno virtual de Python para Playwright

```powershell
cd D:\ProyectosPython\sap-hana-mcp-server
python -m venv venv-sap
.\venv-sap\Scripts\pip install playwright
.\venv-sap\Scripts\python -m playwright install chromium
```

---

## 3. Diagnóstico paso a paso

### 3.1 Estado general de SAP HANA

Script: `scripts/health-check.js`

```powershell
node scripts\health-check.js
```

**Qué reporta:**

- Información de la base de datos, host, versión.
- Estado de los servicios HANA.
- Uso de memoria (`indexserver`, `nameserver`, etc.).
- Tablas más grandes y tablas sin clave primaria.
- Statements costosos (histórico).
- Locks, waits y eventos recientes.

**Caso actual:** HANA respondió correctamente, todos los servicios activos, 354 GB RAM, indexserver usando ~99 GB. No se detectó un cuello de botella en la base de datos.

---

### 3.2 Performance en tiempo real

Script: `scripts/realtime-performance-check.js`

```powershell
node scripts\realtime-performance-check.js
```

**Qué reporta:**

- Transacciones abiertas (`SYS.M_TRANSACTIONS`).
- Queries más lentos y más frecuentes (`SYS.M_SQL_PLAN_CACHE`).
- Conexiones largas o idle (`SYS.M_CONNECTIONS`).
- Tablas columnares con mayor delta sin fusionar (`SYS.M_CS_TABLES`).

**Hallazgos del caso actual:**

- 14,198 conexiones abiertas.
- Dos transacciones idle de ~11-13 minutos.
- Tablas `AJD1` (63 % delta) y `OITM` (51 % delta) con alto delta.

---

### 3.3 Revisión remota de logs en SUSE

Script: `scripts/suse-log-reader.js`

```powershell
$env:SUSE_HOST="hanaroda25.gruporoda.com"
$env:SUSE_USER="root"
$env:SUSE_PASSWORD="B1Admin1$"
node scripts\suse-log-reader.js
```

**Qué reporta:**

- `uptime`, `free`, `vmstat`.
- Últimas líneas de `/var/log/messages` y `/var/log/warn`.
- Procesos `httpd`/Apache activos.
- Logs de error del Service Layer (`error_5000X_log_YYYY_MM_DD`).
- Directorios de trace de HANA.

**Hallazgos del caso actual:**

- Múltiples mensajes `malloc_consolidate(): invalid chunk size` y `double free or corruption (!prev)` en los cuatro nodos (`50001-50004`).
- Procesos hijos de Apache terminaban con `SIGABRT` (`AH00051 child pid ... exit signal Aborted`).

---

### 3.4 Verificar configuración del Service Layer

Script: `scripts/suse-check-kba-config.js`

```powershell
$env:SUSE_HOST="hanaroda25.gruporoda.com"
$env:SUSE_USER="root"
$env:SUSE_PASSWORD="B1Admin1$"
node scripts\suse-check-kba-config.js
```

**Qué reporta:**

- Contenido de `/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf`.

**Configuración detectada en el caso actual:**

```apache
<IfModule mpm_prefork_module>
    StartServers             1
    MaxSpareServers          2
    MinSpareServers          1
    MaxConnectionsPerChild   1024
    MaxRequestWorkers        24
</IfModule>
```

Esta configuración coincide con la columna "De" de la KBA 3733425 y debe cambiarse a:

```apache
<IfModule mpm_prefork_module>
    StartServers             8
    MaxSpareServers          8
    MinSpareServers          8
    MaxConnectionsPerChild   1024
    MaxRequestWorkers        8
</IfModule>
```

---

### 3.5 Consultar notas SAP automáticamente

Script: `scripts/fetch-sap-note-playwright.py`

```powershell
$env:SAP_USER="hcortez@gruporoda.com"
$env:SAP_PASS="961015195Hcv@sap"
$env:SAP_NOTE="3733425"
.\venv-sap\Scripts\python scripts\fetch-sap-note-playwright.py
```

**Qué hace:**

- Abre Chromium en modo headless.
- Navega a `https://me.sap.com/notes/<SAP_NOTE>`.
- Completa el login de SAP ID (usuario y contraseña).
- Espera a que cargue la nota.
- Guarda el HTML y el texto extraído en archivos locales (`sap-note-<numero>-playwright.html/.txt`).

**Resultado del caso actual:** se obtuvo la nota completa, incluyendo la sección **Resolución** que indica el cambio exacto en `httpd-b1s-lb-member-common.conf`.

> **Nota:** si SAP modifica el flujo de login, puede ser necesario ajustar los selectores del script (`input#j_username`, `input#j_password`, botón de submit).

---

## 4. Configurar el MCP server en otra computadora

El archivo `mcp.json` actual contiene la configuración del cliente MCP. Para migrarlo a otra máquina:

1. Copiar el archivo `mcp.json`.
2. Ajustar la ruta de `node.exe` si Node.js está instalado en otra ubicación.
3. Ajustar la ruta de `hana-mcp-server.js` si el proyecto se clona en otra carpeta.
4. Revisar las variables `env` con las credenciales de HANA.

Ejemplo adaptado:

```json
{
  "mcpServers": {
    "hana": {
      "type": "stdio",
      "timeout": 600,
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["D:\\ProyectosPython\\sap-hana-mcp-server\\hana-mcp-server.js"],
      "env": {
        "HANA_HOST": "hanaroda25.gruporoda.com",
        "HANA_PORT": "30015",
        "HANA_USER": "B1ADMIN",
        "HANA_PASSWORD": "<PASSWORD>",
        "HANA_SCHEMA": "RETAIL",
        "HANA_SSL": "false",
        "HANA_ENCRYPT": "false",
        "HANA_VALIDATE_CERT": "false"
      }
    }
  }
}
```

Para evitar exponer la contraseña, se puede:

- Usar variables de entorno del sistema operativo y dejar `HANA_PASSWORD` con una referencia (no todos los clientes MCP lo soportan; ver documentación del cliente).
- O mantener `mcp.json` en una ubicación con permisos restringidos.

---

## 5. Scripts generados durante el caso

| Script | Propósito |
|--------|-----------|
| `scripts/health-check.js` | Estado general de HANA. |
| `scripts/realtime-performance-check.js` | Performance en tiempo real (transacciones, queries, conexiones, delta). |
| `scripts/suse-log-reader.js` | Revisión remota de logs del servidor SUSE. |
| `scripts/suse-check-kba-config.js` | Ver la configuración `mpm_prefork` del Service Layer. |
| `scripts/fetch-sap-note-playwright.py` | Descargar notas SAP con Playwright. |

---

## 6. Troubleshooting común

### 6.1 `Error: Cannot find module 'ssh2'`

```powershell
npm install
```

### 6.2 Playwright no encuentra Chromium

```powershell
.\venv-sap\Scripts\python -m playwright install chromium
```

### 6.3 Timeout en el login de SAP

- Verificar que las credenciales `SAP_USER` / `SAP_PASS` sean correctas.
- SAP puede solicitar 2FA o mostrar un captcha; en ese caso, la automatización fallará y habrá que copiar la nota manualmente.

### 6.4 El script de SSH no conecta

- Verificar que `SUSE_HOST`, `SUSE_USER` y `SUSE_PASSWORD` estén exportadas.
- Verificar que el puerto 22 esté accesible desde la computadora de ejecución.

---

## 7. Licenciamiento y monetización

El MCP usa un servidor de licencias online (`sap-hana-mcp-license-server`) que emite claves cortas atadas al hardware ID. El legacy JWT firmado localmente ya no se utiliza para licencias nuevas.

### 7.1 Generar el par de claves (solo el vendor)

Desde el proyecto `sap-hana-mcp-license-server`:

```powershell
cd ..\sap-hana-mcp-license-server
node scripts\generate-license-keys.js
```

Esto crea:

- `private-key.pem` — **secreto del vendor**, usado por el backend para firmar licencias. No distribuir.
- `public-key.pem` — copiarlo al cliente en `src/licensing/public-key.pem`.

### 7.2 Obtener el hardware ID del cliente

El cliente lo obtiene desde el menú de licencias del `.exe`:

```powershell
hana-mcp-server.exe --show-hwid
```

O, si tiene Node.js:

```powershell
node -e "console.log(require('./src/licensing/hardware-id').getHardwareId())"
```

### 7.3 Generar una licencia para el cliente

Usar el endpoint de administración del backend:

```powershell
curl -X POST https://licencias-mcp.onrender.com/admin/licenses `
  -H "Content-Type: application/json" `
  -H "X-API-Key: <admin-api-key>" `
  -d '{"hwid":"<hardware_id>","days":365,"product_code":"hana-b1","plan":"professional"}'
```

También se puede generar un voucher de un solo uso para que el cliente se active solo:

```powershell
curl -X POST https://licencias-mcp.onrender.com/admin/vouchers `
  -H "Content-Type: application/json" `
  -H "X-API-Key: <admin-api-key>" `
  -d '{"days":30,"count":1,"product_code":"hana-b1","plan":"professional"}'
```

### 7.4 Activar la licencia en el cliente

El cliente puede usar cualquiera de estas dos formas:

1. Variable de entorno:
   ```powershell
   $env:HANA_LICENSE_KEY="<license_key>"
   ```

2. Archivo `.hana-license` en la raíz del proyecto con la clave dentro.

Si no hay licencia, el servidor arranca en **modo demo** por 7 días con funcionalidad básica.

### 7.5 Verificar licencia

```powershell
$env:HANA_LICENSE_KEY="<token_jwt>"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hana_show_license_info","arguments":{}}}' | node hana-mcp-server.js
```

---

## 8. Base de conocimiento automática

El MCP puede guardar casos resueltos como Markdown y buscarlos posteriormente.

### 8.1 Guardar un caso

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "hana_save_knowledge_case",
    "arguments": {
      "title": "Service Layer heap corruption",
      "symptom": "Apache workers crashing with SIGABRT",
      "cause": "Race condition in CAsyncLogger destructor",
      "solution": "Apply KBA 3733425 prefork config changes",
      "category": "service-layer",
      "status": "resolved",
      "severity": "critical",
      "sap_note": "3733425",
      "tags": ["service-layer", "heap-corruption"]
    }
  }
}
```

El caso se guarda en `docs/kb/cases/YYYY-MM-DD-<slug>.md` y se actualiza `docs/kb/index.md`.

### 8.2 Buscar casos anteriores

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "hana_search_knowledge_base",
    "arguments": {
      "query": "heap corruption",
      "limit": 5
    }
  }
}
```

### 8.3 Regenerar índice

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "hana_generate_kb_index",
    "arguments": {}
  }
}
```

> Requiere que la licencia incluya la feature `knowledge-base`.

---

## 9. Consideraciones de seguridad para distribución comercial

- **No distribuir** `private-key.pem` ni los scripts de generación de licencias.
- Empaquetar el MCP como binario con `pkg` o `nexe` para dificultar la lectura del código fuente.
- Considerar ofuscación con `javascript-obfuscator` como capa adicional.
- Validación online opcional configurando `HANA_LICENSE_SERVER_URL`.
- Cambiar la licencia del proyecto si se va a comercializar (actualmente MIT).

---

## 10. Referencias

- `docs/informe-service-layer-crash-3733425.md` — Informe completo del caso.
- `docs/base-de-conocimiento.md` — Punto de entrada a la base de conocimiento.
- KBA 3733425 — *Service Layer worker process termination due to heap corruption under high load*.
- SAP Note 2418476 — Service Layer log rotation.
- SAP Note 3027326 — Service Layer core dumps.
- KBA 3157498 — Service Layer log file configuration.
- KBA 3157607 — How to analyze core dumps.
