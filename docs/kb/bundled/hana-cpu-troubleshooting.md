---
date: 2026-07-04
category: hana-performance
status: reference
severity: medium
sap_note: 2100040
tags:
  - hana
  - cpu
  - performance
  - high-cpu
  - kba-2100040
  - kba-2427538
---

# SAP HANA: Troubleshooting de alto consumo de CPU

> Basado en SAP KBA 2100040 - FAQ: SAP HANA CPU, KBA 2427538 - Troubleshooting HANA High CPU Consumption y SAP HANA Troubleshooting and Performance Analysis Guide.

## Síntomas

- Alerta 5: Host CPU Usage.
- Muchos threads en estado esperando en el Threads Monitor.
- Rendimiento general lento del sistema sin saturación de memoria.
- Procesos no-HANA consumiendo CPU en el host (antivirus, backup, etc.).

## Diagnóstico inicial

1. Abrir **HANA Cockpit** → Overview → CPU Usage tile.
2. Comparar **CPU de SAP HANA vs CPU total**:
   - Si HANA CPU es bajo y total CPU es alto → proceso externo es el culpable.
   - Si HANA CPU es alto → analizar threads y sentencias.
3. Abrir **Threads tile** y activar la columna **CPU Time** (requiere `resource_tracking = on`).
4. Activar **Expensive Statement Trace** con un umbral razonable.
5. Usar **Kernel Profiler** para capturar trazas de CPU (SAP Note 1804811).

## Causas y soluciones

### 1. Sistema parece colgado con alto CPU de sistema (SYS CPU)

**Causa:** Configuración incorrecta de Transparent Huge Pages (THP).

**Acción:**
```bash
cat /sys/kernel/mm/transparent_hugepage/enabled
```
Debe mostrar `[never]`. Si no, aplicar SAP Note 2031375 - SAP HANA: Transparent HugePages (THP) setting on Linux.

### 2. Alto uso de page cache del SO

**Causa:** Uso alto de `kbcached` (>10% de memoria física) con page in/out alto.

**Acción:**
```bash
sar -r
```
Aplicar SAP Note 1557506 - Linux paging improvements.

### 3. Alto context switch por SqlExecutor threads

**Causa:** Configuración inadecuada de `sql_executors` / `max_sql_executors`.

**Acción:**
- Revisar `indexserver.ini` → `sql` → `sql_executors` / `max_sql_executors`.
- Consultar "Controlling Parallelism of SQL Statement Execution" en la guía de HANA.

### 4. Alto context switch por JobExecutor threads

**Causa:** `num_cores` o `max_concurrency` por debajo del número de cores lógicos.

**Acción:**
- `indexserver.ini` → `parallel` → `num_cores` (<= SPS07)
- `global.ini`/`indexserver.ini` → `execution` → `max_concurrency` (> SPS08)
- Asegurar que sean mayores que el número de cores lógicos.

### 5. Rendimiento lento con alto CPU de usuario (USER CPU)

**Causa:** Pocas threads pero alto CPU en pocos nodos/tablas (BW).

**Acción:**
- Revisar particionamiento no uniforme de tablas column store grandes.
- Aplicar SAP Note 1819123 - BW on SAP HANA: landscape redistribution.

### 6. Degradación por muchas versiones MVCC

**Causa:** Transacciones largas sin commit generan versiones MVCC acumuladas.

**Acción:**
- En Performance Monitor buscar el KPI **Active Version**.
- Identificar el bloqueador en Threads tile y cancelar la operación.
- Revisar "Troubleshooting Blocked Transactions".

### 7. SELECT TOP X causa alto CPU

**Causa:** Bug conocido en `UnifiedTable::MVCCObject::generateOLAPBitmapMVCC`.

**Acción:** Aplicar SAP Note 2238679 - High CPU Consumption Caused by UnifiedTable::MVCCObject::generateOLAPBitmapMVCC.

### 8. Cálculo views lentos tras upgrade

**Acción:**
- SAP Note 2441054 - High query compilation times and absence of plan cache entries for queries against calculation views.
- SAP Note 2291812 - SAP HANA DB: Disable/Enable CalculationEngine Feature - CalcView Unfolding.

### 9. Memory leak en FDA (Fast Data Access)

**Síntoma:** Trace muestra `Destroying allocator 'Connection/.../Pool/RowEngine/Session' with x blocks and x bytes still allocated`.

**Acción:** Actualizar HANA a:
- HANA 1.0 SPS12 Rev. 122.15 o superior, o
- HANA 2.0 SPS01 Rev. 012.04 o superior.

Ver SAP Note 2580435 - Memory Leak in Pool/RowEngine/Session.

## Recolección de evidencias

Antes de escalar a SAP, recolectar:
- Runtime dumps (SAP Note 1813020).
- Kernel Profiler trace (SAP Note 1804811).
- Full System Info Dump.
- Evidencia de threads y Expensive Statement Trace.

## Notas SAP relacionadas

- 2100040 - FAQ: SAP HANA CPU
- 2427538 - Troubleshooting HANA High CPU Consumption
- 2031375 - SAP HANA: Transparent HugePages (THP)
- 1557506 - Linux paging improvements
- 1819123 - BW on SAP HANA landscape redistribution
- 2238679 - High CPU Consumption by MVCCObject::generateOLAPBitmapMVCC
- 2580435 - Memory Leak in Pool/RowEngine/Session
