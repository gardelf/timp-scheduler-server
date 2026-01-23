const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// BASE DE DATOS - SQLite
// ============================================

const dbPath = path.join(__dirname, '../schedules.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error abriendo BD:', err);
  } else {
    console.log('✅ Base de datos SQLite conectada:', dbPath);
  }
});

// Crear tablas si no existen
db.serialize(() => {
  // Tabla: extracciones
  db.run(`
    CREATE TABLE IF NOT EXISTS extracciones (
      id TEXT PRIMARY KEY,
      fecha TEXT NOT NULL UNIQUE,
      url TEXT,
      timestamp_extraccion TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT,
      total_clases INTEGER,
      timestamp_servidor TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creando tabla extracciones:', err);
    } else {
      console.log('✅ Tabla extracciones lista');
    }
  });

  // Tabla: clases
  db.run(`
    CREATE TABLE IF NOT EXISTS clases (
      id TEXT PRIMARY KEY,
      extraccion_id TEXT NOT NULL,
      fecha TEXT NOT NULL,
      nombre TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin TEXT NOT NULL,
      instructor TEXT NOT NULL,
      reservas INTEGER,
      asistidos INTEGER,
      no_asistidos INTEGER,
      salidos INTEGER,
      confirmadas INTEGER,
      canceladas INTEGER,
      ausentes INTEGER,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (extraccion_id) REFERENCES extracciones(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creando tabla clases:', err);
    } else {
      console.log('✅ Tabla clases lista');
    }
  });

  // Crear índices para búsquedas rápidas
  db.run(`CREATE INDEX IF NOT EXISTS idx_clases_fecha ON clases(fecha)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_clases_instructor ON clases(instructor)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_extracciones_fecha ON extracciones(fecha)`);
});

// Almacenamiento en memoria (para conexiones WebSocket)
const store = {
  extensions: new Map(),
  dashboards: new Map(),
};

// Crear servidor HTTP
const server = require('http').createServer(app);

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

console.log('🚀 Servidor TIMP iniciando...');

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Guardar datos de extracción en SQLite
function saveScheduleData(data, clientType, clientId) {
  const fecha = data.fecha; // "2026-01-27"
  const clases = data.clases || []; // Array de clases
  const url = data.url;
  const totalClases = data.totalClases || clases.length;
  const dataTimestamp = data.timestamp; // Timestamp del DOM

  console.log(`📊 Guardando extracción para ${fecha} (${totalClases} clases)`);

  // 1. Verificar si existe extracción para esta fecha
  db.get(
    `SELECT id FROM extracciones WHERE fecha = ?`,
    [fecha],
    (err, row) => {
      if (err) {
        console.error('❌ Error verificando extracción:', err);
        return;
      }

      // 2. Si existe, eliminar datos antiguos
      if (row) {
        console.log(`🗑️  Eliminando extracción anterior de ${fecha}`);
        db.run(`DELETE FROM clases WHERE extraccion_id = ?`, [row.id], (err) => {
          if (err) console.error('❌ Error eliminando clases:', err);
        });
        db.run(`DELETE FROM extracciones WHERE fecha = ?`, [fecha], (err) => {
          if (err) console.error('❌ Error eliminando extracción:', err);
        });
      }

      // 3. Insertar nueva extracción
      const extractionId = uuidv4();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO extracciones (id, fecha, url, timestamp_extraccion, source, source_id, total_clases, timestamp_servidor) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          extractionId,
          fecha,
          url,
          dataTimestamp,
          clientType,
          clientId,
          totalClases,
          now
        ],
        (err) => {
          if (err) {
            console.error('❌ Error insertando extracción:', err);
            return;
          }

          console.log(`✅ Extracción guardada: ${fecha} (ID: ${extractionId})`);

          // 4. Insertar clases
          let clasesInsertadas = 0;
          clases.forEach((clase) => {
            const claseId = uuidv4();

            db.run(
              `INSERT INTO clases (id, extraccion_id, fecha, nombre, hora_inicio, hora_fin, instructor, reservas, asistidos, no_asistidos, salidos, confirmadas, canceladas, ausentes, timestamp) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                claseId,
                extractionId,
                fecha,
                clase.nombre,
                clase.horaInicio,
                clase.horaFin,
                clase.instructor,
                clase.reservas,
                clase.asistidos,
                clase.noAsistidos,
                clase.salidos,
                clase.confirmadas,
                clase.canceladas,
                clase.ausentes,
                now
              ],
              (err) => {
                if (err) {
                  console.error('❌ Error insertando clase:', err);
                } else {
                  clasesInsertadas++;
                  if (clasesInsertadas === totalClases) {
                    console.log(`✅ ${totalClases} clases guardadas`);
                  }
                }
              }
            );
          });

          // Notificar a dashboards
          store.dashboards.forEach((dashWs) => {
            if (dashWs.readyState === WebSocket.OPEN) {
              dashWs.send(JSON.stringify({
                type: 'schedule_updated',
                success: true,
                fecha: fecha,
                totalClases: totalClases
              }));
            }
          });
        }
      );
    }
  );
}

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());

// Servir archivos estáticos
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/') {
    return next();
  }

  const filePath = path.join(__dirname, '../public', req.path);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      return next();
    }

    let contentType = 'application/octet-stream';
    if (filePath.endsWith('.html')) contentType = 'text/html; charset=utf-8';
    if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
    if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
    if (filePath.endsWith('.json')) contentType = 'application/json; charset=utf-8';

    res.setHeader('Content-Type', contentType);
    res.send(data);
  });
});

// ============================================
// WebSocket
// ============================================

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const url = req.url || '';

  let clientType = 'unknown';
  if (url.startsWith('/ws/extension')) {
    clientType = 'extension';
    store.extensions.set(clientId, ws);
  } else if (url.startsWith('/ws/dashboard')) {
    clientType = 'dashboard';
    store.dashboards.set(clientId, ws);
  }

  console.log(`✅ Cliente conectado: ${clientType} (${clientId})`);

  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    clientType,
    message: `Conectado como ${clientType}`
  }));

  ws.on('close', () => {
    store.extensions.delete(clientId);
    store.dashboards.delete(clientId);
    console.log(`❌ Cliente desconectado: ${clientType} (${clientId})`);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Mensaje de ${clientType}: ${message.type}`);

      // EXTRACT_REQUEST: Dashboard solicita extracción
      if (message.type === 'extract_request') {
        console.log(`🔄 Reenviando extract_request a ${store.extensions.size} extensiones`);
        store.extensions.forEach((extWs) => {
          if (extWs.readyState === WebSocket.OPEN) {
            extWs.send(JSON.stringify(message));
            console.log('✅ extract_request enviado a extensión');
          }
        });
      }

      // SCHEDULE_DATA: Extensión envía datos extraídos
      else if (message.type === 'schedule_data') {
        console.log(`📊 Recibido schedule_data de ${clientType}`);
        saveScheduleData(message.data, clientType, clientId);
      }
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
    }
  });
});

// ============================================
// API REST
// ============================================

// GET /api/clases/por-fecha - Clases de un día específico
app.get('/api/clases/por-fecha', (req, res) => {
  const fecha = req.query.fecha; // "2026-01-27"

  if (!fecha) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro "fecha" requerido (YYYY-MM-DD)'
    });
  }

  db.all(
    `SELECT * FROM clases WHERE fecha = ? ORDER BY hora_inicio`,
    [fecha],
    (err, rows) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }

      res.json({
        success: true,
        fecha: fecha,
        total_clases: rows.length,
        clases: rows
      });
    }
  );
});

// GET /api/clases/por-instructor - Clases de un instructor
app.get('/api/clases/por-instructor', (req, res) => {
  const instructor = req.query.instructor;
  const limit = parseInt(req.query.limit) || 50;

  if (!instructor) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro "instructor" requerido'
    });
  }

  db.all(
    `SELECT * FROM clases WHERE instructor = ? ORDER BY fecha DESC, hora_inicio LIMIT ?`,
    [instructor, limit],
    (err, rows) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }

      res.json({
        success: true,
        instructor: instructor,
        total_clases: rows.length,
        clases: rows
      });
    }
  );
});

// GET /api/clases/rango - Clases en un rango de fechas
app.get('/api/clases/rango', (req, res) => {
  const fechaInicio = req.query.desde; // "2026-01-23"
  const fechaFin = req.query.hasta; // "2026-01-27"

  if (!fechaInicio || !fechaFin) {
    return res.status(400).json({
      success: false,
      error: 'Parámetros "desde" y "hasta" requeridos (YYYY-MM-DD)'
    });
  }

  db.all(
    `SELECT * FROM clases WHERE fecha BETWEEN ? AND ? ORDER BY fecha, hora_inicio`,
    [fechaInicio, fechaFin],
    (err, rows) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }

      res.json({
        success: true,
        rango: { desde: fechaInicio, hasta: fechaFin },
        total_clases: rows.length,
        clases: rows
      });
    }
  );
});

// GET /api/extracciones - Historial de extracciones
app.get('/api/extracciones', (req, res) => {
  const limit = parseInt(req.query.limit) || 30;

  db.all(
    `SELECT * FROM extracciones ORDER BY timestamp_servidor DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }

      res.json({
        success: true,
        total: rows.length,
        extracciones: rows
      });
    }
  );
});

// GET /api/stats - Estadísticas
app.get('/api/stats', (req, res) => {
  db.get(
    `SELECT COUNT(DISTINCT fecha) as dias_con_datos, COUNT(*) as total_clases FROM clases`,
    (err, row) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }

      res.json({
        success: true,
        stats: {
          extensiones_conectadas: store.extensions.size,
          dashboards_conectados: store.dashboards.size,
          dias_con_datos: row.dias_con_datos,
          total_clases: row.total_clases,
          timestamp: new Date().toISOString()
        }
      });
    }
  );
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'connected'
  });
});

// ============================================
// RUTA RAÍZ - SERVIR INDEX.HTML
// ============================================

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');

  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      console.error('❌ Error leyendo index.html:', err);
      res.status(500).send('Error cargando la página');
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(data);
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

server.listen(PORT, () => {
  console.log(`\n🎉 Servidor TIMP ejecutándose en puerto ${PORT}`);
  console.log(`📊 Panel web: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`💾 Base de datos: ${dbPath}\n`);
});

process.on('SIGTERM', () => {
  console.log('📴 Apagando servidor...');
  db.close((err) => {
    if (err) {
      console.error('❌ Error cerrando BD:', err);
    } else {
      console.log('✅ Base de datos cerrada');
    }
  });
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

module.exports = server;
