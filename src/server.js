const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🧠 MEMORIA RAM (COMO ANTES)
// ============================================

const store = {
  schedules: [],
  maxSchedules: 100
};

// TODOS los clientes WS entran aquí (como antes)
const wsClients = new Set();        // extensiones
const dashboardClients = new Set(); // dashboards

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// API REST
// ============================================

app.get('/api/schedules', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const schedules = store.schedules.slice(-limit);
  res.json({ success: true, count: schedules.length, data: schedules });
});

app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      extensiones_conectadas: wsClients.size,
      dashboards_conectados: dashboardClients.size,
      total_horarios_guardados: store.schedules.length,
      timestamp: new Date().toISOString()
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================
// SERVIDOR HTTP
// ============================================

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor iniciado en puerto ${PORT}`);
});

// ============================================
// WEBSOCKET (VERSIÓN ORIGINAL FUNCIONANDO)
// ============================================

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔌 Cliente WebSocket conectado');

  // 🔥 COMO FUNCIONABA ANTES → TODA CONEXIÓN = EXTENSIÓN
  wsClients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Mensaje recibido:', data.type);

      // Dashboard se registra (solo para recibir datos)
      if (data.type === 'register_dashboard') {
        dashboardClients.add(ws);
        console.log('🖥️ Dashboard registrado');
      }

      // Dashboard pide extracción
      if (data.type === 'extract_request') {
        console.log('📤 Orden de extracción enviada a extensiones');
        wsClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'extract_request' }));
          }
        });
      }

      // EXTENSIÓN ENVÍA HORARIOS (ESTO YA FUNCIONABA)
      if (data.type === 'schedule_data') {
        const scheduleData = {
          id: uuidv4(),
          payload: data.payload,
          timestamp: new Date().toISOString()
        };

        store.schedules.push(scheduleData);
        if (store.schedules.length > store.maxSchedules) store.schedules.shift();

        console.log(`💾 Horario guardado. Total: ${store.schedules.length}`);

        // Avisar al dashboard
        dashboardClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'schedule_saved',
              data: scheduleData
            }));
          }
        });
      }

    } catch (err) {
      console.error('❌ Error WS:', err);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    dashboardClients.delete(ws);
    console.log('❌ Cliente desconectado');
  });
});

console.log('🚀 SERVIDOR RAM ACTIVO');
