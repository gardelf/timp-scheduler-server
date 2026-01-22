/**
 * Servidor TIMP Scheduler
 * Gestiona la comunicación entre la extensión Chrome y el panel web
 */

const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Almacenamiento en memoria (en producción usar base de datos)
const store = {
  schedules: [],
  extensions: new Map(), // Conexiones de extensiones
  dashboards: new Map(), // Conexiones de dashboards
};

// Crear servidor HTTP
const server = require('http').createServer(app);

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

console.log('🚀 Servidor TIMP iniciando...');

// ============================================
// WebSocket - Manejo de conexiones
// ============================================

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const clientType = req.url === '/ws/extension' ? 'extension' : 'dashboard';
  
  console.log(`✅ Cliente conectado: ${clientType} (${clientId})`);
  
  // Registrar cliente
  if (clientType === 'extension') {
    store.extensions.set(clientId, ws);
  } else {
    store.dashboards.set(clientId, ws);
  }
  
  // Enviar confirmación de conexión
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    clientType,
    message: `Conectado como ${clientType}`
  }));
  
  // Manejar mensajes
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📨 Mensaje de ${clientType} (${clientId}):`, message.type);
      
      switch (message.type) {
        case 'extract_request':
          handleExtractRequest(message, clientId, clientType);
          break;
        
        case 'schedule_data':
          handleScheduleData(message, clientId, clientType);
          break;
        
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        
        default:
          console.warn(`⚠️ Tipo de mensaje desconocido: ${message.type}`);
      }
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Error procesando mensaje'
      }));
    }
  });
  
  // Manejar desconexión
  ws.on('close', () => {
    console.log(`❌ Cliente desconectado: ${clientType} (${clientId})`);
    store.extensions.delete(clientId);
    store.dashboards.delete(clientId);
  });
  
  // Manejar errores
  ws.on('error', (error) => {
    console.error(`❌ Error WebSocket (${clientId}):`, error);
  });
});

// ============================================
// Manejadores de mensajes
// ============================================

function handleExtractRequest(message, clientId, clientType) {
  console.log('📤 Enviando solicitud de extracción a extensión...');
  
  // Enviar solicitud a la extensión
  store.extensions.forEach((ws) => {
    ws.send(JSON.stringify({
      type: 'extract_request',
      requestId: message.requestId || uuidv4(),
      timestamp: new Date().toISOString()
    }));
  });
}

function handleScheduleData(message, clientId, clientType) {
  console.log('💾 Guardando datos de horarios...');
  
  // Guardar datos
  const scheduleEntry = {
    id: uuidv4(),
    data: message.data,
    timestamp: new Date().toISOString(),
    source: clientType,
    sourceId: clientId
  };
  
  store.schedules.push(scheduleEntry);
  
  // Mantener solo los últimos 100 registros
  if (store.schedules.length > 100) {
    store.schedules.shift();
  }
  
  // Notificar a todos los dashboards
  broadcastToDashboards({
    type: 'schedule_updated',
    data: scheduleEntry
  });
  
  // Enviar confirmación a la extensión
  const extension = store.extensions.get(clientId);
  if (extension) {
    extension.send(JSON.stringify({
      type: 'extract_success',
      message: 'Datos guardados correctamente'
    }));
  }
}

function broadcastToDashboards(message) {
  const payload = JSON.stringify(message);
  store.dashboards.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

// ============================================
// API REST
// ============================================

// GET - Obtener últimos horarios
app.get('/api/schedules', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const schedules = store.schedules.slice(-limit);
  
  res.json({
    success: true,
    count: schedules.length,
    data: schedules
  });
});

// GET - Obtener horarios de hoy
app.get('/api/schedules/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const todaySchedules = store.schedules.filter(s => 
    s.data.fecha === today
  );
  
  res.json({
    success: true,
    fecha: today,
    count: todaySchedules.length,
    data: todaySchedules
  });
});

// GET - Obtener estadísticas
app.get('/api/stats', (req, res) => {
  const extensionsCount = store.extensions.size;
  const dashboardsCount = store.dashboards.size;
  const schedulesCount = store.schedules.length;
  
  res.json({
    success: true,
    stats: {
      extensiones_conectadas: extensionsCount,
      dashboards_conectados: dashboardsCount,
      total_horarios_guardados: schedulesCount,
      timestamp: new Date().toISOString()
    }
  });
});

// POST - Solicitar extracción manual
app.post('/api/extract', (req, res) => {
  const requestId = uuidv4();
  
  console.log('🔄 Solicitud de extracción manual recibida');
  
  // Enviar solicitud a la extensión
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

// GET - Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// Rutas de página
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================
// Manejo de errores
// ============================================

app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

// ============================================
// Iniciar servidor
// ============================================

server.listen(PORT, () => {
  console.log(`\n🎉 Servidor TIMP ejecutándose en puerto ${PORT}`);
  console.log(`📊 Panel web: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Apagando servidor...');
  server.close(() => {
    console.log('✅ Servidor cerrado');
    process.exit(0);
  });
});

module.exports = server;
