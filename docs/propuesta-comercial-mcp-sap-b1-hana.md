# Propuesta comercial: HANA MCP Server para SAP Business One

**Producto:** Agente MCP (Model Context Protocol) especializado para SAP HANA y SAP Business One  
**Mercado objetivo:** Empresas que operan SAP Business One 10.0 sobre HANA, partners SAP, consultoras de soporte, mesas de ayuda.  
**Modelo de entrega:** Agente local licenciado + infraestructura en la nube para licenciamiento y base de conocimiento.

---

## 1. Resumen ejecutivo

El **HANA MCP Server** es un agente inteligente que se conecta directamente a la base de datos SAP HANA, al servidor SUSE donde corre SAP Business One Service Layer, y al portal de soporte SAP. Permite a los equipos de TI y consultores diagnosticar problemas, monitorear performance, consultar notas SAP, documentar incidentes y aplicar correcciones de forma asistida, todo desde una interfaz conversacional (Kimi, Claude, VS Code, etc.).

El producto se comercializa bajo un modelo de **licencias por máquina/instalación** con suscripción anual, complementado con un **repositorio de conocimiento en la nube** que se sincroniza automáticamente con cada instalación.

---

## 2. Problemática que resolvemos

Las empresas que operan SAP Business One sobre HANA enfrentan problemas recurrentes:

- **Falta de visibilidad** del estado real de HANA y del Service Layer.
- **Diagnóstico lento** cuando ocurren caídas intermitentes o lentitud.
- **Dependencia de consultores externos** para leer logs y notas SAP.
- **Pérdida de conocimiento** cuando un incidente se resuelve pero no se documenta.
- **Riesgo operativo** al aplicar cambios en producción sin respaldo ni guía.

Nuestro agente reduce el tiempo de diagnóstico, estandariza la resolución de incidentes y acumula conocimiento técnico reusable.

---

## 3. Capacidades técnicas del producto

### 3.1 Monitoreo y diagnóstico de SAP HANA

El agente se conecta a HANA y puede consultar en tiempo real:

| Capacidad | Descripción | Valor para el cliente |
|-----------|-------------|----------------------|
| Estado de servicios | Verifica que todos los servicios HANA estén activos. | Detecta caídas tempranas. |
| Uso de memoria | Reporta consumo de RAM por servicio (`indexserver`, `nameserver`, etc.). | Previene problemas de memoria. |
| Queries costosas | Identifica sentencias con mayor tiempo de ejecución. | Optimización de performance. |
| Plan cache | Muestra queries más frecuentes y lentas. | Tuning de aplicaciones. |
| Locks y waits | Detecta bloqueos y esperas activas. | Resolución de bloqueos. |
| Conexiones abiertas | Cuenta conexiones por usuario/host. | Detección de fugas de conexión. |
| Delta merge | Reporta tablas columnares con alto porcentaje de delta. | Mejora velocidad de lectura. |
| Transacciones largas | Identifica transacciones idle o activas por mucho tiempo. | Prevención de bloqueos. |
| Tablas grandes | Lista las tablas más pesadas y tablas sin clave primaria. | Mantenimiento proactivo. |
| Metadatos | Describe tablas, vistas, índices, procedimientos, sinónimos. | Exploración del modelo de datos. |

### 3.2 Análisis remoto del servidor SUSE / Service Layer

Mediante SSH, el agente puede revisar el servidor donde corre SAP Business One:

| Capacidad | Descripción |
|-----------|-------------|
| Logs del sistema | Lee `/var/log/messages`, `/var/log/warn`, `/var/log/syslog`. |
| Logs del Service Layer | Lee `error_5000X_log_YYYY_MM_DD` de Apache. |
| Procesos activos | Lista procesos `httpd`, nodos worker, consumo de recursos. |
| Configuración Apache | Inspecciona `httpd-b1s-lb-member-common.conf` y otros includes. |
| Versiones y parches | Identifica versión de Service Layer y componentes instalados. |
| Core dumps | Verifica si hay volcados generados. |
| Ejecución de comandos | Corre diagnósticos específicos bajo demanda. |

### 3.3 Consulta automatizada de notas SAP

Usando un navegador automatizado (Playwright), el agente puede:

- Navegar a `https://me.sap.com/notes/<numero>`.
- Autenticarse con credenciales del cliente.
- Extraer la sección de síntoma, causa y resolución.
- Guardar la información en la base de conocimiento local.

Esto elimina la necesidad de que un humano busque manualmente la solución en el portal SAP.

### 3.4 Base de conocimiento automática

Cada incidente resuelto puede documentarse automáticamente:

- Se guarda un archivo Markdown por caso en `docs/kb/cases/`.
- Se indexan todos los casos en `docs/kb/index.md`.
- Se permite búsqueda por palabras clave.
- Se sincronizan casos de ejemplo / mejores prácticas desde un repositorio en la nube.

Esto convierte el conocimiento tácito en conocimiento explícito y reusable.

### 3.5 Licenciamiento y protección del software

El producto incluye un sistema de licenciamiento comercial:

- **Hardware ID** único por máquina.
- **Licencia JWT** firmada con RSA por el vendor.
- **Validación online opcional** contra endpoint propio.
- **Modo demo** de 7 días.
- **Features por plan**: `hana`, `knowledge-base`, `remote-support`, `backup`, etc.
- Protección contra copia mediante empaquetado en binario.

### 3.6 Generación de backups (bajo demanda)

El agente puede asistir en la creación de backups:

- Backup completo de base de datos HANA.
- Backup de catálogo.
- Export de schema específico.
- Backup de archivos de configuración del Service Layer.

> Los backups se ejecutan bajo solicitud explícita del cliente y previa verificación de permisos y espacio.

### 3.7 Aplicación asistida de correcciones

El agente puede preparar y aplicar cambios de configuración documentados en notas SAP, como:

- Modificar archivos de configuración de Apache (`httpd-b1s-lb-member-common.conf`).
- Reiniciar el Service Layer de forma controlada.
- Monitorear logs post-cambio.

Siempre bajo aprobación del cliente y con backup previo.

---

## 4. Arquitectura de la solución

```
┌─────────────────────────────────────────────┐
│           Estación de trabajo               │
│  Kimi / Claude / VS Code + mcp.json         │
└──────────────┬──────────────────────────────┘
               │ stdio
┌──────────────▼──────────────────────────────┐
│  HANA MCP Server (agente local licenciado)  │
│                                             │
│  ├─ Conector HANA (SQL)                     │
│  ├─ Conector SSH (SUSE logs/config)         │
│  ├─ Navegador SAP (Playwright)              │
│  ├─ Base de conocimiento local (Markdown)   │
│  └─ Validador de licencias (JWT/RSA)        │
└──────────────┬──────────────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌─────────┐         ┌─────────────────┐
│ SAP     │         │  Nube del vendor│
│ HANA    │         │                 │
│ Service │         │  /api/license   │
│ Layer   │         │  /api/kb        │
│ SUSE    │         │  Panel admin    │
└─────────┘         └─────────────────┘
```

---

## 5. Modelos de comercialización sugeridos

### Modelo A: Licencia por instalación + suscripción anual

| Plan | Features incluidas | Precio orientativo (USD/año) |
|------|-------------------|------------------------------|
| **Starter** | Monitoreo HANA básico + 1 schema | $1,200 - $2,400 |
| **Professional** | HANA avanzado + Service Layer + KB local | $3,600 - $6,000 |
| **Enterprise** | Todo + SAP notes + KB remota + backups + soporte | $8,400 - $14,400 |

*Precios referenciales, ajustables por volumen y región.*

### Modelo B: Por número de usuarios o nodos

- Precio escalonado según cantidad de usuarios de SAP Business One.
- Adicional por cada nodo HANA o Service Layer extra.

### Modelo C: Servicio gestionado

- El partner instala el agente y presta servicio de monitoreo y soporte.
- Ingresos recurrentes por horas o por contrato de SLA.

### Ingresos adicionales

- **Soporte técnico**: tickets, incidentes, tuning.
- **Implementación y capacitación**: puesta en marcha, formación de equipos.
- **Base de conocimiento premium**: casos y runbooks actualizados mensualmente desde la nube.

---

## 6. Beneficios para el cliente

- **Reduce tiempo de diagnóstico** de horas a minutos.
- **Disminuye dependencia de consultores externos** para tareas repetitivas.
- **Estandariza procedimientos** mediante runbooks y casos documentados.
- **Previene incidentes** con monitoreo proactivo.
- **Acumula conocimiento** técnico del negocio del cliente.
- **Aplica correcciones con respaldo** y trazabilidad.

---

## 7. Casos de uso / escenarios comerciales

### Escenario 1 — Caída intermitente del Service Layer

Un cliente reporta que SAP Business One se desconecta esporádicamente. El agente:

1. Revisa logs del Service Layer.
2. Identifica errores de heap corruption.
3. Consulta la KBA 3733425.
4. Propone cambio de configuración.
5. Documenta el caso en la KB local.

### Escenario 2 — Lentitud generalizada

El sistema está lento. El agente:

1. Revisa queries costosas en HANA.
2. Detecta tablas con alto delta sin mergear.
3. Identifica conexiones excesivas.
4. Recomienda tuning y aplica cambios supervisados.

### Escenario 3 — Auditoría y salud mensual

El cliente quiere un informe mensual. El agente:

1. Ejecuta health check completo.
2. Genera informe Markdown.
3. Guarda en base de conocimiento.
4. Programa revisión periódica.

---

## 8. Entregables del servicio

| Entregable | Descripción |
|------------|-------------|
| Agente MCP instalado | Binario + configuración en servidor del cliente. |
| `.env` configurado | Credenciales HANA, SUSE, SAP. |
| Licencia activada | Token JWT vinculado al hardware ID. |
| Base de conocimiento inicial | Casos comunes y runbooks sincronizados. |
| Informe de salud inicial | Estado de HANA y Service Layer. |
| Documentación | Runbook de uso y troubleshooting. |

---

## 9. Requisitos del cliente

- SAP HANA 2.0 (single-container o MDC).
- SAP Business One 10.0 para HANA.
- Acceso de red al servidor HANA y SUSE.
- Credenciales de HANA, SSH root (o usuario con permisos), y SAP Support.
- Permisos de backup para funcionalidad de respaldos.

---

## 10. Roadmap de implementación

| Fase | Duración estimada | Actividades |
|------|-------------------|-------------|
| **1. Instalación** | 1-2 días | Instalar agente, configurar `.env`, activar licencia. |
| **2. Descubrimiento** | 2-3 días | Health check, análisis de performance, revisión de logs. |
| **3. Documentación** | 2-3 días | Crear casos iniciales en KB, sincronizar runbooks. |
| **4. Capacitación** | 1 día | Formación al equipo de TI del cliente. |
| **5. Soporte continuo** | Mensual | Monitoreo, actualización de KB, resolución de incidentes. |

---

## 11. Ventaja competitiva

A diferencia de herramientas genéricas de monitoreo, este agente:

- **Entiende el stack completo SAP Business One + HANA + SUSE.**
- **Se integra con el ecosistema de IA conversacional** (Kimi, Claude, VS Code).
- **Aprende y documenta automáticamente** cada incidente.
- **Consulta directamente el soporte SAP** sin intervención manual.
- **Puede actuar** (backup, cambios de config) bajo supervisión humana.

---

## 12. Próximos pasos para comercializar

1. Definir planes y precios finales según mercado objetivo.
2. Construir endpoint en la nube para licenciamiento y KB.
3. Empaquetar el agente como ejecutable.
4. Crear demo grabada mostrando diagnóstico de un incidente real.
5. Preparar contrato de licenciamiento y términos de uso.

---

**Documento preparado para discusión comercial y ajuste de oferta.**
