# Contrato de API — SAGRIH Backend

Todas las rutas bajo `http://localhost:3001/api`

## Autenticación

Todas las rutas excepto `/auth/login`, `/auth/register` y `/health` requieren:
```
Authorization: Bearer <token>
```

---

## 1. Auth

### POST /api/auth/login
**Request:**
```json
{ "email": "administradorsagrih@gmail.com", "password": "admin123" }
```
**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "nombre": "Administrador",
    "apellido": "SAGRIH",
    "email": "administradorsagrih@gmail.com",
    "rol": "Administrador",
    "medioNotificacion": "email"
  }
}
```

### POST /api/auth/register
**Request:**
```json
{ "nombre": "Nuevo", "apellido": "User", "email": "nuevo@mail.com", "password": "pass123", "rolId": 3 }
```
**Response 201:**
```json
{ "message": "Usuario registrado exitosamente", "user": { "usuar_id": 6, ... } }
```

### GET /api/auth/me
**Response 200:**
```json
{
  "id": 1, "nombre": "Administrador", "apellido": "SAGRIH",
  "email": "administradorsagrih@gmail.com", "rol": "Administrador",
  "medioNotificacion": "email"
}
```

---

## 2. Canteros

### GET /api/canteros
**Response 200:**
```json
[
  { "id": "C-01", "nombre": "Cantero 1", "cultivo": "Tomate cherry", "umbralMin": 55, "umbralMax": 85, "invernaderoId": "INV-MAESTRO", "estado": "Activo" },
  { "id": "C-02", "nombre": "Cantero 2", "cultivo": "Lechuga crespa", "umbralMin": 50, "umbralMax": 80, "invernaderoId": "INV-MAESTRO", "estado": "Activo" }
]
```

### GET /api/canteros/cultivos/lista
**Response 200:**
```json
[
  { "id": 1, "nombre": "Tomate cherry", "umbralMin": 55, "umbralMax": 85 },
  { "id": 2, "nombre": "Lechuga crespa", "umbralMin": 50, "umbralMax": 80 }
]
```

### POST /api/canteros
**Request:** `{ "id": "C-06", "nombre": "Cantero 6", "cultivoId": 1, "invernaderoId": "INV-MAESTRO" }`
**Response 201:** `{ "id": "C-06", "nombre": "Cantero 6" }`

### PUT /api/canteros/:id
**Request:** `{ "nombre": "...", "cultivoId": 2, "umbralMin": 50, "umbralMax": 80, "estado": "Activo" }`
**Response 200:** `{ "message": "Cantero actualizado" }`

### DELETE /api/canteros/:id
**Response 200:** `{ "success": true }`

---

## 3. Riego

### GET /api/riego/programas
**Response 200:**
```json
{
  "C-01": [
    { "id": "prog-1", "dias": ["L","M","X","J","V"], "hora": "06:00", "duracion": 15, "activo": true },
    { "id": "prog-2", "dias": ["L","M","X","J","V"], "hora": "18:00", "duracion": 15, "activo": true }
  ],
  "C-02": [
    { "id": "prog-3", "dias": ["L","M","X","J","V","S","D"], "hora": "12:00", "duracion": 10, "activo": true }
  ]
}
```

### POST /api/riego/programas
**Request:** `{ "canteroId": "C-01", "dias": ["L","M","X"], "hora": "08:00", "duracion": 10 }`
**Response 201:** `{ "id": "prog-4", "dias": ["L","M","X"], "hora": "08:00", "duracion": 10, "activo": true }`
**Error 409:** `{ "error": "Horario no disponible. Choca con otro riego programado." }`

### DELETE /api/riego/programas/:canteroId/:progId
**Response 200:** `{ "success": true }`

### GET /api/riego/historial
**Response 200:**
```json
[
  { "id": 1, "fecha": "2026-05-30T06:00:00.000Z", "cantero": "Cantero 1", "litros": 80, "usuario": null, "tipo": "Automático" }
]
```

### POST /api/riego/ejecutar
**Request:** `{ "canteroId": "C-01", "duracion": 10, "litros": 50 }`
**Response 201:** `{ "success": true, "message": "Riego ejecutado manualmente" }`

---

## 4. Invernaderos

### GET /api/invernaderos
**Response 200:**
```json
[
  { "id": "INV-MAESTRO", "nombre": "Invernadero Principal (Norte)", "ubicacion": "Sector A · Bloque 1", "estado": "activo", "isMaestro": true, "ancho": null, "largo": null, "pasillo": null }
]
```

### GET /api/invernaderos/maestro
**Response 200:** `{ "id": "INV-MAESTRO", "nombre": "Invernadero Principal (Norte)", "ubicacion": "Sector A · Bloque 1", "estado": "activo", "isMaestro": true }`

### GET /api/invernaderos/:id
**Response 200:** (misma estructura que /maestro)

### POST /api/invernaderos
**Request:** `{ "id": "INV-04", "nombre": "Nuevo", "ubicacion": "Sector C" }`
**Response 201:** `{ "id": "INV-04", "nombre": "Nuevo" }`

### PUT /api/invernaderos/:id
**Request:** `{ "nombre": "...", "estado": "activo", "ancho": 10, "largo": 20, "pasillo": 1.5 }`
**Response 200:** `{ "message": "Invernadero actualizado" }`

### DELETE /api/invernaderos/:id
**Response 200:** `{ "success": true }`
**Error 403:** `{ "error": "No se puede eliminar el Invernadero Maestro" }`

---

## 5. Dispositivos

### GET /api/dispositivos
**Response 200:**
```json
[
  { "id": "DEV-001", "tipo": "Controlador", "modelo": "ESP32 Central", "asignacion": null, "estado": "Operativo", "invernaderoId": "INV-MAESTRO", "simulado": false }
]
```

### GET /api/dispositivos/tipos
**Response 200:** `[{ "id": 1, "nombre": "Controlador" }, ...]`

### GET /api/dispositivos/:id/lecturas
**Response 200:**
```json
[{ "id": 1, "valor": 28.5, "unidad": "°C", "fecha": "2026-06-15T10:30:00.000Z" }]
```

### POST /api/dispositivos
**Request:** `{ "id": "DEV-007", "tipoId": 2, "modelo": "Sensor Humedad C3", "canteroId": "C-03", "invernaderoId": "INV-MAESTRO", "estado": "Operativo" }`
**Response 201:** `{ "id": "DEV-007" }`

### PUT /api/dispositivos/:id
**Response 200:** `{ "message": "Dispositivo actualizado" }`

### DELETE /api/dispositivos/:id
**Response 200:** `{ "success": true }`

---

## 6. Usuarios

### GET /api/usuarios
### GET /api/usuarios/roles
### GET /api/usuarios/permisos
### POST /api/usuarios
### PUT /api/usuarios/:id
### DELETE /api/usuarios/:id

---

## 7. Alertas

### GET /api/alertas
**Response 200:**
```json
[
  { "id": 1, "tipo": "info", "titulo": "...", "origen": "Sistema", "fecha": "...", "estado": "activa", "icono": "info" }
]
```

### PUT /api/alertas/:id/estado
**Request:** `{ "estado": "atendida" }`
**Response 200:** `{ "id": 1, "estado": "atendida" }`

---

## 8. Parámetros

### GET /api/parametros
**Response 200:**
```json
{
  "humedad": { "minimoCritico": 35, "optimoInferior": 55, "optimoSuperior": 85 },
  "riego": { "duracionDefecto": 10, "caudalNominal": 1.2, "tiempoEntreRiegos": 6 },
  "tanque": { "capacidad": 10000, "alertaBaja": 20, "alertaCritica": 10 },
  "comunicacion": { "intervaloLectura": 5, "timeoutSensor": 30, "reintentos": 3 }
}
```

### PUT /api/parametros
**Request:** `{ "humedad": { "minimoCritico": 30 }, "riego": { "duracionDefecto": 15 } }`
**Response 200:** (estructura completa actualizada)

### POST /api/parametros/reset
**Response 200:** `{ "message": "Parámetros restablecidos" }`

---

## 9. Historial

### GET /api/historial/consumo-semanal
**Response 200:**
```json
[
  { "dia": "Dom", "litros": 0 },
  { "dia": "Lun", "litros": 140 },
  { "dia": "Mar", "litros": 0 },
  { "dia": "Mié", "litros": 0 },
  { "dia": "Jue", "litros": 0 },
  { "dia": "Vie", "litros": 0 },
  { "dia": "Sáb", "litros": 0 }
]
```

### GET /api/historial/riegos
### GET /api/historial/mantenimiento
### PUT /api/historial/mantenimiento/:id/toggle

---

## 10. Bitácora

### GET /api/bitacora
### GET /api/bitacora/modulos

---

## 11. Sensores (NUEVO)

### GET /api/tanque
**Response 200:**
```json
{
  "nivel": 7500,
  "capacidad": 10000,
  "porcentaje": 75,
  "alertaBaja": 20,
  "alertaCritica": 10,
  "consumo24h": 140,
  "fecha": "2026-06-15T10:30:00.000Z"
}
```
*Si no hay sensor de nivel:* `nivel` se calcula como `capacidad - consumo_7d`, y `fecha` es el timestamp actual.

### GET /api/sensores/ambiente
**Response 200:**
```json
{
  "temperatura": { "valor": 28.5, "unidad": "°C", "fecha": "2026-06-15T10:30:00.000Z" },
  "humedad": { "valor": 65, "unidad": "%", "fecha": "2026-06-15T10:30:00.000Z" }
}
```
*Sin datos:* `valor` es `null`, `fecha` es `null`.

### GET /api/sensores/red
**Response 200:**
```json
{
  "total": 6,
  "online": 5,
  "offline": 1,
  "dispositivos": [
    { "id": "DEV-001", "nombre": "ESP32 Central", "estadoAsignado": "Operativo", "ultimoEvento": "online" },
    { "id": "DEV-003", "nombre": "DHT22 Ambiente", "estadoAsignado": "Falla", "ultimoEvento": "offline" }
  ]
}
```

---

## 12. Dashboard (NUEVO)

### GET /api/dashboard/tendencia-anual
**Response 200:**
```json
[
  { "mes": "Ene", "litros": 290 },
  { "mes": "Feb", "litros": 235 },
  { "mes": "Mar", "litros": 300 },
  { "mes": "Abr", "litros": 315 },
  { "mes": "May", "litros": 335 },
  { "mes": "Jun", "litros": 0 },
  { "mes": "Jul", "litros": 0 },
  { "mes": "Ago", "litros": 0 },
  { "mes": "Sep", "litros": 0 },
  { "mes": "Oct", "litros": 0 },
  { "mes": "Nov", "litros": 0 },
  { "mes": "Dic", "litros": 0 }
]
```
*Meses sin datos retornan 0.*

### GET /api/dashboard/tendencia-mensual
**Response 200:**
```json
[
  { "dia": "2026-05-29", "litros": 125 },
  { "dia": "2026-05-30", "litros": 185 }
]
```

### GET /api/dashboard/eficiencia
**Response 200:**
```json
[
  { "cultivo": "Tomate cherry", "litros": 545, "porcentaje": 38 },
  { "cultivo": "Lechuga crespa", "litros": 350, "porcentaje": 24 },
  { "cultivo": "Pimentón", "litros": 295, "porcentaje": 20 },
  { "cultivo": "Cilantro", "litros": 185, "porcentaje": 13 },
  { "cultivo": "Fresa", "litros": 95, "porcentaje": 7 }
]
```
*Sin datos:* array vacío `[]`.

---

## 13. Health

### GET /api/health
**Response 200:**
```json
{ "status": "ok", "timestamp": "2026-06-15T10:00:00.000Z", "version": "1.0.0" }
```

---

## Resumen de cambios en esta fase

| Archivo | Acción |
|---|---|
| `src/routes/sensores.js` | **CREADO** — rutas `/api/tanque`, `/api/sensores/ambiente`, `/api/sensores/red` |
| `src/routes/dashboard.js` | **CREADO** — rutas `/api/dashboard/tendencia-anual`, `.../tendencia-mensual`, `.../eficiencia` |
| `src/index.js` | **MODIFICADO** — import y mount de las 2 nuevas rutas |
| `src/db/seed-extra.sql` | **CREADO** — datos demo para sensores y dashboard |

### Para aplicar seed extra:
```bash
# Opción 1: usando psql directo
psql -d sagrih -f src/db/seed-extra.sql

# Opción 2: usando node + pg (requiere script wrapper)
```

### Errores documentados del reporte original:
- `GET /api/auth/login` → **incorrecto**. El endpoint real es `POST /api/auth/login`.
- "backend tiene endpoints de dashboard" → **no existían**. Creados en esta fase.
- `GET /api/tanque`, `/api/sensores/ambiente`, `/api/sensores/red` → **no existían**. Creados en esta fase.
