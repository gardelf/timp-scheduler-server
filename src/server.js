const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("🔥 SERVIDOR RAM ARRANCANDO 🔥");

// ================= MEMORIA RAM =================
const store = {
  schedules: [],
  maxSchedules: 100
};

// Clientes
const wsClients = new Set();        // EXTENSIONES
const dashboardClients = new Set();// DASHBOARDS

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ================= API =================
app.get('/api/schedules', (req, res) => {
  res.json({ success: true, count: store.schedules.length, data: store.schedules });
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

// ================= HTTP =================
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});

// ================= WEBSOCKET =================
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🔌 Nueva conexión WS');

  // 🔥 COMO ANTES: toda conexión = extensión
  wsClients.add(ws);

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    console.log('📨 WS mensaje:', data.type);

    if (data.type === 'register_dashboard') {
      dashboardClients.add(ws);
      wsClients.delete(ws); // este no es extensión
      console.log('📊 Dashboard registrado');
    }

    if (data.type === 'extract_request') {
      console.log('📤 Orden extracción → extensión');
      wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'extract_request' }));
        }
      });
    }

    if (data.type === 'schedule_data') {
      const entry = {
        id: uuidv4(),
        payload: data.payload,
        timestamp: new Date().toISOString()
      };

      store.schedules.push(entry);
      console.log(`💾 Horario guardado. Total: ${store.schedules.length}`);

      dashboardClients.forEach(d => {
        if (d.readyState === WebSocket.OPEN) {
          d.send(JSON.stringify({ type: 'schedule_saved', data: entry }));
        }
      });
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    dashboardClients.delete(ws);
    console.log('❌ WS desconectado');
  });
});

console.log('✅ SERVER RAM ACTIVO');
