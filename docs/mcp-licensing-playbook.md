# Playbook: Cómo agregar licenciamiento comercial a cualquier MCP

Este documento resume el esquema de licenciamiento, knowledge base remota, empaquetado al cliente y actualizaciones controladas que implementamos para el HANA MCP Server. Puede reutilizarse como checklist para otros MCPs.

---

## 1. Arquitectura general

```
┌─────────────────────────────────────────────────────────────────┐
│                        VENDOR (tú)                              │
│  ┌─────────────────────┐      ┌─────────────────────────────┐  │
│  │ License Server      │      │ CDN / Bucket                │  │
│  │ (Render + Postgres) │      │ (paquetes de actualización) │  │
│  └─────────────────────┘      └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENTE (usuario final)                    │
│  ┌─────────────────────┐      ┌─────────────────────────────┐  │
│  │ MCP Client          │◄────►│ Local KB (docs/kb/cases/)   │  │
│  │ (Node.js / .exe)    │      │ Remote KB sync (docs/kb/remote) │
│  └─────────────────────┘      └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Responsabilidad |
|------------|-----------------|
| `sap-hana-mcp-license-server` (repo aparte) | Valida licencias, emite JWT, administra clientes, suscripciones, facturación y releases. |
| `src/licensing/` (cliente) | Lee licencia, valida JWT con clave pública, obtiene hardware ID, consulta online. |
| `src/knowledge-base/` (cliente) | Escribe casos locales, sincroniza KB remota, genera índice, busca. |
| `scripts/build-client-package.ps1` | Genera carpeta de instalación y ZIP de distribución. |
| `scripts/update-client.ps1` | Aplica actualizaciones preservando KB/config local. |

---

## 2. Preparar el backend (una sola vez por producto)

### 2.1 Reutilizar o desplegar el license server

El backend de licencias vive en un proyecto separado (`licencias-mcp`). Para un nuevo MCP podés:

- Reutilizar el mismo backend y registrar un nuevo producto en `mcp_products`.
- Clonar el repo, generar nuevas claves y desplegar una instancia propia.

### 2.2 Generar o reutilizar claves RSA

Desde el proyecto `sap-hana-mcp-license-server`:

```bash
node scripts/generate-license-keys.js
```

- `private-key.pem` → solo en el backend (variable de entorno `JWT_PRIVATE_KEY`).
- `public-key.pem` → copiarlo al cliente en `src/licensing/public-key.pem`.

### 2.3 Desplegar el backend

El backend se despliega manualmente en Render (o Railway) siguiendo la guía del proyecto `sap-hana-mcp-license-server`:

```bash
cd sap-hana-mcp-license-server
npm install
npm run db:init
npm start
```

También se puede usar la imagen/portable descrita en `docs/license-server-portable-config.md` del mismo proyecto.

### 2.4 Inicializar base de datos

```bash
npm run db:init
```

### 2.5 Crear producto, organización, suscripción y licencia

Ver `docs/license-server-portable-config.md` secciones 4.1–4.4.

---

## 3. Preparar el cliente MCP

### 3.1 Copiar módulos de licenciamiento y KB

Copiar al nuevo MCP:

```
src/licensing/
src/knowledge-base/
```

Instalar dependencias:

```bash
npm install jsonwebtoken node-machine-id dotenv axios
```

### 3.2 Integrar validación de licencia al inicio

En el punto de entrada del MCP (ej. `src/server/index.js`):

```js
const licenseManager = require('../licensing/license-manager');
const { syncRemoteKB, schedulePeriodicSync } = require('../knowledge-base/remote-sync');
const { generateIndex } = require('../knowledge-base/index-manager');
const { checkForUpdates } = require('../licensing/update-checker');

async function start() {
  const license = await licenseManager.validate();

  // Notify about available updates (user must confirm)
  const updateInfo = await checkForUpdates();
  if (updateInfo.updateAvailable) {
    if (updateInfo.mandatory) {
      throw new Error(`Mandatory update available: ${updateInfo.latestVersion}. Apply with hana_apply_update.`);
    }
    console.warn(`Update available: ${updateInfo.latestVersion}. Apply with hana_apply_update.`);
  }

  if (licenseManager.hasFeature('knowledge-base')) {
    await syncRemoteKB();
    generateIndex();
    schedulePeriodicSync();
  }

  // ... iniciar MCP
}
```

### 3.3 Agregar tools de licencia y KB

En `src/constants/tool-definitions.js`:

- `hana_show_license_info`
- `hana_check_for_updates`
- `hana_apply_update`
- `hana_save_knowledge_case`
- `hana_search_knowledge_base`
- `hana_generate_kb_index`

En `src/tools/index.js` conectar con las implementaciones correspondientes.

### 3.4 Configurar variables de entorno

Añadir a `.env.example`:

```env
HANA_LICENSE_KEY=
HANA_LICENSE_SERVER_URL=https://tu-app.railway.app/api/license/validate
HANA_KB_REMOTE_URL=https://tu-app.railway.app/api/kb
HANA_LICENSE_PRODUCT_CODE=<product-code>
HANA_LICENSE_CHECK_INTERVAL_HOURS=24
HANA_LICENSE_OFFLINE_GRACE_HOURS=72
```

### 3.5 Copiar la clave pública

Asegurar que `src/licensing/public-key.pem` esté presente en el cliente.

---

## 4. Empaquetar y distribuir al cliente

### 4.1 Ejecutar build

```powershell
./scripts/build-client-package.ps1
```

Esto genera:
- `dist/hana-mcp-client/` — carpeta lista para instalar.
- `dist/hana-mcp-client-<version>.zip` — ZIP para subir a CDN.

### 4.2 Entregar al cliente

El paquete debe contener:

```
hana-mcp-client/
├── hana-mcp-server.js
├── src/
├── docs/kb/cases/
├── docs/kb/index.md
├── scripts/update-client.ps1
├── scripts/update-client.sh
├── .env.example
├── mcp.json.example
├── README-CLIENTE.md
├── start.bat
├── start.ps1
└── node_modules/
```

### 4.3 Qué NUNCA entregar

- `private-key.pem`
- Scripts de generación de licencias/tokens (viven en el proyecto del backend).
- `.env` real del cliente.

---

## 5. Telemetría y dashboard (opcional pero recomendado)

### 5.1 Backend

El backend expone:
- `POST /api/telemetry/heartbeat` — recibe pings del cliente.
- `POST /api/telemetry/event` — recibe eventos (tool usada, error, etc.).
- `GET /admin/dashboard/overview` — resumen de instalaciones activas, versiones, errores.
- `GET /admin/dashboard/installations` — detalle por hardware key.
- `GET /admin/dashboard/usage` — tools más usadas y errores recientes.

### 5.2 Cliente

- Copiar/crear `src/telemetry/telemetry-client.js`.
- Llamar `telemetry.scheduleHeartbeats(...)` al iniciar.
- Enviar eventos al ejecutar tools o cuando ocurran errores.
- Configurar `HANA_TELEMETRY_HEARTBEAT_MINUTES` (default 30).

### 5.3 Casos de uso

- Detectar clientes inactivos o por vencer.
- Saber qué tools usan más los clientes.
- Identificar errores frecuentes y mejorar la KB.
- Planificar renovaciones y upsells.

## 6. Actualizaciones controladas

### 6.1 Flujo de publicación

1. Hacer mejoras al MCP.
2. Ejecutar `./scripts/build-client-package.ps1`.
3. Subir `dist/hana-mcp-client-<version>.zip` a CDN.
4. Registrar release en el backend:

```bash
curl -X POST https://tu-app.railway.app/admin/releases \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <ADMIN_API_KEY>" \
  -d '{
    "product_id": "<uuid>",
    "version": "1.1.0",
    "download_url": "https://tu-cdn.com/hana-mcp-client-1.1.0.zip",
    "checksum": "<sha256>",
    "release_notes": "...",
    "is_mandatory": false
  }'
```

### 6.2 Flujo del usuario

1. Al iniciar el MCP, ve una advertencia si hay update disponible.
2. Ejecuta `hana_check_for_updates` para ver detalles.
3. Ejecuta `hana_apply_update` con `confirm: true`.
4. El MCP se cierra, el updater aplica el cambio y reinicia.
5. Se preservan `docs/kb/cases/`, `.env`, `mcp.json` y la licencia.

---

## 7. Checklist de replicación

- [ ] Reutilizar o desplegar el backend de licencias (`sap-hana-mcp-license-server`).
- [ ] Generar o reutilizar par de claves RSA en el proyecto del backend.
- [ ] Reemplazar `LICENSE` por una licencia propietaria/EULA y actualizar `package.json` (`license: "SEE LICENSE IN LICENSE"`).
- [ ] Copiar `src/licensing/` y `src/knowledge-base/` al nuevo MCP.
- [ ] Instalar dependencias: `jsonwebtoken`, `node-machine-id`, `dotenv`, `axios`.
- [ ] Integrar `licenseManager.validate()` y `syncRemoteKB()` en el arranque.
- [ ] Integrar `checkForUpdates()` en el arranque (no auto-apply).
- [ ] Integrar `telemetry.scheduleHeartbeats()` y envío de eventos de tools.
- [ ] Agregar tools de licencia/KB/update a `tool-definitions.js` y `tools/index.js`.
- [ ] Configurar `.env.example` y `mcp.json.example`.
- [ ] Empaquetar ejecutable con `npm run build:exe` (`pkg`) o carpeta fuente con `build-client-package.ps1`.
- [ ] Probar instalación en máquina limpia (sin Node.js si es .exe).
- [ ] Verificar que `hana_show_license_info` reporta `VALID`.
- [ ] Verificar sincronización remota de KB.
- [ ] Verificar flujo de actualización con `hana_apply_update`.

---

## 8. Notas de seguridad

- La clave privada RSA nunca debe salir del backend.
- Los tokens JWT deben tener `exp` y `hwid`.
- Las credenciales del cliente viven solo en `.env` y `mcp.json` locales.
- Los paquetes de actualización deben publicarse vía HTTPS y validarse con SHA256.
- Las actualizaciones mandatorias deben usarse con moderación.

---

## 9. Archivos de referencia

- `docs/client-distribution.md` — qué entregar al cliente y cómo empaquetar.
- Proyecto `sap-hana-mcp-license-server` — backend de licencias, guía de despliegue y README.
