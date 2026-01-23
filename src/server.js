const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// ALMACENAMIENTO EN MEMORIA RAM
// ============================================

const store = {
  schedules: [],
  maxSchedules: 100
};

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// RUTAS API
// ============================================

// GET /api/schedules - Obtener todos los horarios
app.get('/api/schedules', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const schedules = store.schedules.slice(-limit);
  res.json({
    success: true,
    count: schedules.length,
    data: schedules
  });
});

// GET /api/stats - Obtener estadísticas
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      extensiones_conectadas: extensionClients.size,
      dashboards_conectados: dashboardClients.size,
      total_horarios_guardados: store.schedules.length,
      timestamp: new Date().toISOString()
    }
  });
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// SERVIDOR HTTP
// ============================================

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor iniciado en puerto ${PORT}`);
  console.log(`📊 URL: http://localhost:${PORT}`);
});

// ============================================
// WEBSOCKET
// ============================================

const wss = new WebSocket.Server({ server });
const extensionClients = new Set();
const dashboardClients = new Set();

wss.on('connection', (ws, req) => {
  const url = req.url;
  console.log(`✅ Nuevo cliente WebSocket conectado en: ${url}`);

  // Determinar tipo de cliente por URL
  if (url === '/ws/extension') {
    extensionClients.add(ws);
    console.log(`✅ Extensión registrada. Total extensiones: ${extensionClients.size}`);
    
    // Enviar confirmación de conexión
    ws.send(JSON.stringify({
      type: 'connected',
      clientId: uuidv4()
    }));
  } else if (url === '/ws/dashboard') {
    dashboardClients.add(ws);
    console.log(`✅ Dashboard registrado. Total dashboards: ${dashboardClients.size}`);
  } else {
    // Conexión genérica (compatibilidad)
    extensionClients.add(ws);
    console.log(`✅ Cliente genérico registrado`);
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Mensaje recibido:', data.type);

      if (data.type === 'ping') {
        // Responder al heartbeat
        ws.send(JSON.stringify({ type: 'pong' }));
      } else if (data.type === 'schedule_data') {
        // Guardar los datos en memoria
        const scheduleData = {
          id: uuidv4(),
          data: data.data,
          timestamp: new Date().toISOString(),
          source: 'extension',
          sourceId: uuidv4()
        };

        store.schedules.push(scheduleData);

        // Mantener máximo de registros
        if (store.schedules.length > store.maxSchedules) {
          store.schedules.shift();
        }

        console.log(`✅ Datos guardados. Total: ${store.schedules.length}`);

        // Notificar a todos los dashboards
        broadcastToDashboards({
          type: 'schedule_saved',
          data: scheduleData
        });

        // Responder a la extensión
        ws.send(JSON.stringify({
          type: 'schedule_saved',
          success: true,
          id: scheduleData.id
        }));
      }
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
    }
  });

  ws.on('close', () => {
    extensionClients.delete(ws);
    dashboardClients.delete(ws);
    console.log('❌ Cliente desconectado');
  });

  ws.on('error', (error) => {
    console.error('❌ Error WebSocket:', error);
  });
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function broadcastToDashboards(message) {
  const payload = JSON.stringify(message);
  dashboardClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// ============================================
// MANEJO DE ERRORES
// ============================================

process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada no manejada:', reason);
});

console.log('🚀 Servidor TIMP iniciado correctamente');
