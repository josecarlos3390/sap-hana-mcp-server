# Informe técnico: Inestabilidad del SAP Business One Service Layer

**Fecha:** 04 de julio de 2026  
**Sistema afectado:** `hanaroda25.gruporoda.com`  
**Componente:** SAP Business One 10.0 Service Layer para SAP HANA  
**Referencia SAP:** KBA 3733425 — *Service Layer worker process termination due to heap corruption under high load*  
**Elaborado por:** Análisis automatizado con `hana-mcp-server` + diagnóstico remoto del servidor SUSE  

---

## 1. Resumen ejecutivo

El Service Layer de SAP Business One presenta **terminaciones intermitentes de sus procesos worker Apache (`httpd`)** con error `SIGABRT` y mensajes de corrupción de memoria dinámica (heap). El problema coincide exactamente con la nota SAP **KBA 3733425**.

- **No se trata de un fallo en SAP HANA:** la base de datos responde con normalidad, todos sus servicios están activos y no hay cuellos de botella de CPU o memoria.
- **Tampoco es causado por una consulta específica:** la query `ACB_TES_CtasXPagarDetallev2` fue descartada porque aparece solo 6 veces en el histórico y no está en caché de planes.
- **El Service Layer sigue funcionando**, pero de forma inestable: cuando un proceso hijo muere, Apache levanta otro. Ese ciclo de muerte/recreación genera reconexiones masivas a HANA, acumulación de conexiones y riesgo de degradación progresiva.
- **La solución es conocida y documentada por SAP:** cambiar la configuración del módulo `mpm_prefork` y reiniciar el Service Layer.

---

## 2. Entorno técnico

| Elemento | Valor |
|----------|-------|
| Host | `hanaroda25.gruporoda.com` |
| Sistema operativo | SUSE Linux Enterprise Server 15 SP5, kernel `5.14.21-150500.55.88-default` |
| glibc | `2.31` |
| SAP HANA | `NDB`, versión `2.00.059.13.1713941539`, puerto `30015` |
| Esquema monitorizado | `RETAIL` (usuario `B1ADMIN`) |
| Service Layer | Apache/2.4.62 (compilado 11-ago-2024) |
| Load balancer | Puerto `50000` |
| Nodos worker | Puertos `50001`, `50002`, `50003`, `50004` |
| MPM de worker nodes | `mpm_prefork` |
| Archivo de configuración afectado | `/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf` |
| Core dumps | Deshabilitados (`Max core file size: 0`) |

---

## 3. Síntomas y evidencia recopilada

### 3.1 Errores en los logs del Service Layer

En los archivos `error_5000X_log_YYYY_MM_DD` se repiten constantemente:

```
malloc_consolidate(): invalid chunk size
double free or corruption (!prev)
corrupted size vs. prev_size in fastbins
```

Ejemplo real del nodo `50004`:

```
[...] AH00051: child pid 10242 exit signal Aborted (6), possible coredump
[...] AH00051: child pid 10192 exit signal Aborted (6), possible coredump
[...] AH00051: child pid 11106 exit signal Aborted (6), possible coredump
```

### 3.2 Trazas de pila (stack trace)

La nota SAP incluye una traza idéntica a la situación observada:

```
#0  clock_nanosleep@GLIBC_2.2.5
#1  nanosleep
#2  CAsyncLogger::~CAsyncLogger()
#3  CAsyncLogger::~CAsyncLogger()
#4  std::_Rb_tree<SBOString, ...>::_M_erase
#6  CLogManager::~CLogManager()
#7  CLogManager::Destroy()
#9  __run_exit_handlers () from /lib64/libc.so.6
#10 exit ()
#11 clean_child_exit
```

El crash ocurre en el **destructor del logger asíncrono (`CAsyncLogger`)** durante la terminación de un proceso hijo Apache.

### 3.3 Nodos afectados

Los cuatro nodos worker (`50001-50004`) presentan el mismo patrón, lo que indica que el origen está en la **configuración compartida**, no en un nodo individual.

### 3.4 Limitación para análisis profundo

Los core dumps están deshabilitados, por lo que no es posible generar un volcado detallado del proceso en el momento del fallo. Esto no impide aplicar la solución, pero dificulta una validación adicional sin habilitarlos temporalmente.

---

## 4. Análisis de impacto actual

### 4.1 ¿Cómo **sí** está afectando?

- **Inestabilidad del middle tier:** procesos worker mueren y se recrean de forma intermitente.
- **Acumulación de conexiones a HANA:** se detectaron **14,198 conexiones abiertas**, la mayoría de `B1_SBOCOMMON` y `B1ADMIN`. Esto es coherente con reconexiones repetidas del Service Layer tras cada caída de proceso.
- **Presión adicional sobre HANA:** conexiones idle y transacciones abiertas largas (de 11 a 13 minutos) que potencialmente dejan locks o recursos sin liberar.
- **Riesgo de degradación:** si la frecuencia de caídas aumenta, los usuarios podrían experimentar respuestas lentas, errores intermitentes `500` o pérdida de sesiones.
- **Deltas sin fusionar:** tablas columnares con alto porcentaje de delta (`AJD1` 63 %, `OITM` 51 %) ralentizan lecturas. No es causa del crash, pero sí un factor de performance que hay que atender.

### 4.2 ¿Cómo **no** está afectando?

- **SAP HANA no se ha caído:** todos los servicios están activos, el indexserver usa ~99 GB de 354 GB RAM disponibles.
- **No hay corrupción de datos:** los errores son de memoria de proceso, no de persistencia en base de datos.
- **El Service Layer no está completamente fuera de servicio:** el balanceador sigue distribuyendo tráfico y Apache levanta nuevos workers.
- **No hay un cuello de botella de CPU o I/O** identificado en el análisis en tiempo real.

### 4.3 Conclusión del impacto

El problema es **crítico desde el punto de vista de estabilidad**, pero **no es una caída total**. Es una "herida que sangra": el sistema se recupera automáticamente, pero cada caída genera conexiones huérfanas, fragmentación de recursos y riesgo creciente. Conviente actuar antes de que escale.

---

## 5. Causa raíz

Según la KBA 3733425:

> **Condición de carrera durante el cierre del proceso worker Apache.**  
> Se produce un error de *double free* en el destructor del registrador asíncrono (`CAsyncLogger`) durante la terminación del proceso worker.

En otras palabras: cuando un proceso `httpd` hijo termina (por ejemplo, porque alcanza `MaxConnectionsPerChild` o sobra/escasea de procesos según `mpm_prefork`), el logger asíncrono intenta liberar memoria dos veces, corrompiendo el heap y provocando `SIGABRT`. El patrón se ve favorecido en escenarios de **carga alta + rotación frecuente de procesos**.

---

## 6. Solución propuesta

SAP indica modificar un único archivo compartido por todos los nodos worker:

**Archivo:** `/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf`

**Bloque a cambiar (`<IfModule mpm_prefork_module>`):**

**Configuración actual (coincide con la nota):**

```apache
StartServers             1
MaxSpareServers          2
MinSpareServers          1
MaxConnectionsPerChild   1024
MaxRequestWorkers        24
```

**Configuración recomendada por SAP:**

```apache
StartServers             8
MaxSpareServers          8
MinSpareServers          8
MaxConnectionsPerChild   1024
MaxRequestWorkers        8
```

**Acción posterior:** reiniciar el Service Layer para que todos los nodos worker (`50001-50004`) carguen la nueva configuración.

### 6.1 ¿Por qué funciona este cambio?

- `StartServers`, `MinSpareServers` y `MaxSpareServers` pasan a `8`: se mantiene un **pool más estable de procesos precreados**, reduciendo la rotación de procesos y, con ello, las oportunidades de disparar la condición de carrera en el destructor del logger.
- `MaxRequestWorkers` baja de `24` a `8`: limita el número de procesos concurrentes por nodo. Según SAP, con esta configuración el patrón de corrupción deja de reproducirse.
- `MaxConnectionsPerChild` se mantiene en `1024`: un proceso se recicla después de atender 1,024 conexiones, lo que sigue siendo saludable, pero al haber menos workers la rotación global es más predecible.

### 6.2 Referencias SAP

- **KBA 3733425** — *Service Layer worker process termination due to heap corruption under high load* (la solución principal).
- **SAP Note 2418476** — *Service Layer allows log rotation*.
- **SAP Note 3027326** — *Service Layer on SAP HANA causes core dump files*.
- **KBA 3157498** — *Service Layer log file configuration*.
- **KBA 3157607** — *How to analyze core dumps*.

---

## 7. Riesgos y consideraciones

| Riesgo | Descripción | Mitigación |
|--------|-------------|------------|
| **Menor concurrencia máxima** | De 24 a 8 workers por nodo; total de 96 a 32 procesos simultáneos. | Evaluar carga actual. Si los usuarios no saturan los 32 workers, no habrá impacto percibido. |
| **Corte de sesiones activas** | Reiniciar el Service Layer desconecta a los usuarios conectados. | Realizar el reinicio en una ventana de mantenimiento o baja actividad. |
| **Persistencia del problema** | Si el cambio no es suficiente, se requeriría un patch adicional de SAP. | Monitorear logs durante 24-48 h. Habilitar core dumps temporalmente si es necesario escalar con SAP. |
| **Conexiones HANA acumuladas** | El reinicio cerrará las conexiones actuales, pero conviene revisar el pool de conexiones del Service Layer después. | Verificar `SYS.M_CONNECTIONS` tras el reinicio. |

---

## 8. Hallazgos adicionales (no críticos, pero recomendados)

1. **Exceso de conexiones HANA:** 14,198 conexiones abiertas. Se recomienda revisar y ajustar los pools de conexión del Service Layer y los timeouts de sesión.
2. **Transacciones idle largas:** dos transacciones activas entre 11 y 13 minutos. Identificar el usuario/host para evitar bloqueos.
3. **Delta merge pendiente:** tablas `AJD1` (63 %) y `OITM` (51 %) con alto porcentaje de delta. Ejecutar merge manual y verificar la política de auto-merge.

Estos puntos no resuelven el crash, pero mejorarán la estabilidad general del entorno.

---

## 9. Recomendaciones

1. **Aplicar la solución de la KBA 3733425** en una ventana de mantenimiento acordada.
2. **Realizar backup** del archivo `httpd-b1s-lb-member-common.conf` antes de editarlo.
3. **Reiniciar el Service Layer** de forma controlada y monitorear los logs de error inmediatamente después.
4. **Durante 24-48 h posteriores**, verificar que no aparezcan nuevos mensajes `malloc_consolidate` o `double free`.
5. **Si persiste el problema**, habilitar temporalmente core dumps y abrir un ticket a SAP con la traza.
6. **Atender deuda técnica:** delta merge y conexiones HANA excesivas para evitar cuellos de botella secundarios.

---

## 10. Decisión requerida

Se solicita aprobación para ejecutar los siguientes pasos:

1. Backup de `/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf`.
2. Aplicar la configuración recomendada por SAP.
3. Reiniciar el Service Layer.
4. Monitorear logs y conexiones HANA durante las siguientes 24-48 horas.

**Nota:** el cambio es reversible en minutos restaurando el backup y reiniciando de nuevo, si se detectara algún efecto negativo.
