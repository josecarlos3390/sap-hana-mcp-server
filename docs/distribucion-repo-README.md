# HANA MCP Server — Distribución cliente

Paquete ejecutable del **Model Context Protocol (MCP) server** para SAP HANA y SAP Business One Service Layer.

## 📥 Descarga

Descargá la última versión desde [Releases](../../releases):

- `hana-mcp-server-v0.3.1-win-x64.zip`

Descomprimí el ZIP en una carpeta permanente, por ejemplo:

```
C:\hana-mcp-client\
```

## ✅ Requisitos

- Windows 10/11 o Windows Server 2019+ (x64)
- Acceso de red al servidor SAP HANA
- Token de licencia JWT proporcionado por el vendor (si aplica)

> **No necesitás instalar Node.js**: el ejecutable incluye su propio runtime.

## 🚀 Instalación rápida

1. Descomprimí el ZIP en la carpeta destino.
2. Copiá `.env.example` como `.env` y completá al menos:
   - `HANA_HOST`
   - `HANA_PORT`
   - `HANA_USER`
   - `HANA_PASSWORD`
   - `HANA_SCHEMA`
3. Si recibiste el token JWT como archivo, guardalo como `.hana-license` en la misma carpeta.
4. Ejecutá `start.bat` (doble clic) o configurá tu cliente MCP para que apunte a `hana-mcp-server.exe`.

## ⚙️ Configuración de `.env`

Ejemplo mínimo:

```env
HANA_HOST=tu-servidor-hana
HANA_PORT=30015
HANA_USER=TU_USUARIO
HANA_PASSWORD=TU_PASSWORD
HANA_SCHEMA=TU_SCHEMA
HANA_SSL=false
HANA_VALIDATE_CERT=false
```

Ver `.env.example` para todas las opciones disponibles.

## 🔐 Licenciamiento

Obtené tu **hardware ID** ejecutando el servidor y consultando la tool `hana_show_license_info`. Enviale ese HWID al vendor para que genere tu token.

```json
{
  "name": "hana_show_license_info",
  "arguments": {}
}
```

Una vez instalado el token, la misma tool debe reportar:

```
status: VALID
plan: enterprise
features: ["hana", "knowledge-base"]
```

## 🔌 Uso con Claude / VS Code / MCP Inspector

Ejemplo de `mcp.json`:

```json
{
  "mcpServers": {
    "hana": {
      "type": "stdio",
      "command": "C:\\hana-mcp-client\\hana-mcp-server.exe"
    }
  }
}
```

## 🔄 Actualizaciones

El servidor **nunca** se actualiza solo. Cuando haya una nueva versión, el vendor la publicará en Releases. Podés consultarla con la tool `hana_check_for_updates` y aplicarla con `hana_apply_update`:

```json
{
  "name": "hana_apply_update",
  "arguments": {
    "confirm": true
  }
}
```

El proceso preserva tu base de conocimiento local (`docs/kb/cases/`) y tu configuración (`.env`, `.hana-license`, `mcp.json`).

## 📁 Contenido del paquete

- `hana-mcp-server.exe` — MCP empaquetado con Node.js.
- `start.bat` — lanzador para Windows.
- `docs/kb/cases/` — base de conocimiento local.
- `node_modules/@sap/hana-client/` — driver nativo de SAP HANA.
- `public-key.pem` — clave pública para validar licencias.
- `.env.example` — plantilla de configuración.
- `mcp.json.example` — plantilla de configuración MCP.
- `scripts/update-client.ps1` / `update-client.sh` — helpers de actualización.

## 📴 Modo offline (licencia vencida)

Si la licencia expira, el MCP **no se cierra**: entra en modo offline y mantiene disponible la base de conocimiento local en modo de solo lectura.

- Funcionan:
  - `hana_search_knowledge_base`
  - `hana_read_kb_case`
  - `hana_generate_kb_index`
  - `hana_show_license_info`
- No funcionan hasta renovar la licencia:
  - Todas las tools de consulta y administración de HANA.
  - Guardar nuevos casos (`hana_save_knowledge_case`).
  - Sincronización remota de KB.

## 🆘 Soporte

Para renovar la licencia, agregar hardware IDs adicionales o reportar problemas, contactá al vendor con el hardware ID mostrado por `hana_show_license_info`.
