# AGENTE IA para SAP HANA + SAP Business One

## El asistente inteligente que diagnostica, monitorea y resuelve tu base de datos HANA en tiempo real

---

## Resumen ejecutivo

**AGENTE IA para SAP HANA + SAP B1** es un Model Context Protocol (MCP) Server que conecta agentes de inteligencia artificial (Claude, Kimi, VS Code Copilot, etc.) directamente con tu base de datos SAP HANA y SAP Business One. En lugar de depender de un DBA senior para escribir consultas, revisar logs o interpretar métricas, tus equipos de soporte, consultoría y operaciones pueden conversar en lenguaje natural con el agente y obtener respuestas técnicas precisas, diagnósticos estructurados y recomendaciones accionables en segundos.

El producto se instala **localmente en el equipo del cliente**, funciona con o sin conexión a internet y se licencia bajo un modelo de **suscripción mensual** que incluye actualizaciones continuas, sincronización de base de conocimiento y soporte.

---

## ¿Qué problemas resuelve?

| Problema actual | Cómo lo resuelve AGENTE IA |
|-----------------|------------------------------|
| Diagnósticos de HANA requieren conocimiento avanzado de SQL y vistas del sistema (`M_*`, `SYS.*`) | El agente consulta las vistas del sistema por ti y devuelve respuestas en español/inglés estructuradas |
| Los incidentes se resuelven lentamente por falta de documentación interna | Base de conocimiento local en Markdown para documentar cada incidente y reutilizar soluciones |
| No se detecta cuellos de botella de memoria, CPU o bloqueos hasta que el sistema falla | Monitoreo en tiempo real con alertas automáticas de salud, memoria y rendimiento |
| Consultores junior necesitan supervisión constante de un DBA senior | Reduce la curva de aprendizaje con un asistente que guía paso a paso |
| Las actualizaciones de herramientas son manuales y riesgosas | Sistema de actualización controlada por el usuario que preserva configuración y KB |

---

## Funcionalidades principales

### 1. Descubrimiento inteligente del esquema de datos

Con 20+ herramientas de descubrimiento, el agente puede explorar la base de datos sin escribir SQL:

- **Listar schemas, tablas, vistas, sinónimos, procedimientos, funciones y secuencias**
- **Describir tablas y columnas** con metadatos técnicos y semántica de negocio opcional
- **Buscar tablas y columnas por patrón** (`%CUSTOMER_ID%`, `%BUKRS%`, etc.)
- **Listar índices, constraints, claves foráneas y privilegios**
- **Obtener DDL completo** de cualquier objeto (`hana_get_ddl`)
- **Describir vistas de cálculo** de `_SYS_BIC` para ambientes BW/S4

### 2. Ejecución segura de consultas SQL

- Ejecuta consultas `SELECT` con límites de filas/columnas/celdas configurables
- Bloqueo por defecto de operaciones destructivas: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`
- Opción de habilitar DML por operación cuando el negocio lo requiera
- Paginación de resultados grandes con `hana_query_next_page`
- Explicación de planes de ejecución (`hana_explain_plan`)
- Estadísticas de columnas (`hana_get_column_stats`) para profiling de datos

### 3. Monitoreo de salud y rendimiento

Herramientas de diagnóstico operativo para detectar problemas antes de que impacten al negocio:

- **`hana_health_check`**: snapshot diagnóstico con info de base de datos, servicios, memoria, tablas más grandes y transacciones bloqueadas
- **`hana_memory_monitor`**: uso de memoria del indexserver vs. límites de asignación, con niveles de alerta (`ok`, `warning`, `critical`) y historial CSV opcional
- **`hana_realtime_performance`**: transacciones abiertas, queries más costosos, conexiones largas, deltas de column-store y bloqueos
- **`hana_get_expensive_queries`**: top de sentencias más costosas ordenadas por duración

### 4. Base de conocimiento local (Knowledge Base)

- Guarda incidentes resueltos como casos en Markdown con front-matter estructurado
- Búsqueda semántica/keyword sobre casos locales y casos remotos sincronizados desde la nube
- Índice automático regenerable con `hana_generate_kb_index`
- Disponible **incluso con la licencia vencida** en modo offline, para que el conocimiento nunca se pierda

### 5. Licenciamiento y actualizaciones controladas

- Validación local de licencia JWT vinculada al hardware ID del equipo
- Modo DEMO de 7 días para evaluación
- Sistema de actualizaciones manual: el cliente decide cuándo aplicar una nueva versión
- Las actualizaciones preservan:
  - Base de conocimiento local (`docs/kb/cases/`)
  - Configuración (`.env`, `mcp.json`)
  - Licencia (`.hana-license`)

### 6. Interfaz web opcional (HANA MCP UI)

- UI web para visualizar configuración, estado del servidor y herramientas disponibles
- Ideal para demos y para equipos que prefieren una interfaz gráfica

---

## ¿Por qué adquirir AGENTE IA?

### Ahorro directo de costos

1. **Reduce horas de consultoría especializada**
   Tareas que antes requerían un consultor HANA senior ahora las puede hacer un analista junior con el asistente. Esto reduce significativamente el costo por hora de diagnóstico.

2. **Evita contrataciones de emergencia**
   Cuando HANA se comporta mal, muchas empresas contratan DBA externos por hora. Con AGENTE IA, el equipo interno puede realizar el diagnóstico inicial en minutos.

3. **Previene downtime costoso**
   Las herramientas de monitoreo detectan alertas de memoria, bloqueos y queries caros antes de que generen caídas del sistema, ahorrando las pérdidas asociadas a la indisponibilidad de SAP B1.

4. **Acelera el onboarding técnico**
   Nuevo personal de soporte puede entender la estructura de la base de datos, relaciones entre tablas y patrones de incidentes sin depender de la memoria institucional.

5. **Documentación que se paga sola**
   Cada caso resuelto se guarda en la base de conocimiento. Eso reduce la repetición de incidentes y evita que el conocimiento se vaya cuando un colaborador sale de la empresa.

### Ventajas operativas

- **Respuestas en segundos**, no en horas
- **Diagnósticos estructurados** con datos reales de tu HANA
- **No depende de internet** para funcionar (modo offline de KB)
- **Seguridad primero**: queries destructivas bloqueadas por defecto, validación de licencia local, sin exponer credenciales
- **Escalable por suscripción**: empieza con lo básico y recibe nuevas funcionalidades cada mes como parte de la suscripción

---

## Modelo de licenciamiento (suscripción)

AGENTE IA se comercializa bajo un modelo de suscripción mensual. Cada licencia incluye:

- Instalación local en un equipo Windows x64
- Token JWT vinculado al hardware ID del equipo
- Acceso a todas las funcionalidades contratadas
- Actualizaciones de funcionalidades mientras la suscripción esté activa
- Sincronización de base de conocimiento remota (si aplica)
- Soporte técnico según plan

> **Modo offline garantizado**: si la suscripción se retrasa o vence, el cliente conserva acceso de solo lectura a toda la base de conocimiento local documentada.

---

## Casos de uso reales

### Caso 1: Mi SAP B1 está lento
El consultor pregunta al agente: *"¿Qué está consumiendo más memoria en HANA?"*. El agente ejecuta `hana_memory_monitor`, detecta uso crítico sobre el 85 % del límite efectivo y sugiere revisar las tablas column-store con mayor delta.

### Caso 2: No sé qué campos tiene la tabla de clientes
El analista pregunta: *"Muéstrame las columnas de la tabla de clientes en el schema RETAIL"*. El agente usa `hana_explain_table` y devuelve metadatos técnicos más descripciones de negocio si están configuradas.

### Caso 3: Se repite un error de Service Layer
El equipo de soporte documenta el incidente con `hana_save_knowledge_case`. La próxima vez que alguien pregunte por un síntoma similar, `hana_search_knowledge_base` encuentra la solución documentada.

### Caso 4: Auditoría de queries lentos
El DBA ejecuta `hana_get_expensive_queries` y `hana_realtime_performance` para identificar qué usuarios o procesos están generando carga, sin escribir SQL manual.

---

## Diferenciadores frente a otras soluciones

| Característica | AGENTE IA | Consultoría tradicional | Otras herramientas genéricas |
|----------------|-----------|-------------------------|------------------------------|
| Conexión directa a HANA/B1 | ✅ Nativa | ❌ Manual | ⚠️ Requiere configuración compleja |
| Respuestas en lenguaje natural | ✅ Sí | ❌ No | ⚠️ Limitado |
| Base de conocimiento local persistente | ✅ Sí | ❌ Dependiente de personas | ❌ No |
| Modo offline ante licencia vencida | ✅ Sí | N/A | ❌ No |
| Bloqueo de operaciones destructivas | ✅ Por defecto | Variable | Variable |
| Actualizaciones controladas por el cliente | ✅ Sí | N/A | ⚠️ Automáticas forzadas |
| Instalación local sin depender de la nube | ✅ Sí | N/A | ❌ Mayormente cloud |

---

## Impacto en productividad y costos operativos

AGENTE IA transforma la forma en que los equipos técnicos interactúan con SAP HANA y SAP Business One. Algunos impactos medibles:

- **Reducción del tiempo de diagnóstico**: incidentes que antes tomaban horas de consultoría especializada ahora pueden ser diagnosticados en minutos.
- **Menor dependencia de expertos externos**: el equipo interno puede realizar análisis iniciales, explorar el esquema de datos y consultar casos documentados sin esperar a un DBA senior.
- **Prevención de incidentes mayores**: el monitoreo continuo de memoria, queries caros y transacciones bloqueadas permite actuar antes de que el sistema se vea afectado.
- **Conocimiento institutionalizado**: cada caso resuelto queda documentado en la base de conocimiento local, reduciendo la repetición de incidentes y la pérdida de know-how cuando el personal cambia.
- **Ahorro de horas operativas**: menos tiempo en escribir SQL manual, revisar vistas del sistema o interpretar logs técnicos.

Además de estos ahorros operativos directos, el valor intangible es alto: mayor autonomía del equipo de soporte, respuestas más rápidas a usuarios finales y una base de conocimiento que crece con el tiempo.

---

## Requisitos técnicos

- Windows 10/11 o Windows Server 2019+ (x64)
- Acceso de red al servidor SAP HANA
- Credenciales de lectura (y DML solo si se habilita explícitamente)
- No requiere Node.js instalado si se usa la versión ejecutable `.exe`

---

## ¿Cómo empezar?

1. **Solicita una demo** o licencia de evaluación de 7 días.
2. Te enviamos el paquete ejecutable para Windows.
3. Configuras `.env` con los datos de conexión a tu HANA.
4. Ejecutas `hana_show_license_info` para obtener el hardware ID.
5. Te entregamos el token JWT activado para tu equipo.
6. Empiezas a conversar con tu base de datos.

---

## Conclusión

**AGENTE IA para SAP HANA + SAP B1** convierte la base de datos en un colaborador accesible. Reduce costos de soporte, acelera diagnósticos, preserva el conocimiento técnico y previene problemas antes de que escalen. Es la capa de inteligencia artificial que tu equipo de SAP necesita para trabajar más rápido, con menos riesgos y sin depender siempre de un experto disponible.

> **La suscripción incluye actualizaciones mensuales**: a medida que adquieres el producto, recibes nuevas funcionalidades de diagnóstico, monitoreo y automatización, haciendo que tu inversión se revalúe constantemente.

---

**Para más información o solicitar una demo, contacta al equipo comercial.**
