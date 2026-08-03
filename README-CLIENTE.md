# HANA MCP Server — Paquete del cliente

Este paquete contiene el Model Context Protocol (MCP) server para SAP HANA y SAP Business One Service Layer empaquetado como ejecutable para Windows.

## Requisitos

- Windows 10/11 o Windows Server 2019+ (x64)
- Acceso de red al servidor SAP HANA
- Token de licencia JWT proporcionado por el vendor (si aplica)

> No es necesario tener Node.js instalado: el ejecutable incluye su propio runtime.

## Instalación

1. Descomprimir el ZIP en una ubicación permanente, por ejemplo:
   ```
   C:\hana-mcp-client\
   ```

2. Copiar `.env.example` como `.env` y completar al menos:
   - `HANA_HOST`
   - `HANA_PORT`
   - `HANA_USER`
   - `HANA_PASSWORD`
   - `HANA_SCHEMA`
   - `HANA_LICENSE_KEY` (si no se usa `.hana-license`)

3. Si el vendor entregó el token en un archivo, guardarlo como `.hana-license` en la misma carpeta.

4. Ejecutar `start.bat` (doble clic) o invocar `hana-mcp-server.exe` desde tu cliente MCP.

## Gestión de licencias

Este paquete incluye un menú interactivo para activar y transferir licencias sin necesidad de editar archivos manualmente.

### Abrir el menú de licencias

Ejecuta en consola:

```bash
node scripts/license-menu.js
```

O haz doble clic en `license-menu.bat`.

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

El script `license-menu.js` también acepta argumentos para automatizar el proceso:

```bash
# Ver el Hardware ID
node scripts/license-menu.js --show-hwid

# Canjear un voucher directamente
node scripts/license-menu.js --redeem ABCD-EFGH-IJKL-MNOP

# Activar una licencia directa
node scripts/license-menu.js --activate WXYZ-1234-ABCD-5678
```

Esto es útil si querés incluir la activación dentro de un script de instalación.

---

## Verificación

Una vez iniciado, la tool `hana_show_license_info` debe reportar:

```
status: VALID
plan: <plan-asignado>
features: ["hana", "knowledge-base", ...]
```

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

## Contenido del paquete

- `hana-mcp-server.exe` — MCP empaquetado con Node.js.
- `docs/kb/cases/` — base de conocimiento local.
- `docs/kb/index.md` — índice de la KB.
- `public-key.pem` — clave pública para validar licencias.
- `.env.example` — plantilla de configuración.
- `mcp.json.example` — plantilla de configuración MCP.
- `start.bat` — lanzador para Windows.
- `scripts/update-client.ps1` / `update-client.sh` — helpers de actualización.
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
