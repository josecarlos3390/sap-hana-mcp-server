---
date: 2026-07-09
datetime: "2026-07-09T13:21:51.023Z"
category: sap-b1
status: resolved
severity: high
component: SAP Business One ServerTools / Tomcat / LicenseControlCenter
tags:
  - sap-b1
  - licensecontrolcenter
  - tomcat
  - suse
  - ld_library_path
  - unsatisfiedlinkerror
  - sapb1servertools
---

# LicenseControlCenter de SAP B1 no responde por LD_LIBRARY_PATH faltante en Tomcat

## Síntoma
No se puede acceder a LicenseControlCenter de SAP Business One en https://<servidor>:40000/. La consola web no responde o muestra error.

## Causa raíz
Existen dos procesos Tomcat simultaneos. El proceso que escucha en el puerto 40000 fue iniciado sin la variable de entorno LD_LIBRARY_PATH, por lo que no puede cargar las librerias nativas del License Server (libB1_LicenseWSInterface.so depende de libcurlpp.so.0 y libjson.so). Esto genera java.lang.UnsatisfiedLinkError en el metodo HandShake del LicenseServer.

## Solución
Reiniciar el servicio sapb1servertools usando el script init.d oficial, que configura correctamente LD_LIBRARY_PATH:

```bash
/etc/init.d/sapb1servertools stop
# Verificar que no queden procesos Tomcat activos
ps -ef | grep tomcat | grep -v grep
/etc/init.d/sapb1servertools start
# Verificar que un unico Tomcat escuche en 40000
netstat -tlnp | grep 40000
```

## Evidencia
Logs de catalina.out mostraban repetidamente:

```java
java.lang.UnsatisfiedLinkError: com.sap.businessone.LicenseService.LicenseServer.HandShake(JLjava/lang/String;[Ljava/lang/String;)J
```

El comando `ldd` sobre /usr/sap/SAPBusinessOne/Common/lib/libB1_LicenseWSInterface.so mostraba libcurlpp.so.0 y libjson.so como "not found". El proceso Tomcat activo en puerto 40000 no tenia LD_LIBRARY_PATH en su entorno.

## Scripts / herramientas usadas
_Ninguno_

## Lecciones aprendidas
Siempre usar /etc/init.d/sapb1servertools para iniciar/detener los ServerTools de SAP B1. No iniciar Tomcat manualmente porque se omiten variables de entorno criticas como LD_LIBRARY_PATH. Tras un reinicio del servidor, verificar que solo haya una instancia de Tomcat escuchando en el puerto correcto.
