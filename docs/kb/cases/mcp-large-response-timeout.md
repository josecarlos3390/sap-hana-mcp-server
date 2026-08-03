---
date: 2026-07-06
category: service-layer
status: reference
severity: medium
sap_note: null
tags:
  - mcp
  - stdio
  - timeout
  - health-check
  - troubleshooting
---

# MCP: Respuestas de tool muy grandes causan timeout o cuelgue en clientes stdio

> Lección aprendida al convertir scripts de monitoreo (`scripts/health-check.js`, `scripts/realtime-performance-check.js`) en tools MCP. Una tool que devuelve cientos de KB de JSON estructurado puede parecer colgarse aunque el servidor haya terminado de procesar.

## Síntomas

- El servidor MCP arranca, recibe `tools/call` y ejecuta todas las queries.
- Los logs del servidor muestran que la tool terminó y la respuesta se construyó.
- El cliente nunca recibe la respuesta y termina por timeout.
- El problema no se reproduce cuando la misma query se ejecuta directamente con `hana_execute_query` o desde un script Node.js.

## Causa

Algunos clientes MCP stdio (o el propio pipe stdout/stdin) no manejan bien respuestas de varios cientos de KB en una sola línea JSON-RPC. Aunque `console.log(JSON.stringify(response))` funcione en un script sencillo, en el contexto del servidor MCP puede saturar el buffer de salida o hacer que el cliente deje de leer.

En nuestro caso, `hana_health_check` original devolvía:
- 63 filas de `SYS.M_HOST_INFORMATION`
- 80 filas de `SYS.M_MEMORY`
- Todas las filas de `SYS.USERS`
- 20 filas de múltiples vistas de monitoreo

Esto generaba ~110 KB de preview de texto + structuredContent, que colgaba el cliente.

## Solución aplicada

Rediseñar las tools de monitoreo para devolver snapshots compactos:

1. **Ejecutar queries secuencialmente** en lugar de `Promise.all` para no saturar el connection pool (tamaño por defecto 3).
2. **Limitar filas** devueltas: `LIMIT 5` / `LIMIT 10` por sección.
3. **Seleccionar solo columnas necesarias**, evitar `SELECT *` en vistas grandes.
4. **Usar conteos** cuando el detalle completo no aporte valor (ej. `SELECT COUNT(*) FROM SYS.M_BLOCKED_TRANSACTIONS`).
5. **Mantener** `structuredContent` para que el LLM pueda consumer los datos, pero manteniéndolo pequeño.

Ejemplo de query saludable:

```sql
SELECT NAME, VALUE
FROM SYS.M_MEMORY
WHERE PORT = '30003'
  AND NAME IN ('SYSTEM_MEMORY_SIZE','TOTAL_MEMORY_SIZE_IN_USE','GLOBAL_ALLOCATION_LIMIT','EFFECTIVE_PROCESS_ALLOCATION_LIMIT')
```

## Cómo diagnosticar

1. Agregar logs `console.error` en la tool para confirmar que las queries terminan.
2. Medir el tamaño de `JSON.stringify(response)` antes de retornar.
3. Si supera ~50 KB, reducir el dataset.
4. Probar la tool con un cliente MCP real (Kimi CLI, Claude Desktop) en lugar de solo unit tests.

## Archivos relacionados

- `src/tools/health-tools.js`
- `src/database/connection-pool.js`
- `src/utils/formatters.js`
