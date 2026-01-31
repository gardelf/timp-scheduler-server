const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🧠 ALMACENAMIENTO EN MEMORIA RAM
// ============================================

const store = {
  schedules: [],
  maxSchedules: 100
};

// 👇 CLIENTES WEBSOCKET (TIENEN QUE ESTAR ARRIBA)
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
});

// ============================================
// WEBSOCKET
// ============================================

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔌 Cliente WebSocket conectado');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Mensaje recibido:', data.type);

      // ========================================
      // REGISTROS
      // ========================================
      if (data.type === 'register_extension') {
        wsClients.add(ws);
        console.log('✅ Extensión registrada');

      } else if (data.type === 'register_dashboard') {
        dashboardClients.add(ws);
        console.log('✅ Dashboard registrado');
      }

      // ========================================
      // ORDEN DE EXTRACCIÓN DESDE DASHBOARD
      // ========================================
      else if (data.type === 'extract_request') {
        console.log('📤 Orden de extracción recibida');

        wsClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'extract_request' }));
          }
        });
      }

      // ========================================
      // DATOS DE HORARIOS DESDE EXTENSIÓN
      // ========================================
      else if (data.type === 'schedule_data') {
        const scheduleData = {
          id: uuidv4(),
          payload: data.payload,
          timestamp: new Date().toISOString()
        };

        store.schedules.push(scheduleData);
        if (store.schedules.length > store.maxSchedules) store.schedules.shift();

        console.log(`💾 Horario guardado. Total: ${store.schedules.length}`);

        broadcastToDashboards({
          type: 'schedule_saved',
          data: scheduleData
        });
      }

    } catch (err) {
      console.error('❌ Error procesando mensaje:', err);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    dashboardClients.delete(ws);
    console.log('❌ Cliente desconectado');
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function broadcastToDashboards(message) {
  const payload = JSON.stringify(message);
  dashboardClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

console.log('🚀 Servidor TIMP listo');
