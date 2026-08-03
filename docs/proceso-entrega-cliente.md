# Proceso de empaquetado y entrega al cliente

Este documento describe paso a paso cómo generar el paquete que se le entrega al cliente final del **SAP HANA MCP Server**, desde el build hasta la activación de la licencia.

---

## 1. Requisitos previos

- Tener el repo `sap-hana-mcp-server` actualizado (`git pull`).
- Tener Node.js 18+ instalado.
- Tener `node_modules` instalados:
  ```bash
  npm install
  ```
- Tener las claves RSA generadas en el proyecto `sap-hana-mcp-license-server`:
  ```bash
  cd ..\sap-hana-mcp-license-server
  node scripts\generate-license-keys.js
  ```
  - Copiar el archivo `public-key.pem` resultante a:
    ```
    sap-hana-mcp-server\src\licensing\public-key.pem
    ```
  - La `private-key.pem` **nunca** debe salir del backend.

- Verificar que la base de conocimiento local (`docs/kb/cases/`) tenga los casos que querés entregar.

---

## 2. Generar el paquete ejecutable

Desde la raíz del proyecto `sap-hana-mcp-server`:

```powershell
npm run build:exe
```

Este comando:

1. Empaqueta `hana-mcp-server.js` y todo el código en un solo `.exe` con `pkg`.
2. Copia los assets necesarios: KB local, clave pública, plantillas, lanzadores.
3. Incluye el driver nativo `@sap/hana-client` para que funcione sin Node.js.
4. Genera los lanzadores `license-menu.bat`, `license-menu.ps1`, `first-run.bat` y `first-run.ps1`.
5. Crea el ZIP final en:
   ```
   dist\hana-mcp-server-v<version>-win-x64.zip
   ```

### Salida esperada

```
Build complete:
  Folder: D:\ProyectosPython\sap-hana-mcp-server\dist\hana-mcp-server-exe
  ZIP:    D:\ProyectosPython\sap-hana-mcp-server\dist\hana-mcp-server-v0.3.1-win-x64.zip
  Size:   56.25 MB
```

---

## 3. Verificar el contenido del ZIP

Extraer y revisar que contenga al menos:

```
hana-mcp-server-exe/
├── hana-mcp-server.exe          # MCP empaquetado
├── docs/
│   └── kb/
│       ├── bundled/             # KB incluida con el producto
│       ├── user/                # KB creada por el cliente (vacía al inicio)
│       ├── remote/              # KB sincronizada desde la nube (vacía al inicio)
│       └── index.md
├── config/                      # Plantillas de configuración por agente
│   ├── claude-desktop-config.json.example
│   ├── kimi-code-config.json.example
│   ├── vscode-mcp-config.json.example
│   └── opencode-config.json.example
├── public-key.pem               # Clave pública de licencias
├── .env.example                 # Plantilla de configuración
├── mcp.json.example             # Plantilla MCP genérica
├── README-CLIENTE.md            # Guía del cliente
├── LICENSE
├── start.bat                    # Lanzador del servidor
├── first-run.bat                # Asistente de configuración inicial
├── first-run.ps1
├── license-menu.bat             # Menú de licencias (doble clic)
├── license-menu.ps1
└── scripts/
    ├── check-requirements.js    # Verificación de requisitos
    ├── install-requirements.js  # Instalación de dependencias opcionales
    ├── update-client.ps1        # Helper de actualizaciones
    └── update-client.sh
```

> **Importante:** No debe existir `private-key.pem`, `backend/`, `tests/`, `opencode.json` con datos reales, ni código fuente del license server.

---

## 4. Entrega al cliente

El artefacto final es el ZIP. Se puede entregar por:

- Google Drive / Dropbox / OneDrive.
- Correo (si el tamaño lo permite; ~56 MB).
- Portal de descargas propio.
- WhatsApp / Telegram (como archivo).

### Instrucciones mínimas para el cliente

1. Descomprimir el ZIP en una ubicación permanente, por ejemplo:
   ```
   C:\hana-mcp-client\
   ```
2. Ejecutar **`first-run.bat`** para abrir el asistente de configuración inicial. Esto verifica requisitos, crea el `.env`, muestra el Hardware ID, permite canjear un voucher o activar una licencia directa, y genera el archivo de configuración para el agente elegido (Claude Desktop, Kimi Code, VS Code u OpenCode).
3. Si no se activó la licencia en el paso anterior, enviar el Hardware ID al vendor y esperar el voucher o licencia; luego activarla desde `license-menu.bat` → **2. Activar Licencia**.
4. Copiar el archivo de configuración generado (`claude-desktop-config.json`, `kimi-code-config.json`, etc.) a la ubicación correspondiente del agente.
5. Reiniciar el agente de IA.

> El MCP implementa el protocolo MCP sobre stdio, por lo que es compatible con cualquier cliente MCP. La configuración es la misma en todos; solo cambia el formato del archivo donde se pega.

---

## 5. Flujo de activación de licencia (vista del vendor)

### Opción A: licencia directa

El cliente envía su Hardware ID. El vendor crea la licencia:

```bash
curl -X POST https://licencias-mcp.onrender.com/admin/licenses \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <ADMIN_API_KEY>" \
  -d '{
    "hwid": "<hardware_id_del_cliente>",
    "days": 365,
    "product_code": "hana-b1",
    "plan": "professional"
  }'
```

Responder al cliente con la `license_key` recibida.

### Opción B: voucher de un solo uso

Para que el cliente se active solo:

```bash
curl -X POST https://licencias-mcp.onrender.com/admin/vouchers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <ADMIN_API_KEY>" \
  -d '{
    "days": 30,
    "count": 1,
    "product_code": "hana-b1",
    "plan": "professional"
  }'
```

Enviar el código de voucher al cliente. Él lo canjea desde `license-menu.bat`.

---

## 6. Actualizar la base de conocimiento sin reinstalar

La KB local se puede actualizar de dos formas:

### A. KB remota (recomendado)

Publicar un caso nuevo en el backend:

```bash
curl -X POST https://licencias-mcp.onrender.com/admin/kb/cases \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <ADMIN_API_KEY>" \
  -d '{
    "product_code": "hana-b1",
    "path": "cases/nuevo-caso.md",
    "title": "Nuevo diagnóstico",
    "content": "# Nuevo diagnóstico\n\nDescripción...",
    "version": "1.0"
  }'
```

El cliente lo recibirá automáticamente en `docs/kb/remote/` según el intervalo configurado en `HANA_KB_SYNC_INTERVAL_HOURS` (default 24 horas), o forzando un reinicio.

### B. Nueva versión del paquete

Si se agregan casos a `docs/kb/cases/` en el repo, regenerar el ZIP con `npm run build:exe` y distribuir la nueva versión. El cliente puede aplicarla con `hana_apply_update` si se publicó un release en el backend.

---

## 7. Checklist antes de entregar

- [ ] `npm test` pasa sin errores.
- [ ] `npm run build:exe` genera el ZIP.
- [ ] El ZIP contiene `license-menu.bat`, `license-menu.ps1`, `first-run.bat` y `first-run.ps1`.
- [ ] El ZIP contiene `docs/kb/bundled/` con los casos esperados.
- [ ] El ZIP contiene `config/` con las plantillas de agentes.
- [ ] El ZIP contiene `scripts/check-requirements.js` y `scripts/install-requirements.js`.
- [ ] `README-CLIENTE.md` describe el asistente de configuración, la compatibilidad con agentes y la verificación de requisitos.
- [ ] No hay `private-key.pem` ni archivos del backend en el ZIP.
- [ ] `src/licensing/public-key.pem` está actualizado y coincide con el backend.
- [ ] `.env.example` **no contiene datos reales de ningún cliente** (usa valores ficticios como `hana.acmecorp.example`).
- [ ] `docs/kb/remote/` no contiene casos de prueba basura.
- [ ] `README-CLIENTE.md` refleja la versión actual y el flujo de licencias.
- [ ] Se conoce la `license_key` o voucher a entregar al cliente.

---

## 8. Estructura de la base de conocimiento

La KB se divide en tres ubicaciones para separar lo que entrega el vendor, lo que crea el cliente y lo que se sincroniza de la nube:

| Carpeta | Contenido | ¿Se preserva en actualizaciones? |
|---|---|---|
| `docs/kb/bundled/` | Casos incluidos con el producto (vendor). | ❌ Se sobrescribe con la nueva versión. |
| `docs/kb/user/` | Casos que el cliente crea con `hana_save_knowledge_case`. | ✅ Se preserva siempre. |
| `docs/kb/remote/` | Casos descargados desde `HANA_KB_REMOTE_URL`. | ✅ Se preserva (se sincroniza, no se borra). |

### Sanitizar antes de build

1. Revisar `.env.example` y reemplazar cualquier host, usuario, schema o nota SAP real por valores ficticios.
2. Limpiar `docs/kb/remote/` de casos de prueba.
3. Asegurar que los casos en `docs/kb/bundled/` no contengan credenciales ni nombres de cliente reales.

## 9. Archivos relacionados

- `scripts/build-exe.ps1` — script que genera el paquete.
- `README-CLIENTE.md` — guía incluida dentro del ZIP.
- `docs/client-distribution.md` — qué incluir/excluir del paquete.
- Proyecto `sap-hana-mcp-license-server` — backend de licencias y KB remota.
