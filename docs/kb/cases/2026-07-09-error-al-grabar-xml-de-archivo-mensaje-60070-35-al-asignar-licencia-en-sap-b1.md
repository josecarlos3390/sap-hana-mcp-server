---
date: 2026-07-09
datetime: "2026-07-09T13:37:59.595Z"
category: sap-b1
status: resolved
severity: medium
component: SAP Business One License Server / B1Upf.xml
tags:
  - sap-b1
  - licensecontrolcenter
  - 60070-35
  - b1upf
  - permisos
  - b1service0
  - licencia
---

# Error al grabar XML de archivo [Mensaje 60070-35] al asignar licencia en SAP B1

## Síntoma
Desde SAP Business One, al asignar una licencia a un usuario, aparece el mensaje: "Error al grabar XML de archivo [Mensaje 60070-35]".

## Causa raíz
El archivo /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml (que contiene la asignacion de usuarios y modulos de licencia) pertenecia al usuario root con permisos de solo lectura para otros usuarios. El proceso Tomcat de SAP Business One ServerTools ejecuta como b1service0, por lo que no podia escribir el archivo al actualizar la asignacion de licencia.

## Solución
1. Crear un backup de B1Upf.xml.
2. Cambiar el propietario del archivo a b1service0:b1service0.
3. Asegurar permisos 644.

```bash
TIMESTAMP=$(date +%Y%m%d%H%M%S)
cp -p /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml.bak.${TIMESTAMP}
chown b1service0:b1service0 /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml
chmod 644 /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml
```

No es necesario reiniciar el servicio.

## Evidencia
El comando `ls -la` mostraba B1Upf.xml con propietario root:root y permisos -rw-r--r--. El proceso Tomcat corre como b1service0 (UID 1003). Al intentar escribir el XML de licencia, el sistema operativo denegaba el acceso.

## Scripts / herramientas usadas
_Ninguno_

## Lecciones aprendidas
Las operaciones de licencia de SAP B1 deben poder escribir B1Upf.xml. Si el archivo fue modificado previamente por el usuario root (instalacion o mantenimiento manual), quedara con propietario root y bloqueara futuras asignaciones. Siempre verificar que B1Upf.xml pertenezca a b1service0:b1service0 despues de cualquier intervencion manual.
