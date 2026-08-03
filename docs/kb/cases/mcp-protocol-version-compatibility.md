---
date: 2026-07-06
category: service-layer
status: reference
severity: medium
sap_note: null
tags:
  - mcp
  - protocol
  - kimicli
  - compatibility
  - troubleshooting
  - python-mcp-sdk
---

# MCP: Error de versión de protocolo al conectar con Kimi CLI / Python MCP SDK

> Fix para el error `Unsupported protocol version from the server: 2025-11-25` cuando un cliente MCP basado en el SDK de Python (Kimi CLI, Claude Desktop Python, etc.) intenta conectar al HANA MCP Server.

## Síntomas

- El servidor HANA MCP arranca correctamente y la conexión directa a HANA funciona.
- Al usar `kimi --mcp-config-file ./mcp.json` (o cualquier cliente basado en el SDK Python `mcp`), la conexión falla.
- Error del cliente:

```text
Connection failed: RuntimeError: Client failed to connect: Unsupported protocol version from the server: 2025-11-25
```

- En los logs del servidor se ve que el `initialize` llega, pero el cliente rechaza la respuesta.

## Causa

El SDK oficial de Python `mcp` envía como versión de protocolo `2025-06-18` durante el handshake `initialize`. El HANA MCP Server no la tenía en su lista de versiones soportadas, por lo que respondía con su versión más nueva (`2025-11-25`). El cliente Python no reconoce `2025-11-25`, así que aborta la conexión.

Versiones involucradas:

| Componente | Versión usada | Soportaba `2025-06-18` |
|------------|---------------|------------------------|
| HANA MCP Server | `LATEST = 2025-11-25` | No |
| Python MCP SDK (`mcp`) | `LATEST_PROTOCOL_VERSION = 2025-06-18` | Sí (la envía) |

## Solución aplicada

### 1. Agregar `2025-06-18` a las versiones soportadas

**Archivo:** `src/constants/mcp-constants.js`

```javascript
// MCP Protocol versions
const PROTOCOL_VERSIONS = {
  LATEST: '2025-11-25',
  SUPPORTED: ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
};
```

### 2. Mejorar la negociación de versión

**Archivo:** `src/server/mcp-handler.js`

Antes, cuando el cliente pedía una versión desconocida, el servidor respondía siempre con `LATEST`. Ahora responde con la **versión soportada más reciente**, evitando devolver una versión que el cliente no entienda.

```javascript
const requestedVersion = params && params.protocolVersion;
let negotiatedVersion = PROTOCOL_VERSIONS.LATEST;

if (requestedVersion && PROTOCOL_VERSIONS.SUPPORTED.includes(requestedVersion)) {
  negotiatedVersion = requestedVersion;
} else if (requestedVersion) {
  // Client requested a version not explicitly supported; negotiate down to the newest supported version
  negotiatedVersion = PROTOCOL_VERSIONS.SUPPORTED[0];
}
```

## Cómo diagnosticar si vuelve a ocurrir

1. Revisar el error exacto del cliente MCP.
2. Verificar en `src/constants/mcp-constants.js` que la versión que envía el cliente esté en `PROTOCOL_VERSIONS.SUPPORTED`.
3. Inspeccionar el handshake con un script simple de stdio:

```javascript
const { spawn } = require('child_process');
const server = spawn('node', ['hana-mcp-server.js'], { stdio: ['pipe', 'pipe', 'inherit'] });

setTimeout(() => {
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    }
  }) + '\n');
}, 500);

server.stdout.on('data', d => console.log('OUT:', d.toString()));
```

4. Si el servidor responde con una versión que el cliente no soporta, agregar la versión solicitada a `SUPPORTED` y/o ajustar la lógica de negociación.

## Notas adicionales

- El warning `AuthlibDeprecationWarning: authlib.jose module is deprecated...` que muestra Kimi CLI es solo una advertencia de `fastmcp` y no afecta la conexión.
- En Windows, `kimi mcp test <nombre>` puede terminar con `UnicodeEncodeError: 'charmap' codec can't encode character '\u2713'` al intentar imprimir el símbolo ✓. Esto es un problema de codificación de la terminal, no del servidor. Se resuelve ejecutando `chcp 65001` antes del test.

## Archivos modificados

- `src/constants/mcp-constants.js`
- `src/server/mcp-handler.js`
