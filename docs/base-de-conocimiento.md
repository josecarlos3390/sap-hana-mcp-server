# Base de conocimiento: Diagnóstico de SAP HANA y Service Layer

Este documento es el punto de entrada para consultar el conocimiento acumulado sobre el diagnóstico y corrección de problemas en el entorno SAP HANA / SAP Business One Service Layer de `hanaroda25.gruporoda.com`.

---

## Documentos disponibles

- [`propuesta-comercial-mcp-sap-b1-hana.md`](./propuesta-comercial-mcp-sap-b1-hana.md) — Propuesta comercial del producto: capacidades, modelos de licenciamiento y precios orientativos.
- [`informe-service-layer-crash-3733425.md`](./informe-service-layer-crash-3733425.md) — Ejemplo de informe técnico generado por el agente.
- [`runbook-diagnostico-hana-service-layer.md`](./runbook-diagnostico-hana-service-layer.md) — Guía de uso y diagnóstico.

## Casos documentados

### Caso 1 — Inestabilidad del Service Layer por corrupción de heap (KBA 3733425)

**Fecha:** julio de 2026  
**Componente afectado:** SAP Business One 10.0 Service Layer para SAP HANA  
**Severidad:** Crítico (inestabilidad intermitente, sin caída total)  
**Estado:** Diagnóstico completo; solución validada por SAP; pendiente de aplicación

#### Resumen

Los procesos worker Apache (`httpd`) de los cuatro nodos del Service Layer (`50001-50004`) terminaban intermitentemente con `SIGABRT` y errores de corrupción de heap:

- `malloc_consolidate(): invalid chunk size`
- `double free or corruption (!prev)`
- `corrupted size vs. prev_size in fastbins`

La causa raíz, confirmada por la **KBA 3733425**, es una **condición de carrera durante el cierre del proceso worker Apache**, que provoca un `double free` en el destructor del logger asíncrono (`CAsyncLogger`).

#### Documentos del caso

- [`informe-service-layer-crash-3733425.md`](./informe-service-layer-crash-3733425.md) — Informe técnico completo para presentar a los encargados.
- [`runbook-diagnostico-hana-service-layer.md`](./runbook-diagnostico-hana-service-layer.md) — Guía paso a paso para reproducir el diagnóstico desde otra computadora.

#### Solución propuesta

Modificar el archivo compartido por todos los nodos worker:

`/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf`

Cambiar el bloque `<IfModule mpm_prefork_module>` de:

```apache
StartServers             1
MaxSpareServers          2
MinSpareServers          1
MaxConnectionsPerChild   1024
MaxRequestWorkers        24
```

a:

```apache
StartServers             8
MaxSpareServers          8
MinSpareServers          8
MaxConnectionsPerChild   1024
MaxRequestWorkers        8
```

Y reiniciar el Service Layer.

#### Scripts reutilizables

| Script | Descripción |
|--------|-------------|
| `scripts/health-check.js` | Estado general de SAP HANA. |
| `scripts/realtime-performance-check.js` | Performance en tiempo real: transacciones, queries, conexiones, delta merge. |
| `scripts/suse-log-reader.js` | Revisión remota de logs del servidor SUSE vía SSH. |
| `scripts/suse-check-kba-config.js` | Ver configuración `mpm_prefork` del Service Layer. |
| `scripts/fetch-sap-note-playwright.py` | Consultar notas SAP vía navegador automatizado. |

---

## Funcionalidades de licenciamiento y knowledge base

El MCP ahora incluye:

- **Licenciamiento local por hardware ID** usando JWT firmados con RSA.
- **Validación online opcional** contra un endpoint en la nube (`HANA_LICENSE_SERVER_URL`).
- **Modo demo** de 7 días si no hay licencia.
- **Base de conocimiento automática** en Markdown bajo `docs/kb/`.
- **Sincronización remota de KB**: al iniciar, el MCP puede descargar archivos `.md` desde un endpoint en la nube (`HANA_KB_REMOTE_URL`) y mezclarlos con los casos locales.
- Carga de configuración desde archivo `.env`.
- Tools MCP:
  - `hana_show_license_info`
  - `hana_save_knowledge_case`
  - `hana_search_knowledge_base`
  - `hana_generate_kb_index`

Ver detalles en [`runbook-diagnostico-hana-service-layer.md`](./runbook-diagnostico-hana-service-layer.md).

## Cómo usar esta base de conocimiento

### Si hay un nuevo incidente similar

1. Revisar [`runbook-diagnostico-hana-service-layer.md`](./runbook-diagnostico-hana-service-layer.md).
2. Ejecutar `scripts/health-check.js` y `scripts/realtime-performance-check.js` para descartar problemas en HANA.
3. Ejecutar `scripts/suse-log-reader.js` para revisar logs del Service Layer.
4. Comparar la configuración con `scripts/suse-check-kba-config.js`.
5. Si se identifica una nueva nota SAP, usar `scripts/fetch-sap-note-playwright.py` para obtener la resolución.

### Si se va a ejecutar en otra computadora

1. Clonar/copiar el proyecto.
2. Ejecutar `npm install`.
3. Crear el entorno virtual de Python e instalar Playwright:
   ```powershell
   python -m venv venv-sap
   .\venv-sap\Scripts\pip install playwright
   .\venv-sap\Scripts\python -m playwright install chromium
   ```
4. Configurar las variables de entorno listadas en el runbook.
5. Ajustar `mcp.json` si la ruta de Node.js o del proyecto cambia.

---

## Lecciones aprendidas

- **No todo es HANA:** los errores de heap aparecían en el Service Layer, no en la base de datos. HANA estaba sana.
- **Las queries costosas históricas no siempre son el problema:** la query `ACB_TES_CtasXPagarDetallev2` fue descartada porque solo se ejecutó 6 veces y no estaba en el plan cache.
- **Los core dumps ayudan:** al estar deshabilitados, no fue posible obtener un volcado detallado. En futuros casos, habilitarlos temporalmente agiliza el análisis con SAP.
- **La automatización acelera el diagnóstico:** con SSH y Playwright se pudo revisar logs y consultar notas SAP sin acceder manualmente al servidor ni al portal.
- **Documentar durante el incidente ahorra tiempo después:** el runbook y los scripts quedan listos para reutilizar en futuros eventos.

---

## Referencias rápidas

- KBA 3733425 — *Service Layer worker process termination due to heap corruption under high load*
- SAP Note 2418476 — *Service Layer allows log rotation*
- SAP Note 3027326 — *Service Layer on SAP HANA causes core dump files*
- KBA 3157498 — *Service Layer log file configuration*
- KBA 3157607 — *How to analyze core dumps*

---

## Mantenimiento de esta base

Cada vez que se resuelva un nuevo caso significativo, agregar una sección con:

1. Resumen del problema.
2. Evidencia clave.
3. Causa raíz.
4. Solución.
5. Scripts o comandos utilizados.
6. Lecciones aprendidas.
