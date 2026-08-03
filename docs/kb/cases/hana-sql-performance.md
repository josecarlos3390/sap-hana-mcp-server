---
date: 2026-07-04
category: hana-performance
status: reference
severity: medium
sap_note: 2000002
tags:
  - hana
  - sql
  - query-optimization
  - performance
  - kba-2000002
  - kba-2586630
---

# SAP HANA: Optimización y troubleshooting de sentencias SQL lentas

> Basado en SAP KBA 2000002 - FAQ: SAP HANA SQL Optimization y KBA 2586630 - SAP HANA Database: Slow Individual SQL Statements.

## Síntomas

- Una o varias sentencias SQL individuales tardan más de lo esperado.
- Alto consumo de CPU o memoria asociado a una consulta específica.
- Inconsistencia: la misma sentencia a veces es rápida y a veces lenta.
- Todas las consultas sobre una tabla específica son lentas.

## Diagnóstico

1. Obtener el **plan de ejecución** (Explain Plan / Plan Visualizer).
2. Activar **Expensive Statement Trace** para capturar la sentencia.
3. Revisar `M_EXPENSIVE_STATEMENTS` (CPU_TIME, MEMORY_SIZE, DURATION).
4. Usar **SQL Analyzer** en HANA Cockpit para ver:
   - Data flow
   - Tables used
   - Join order
   - Tamaño de resultados intermedios

## Causas y soluciones

### 1. Sentencia a veces lenta, a veces rápida

**Causas posibles:**
- Cambios en el plan de ejecución por estadísticas desactualizadas.
- Contención de locks o bloqueos concurrentes.
- Carga del sistema variable.

**Acción:**
- Refrescar estadísticas: `UPDATE STATISTICS ON TABLE <schema>.<table>`.
- Revisar bloqueos con `M_BLOCKED_TRANSACTIONS` y `M_LOCK_WAITS`.
- Capturar Plan Viz en ambos escenarios para comparar.

### 2. Filtros `<` o `>` en consultas FAE (FOR ALL ENTRIES)

**Causa:** Filtros de rango en FAE pueden ser más lentos.

**Acción:** Evitar `<` y `>` en FAE queries. SAP Notes 1662726 y 1987132.

### 3. Todas las sentencias sobre una tabla específica son lentas

**Causa:** Muchas versiones MVCC acumuladas en una tabla.

**Acción:**
```sql
SELECT * FROM M_RS_TABLE_VERSION_STATISTICS WHERE table_name = 'MYTABLE';
```
- Aplicar commit temprano.
- Cerrar cursores que no se necesiten.
- Revisar lógica de aplicación que actualiza registros frecuentemente.

### 4. Resultados intermedios grandes

**Acción:**
- Reducir el número de columnas en SELECT.
- Aplicar filtros más restrictivos en WHERE.
- Reescribir joins: empezar por el conjunto más pequeño.
- Evitar subconsultas masivas; usar CTEs o tablas temporales si aplica.

### 5. Joins ineficientes

**Acción:**
- Revisar el orden de joins en el plan visualizer.
- Asegurar que los predicados de join usen columnas indexadas/clave.
- Considerar hints de HANA (SAP Note 2142945 - FAQ: SAP HANA Hints).

### 6. Cálculo views lentos

**Acción:**
- SAP Note 2441054 - High query compilation times for calculation views.
- SAP Note 2291812 - CalcView Unfolding.

### 7. Problemas después de migración a HANA

**Acción:**
- Revisar SAP Note 1912445 - ABAP custom code migration for SAP HANA.
- Usar Code Inspector y SQL Monitor para identificar código no optimizado.

## Buenas prácticas de SQL en HANA

- Filtrar en la fuente (projection) lo antes posible.
- Usar `DISTINCT` en lugar de `GROUP BY` no id when appropriate.
- Particionar tablas grandes (range, hash, round-robin) según patrones de acceso.
- Minimizar índices no únicos; cada índice consume memoria.
- Reemplazar tablas temporales locales por variables de tabla cuando sea posible.
- Usar funciones de tabla en lugar de scripted calculation views.

## Notas SAP relacionadas

- 2000002 - FAQ: SAP HANA SQL Optimization
- 2586630 - SAP HANA Database: Slow Individual SQL Statements
- 2142945 - FAQ: SAP HANA Hints
- 1912445 - ABAP custom code migration for SAP HANA
- 2441054 - High query compilation times for calculation views
