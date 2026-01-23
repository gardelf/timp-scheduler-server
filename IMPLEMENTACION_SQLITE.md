# 📋 IMPLEMENTACIÓN DE SQLite - TIMP SCHEDULER

## ✅ CAMBIOS REALIZADOS

### 1. **Instalación de Dependencias**

Se agregó `sqlite3` al `package.json`:

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.14.2",
    "uuid": "^9.0.0",
    "sqlite3": "^5.1.6"
  }
}
```

**Instalación:**
```bash
npm install
```

---

### 2. **Modificaciones en server.js**

#### A. Inicialización de SQLite

```javascript
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../schedules.db');
const db = new sqlite3.Database(dbPath);
```

**Ubicación del archivo:** `/home/ubuntu/timp-server/schedules.db`

#### B. Creación de Tabla

```javascript
db.run(`
  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    date_extracted TEXT NOT NULL,
    date_confirmed TEXT NOT NULL,
    clases TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL,
    source_id TEXT,
    validation_status TEXT NOT NULL,
    error_message TEXT
  )
`);
```

**Columnas:**
- `id`: ID único (UUID)
- `date_extracted`: Fecha de HOY (YYYY-MM-DD)
- `date_confirmed`: Fecha confirmada del DOM
- `clases`: JSON con las clases extraídas
- `timestamp`: Cuándo se extrajo (ISO 8601)
- `source`: "extension" o "dashboard"
- `source_id`: ID del cliente que envió
- `validation_status`: "valid", "invalid", "pending"
- `error_message`: Mensaje de error si aplica

#### C. Validación de Fecha

```javascript
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function saveScheduleData(data, clientType, clientId) {
  const today = getTodayDate();
  
  // VALIDAR: date_confirmed === today
  if (data.date_confirmed !== today) {
    return {
      success: false,
      error: `Fecha no coincide. Esperado: ${today}, Recibido: ${data.date_confirmed}`,
      validation_status: 'invalid'
    };
  }
  
  // GUARDAR en SQLite
  db.run(`INSERT INTO schedules ...`);
}
```

**Flujo:**
1. Se recibe `schedule_data` de la extensión
2. Se calcula la fecha de HOY en el servidor
3. Se compara con `date_confirmed` del DOM
4. Si coinciden → GUARDAR en SQLite
5. Si NO coinciden → DESCARTAR y mostrar error

---

### 3. **Nuevos Endpoints API**

#### GET /api/schedules
Obtiene los últimos horarios guardados.

```bash
curl https://timp-scheduler-server-production.up.railway.app/api/schedules?limit=10
```

**Respuesta:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "abc123",
      "date_extracted": "2026-01-23",
      "date_confirmed": "2026-01-23",
      "clases": "[...]",
      "timestamp": "2026-01-23T08:30:45.123Z",
      "source": "extension",
      "validation_status": "valid"
    }
  ]
}
```

#### GET /api/schedules/today
Obtiene solo los horarios de HOY.

```bash
curl https://timp-scheduler-server-production.up.railway.app/api/schedules/today
```

#### GET /api/schedules/history
Obtiene historial de últimas 50 extracciones.

```bash
curl https://timp-scheduler-server-production.up.railway.app/api/schedules/history
```

#### GET /api/stats
Obtiene estadísticas del sistema.

```bash
curl https://timp-scheduler-server-production.up.railway.app/api/stats
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "extensiones_conectadas": 1,
    "dashboards_conectados": 1,
    "total_horarios_guardados": 5,
    "horarios_hoy": 2,
    "fecha_hoy": "2026-01-23",
    "timestamp": "2026-01-23T08:35:12.456Z"
  }
}
```

#### POST /api/extract/today
Solicita extracción de HOY (nuevo endpoint).

```bash
curl -X POST https://timp-scheduler-server-production.up.railway.app/api/extract/today
```

---

### 4. **Nuevos Tipos de Mensaje WebSocket**

#### extract_today (Dashboard → Servidor → Extensión)

```javascript
{
  "type": "extract_today"
}
```

El servidor responde con:

```javascript
{
  "type": "extract_request",
  "mode": "today",
  "date": "2026-01-23",
  "timestamp": "2026-01-23T08:30:45.123Z"
}
```

#### schedule_saved (Servidor → Extensión)

Cuando los datos se guardan correctamente:

```javascript
{
  "type": "schedule_saved",
  "success": true,
  "id": "abc123",
  "validation_status": "valid"
}
```

---

### 5. **Dashboard Actualizado**

#### Nuevo Botón: "Extraer Horarios Ahora"

```javascript
// En script.js
extractToday() {
  this.sendMessage({
    type: 'extract_today'
  });
}
```

#### Nuevas Secciones

- **Estadísticas:** Total guardados, hoy, última actualización
- **Último Horario:** Detalles del más reciente
- **Historial:** Tabla con todos los horarios
- **Consola de Eventos:** Logs en tiempo real

#### Actualización Automática

- Se actualiza cada 10 segundos
- Se actualiza en tiempo real cuando llegan datos por WebSocket
- Muestra estado de conexión

---

### 6. **Estructura de Archivos**

```
/home/ubuntu/timp-server/
├── src/
│   └── server.js              (modificado: SQLite + validación)
├── public/
│   ├── index.html             (existente)
│   ├── script.js              (nuevo: dashboard logic)
│   └── style.css              (nuevo: estilos)
├── schedules.db               (nuevo: base de datos SQLite)
├── package.json               (modificado: sqlite3)
├── Dockerfile                 (modificado: soporte SQLite)
├── .gitignore                 (nuevo)
└── IMPLEMENTACION_SQLITE.md   (este archivo)
```

---

## 🧪 PRUEBAS

### Test 1: Verificar que la BD se crea

```bash
cd /home/ubuntu/timp-server
npm start
```

Debería mostrar:
```
✅ Base de datos SQLite conectada: /home/ubuntu/timp-server/schedules.db
✅ Tabla schedules lista
```

### Test 2: Verificar que los datos se guardan

1. Abrir el dashboard: `http://localhost:3000`
2. Hacer clic en "Extraer Horarios Ahora"
3. Esperar a que la extensión envíe datos
4. Verificar que aparece en la tabla

### Test 3: Verificar que se valida la fecha

Si la extensión envía una fecha diferente a HOY:
- El servidor debería mostrar: `❌ VALIDACIÓN FALLIDA`
- Los datos NO se guardan
- El dashboard muestra el error

### Test 4: Verificar que persisten los datos

1. Guardar algunos horarios
2. Reiniciar el servidor: `npm start`
3. Los datos deberían seguir ahí

### Test 5: Verificar los endpoints API

```bash
# Últimos horarios
curl http://localhost:3000/api/schedules

# Horarios de HOY
curl http://localhost:3000/api/schedules/today

# Historial
curl http://localhost:3000/api/schedules/history

# Estadísticas
curl http://localhost:3000/api/stats
```

---

## 🚀 DEPLOYMENT EN RAILWAY

### Pasos

1. **Actualizar repositorio GitHub:**
   ```bash
   git add .
   git commit -m "Implementar SQLite con validación de fecha"
   git push origin main
   ```

2. **Railway detectará los cambios y redesplegará automáticamente**

3. **Verificar que funciona:**
   ```bash
   curl https://timp-scheduler-server-production.up.railway.app/api/stats
   ```

### Persistencia en Railway

- El archivo `schedules.db` se guardará en el contenedor
- Si Railway reinicia el contenedor, los datos se pierden
- **Solución futura:** Usar PostgreSQL en Railway (sin cambiar código)

---

## 📊 ESTRUCTURA DE DATOS GUARDADOS

### Ejemplo de fila en la BD

```json
{
  "id": "a1b2c3d4-e5f6-4789-0abc-def123456789",
  "date_extracted": "2026-01-23",
  "date_confirmed": "2026-01-23",
  "clases": "[{\"hora\": \"09:00\", \"materia\": \"Matemáticas\", \"profesor\": \"Juan\"}, ...]",
  "timestamp": "2026-01-23T08:30:45.123Z",
  "source": "extension",
  "source_id": "df6c0b3f-8342-4e43-b277-5386296a8771",
  "validation_status": "valid",
  "error_message": null
}
```

---

## 🔄 FLUJO COMPLETO

```
1. Dashboard: Click en "Extraer Horarios Ahora"
   ↓
2. Dashboard → Servidor: {type: "extract_today"}
   ↓
3. Servidor → Extensión: {type: "extract_request", mode: "today", date: "2026-01-23"}
   ↓
4. Extensión: Navega a /dashboard?tab=tickets
   ↓
5. Content Script: Lee DOM y extrae clases
   ↓
6. Content Script → Servidor: {type: "schedule_data", date_confirmed: "2026-01-23", clases: [...]}
   ↓
7. Servidor: Valida que date_confirmed === "2026-01-23"
   ↓
8. Servidor: Guarda en SQLite
   ↓
9. Servidor → Extensión: {type: "schedule_saved", success: true}
   ↓
10. Servidor → Dashboard: {type: "schedule_updated", data: {...}}
   ↓
11. Dashboard: Actualiza tabla y estadísticas
```

---

## 🛠️ TROUBLESHOOTING

### Problema: "Error: SQLITE_CANTOPEN"

**Causa:** El directorio no existe o no hay permisos

**Solución:**
```bash
mkdir -p /home/ubuntu/timp-server
chmod 755 /home/ubuntu/timp-server
```

### Problema: "No hay datos en la BD"

**Causa:** La extensión no está enviando `schedule_data`

**Solución:**
1. Verificar que el content script está inyectado en timp.pro
2. Revisar los logs del background script
3. Verificar que `date_confirmed` coincide con HOY

### Problema: "Fecha no coincide"

**Causa:** La extensión está enviando una fecha diferente a HOY

**Solución:**
1. Verificar que el content script lee correctamente la fecha del DOM
2. Verificar que la zona horaria es la correcta
3. Usar `console.log` para debuggear

---

## 📝 PRÓXIMOS PASOS

1. ✅ SQLite implementado
2. ✅ Validación de fecha implementada
3. ✅ Dashboard actualizado
4. ⏳ Probar en Railway
5. ⏳ Agregar exportación a CSV/Excel
6. ⏳ Agregar búsqueda y filtros
7. ⏳ Migrar a PostgreSQL (fase 2)

---

## 📞 REFERENCIAS

- **SQLite:** https://www.sqlite.org/
- **Node.js sqlite3:** https://github.com/mapbox/node-sqlite3
- **Express:** https://expressjs.com/
- **WebSocket:** https://github.com/websockets/ws

---

**Implementación completada:** 23 de Enero de 2026
**Estado:** Listo para probar
