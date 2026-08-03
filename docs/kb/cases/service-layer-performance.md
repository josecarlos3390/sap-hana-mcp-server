---
date: 2026-07-04
category: service-layer
status: reference
severity: medium
sap_note: 2607373
tags:
  - service-layer
  - performance
  - sap-b1
  - kba-2607373
  - kba-3139544
  - kba-3157498
---

# SAP Business One Service Layer: Configuración y rendimiento

> Basado en SAP KBA 2607373 - Troubleshooting Service Layer on Linux, KBA 3139544, KBA 3157498 y webinar de SAP sobre configuración óptima del Service Layer.

## Síntomas

- Respuestas lentas desde el Service Layer.
- Login tarda ~5 segundos o más.
- Consumo alto de CPU/RAM en el Service Layer.
- Errores 500/502/503/504 frecuentes bajo carga.

## Buenas prácticas generales

### 1. Reutilizar sesión (cookie) en lugar de Basic Auth por request

- Enviar comando `/Login` una vez y reutilizar la cookie de sesión.
- Basic Auth en cada request fuerza un login nuevo, lo que ralentiza las llamadas.
- Timeout de inactividad por defecto: 30 minutos (configurable).

### 2. Configuración de Apache (prefork)

Ajustar en `httpd-b1s-lb-member-common.conf` según carga:
```apache
StartServers             8
MaxSpareServers          8
MinSpareServers          8
MaxConnectionsPerChild   1024
MaxRequestWorkers        8
```

> **Nota:** KBA 3733425 corrige heap corruption en escenarios de alta carga ajustando estos valores.

### 3. Max Connections Per Child

- Controla con qué frecuencia Apache recicla procesos worker.
- Útil para liberar memoria acumulada por leaks.

### 4. Maximum Threads per Load Balancer Member

- Configurar según número esperado de requests concurrentes.
- No hay un número máximo absoluto de threads por instalación; depende de recursos del servidor.

### 5. Número de nodos Service Layer

- No existe una fórmula universal.
- Se debe establecer una línea base según la implementación.
- Referencia: KBA 3139544 para consideraciones de sizing.

### 6. Procesamiento masivo de documentos

- Procesar 6000 documentos/día en horario online solo si el tiempo por transacción es bajo.
- Si las transacciones son largas, reprogramar a horario fuera de pico o procesar concurrentemente si es viable.

### 7. SQL Queries del Service Layer

- Algunas tablas están restringidas en SQL Queries por seguridad.
- Si SQL Queries consume alta CPU/RAM, revisar SAP Note 3529952.
- Limitar máximo de resultados y aplicar filtros siempre que sea posible.

## Monitoreo

### Access log
- Registra requests que llegan al load balancer.
- Referencia: KBA 3157498 punto 1.

### Error log
- Errores técnicos (5xx).
- Referencia: KBA 3157498 punto 2.

### Observer logs
- Útil para identificar delays y transacciones bloqueadas.
- Referencia: KBA 3157498 puntos 5 y 6.

### Service Layer Controller
- Muestra número de requests manejados por nodo.
- Permite monitorear en tiempo real.

## Logs relevantes

```bash
# Ruta típica en Linux
/usr/sap/SAPBusinessOne/ServiceLayer/logs/
# Archivos: httpd.servicelayer, httpd.DILogger, httpd.b1logger, access logs
```

## Notas SAP relacionadas

- 2607373 - Troubleshooting Service Layer on Linux
- 3139544 - Service Layer sizing considerations
- 3157498 - Service Layer log analysis
- 3529952 - Service Layer SQLQueries high CPU/RAM
- 3733425 - Service Layer worker process termination due to heap corruption
