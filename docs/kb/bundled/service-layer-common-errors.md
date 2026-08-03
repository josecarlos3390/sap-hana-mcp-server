---
date: 2026-07-04
category: service-layer
status: reference
severity: medium
sap_note: 3654819
tags:
  - service-layer
  - sap-b1
  - errors
  - troubleshooting
  - kba-3654819
  - kba-3663692
  - kba-3454535
  - kba-3538414
  - kba-3607657
---

# SAP Business One Service Layer: Errores comunes y fixes

> Recopilación de fixes de notas SAP para errores frecuentes del Service Layer.

## 1. "Fail to connect to SLD" (código 312)

**KBA:** 3654819

### Síntomas
- Desconexiones intermitentes o timeouts.
- Error 500 con código 312.
- Service Layer no puede atender requests.

### Causas
- Latencia de red.
- Problemas de validación de certificado.
- Timeout de conectividad.
- Inestabilidad del SLD.

### Acciones
1. Verificar conectividad y latencia entre Service Layer y SLD.
2. Revisar certificados y validación.
3. Monitorear timeouts y tareas programadas.
4. Analizar logs del Service Layer (ver KBA 3607657).

---

## 2. Login concurrente falla: "SAML Login Failed" (299) / "Connection to license server is not authenticated" (-132)

**KBA:** 3663692

### Síntomas
- Logins concurrentes fallan ocasionalmente.
- Error 299 en Service Layer.
- Error -132 en DI API.

### Causas
- Problema de concurrencia en autenticación.
- Timeouts.

### Acciones
1. Revisar configuración de timeouts en SLD y Service Layer.
2. Limitar requests de login concurrentes o implementar reintentos con backoff.
3. Aplicar nota/patch indicado en la KBA si aplica a la versión.

---

## 3. Service Layer no inicia: "Address already in use"

**KBA:** 3454535

### Síntomas
- `systemctl start b1s` falla.
- Error: `make_sock: could not bind to address [::]:50000`.

### Causa
- Puerto 50000 ya está en uso por otro proceso.
- Cierre anterior no limpió el socket.

### Acciones
```bash
# Verificar qué proceso usa el puerto
sudo lsof -i :50000
# o
sudo netstat -tulpn | grep 50000

# Matar proceso huérfano si es seguro
sudo kill -9 <PID>

# Reiniciar Service Layer
sudo systemctl restart b1s
```

---

## 4. Logs del Service Layer no se eliminan y consumen disco

**KBA:** 3538414

### Síntomas
- Archivos `httpd.servicelayer`, `httpd.DILogger`, `httpd.b1logger` crecen indefinidamente.
- Disco lleno.
- Rendimiento degradado.

### Acciones
1. Configurar rotación y retención de logs en el Service Layer.
2. Revisar KBAs 3543181 y 3538414 para parámetros de cleanup.
3. Establecer política de retención (por ejemplo, 30 días).
4. Monitorear uso de disco periódicamente.

---

## 5. Cómo usar logs del Service Layer para diagnosticar errores 5xx

**KBA:** 3607657

### Errores cubiertos
- 500 Internal Server Error
- 502 Bad Gateway
- 503 Service Unavailable
- 504 Gateway Timeout

### Acciones
1. Revisar **error log** para identificar el componente que falla.
2. Revisar **access log** para correlacionar request y response.
3. Revisar **observer logs** para transacciones y bloqueos.
4. Recolectar evidencia para ticket SAP si es necesario.

---

## Comandos útiles

```bash
# Estado del servicio
sudo systemctl status b1s

# Logs recientes
sudo journalctl -u b1s -n 200

# Reiniciar Service Layer
sudo systemctl restart b1s

# Ver puertos en escucha
sudo ss -tulpn | grep b1s
```

## Notas SAP relacionadas

- 3654819 - Fail to connect to SLD
- 3663692 - Concurrent login failures
- 3454535 - Service Layer fails to start (port in use)
- 3538414 - Service Layer logs not deleted
- 3607657 - Using Service Layer logs to analyze 5xx errors
- 3157498 - Service Layer log analysis general
