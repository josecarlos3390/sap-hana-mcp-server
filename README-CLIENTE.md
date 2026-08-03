# HANA MCP Server — Paquete del cliente

Este paquete contiene el Model Context Protocol (MCP) server para SAP HANA y SAP Business One Service Layer empaquetado como ejecutable para Windows.

## Requisitos

- Windows 10/11 o Windows Server 2019+ (x64)
- Acceso de red al servidor SAP HANA
- **Licencia activa** generada con el menú de licencias incluido (ver más abajo). El servidor no arranca sin una licencia válida.

> No es necesario tener Node.js instalado: el ejecutable incluye su propio runtime.

## Instalación

1. Descomprimir el ZIP en una ubicación permanente, por ejemplo:
   ```
   C:\hana-mcp-client\
   ```

2. Abrir el menú de licencias (`license-menu.bat`) y seleccionar **5. Configurar conexión a HANA (asistente)** para crear automáticamente el `.env` y el archivo de configuración para tu agente de IA.

3. Activar la licencia con la opción **2. Activar Licencia** → **Canjear voucher** (o **Activar licencia directa** si el vendor te entregó una clave).

4. Copiar el archivo de configuración generado para tu agente (Claude Desktop, Kimi Code, VS Code u OpenCode) en la ubicación correspondiente.

5. Reiniciar tu agente de IA.

> Si preferís configurar manualmente, ver la sección [Configuración manual por agente](#configuración-manual-por-agente) más abajo.

## Configuración con el asistente

El menú de licencias incluye un asistente interactivo (opción **5**) que pregunta:

- Host, puerto, usuario, contraseña y schema de SAP HANA.
- Tipo de conexión (`auto`, `single_container`, `mdc_tenant`, `mdc_system`).
- Si usar SSL/encriptación/validación de certificado.
- Qué agente de IA vas a usar.

Al finalizar genera:

- `.env` en la carpeta del MCP.
- Un archivo JSON de ejemplo listo para copiar en tu agente (`claude-desktop-config.json`, `kimi-code-config.json`, `vscode-mcp-config.json` u `opencode-config.json`).

## Compatibilidad con agentes

El HANA MCP Server implementa el protocolo **Model Context Protocol (MCP) sobre stdio**, por lo que es compatible con cualquier cliente MCP. Hemos probado y documentado la configuración para:

- **Claude Desktop** — usa `claude_desktop_config.json`.
- **Kimi Code** — usa `mcp.json` o la configuración MCP del IDE.
- **VS Code** — extensión MCP / Cline / Claude Code, usa `settings.json`.
- **OpenCode** — usa `opencode.json`.

La configuración es esencialmente la misma: apuntar el comando al ejecutable (`hana-mcp-server.exe`) y pasar las variables de entorno necesarias. Cada agente tiene su propio formato de archivo.

## Configuración manual por agente

Si no usás el asistente, copiá `.env.example` a `.env`, completalo, y luego copiá la sección correspondiente a tu agente.

### Claude Desktop

Guardar como `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hana": {
      "command": "C:\\hana-mcp-client\\hana-mcp-server.exe",
      "args": [],
      "env": {
        "HANA_LICENSE_FILE": "C:\\hana-mcp-client\\.hana-license",
        "HANA_LICENSE_SERVER_URL": "https://licencias-mcp.onrender.com",
        "HANA_LICENSE_PRODUCT_CODE": "hana-b1",
        "HANA_KB_REMOTE_URL": "https://licencias-mcp.onrender.com/api/kb",
        "HANA_HOST": "<host-hana>",
        "HANA_PORT": "30015",
        "HANA_USER": "<usuario-hana>",
        "HANA_PASSWORD": "<contraseña-hana>",
        "HANA_SCHEMA": "<schema>",
        "HANA_SSL": "false",
        "HANA_ENCRYPT": "false",
        "HANA_VALIDATE_CERT": "false",
        "LOG_LEVEL": "info",
        "ENABLE_FILE_LOGGING": "true",
        "ENABLE_CONSOLE_LOGGING": "false"
      }
    }
  }
}
```

### Kimi Code

Guardar como `%USERPROFILE%\.kimi\mcp.json` (o la ruta que indique la documentación de Kimi):

```json
{
  "mcpServers": {
    "hana": {
      "type": "stdio",
      "command": "C:\\hana-mcp-client\\hana-mcp-server.exe",
      "args": [],
      "env": { /* mismas variables que Claude Desktop */ }
    }
  }
}
```

### VS Code (extensión MCP)

Agregar al `settings.json` de VS Code:

```json
{
  "mcp": {
    "servers": {
      "hana": {
        "type": "stdio",
        "command": "C:\\hana-mcp-client\\hana-mcp-server.exe",
        "args": [],
        "env": { /* mismas variables que Claude Desktop */ }
      }
    }
  }
}
```

### OpenCode

Guardar como `%USERPROFILE%\.opencode\config.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hana": {
      "type": "local",
      "command": ["C:\\hana-mcp-client\\hana-mcp-server.exe"],
      "enabled": true,
      "env": { /* mismas variables que Claude Desktop */ }
    }
  }
}
```

## Gestión de licencias

Este paquete incluye un menú interactivo para activar y transferir licencias sin necesidad de editar archivos manualmente.

### Abrir el menú de licencias

Haz doble clic en `license-menu.bat` o ejecuta en consola:

```bash
hana-mcp-server.exe --license-menu
```

### Opciones del menú

#### 1. Ver mi Hardware ID

Muestra el identificador único de esta máquina. Envía este código por WhatsApp a tu proveedor para solicitar o renovar la licencia.

#### 2. Activar Licencia

Al seleccionar **2** verás dos opciones:

##### Canjear voucher (recomendado)

Si el proveedor te envió un voucher (código de un solo uso):

1. Selecciona **2** → **1** (Canjear voucher).
2. Ingresa el voucher.
3. El sistema genera automáticamente una licencia atada al Hardware ID de esta máquina y la guarda en `.hana-license`.

Después de canjear puedes iniciar el MCP con `start.bat`.

##### Activar licencia directa

Si el proveedor te envió directamente una clave de licencia:

1. Selecciona **2** → **2** (Activar licencia directa).
2. Ingresa la clave recibida.
3. El menú valida la clave contra el servidor de licencias y, si es válida, la guarda en `.hana-license`.

#### 4. Ver Información de mi Licencia

Muestra los datos de la licencia guardada en `.hana-license`:

- Clave de licencia.
- Plan contratado.
- Fecha de vencimiento.
- Días restantes.
- Características incluidas.

Si la licencia está por vencer (3 días o menos), muestra una advertencia.

#### 3. Transferir Licencia

Si cambias de servidor o máquina y quieres mover tu licencia:

1. En la máquina **nueva**, abre el menú y selecciona **1** para ver su Hardware ID. Anótalo.
2. En la máquina **antigua**, abre el menú y selecciona **3**.
3. Ingresa el Hardware ID de la máquina nueva y tu clave de licencia actual.
4. El sistema revoca la licencia antigua, crea una nueva para la máquina nueva con los **mismos días restantes** y la guarda en `.hana-license`.
5. Copia el archivo `.hana-license` de la máquina antigua a la máquina nueva, o anota la nueva clave y actívala en la máquina nueva con la opción **2**.

> ⚠️ La licencia antigua queda inactiva inmediatamente. Asegúrate de ya no necesitarla.

### Modo consola (sin menú interactivo)

El mismo ejecutable acepta argumentos para automatizar la gestión de licencias sin abrir el menú interactivo:

```bash
# Ver el Hardware ID
hana-mcp-server.exe --show-hwid

# Canjear un voucher directamente
hana-mcp-server.exe --redeem ABCD-EFGH-IJKL-MNOP

# Activar una licencia directa
hana-mcp-server.exe --activate WXYZ-1234-ABCD-5678

# Ver información de la licencia guardada
hana-mcp-server.exe --license-info
```

Esto es útil si querés incluir la activación dentro de un script de instalación.

### Licencias de evaluación (demo)

Si necesitás probar el MCP antes de comprar, solicitale al vendor una **licencia demo**. Se genera como cualquier otra licencia pero con una duración corta (por ejemplo, 7 días). Una vez vencida, el servidor no arranca hasta renovarla; no hay período de prueba automático.

---

## Verificación

Una vez iniciado, la tool `hana_show_license_info` debe reportar:

```
status: VALID
plan: <plan-asignado>
features: ["hana", "knowledge-base", ...]
```

## Diagnósticos del servidor SUSE (Service Layer / HANA)

Si el servidor SAP Business One Service Layer y/o HANA corren en un host SUSE, el MCP puede leer logs y configuración vía SSH usando las herramientas:

- `hana_suse_read_logs` — lee `/var/log/messages`, `/var/log/warn`, procesos `httpd`, logs de error del Service Layer y traces del `indexserver` de HANA. Acepta `lines`, `service_layer` y `hana` (todo opcional).
- `hana_suse_read_config` — lee el archivo `/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf` (objetivo de la KBA 3733425).
- `hana_suse_check_service_layer` — recupera versión, parches, configuración y estado de `httpd` del Service Layer.

Requiere definir en el `.env` o en la configuración del agente:

```env
SUSE_HOST=<host-suse>
SUSE_USER=<usuario-ssh>
SUSE_PASSWORD=<contraseña-ssh>
```

Estas herramientas son **solo lectura** y usan un catálogo fijo de comandos SSH; no ejecutan comandos arbitrarios.

## Actualizaciones

El MCP **nunca** se actualiza solo. Cuando haya una nueva versión disponible, verás una advertencia al iniciar o puedes consultarla con la tool `hana_check_for_updates`.

Para instalar una actualización, ejecuta la tool `hana_apply_update` con:

```json
{
  "confirm": true
}
```

Esto descargará la nueva versión, preservará tu base de conocimiento local (`docs/kb/cases/`) y tu configuración (`.env`, `mcp.json`, licencia), y reiniciará el servidor.

Si una actualización es marcada como **mandatoria** por el vendor, el MCP no arrancará hasta que la apliques.

## Base de conocimiento remota

Además de la KB local (`docs/kb/cases/`), el MCP puede sincronizar casos nuevos desde un servidor remoto. Esto permite que el proveedor publique diagnósticos y lecciones aprendidas sin que tengas que reinstalar el paquete.

Para habilitarla, configurá en tu `.env`:

```env
HANA_KB_REMOTE_URL=https://licencias-mcp.onrender.com/api/kb
HANA_KB_SYNC_INTERVAL_HOURS=24
```

El MCP descargará automáticamente los casos en `docs/kb/remote/` y los incluirá en las búsquedas.

También podés forzar una sincronización manual reiniciando el servidor.

## Captura de notas SAP y casos de diagnóstico

El MCP incluye herramientas para guardar conocimiento directamente en la KB local:

- `hana_fetch_sap_note` — guarda el contenido de una Nota SAP / KBA en la KB local (`docs/kb/user/`). Si le pasás el texto completo en el parámetro `content`, lo guarda directamente. Si no, intenta ejecutar el script Playwright `scripts/fetch-sap-note-playwright.py`, que requiere las variables de entorno `SAP_USER`, `SAP_PASS` y `SAP_NOTE`, y que Playwright esté instalado en el entorno virtual `venv-sap`.
- `hana_create_diagnostic_case` — guarda una sesión de diagnóstico como caso de KB local, con campos como síntoma, causa, solución, evidencia, lecciones aprendidas y nota SAP relacionada. Requiere el título (`title`).

Ambas tools necesitan una licencia activa con la característica `knowledge-base`.

## Verificación de requisitos

Antes de usar el MCP, ejecutá la verificación de requisitos:

```bash
hana-mcp-server.exe --check-requirements
```

O desde el menú de licencias seleccionando **6. Verificar/instalar requisitos**.

Esto revisa:

- Node.js >= 18 (solo para el paquete source).
- Existencia de `.env` y variables de conexión HANA.
- Licencia activa (`.hana-license` o `HANA_LICENSE_KEY`).
- Credenciales SUSE SSH (opcional, para tools de diagnóstico SUSE).
- Python + Playwright (opcional, para descarga automática de SAP Notes).

Si faltan dependencias opcionales, el MCP funciona igual pero algunas features estarán deshabilitadas.

### Instalar requisitos opcionales

Para habilitar la descarga automática de SAP Notes:

```bash
hana-mcp-server.exe --install-requirements
```

Esto instala Playwright y el navegador Chromium. Requiere Python 3 previamente instalado.

## Contenido del paquete

- `hana-mcp-server.exe` — MCP empaquetado con Node.js.
- `docs/kb/bundled/` — base de conocimiento incluida con el producto (se puede actualizar con nuevas versiones).
- `docs/kb/user/` — casos que vos o tu equipo creen con el MCP (nunca se sobrescriben).
- `docs/kb/remote/` — casos sincronizados desde el servidor remoto.
- `docs/kb/index.md` — índice de la KB.
- `public-key.pem` — clave pública para validar licencias.
- `.env.example` — plantilla de configuración.
- `.hana-license` — archivo donde se guarda la licencia activa (se crea al activar).
- `mcp.json.example` — plantilla de configuración MCP.
- `start.bat` — lanzador del servidor MCP para Windows.
- `license-menu.bat` / `license-menu.ps1` — lanzadores del menú de licencias.
- `scripts/update-client.ps1` / `update-client.sh` — helpers de actualización.
- `node_modules/@sap/hana-client/` — driver nativo de SAP HANA necesario en runtime.
- `node_modules/@sap/hana-client/` — driver nativo de SAP HANA necesario en runtime.

## Modo offline (licencia vencida)

Si la licencia expira, el MCP no deja de funcionar completamente: entra en **modo offline** y mantiene accesible la base de conocimiento local para lectura.

- ✅ Puedes usar:
  - `hana_search_knowledge_base`
  - `hana_read_kb_case`
  - `hana_generate_kb_index`
  - `hana_show_license_info`
- ❌ Están bloqueadas temporalmente:
  - Todas las tools de consulta y administración de HANA.
  - Guardar nuevos casos (`hana_save_knowledge_case`).
  - Sincronización remota de la KB.

Para salir del modo offline, renueva la licencia con el vendor y reinicia el servidor.

## Soporte

Para renovar la licencia o agregar hardware IDs adicionales, contactar al vendor con el hardware ID mostrado por `hana_show_license_info`.
