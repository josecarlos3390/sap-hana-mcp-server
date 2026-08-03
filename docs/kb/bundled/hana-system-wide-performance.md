---
date: 2026-07-04
category: hana-performance
status: reference
severity: medium
sap_note: 2000000
tags:
  - hana
  - performance
  - system-wide
  - kba-2000000
  - kba-2586666
---

# SAP HANA: Troubleshooting de rendimiento general (system-wide)

> Basado en SAP KBA 2000000 - FAQ: SAP HANA Performance Optimization y KBA 2586666 - SAP HANA Database: Slow System-wide Performance.

## Síntomas

- El sistema completo responde lento.
- CPU alta de forma sostenida.
- Muchos threads pendientes o esperando.
- Bloqueos frecuentes (DML hangs).
- Respuesta lenta sin que una sola sentencia destaque.

## Diagnóstico inicial

1. Ejecutar **HANA_Configuration_MiniChecks** de SAP Note 1969700.
   - Revisar columna `C` marcada con `X` para problemas críticos.
   - La última columna referencia notas SAP relevantes.
2. Revisar **Performance Monitor** y **Alerts tile** en HANA Cockpit.
3. Verificar actividades en segundo plano:
   - Delta merges (`M_DELTA_MERGE_STATISTICS`)
   - Column unloads (`M_CS_UNLOADS`)
   - Savepoints (`M_SAVEPOINTS`)
   - Backups (`M_BACKUP_CATALOG`)

## Causas y soluciones

### 1. Carga alta de sentencias concurrentes

**Causa:** Muchos usuarios emitiendo muchas sentencias; falta de recursos.

**Acción:**
- Restringir número de usuarios o aumentar hardware.
- Usar **workload classes** para priorizar cargas críticas:
  ```sql
  CREATE WORKLOAD CLASS "REPORTING_WORKLOAD"
  SET 'MAX_CPU_THREADS' = '8',
      'PRIORITY' = '5',
      'MAX_CONCURRENT_STATEMENTS' = '25';
  ```

### 2. Cambio de patron de workload

**Causa:** Pocas sentencias pesadas en lugar de muchas OLTP ligeras.

**Acción:**
- Identificar sentencias pesadas con Expensive Statement Trace.
- Optimizar esas consultas o reprogramarlas a horario de baja demanda.

### 3. Problemas de locks y bloqueos

**Acción:**
- Revisar `M_BLOCKED_TRANSACTIONS`.
- Identificar bloqueador y cancelar operación si es necesario.
- Ver SAP Note 2214279 - Blocking situation caused by waiting writer holding consistent change lock.

### 4. OS/System CPU alto

Ver artículo **hana-cpu-troubleshooting.md**:
- Transparent Huge Pages (2031375).
- Page cache / Linux paging (1557506).
- Plan trace (2206354).
- Configuración de `sql_executors` y `max_concurrency`.

### 5. Problemas de red

**Acción:**
- SAP Note 2081065 - Troubleshooting SAP HANA Network.
- Scripts `HANA_Network_Clients` y `HANA_Network_Services` (SAP Note 1969700).
- Comandos Linux: `ifconfig`, `tcpdump`, `iperf`.

### 6. Problemas de I/O

**Síntoma:** Aplicaciones lentas, sistema poco responsivo.

**Acción:**
- SAP Note 1999930 - FAQ: SAP HANA I/O Analysis.
- Revisar volúmenes en HANA Studio / Cockpit.
- Verificar latencia de discos y logs de I/O.

### 7. Problemas después de upgrade de HANA

**Causa:** Calculation views lentos tras upgrade.

**Acción:**
- SAP Note 2441054 - High query compilation times for calculation views.
- SAP Note 2291812 - CalcView Unfolding.

## Recolección de evidencias

Si el problema persiste, generar al menos dos **runtime dumps** a intervalos de 3 minutos mientras el sistema está lento:
- SAP Note 1813020 - How to generate a runtime dump on SAP HANA.
- Adjuntar junto con Full System Info Dump al ticket de SAP.

## Notas SAP relacionadas

- 2000000 - FAQ: SAP HANA Performance Optimization
- 2586666 - SAP HANA Database: Slow System-wide Performance
- 1969700 - SQL Statement Collection for SAP HANA
- 1813020 - How to generate a runtime dump on SAP HANA
- 2081065 - Troubleshooting SAP HANA Network
- 1999930 - FAQ: SAP HANA I/O Analysis
