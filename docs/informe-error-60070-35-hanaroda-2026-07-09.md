# Informe técnico: Error 60070-35 al asignar licencia de usuario en SAP B1

**Cliente:** Grupo Roda  
**Servidor:** hanaroda.gruporoda.com  
**Sistema:** SAP Business One sobre SAP HANA  
**Fecha:** 9 de julio de 2026  
**Incidente:** Error al grabar XML de archivo [Mensaje 60070-35] al asignar licencia a un usuario

---

## 1. Resumen ejecutivo

Durante la asignación de licencias a usuarios desde el cliente SAP Business One, el sistema mostraba el mensaje de error **"Error al grabar XML de archivo [Mensaje 60070-35]"**. Se determinó que la causa era un problema de permisos del archivo `/usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml`, el cual pertenecía al usuario `root` en lugar de `b1service0`, impidiendo que el License Server actualizara la asignación de módulos.

Se creó un backup del archivo y se corrigió el propietario a `b1service0:b1service0`. Tras el cambio, el sistema quedó habilitado para grabar correctamente las asignaciones de licencia.

---

## 2. Síntoma reportado

Al intentar asignar una licencia a un usuario desde la interfaz de SAP Business One, aparecía el siguiente mensaje:

> **Error al grabar XML de archivo [Mensaje 60070-35]**

El acceso a LicenseControlCenter funcionaba correctamente después del reinicio previo del servicio `sapb1servertools`.

---

## 3. Diagnóstico realizado

### 3.1 Verificación del servicio de licencias

Se confirmó que el servicio SAP Business One ServerTools estaba activo y que LicenseControlCenter respondía en el puerto `40000`. El proceso Tomcat correspondiente se ejecutaba con el usuario `b1service0`.

### 3.2 Revisión de archivos de licencia

Se inspeccionaron los archivos ubicados en:

```
/usr/sap/SAPBusinessOne/Common/License/webapps/lib/
```

**Hallazgos:**

| Archivo | Propietario | Permisos | Observación |
|---------|-------------|----------|-------------|
| `B1LicServiceSettings.xml` | `b1service0:b1service0` | `-rwxr-xr-x` | Correcto |
| `B1LicenseFile-0020937938.txt` | `b1service0:b1service0` | `-rw-r--r--` | Correcto |
| `B1Upf.xml` | **`root:root`** | `-rw-r--r--` | **Incorrecto: el proceso no puede escribirlo** |
| `B1Upf_bk.xml` | `b1service0:b1service0` | `-rw-r--r--` | Correcto |

### 3.3 Análisis del archivo B1Upf.xml

El archivo `B1Upf.xml` contiene la asignación de usuarios y módulos de licencia. Técnicamente:

- Es un archivo XML válido con codificación **UTF-16**.
- Su tamaño es de **148.120 bytes**.
- Contiene nodos `<Users>`, `<User>`, `<UserName>`, `<IsConnected>` y `<Modules>`.
- El backup `B1Upf_bk.xml` también es válido pero corresponde a una versión anterior (29.728 bytes).

### 3.4 Identificación de la causa

El proceso Tomcat de SAP Business One ServerTools corre bajo el usuario `b1service0`. Dado que `B1Upf.xml` pertenecía a `root` con permisos `644`, el usuario `b1service0` solo tenía permiso de lectura. Cada intento de asignar o modificar una licencia requiere actualizar `B1Upf.xml`, por lo que el sistema operativo rechazaba la escritura y SAP B1 devolvía el error **60070-35**.

---

## 4. Causa raíz

El archivo `B1Upf.xml` tenía un propietario incorrecto (`root:root`) debido probablemente a una intervención manual previo realizada con el usuario `root` (por ejemplo, copia, edición o restauración del archivo durante mantenimiento o instalación). Esto provocó que el License Server, que opera como `b1service0`, no pudiera persistir los cambios de asignación de licencias.

---

## 5. Acciones correctivas

Se ejecutaron los siguientes pasos en el servidor SUSE como usuario `root`:

```bash
# 1. Crear backup con marca de tiempo
TIMESTAMP=$(date +%Y%m%d%H%M%S)
cp -p /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml \
   /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml.bak.${TIMESTAMP}

# 2. Cambiar propietario al usuario que ejecuta el servicio
chown b1service0:b1service0 /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml

# 3. Asegurar permisos de lectura/escritura
chmod 644 /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml
```

**Backup generado:**

```
/usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml.bak.20260709093718
```

### Verificación posterior

```bash
ls -la /usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml
```

**Resultado:**

```bash
-rw-r--r-- 1 b1service0 b1service0 148120 Sep 29  2025 B1Upf.xml
```

Además, se verificó que el usuario `b1service0` pudiera escribir el archivo mediante un test de escritura.

---

## 6. Estado final

- El archivo `B1Upf.xml` ahora pertenece a `b1service0:b1service0`.
- El License Server puede escribir correctamente la asignación de licencias.
- No fue necesario reiniciar el servicio `sapb1servertools`.
- El usuario puede continuar con la asignación de licencias desde SAP Business One.

---

## 7. Recomendaciones

1. **Evitar manipulaciones manuales como root:**
   Cuando sea necesario intervenir archivos de SAP Business One, usar siempre el usuario `b1service0` o los scripts oficiales. Esto previene que archivos críticos queden con propietario incorrecto.

2. **Verificación periódica de permisos:**
   Incluir en las tareas de mantenimiento una revisión de los permisos de los archivos clave del License Server:
   ```bash
   ls -la /usr/sap/SAPBusinessOne/Common/License/webapps/lib/
   ```

3. **Backup de B1Upf.xml:**
   Antes de cualquier operación de licencia masiva o migración, realizar un backup de `B1Upf.xml` para poder restaurar la asignación de licencias en caso de inconvenientes.

4. **Rotación de credenciales:**
   Dado que se utilizaron credenciales de acceso para realizar el diagnóstico y la corrección, se recomienda rotar las contraseñas de los usuarios `root` (SUSE) y `SYSTEM` (HANA).

5. **Auditoría de archivos con propietario root:**
   Ejecutar periódicamente una auditoría para detectar archivos en `/usr/sap/SAPBusinessOne/` que pertenezcan a `root` pero deban ser gestionados por `b1service0`:
   ```bash
   find /usr/sap/SAPBusinessOne -user root -group root 2>/dev/null
   ```

---

## 8. Datos técnicos adicionales

| Componente | Valor observado |
|------------|-----------------|
| Archivo afectado | `/usr/sap/SAPBusinessOne/Common/License/webapps/lib/B1Upf.xml` |
| Propietario original | `root:root` |
| Permisos originales | `-rw-r--r--` (solo root podía escribir) |
| Propietario corregido | `b1service0:b1service0` |
| Permisos corregidos | `-rw-r--r--` |
| Usuario del proceso Tomcat | `b1service0` (UID 1003) |
| Backup generado | `B1Upf.xml.bak.20260709093718` |
| Reinicio requerido | No |

---

**Elaborado por:** Equipo de soporte HANA MCP Server  
**Fecha de elaboración:** 9 de julio de 2026
