const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Almacenamiento en memoria
const store = {
  schedules: [],
  extensions: new Map(),
  dashboards: new Map(),
};

// Crear servidor HTTP
const server = require('http').createServer(app);

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

console.log('🚀 Servidor TIMP iniciando...');

// ============================================
// MIDDLEWARE - MÍNIMO
// ============================================

app.use(express.json());

// Servir archivos estáticos SIN middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/') {
    return next();
  }
  
  const filePath = path.join(__dirname, '../public', req.path);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      return next();
    }
    
    // Determinar content-type
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
  const clientType = req.url === '/ws/extension' ? 'extension' : 'dashboard';
  
  console.log(`✅ Cliente conectado: ${clientType} (${clientId})`);
  
  if (clientType === 'extension') {
    store.extensions.set(clientId, ws);
  } else {
    store.dashboards.set(clientId, ws);
  }
  
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    clientType,
    message: `Conectado como ${clientType}`
  }));
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 Mensaje de ${clientType}:`, message.type);
      
      if (message.type === 'extract_request') {
        store.extensions.forEach((ws) => {
          ws.send(JSON.stringify({
            type: 'extract_request',
            requestId: message.requestId || uuidv4(),
            timestamp: new Date().toISOString()
          }));
        });
      } else if (message.type === 'schedule_data') {
        const scheduleEntry = {
          id: uuidv4(),
          data: message.data,
          timestamp: new Date().toISOString(),
          source: clientType,
          sourceId: clientId
        };
        
        store.schedules.push(scheduleEntry);
        if (store.schedules.length > 100) {
          store.schedules.shift();
        }
        
        store.dashboards.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'schedule_updated',
              data: scheduleEntry
            }));
          }
        });
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`❌ Cliente desconectado: ${clientType}`);
    store.extensions.delete(clientId);
    store.dashboards.delete(clientId);
  });
});

// ============================================
// API REST
// ============================================

app.get('/api/schedules', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  res.json({
    success: true,
    count: store.schedules.length,
    data: store.schedules.slice(-limit)
  });
});

app.get('/api/schedules/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const todaySchedules = store.schedules.filter(s => s.data.fecha === today);
  res.json({
    success: true,
    fecha: today,
    count: todaySchedules.length,
    data: todaySchedules
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      extensiones_conectadas: store.extensions.size,
      dashboards_conectados: store.dashboards.size,
      total_horarios_guardados: store.schedules.length,
      timestamp: new Date().toISOString()
    }
  });
});

app.post('/api/extract', (req, res) => {
  const requestId = uuidv4();
  store.extensions.forEach((ws) => {
    ws.send(JSON.stringify({
      type: 'extract_request',
      requestId,
      timestamp: new Date().toISOString()
    }));
  });
  res.json({
    success: true,
    message: 'Solicitud de extracción enviada',
    requestId
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
// RUTA RAÍZ - SERVIR INDEX.HTML
// ============================================

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  console.log(`📄 Sirviendo: ${indexPath}`);
  
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
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws\n`);
});

process.on('SIGTERM', () => {
  console.log('📴 Apagando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

module.exports = server;
