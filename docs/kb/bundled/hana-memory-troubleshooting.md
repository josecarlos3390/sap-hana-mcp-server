---
date: 2026-07-04
category: hana-performance
status: reference
severity: medium
sap_note: 1999997
tags:
  - hana
  - memory
  - oom
  - performance
  - kba-1999997
---

# SAP HANA: Troubleshooting de problemas de memoria y OOM

> Basado en SAP KBA 1999997 - FAQ: SAP HANA Memory y SAP HANA Troubleshooting and Performance Analysis Guide.

## Síntomas comunes

- Alertas de uso alto de memoria física (Alert 1, Alert 12, Alert 40, Alert 43, Alert 45).
- Mensajes `FATAL_OUT_OF_MEMORY` en logs de HANA.
- Procesos de HANA terminados por el OOM killer de Linux.
- Caídas de rendimiento por descarga (unload) frecuente de tablas del column store.

## Causas raíz y acciones recomendadas

### 1. Uso súbito alto de memoria por una sentencia

**Causa:** Resultados intermedios muy grandes durante el procesamiento de una consulta.

**Acción:**
- Activar `resource_tracking` y `memory_tracking` en `global.ini`:
  ```ini
  [resource_tracking]
  enable_tracking = on
  memory_tracking = on
  ```
- Activar **Expensive Statement Trace**.
- Revisar `M_EXPENSIVE_STATEMENTS.MEMORY_SIZE` para identificar la sentencia.
- Optimizar la consulta: reducir columnas seleccionadas, aplicar filtros más restrictivos, evitar subconsultas masivas.

### 2. Incremento continuo de memoria (memory leak)

**Causa:** Uso de `exec("commit")` o `exec("rollback")` dentro de stored procedures SQLScript.

**Acción:**
- Eliminar `exec("commit")` / `exec("rollback")` de procedimientos almacenados.
- Usar `AUTONOMOUS TRANSACTION` o la sintaxis de commit/rollback nativa de SQLScript.
- Si el crecimiento no se explica por datos, abrir ticket a SAP con full system dump, `mm trace` y `_SYS_STATISTICS.HOST_HEAP_ALLOCATORS_BASE`.

### 3. OOM por uso alto de allocators del column store

**Causa:** Sistema subdimensionado o tablas muy grandes cargadas en memoria.

**Acción:**
1. Revisar los top allocators en la sección `[MEMORY_OOM]` del dump OOM.
2. Verificar el unload trace por descargas frecuentes (`M_CS_UNLOADS`).
3. Reducir datos en column store (archivado, particionamiento) o aumentar memoria física.

### 4. OOM por Statistics Server

**Causa:** Tabla `_SYS_STATISTICS.STATISTICS_ALERTS_BASE` muy grande.

**Acción:**
- Verificar tamaño de `_SYS_STATISTICS.STATISTICS_ALERTS_BASE`.
- Truncar la tabla desde `hdbsql` según SAP Note 2170779.
- Revisar SAP Note 2147247 - FAQ: SAP HANA Statistics Server.

### 5. Memoria compartida (shared memory) alta

**Causa:** Tablas row store severamente fragmentadas.

**Acción:**
1. Verificar `SHARED_MEMORY` en `[MEMORY_OOM]` del dump.
2. Aplicar SAP Note 1813245 - SAP HANA DB: Row store reorganization.
3. Convertir tablas row store a column store donde sea posible o archivar datos antiguos.

## Herramientas útiles

- **HANA Cockpit** → Memory Analysis, Performance Monitor.
- **HANA Studio** → Administration Console → Alerts.
- **SQL Statement Collection for SAP HANA** (SAP Note 1969700):
  - `HANA_Memory_Overview_1.00.90+.txt`
- **HANA Dump Analyzer** (SAP Note 2498739) para analizar RTE dumps.

## Comandos Linux útiles

```bash
# Ver uso de memoria y swap
sar -r

# Ver si HANA fue matado por OOM
grep -i "killed process" /var/log/messages

# Ver configuración de Transparent Huge Pages
cat /sys/kernel/mm/transparent_hugepage/enabled
```

## Notas SAP relacionadas

- 1999997 - FAQ: SAP HANA Memory
- 2170779 - Big statistics server table leads to performance impact
- 1813245 - SAP HANA DB: Row store reorganization
- 1969700 - SQL Statement Collection for SAP HANA
- 2498739 - How-To: Analyzing Runtime Dumps with SAP HANA Dump Analyzer
