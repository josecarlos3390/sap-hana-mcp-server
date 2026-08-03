# Guía de distribución al cliente

Esta guía define qué archivos se entregan localmente al cliente y cuáles deben quedar exclusivamente del lado del vendor (nosotros).

## Objetivo

El cliente recibe un paquete mínimo, seguro y funcional para ejecutar el MCP localmente. No debe incluirse código del backend de licenciamiento, claves privadas, scripts administrativos ni credenciales.

---

## Paquete de entrega al cliente

El único artefacto que se le entrega al cliente es el ejecutable empaquetado:

```
dist/hana-mcp-server-v<version>-win-x64.zip
```

Al descomprimir se obtiene:

```
hana-mcp-server-exe/
├── hana-mcp-server.exe          # MCP empaquetado con Node.js
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
├── README-CLIENTE.md            # Guía de instalación y uso
├── LICENSE
├── start.bat                    # Lanzador del servidor MCP
├── license-menu.bat             # Menú de licencias (doble clic)
├── license-menu.ps1
└── scripts/
    ├── update-client.ps1        # Helper de actualizaciones
    └── update-client.sh
```

### Cómo construirlo

```powershell
npm run build:exe
```

Esto ejecuta `scripts/build-exe.ps1`, que:

1. Empaqueta el código con `pkg` en un único `.exe` Windows x64.
2. Incluye el menú de licencias y el asistente de configuración dentro del ejecutable.
3. Copia assets de runtime: KB, clave pública, plantillas, lanzadores y helpers de actualización.
4. Incluye el driver nativo `@sap/hana-client` para que funcione sin Node.js instalado.

### Ventajas

- El cliente no necesita Node.js.
- El código fuente queda empaquetado en el binario.
- Menor riesgo de manipulación.
- Experiencia guiada con `license-menu.bat`.

---

## Paquete de actualización (uso interno / CDN)

El segundo ZIP generado por `scripts/build-client-package.ps1`:

```
dist/hana-mcp-client-<version>.zip
```

está pensado para el mecanismo de actualización automática (`hana_apply_update`) o para clientes técnicos que prefieran correr el MCP con Node.js. **No es el paquete de entrega principal.**

Se debe publicar en el backend (`/admin/releases`) para que los clientes puedan descargarlo cuando elijan actualizar.

---

## Qué NO debe entregarse al cliente

| Ruta | Motivo |
|------|--------|
| `private-key.pem` | Clave privada de firma de licencias. Vive en `sap-hana-mcp-license-server`. |
| `.env` real del cliente | Se crea en sitio; no se commitea ni se distribuye. |
| `mcp.json` real del cliente | Contiene contraseñas; usar `mcp.json.example`. |
| `tests/` | No es necesario en producción. |
| `backend/` | Backend de licencias; no pertenece al cliente. |
| `hana-mcp-ui/` | UI administrativa; no pertenece al cliente. |
| Scripts de diagnóstico SUSE hardcodeados | Contienen credenciales o datos del entorno de desarrollo. |

---

## Flujo de entrega sugerido

1. Generar el paquete ejecutable:
   ```powershell
   npm run build:exe
   ```
2. Verificar que el ZIP no contenga datos reales de ningún cliente.
3. Probar el ejecutable en una máquina limpia sin Node.js.
4. Entregar al cliente el ZIP `hana-mcp-server-v<version>-win-x64.zip`.
5. El cliente ejecuta `license-menu.bat`, obtiene su Hardware ID y lo envía al vendor.
6. El vendor crea la licencia o voucher en el backend.
7. El cliente canjea la licencia con el mismo menú.
8. El cliente usa el asistente (opción 5) para generar `.env` y la configuración de su agente MCP.
9. Reinicia su agente de IA (Claude Desktop, Kimi Code, VS Code, OpenCode, etc.).

---

## Actualizaciones

El MCP nunca se actualiza solo. Cuando haya una nueva versión publicada en el backend, el usuario puede aplicarla con la tool `hana_apply_update` (confirmando explícitamente). El updater descarga el ZIP de actualización (`hana-mcp-client-<version>.zip`) y preserva:

- `docs/kb/user/` (KB creada por el cliente)
- `docs/kb/remote/` (KB sincronizada)
- `.env`, `mcp.json`
- `.hana-license`, `.hana-license-cache.json`

La KB del vendor (`docs/kb/bundled/`) se sobrescribe con la nueva versión.
