# AGENTS.md — Runbook operativo (despliegue hanaroda25)

Instrucciones de contexto para el agente (opencode) sobre **este despliegue específico**.
El producto en sí (servidor MCP `hana`) se documenta en `README.md` y `docs/`.
Aquí se documenta **cómo operar el entorno real**: HANA, SUSE y SAP Support.

---

## 0. Entorno

| Item | Valor |
|------|-------|
| Host HANA / SUSE | `hanaroda25.gruporoda.com` (mismo host: HANA en `:30015`, SUSE por SSH `:22`) |
| Tenant / BD HANA | `NDB` |
| Usuario HANA | `B1ADMIN` |
| Schema por defecto | `RETAIL` (SAP Business One, versión para HANA) |
| Service Layer | 4 miembros `50001`–`50004` + LB `50000` (Apache `httpd`, MPM `prefork`) |
| Plataforma del agente | Windows + PowerShell 5.1 (herramienta `bash`) |

**Credenciales:** todas viven en `.env` (NO se commitea — ver `.gitignore`). Nunca imprimas ni commitees secretos. Si necesitas mostrar config, muestra nombres de variables, no valores.

---

## 1. Cargar variables del `.env` (patrón obligatorio)

Los scripts de SUSE y Playwright leen credenciales del entorno. Cárgalas antes de ejecutar:

```powershell
Get-Content ".env" | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    Set-Item -Path ("Env:" + $matches[1]) -Value $matches[2]
  }
}
```

Variables relevantes: `SUSE_HOST`, `SUSE_USER`, `SUSE_PASSWORD`, `SAP_USER`, `SAP_PASS`, `SAP_NOTE`.

> **Nota (2026-08-04):** actualmente el `.env` de este workspace **no contiene** `SUSE_*`; los scripts de SUSE usan valores hardcodeados. Para seguir el patrón correcto, agregar `SUSE_HOST`, `SUSE_USER` y `SUSE_PASSWORD` al `.env` y reemplazar los defaults en `scripts/suse-*.js`.
>
> También revisar que `HANA_HOST` en `.env` coincida con el host real (hoy el `.env` tiene `hana.test.com` mientras que la config del MCP usa `hanaroda25.gruporoda.com`).

---

## 2. Capacidad 1 — HANA (MCP `hana`)

Único MCP server configurado (`opencode.json` / `mcp.json`). ~43 herramientas.
Referencia completa: `README.md` § Capabilities. Grupos clave:

- **Conexión/config:** `hana_test_connection`, `hana_get_session_info`, `hana_show_config`, `hana_show_env_vars`, `hana_show_license_info`.
- **Esquemas/tablas:** `hana_list_schemas`, `hana_list_tables`, `hana_describe_table`, `hana_explain_table`, `hana_search_tables`, `hana_search_columns`.
- **SQL:** `hana_execute_query` (+ `hana_query_next_page` para paginación). **DML bloqueado por defecto** (`HANA_ALLOW_INSERT/UPDATE/DELETE`).
- **Estructura:** `hana_list_constraints`, `hana_list_foreign_keys`, `hana_list_indexes`, `hana_get_ddl`, `hana_get_dependencies`.
- **Rendimiento/salud:** `hana_health_check`, `hana_memory_monitor`, `hana_realtime_performance`, `hana_get_expensive_queries`, `hana_explain_plan`.
- **Recursos MCP:** `hana:///schemas`, `hana:///schemas/{s}/tables/{t}`.

> Nota: algunas herramientas (`hana_list_schemas`, `hana_execute_query`) devuelven solo resumen de texto; los datos van en `structuredContent`. Para ver nombres completos usa el recurso `hana:///schemas` con `read_mcp_resource`.

---

## 3. Capacidad 2 — SUSE vía SSH (NO es MCP)

Se ejecuta desde el `bash` local usando el módulo `ssh2` (en `node_modules`) + credenciales del `.env`.
No hay servidor SSH como MCP; son scripts Node.

### Scripts disponibles en `scripts/`

| Script | Uso |
|--------|-----|
| `suse-log-reader.js` | Lee `/var/log/messages`, `/var/log/warn`, procesos `httpd`, logs `error_*` del Service Layer y traces HANA. **Usa env vars** (`SUSE_*`). |
| `suse-check-kba-config.js` | Lee el `httpd-b1s-lb-member-common.conf` (objetivo de la KBA 3733425). **Usa env vars**. |
| `suse-service-layer-version.js` | Versión/patch del Service Layer y config. ⚠️ **credenciales hardcodeadas** (heredar a env vars). |
| `investigate-b1sl-crashes.js` | Investiga caídas de `httpd` del Service Layer. ⚠️ **credenciales hardcodeadas**. |

### Ejecución estándar

```powershell
# 1) cargar .env  (ver §1)
# 2) correr el script con node:
& "C:\Program Files\nodejs\node.exe" ".\scripts\suse-log-reader.js"
```

### SSH ad-hoc (comando arbitrario de solo lectura)

Si necesitas inspeccionar algo no cubierto por los scripts, escribe un JS efímero en el dir temporal y resuelve `ssh2` del proyecto vía `NODE_PATH`:

```powershell
$env:NODE_PATH = "D:\ProyectosPython\sap-hana-mcp-server\node_modules"
& "C:\Program Files\nodejs\node.exe" "C:\Users\jdiaz\AppData\Local\Temp\opencode\mi-script.js"
```

Alternativa local: `plink.exe` (PuTTY, en `D:\Program Files\PuTTY`) u `ssh.exe` (OpenSSH).

### Rutas útiles en el SUSE

```
/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb-member-common.conf   # config miembros (común a 50001-50004)
/usr/sap/SAPBusinessOne/ServiceLayer/conf/httpd-b1s-lb.conf                 # frontend LB (50000)
/usr/sap/SAPBusinessOne/ServiceLayer/logs/error_${PORT}_log_%Y_%m_%d        # logs de error (rotación diaria)
/usr/sap/SAPBusinessOne/ServiceLayer/coredump                               # volcados core
/var/log/messages , /var/log/warn                                           # sistema
```

---

## 4. Capacidad 3 — Notas SAP vía Playwright (NO es MCP)

`scripts/fetch-sap-note-playwright.py` abre Chromium, hace login en SAP for Me (`accounts.sap.com`) y descarga la nota indicada.

- **Entorno:** venv `venv-sap` (Python) con Playwright 1.61 instalado.
- **Variables:** `SAP_USER`, `SAP_PASS`, `SAP_NOTE` (del `.env`).
- **URL base:** `https://me.sap.com/notes/{NOTE}`.

### Ejecución

```powershell
# 1) cargar .env  (ver §1)
# 2) correr con el python del venv:
& ".\venv-sap\Scripts\python.exe" ".\scripts\fetch-sap-note-playwright.py"
```

### Salida

- `sap-note-{NOTE}-playwright.txt` — texto plano (la versión completa, requiere login).
- `sap-note-{NOTE}-playwright.html` — HTML completo.
- En timeout/error: `sap-note-{NOTE}-timeout.png` / `sap-note-{NOTE}-error.png`.

> ⚠️ **Encoding:** al imprimir en consola puede fallar con `'charmap' codec can't encode…` (codepage Windows). Los archivos **sí se guardan** correctamente en UTF-8 antes de ese error; léelos con `read` en lugar de depender del print.

---

## 5. Reglas operativas (importante)

1. **Sistema de producción.** Antes de cualquier cambio (config SUSE, reinicios, DML en HANA), **mostrar el plan y esperar confirmación** del usuario.
2. **Lectura primero.** Por defecto solo inspeccionar (logs, config, metadatos). Aplicar fixes solo con visto bueno.
3. **DML en HANA bloqueado** por defecto. Si se habilita, operar con transacciones explícitas y respaldo.
4. **Respaldar antes de editar** cualquier `.conf` del SUSE (`cp file file.bak.$(fecha)`).
5. **No commitear secretos.** `.env`, `private-key.pem`, ni credenciales van al repo.
6. **Documentar hallazgos** relevantes con `hana_save_knowledge_case` (KB local del MCP) y/o actualizar este runbook.

---

## 6. Casos conocidos

- **KBA/Nota SAP 3733425** — *Service Layer worker process termination due to heap corruption under high load*.
  - Síntoma: `malloc_consolidate(): invalid chunk size`, `double free or corruption (!prev)`, `corrupted size vs. prev_size in fastbins`, `httpd` child `exit signal Aborted (6)` con coredumps.
  - Causa: condición de carrera al cerrar workers; doble `free()` en `CAsyncLogger::~CAsyncLogger`.
  - Fix: en `httpd-b1s-lb-member-common.conf`, `MaxRequestWorkers` → `8` (antes `24`), mantener `MaxConnectionsPerChild 1024`; reiniciar Service Layer.
  - Ajuste adicional (2026-08-04): `MinSpareServers` → `4` y `MaxSpareServers` → `6` (eran `8`/`8`). Con `MinSpareServers=MaxSpareServers=MaxRequestWorkers=8`, Apache prefork no podía mantener spares y atender requests al mismo tiempo, generando warnings constantes `AH00161: server reached MaxRequestWorkers`. Se dejó `MaxRequestWorkers=8` para respetar la KBA.
  - Estado despliegue: fix aplicado y Service Layer reiniciado; login y consultas OData funcionando en `RETAIL` y `RETAIL_QA5`.
  - Relacionadas: KBA 3157498, KBA 3157607, Notas SAP 2418476, 3027326.

---

## 7. Mejoras pendientes (opcional)

- Empaquetar SUSE y SAP-notes como MCP servers propios (hoy son scripts invocados desde `bash`).
- Migrar credenciales hardcodeadas en `suse-service-layer-version.js` e `investigate-b1sl-crashes.js` a env vars (patrón de `suse-log-reader.js`).
