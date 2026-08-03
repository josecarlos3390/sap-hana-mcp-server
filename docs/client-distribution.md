# Guía de distribución al cliente

Esta guía define qué archivos se deben entregar localmente al cliente y cuáles deben quedar exclusivamente del lado del vendor (nosotros).

## Objetivo

El cliente recibe un paquete mínimo, seguro y funcional para ejecutar el MCP localmente. No debe incluirse código del backend de licenciamiento, claves privadas, scripts administrativos ni credenciales.

---

## Opción recomendada: ejecutable empaquetado

Para proteger el código fuente, el paquete ideal es un ejecutable generado con
`pkg`:

```
hana-mcp-client/
├── hana-mcp-server.exe          # MCP empaquetado con Node.js
├── docs/
│   └── kb/
│       ├── cases/               # Base de conocimiento local
│       └── index.md             # Índice de KB
├── node_modules/                # @sap/hana-client + dependencias nativas
│   └── @sap/hana-client/
├── public-key.pem               # Clave pública para validar licencias
├── .env.example                 # Plantilla de configuración
├── mcp.json.example             # Plantilla de configuración MCP
├── README-CLIENTE.md            # Instrucciones de instalación
├── start.bat                    # Lanzador para Windows (doble clic)
└── scripts/
    ├── update-client.ps1        # Updater para hana_apply_update
    └── update-client.sh
```

### Cómo construirlo

Desde la raíz del repositorio (Windows):

```powershell
npm run build:exe
```

Esto ejecuta `scripts/build-exe.ps1`, que:

1. Empaqueta el código con `pkg` en un único `.exe` Windows x64.
2. Incluye el binario nativo de `@sap/hana-client` dentro del ejecutable como asset.
3. Copia una copia real de `node_modules/@sap/hana-client` junto al `.exe` para que el driver nativo pueda cargarse desde el filesystem.
4. Copia assets de runtime: `docs/kb/`, `public-key.pem`, `.env.example`, `scripts/update-client.*`, `start.bat`, `README.md` (a partir de `docs/distribucion-repo-README.md`), etc.
5. Produce un ZIP en `dist/hana-mcp-server-v<version>-win-x64.zip`.

El ZIP extrae una carpeta `hana-mcp-server-exe/`. El cliente debe:

1. Configurar `.env` dentro de esa carpeta (copiar `.env.example` y completar los valores).
2. Guardar el token JWT en `.hana-license` si se entrega por separado.
3. Ejecutar `start.bat` (doble clic) o apuntar su MCP client a `hana-mcp-server.exe`.

### Ventajas

- El cliente no necesita tener Node.js instalado.
- El código fuente queda empaquetado en el binario.
- Menor riesgo de manipulación o extracción de lógica.
- Solo se exponen assets de KB, la clave pública y los scripts de actualización.

### Inconvenientes

- Requiere compilar en Windows para destino Windows x64.
- `pkg` muestra advertencias sobre archivos no-JS de `axios`, pero el ejecutable resultante funciona.
- Hay que probar el ejecutable en Windows del cliente.

---

## Opción alternativa: carpeta con fuente (más simple)

Si no se empaqueta como ejecutable, se entrega una carpeta con el proyecto Node.js:

```
hana-mcp-client/
├── hana-mcp-server.js
├── src/                         # Código fuente del MCP
│   ├── licensing/public-key.pem
│   └── ...
├── docs/
│   └── kb/
│       ├── cases/
│       └── index.md
├── package.json
├── node_modules/                # Dependencias instaladas
├── .env.example
├── mcp.json.example
├── README-CLIENTE.md
└── start.bat / start.ps1
```

### Ventajas

- Fácil de construir y actualizar.
- No depende de empaquetadores.

### Inconvenientes

- El código fuente queda expuesto.
- El cliente podría intentar modificar lógica de licenciamiento.

---

## Qué NO debe entregarse al cliente

| Ruta | Motivo |
|------|--------|
| `private-key.pem` | Clave privada de firma de licencias. Vive en el proyecto `sap-hana-mcp-license-server`. |
| `src/licensing/private-key.pem` | Si existiera. |
| `.env` real del cliente | Se crea en sitio; no se commitea ni se distribuye. |
| `mcp.json` real del cliente | Contiene contraseñas; usar `mcp.json.example`. |
| `tests/` | No es necesario en producción. |
| `docs/propuesta-comercial*.md` | Documentación interna comercial. |
| `docs/license-server-portable-config.md` | Guía del backend; vive en el proyecto `sap-hana-mcp-license-server`. |

---

## Archivos de configuración del cliente

### `.env`

El archivo `.env` se crea en el cliente a partir de `.env.example`. Debe contener:

- Datos de conexión HANA.
- Datos de acceso SUSE (si aplica).
- Token de licencia JWT.
- URLs del license server y KB remoto.
- Código de producto (`HANA_LICENSE_PRODUCT_CODE`).

### `mcp.json`

Configuración del cliente para Claude Code / VS Code. Ejemplo:

```json
{
  "mcpServers": {
    "hana": {
      "type": "stdio",
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\hana-mcp-client\\hana-mcp-server.js"],
      "env": {
        "HANA_LICENSE_KEY": "<token-jwt>",
        "HANA_LICENSE_SERVER_URL": "https://tu-app.railway.app/api/license/validate",
        "HANA_KB_REMOTE_URL": "https://tu-app.railway.app/api/kb",
        "HANA_LICENSE_PRODUCT_CODE": "hana-b1",
        "HANA_HOST": "<host>",
        "HANA_PORT": "30015",
        "HANA_USER": "<user>",
        "HANA_PASSWORD": "<pass>",
        "HANA_SCHEMA": "<schema>"
      }
    }
  }
}
```

> **Seguridad:** nunca incluir contraseñas en archivos que se versionen o distribuyan. Configurar directamente en el host del cliente.

---

## Modo offline cuando la licencia vence

Si el token JWT expira, el MCP **no se cierra**: entra en modo offline y mantiene disponible la base de conocimiento local en modo de solo lectura.

- Funcionan:
  - `hana_search_knowledge_base`
  - `hana_read_kb_case`
  - `hana_generate_kb_index`
  - `hana_show_license_info`
- No funcionan hasta renovar la licencia:
  - Todas las tools de HANA (consultas, schemas, tablas, monitoreo, etc.).
  - Guardar nuevos casos (`hana_save_knowledge_case`).
  - Sincronización remota de KB.

Esto garantiza que el cliente siempre pueda consultar la documentación y casos documentados, incluso durante una renovación de licencia.

## Base de conocimiento local

El directorio `docs/kb/cases/` se entrega al cliente para que `hana_search_knowledge_base` funcione sin conexión. Incluye:

- Artículos de diagnóstico HANA (memory, CPU, SQL, system-wide).
- Artículos del Service Layer (performance, errores comunes).
- Cualquier caso específico generado para el cliente.

El índice `docs/kb/index.md` se regenera automáticamente al iniciar el servidor.

---

## Proceso de entrega sugerido

1. Generar el paquete ejecutable con `npm run build:exe` (o la carpeta fuente con `scripts/build-client-package.ps1`).
2. Validar que no haya archivos sensibles en el paquete.
3. Probar el ejecutable en una máquina limpia **sin** Node.js instalado.
4. Entregar al cliente junto con el token JWT generado para su hardware ID.
5. Configurar `mcp.json` o `.env` en el equipo del cliente.
6. Verificar que `hana_show_license_info` reporta `VALID`.

---

## Actualizaciones controladas por el usuario (manual confirmation)

El MCP **nunca** aplica actualizaciones automáticamente. El usuario debe confirmar explícitamente antes de instalar una nueva versión.

### Cómo funciona

1. El backend almacena releases en la tabla `releases` (versión, URL de descarga, checksum, notas).
2. Al iniciar, el MCP consulta `GET /api/version?product=hana-b1`.
3. Si hay una versión mayor:
   - Se registra una advertencia en los logs.
   - Si la actualización es **opcional**, el MCP continúa funcionando normalmente.
   - Si la actualización es **mandatoria** (`is_mandatory=true`), el MCP se niega a arrancar hasta que el usuario la aplique.
4. El usuario ejecuta la tool `hana_apply_update` con `confirm: true`.
5. El MCP descarga el ZIP, verifica el checksum SHA256, guarda `.pending-update.json`, lanza `scripts/update-client.ps1` (o `.sh`) y se cierra.
6. El updater script espera a que el proceso padre termine, extrae el ZIP sobre la carpeta de instalación y **preserva**:
   - `docs/kb/cases/` (conocimiento local del cliente)
   - `.env`, `mcp.json`
   - `.hana-license`, `.hana-license-cache.json`
7. Reinicia el MCP.

### Tools expuestas al usuario

- `hana_check_for_updates` — consulta si hay una nueva versión disponible.
- `hana_apply_update` — descarga e instala la última versión (requiere `confirm: true`).

### Publicar una nueva versión

```bash
curl -X POST https://tu-app.railway.app/admin/releases \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <ADMIN_API_KEY>" \
  -d '{
    "product_id": "<uuid-producto>",
    "version": "1.1.0",
    "download_url": "https://tu-cdn.com/hana-mcp-client-1.1.0.zip",
    "checksum": "<sha256-del-zip>",
    "release_notes": "Mejoras de rendimiento y nuevos diagnósticos.",
    "is_mandatory": false
  }'
```

### Recomendaciones

- Almacenar el ZIP de actualización en un CDN o bucket seguro (S3, R2, etc.).
- Firmar o checksumar el paquete; el cliente valida el SHA256 antes de aplicar.
- Hacer pruebas en un entorno de staging antes de marcar una release como `is_mandatory`.
- Evitar actualizaciones obligatorias a menos que sea estrictamente necesario (por ejemplo, por seguridad o cambios de protocolo).

## Empaquetado como ejecutable (próximos pasos)

Para generar `.exe` se recomienda:

1. Instalar `pkg`:
   ```bash
   npm install -g pkg
   ```
2. Configurar `package.json` con assets necesarios.
3. Ejecutar el build.
4. Copiar binarios nativos de `@sap/hana-client` junto al `.exe`.
5. Probar en Windows.

Ver script `scripts/build-client-package.ps1` para una primera versión automatizada.
