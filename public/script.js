// ============================================
// TIMP SCHEDULER - Dashboard Script
// ============================================

class TimPScheduler {
  constructor() {
    this.ws = null;
    this.clientId = null;
    this.clientType = 'dashboard';
    this.isConnected = false;
    this.schedules = [];
    
    this.init();
  }
  
  init() {
    console.log('[TIMP Dashboard] Inicializando...');
    
    // Conectar WebSocket
    this.connectWebSocket();
    
    // Configurar event listeners
    this.setupEventListeners();
    
    // Cargar datos iniciales
    this.loadStats();
    this.loadSchedules();
    
    // Actualizar cada 10 segundos
    setInterval(() => this.loadStats(), 10000);
  }
  
  // ============================================
  // WebSocket
  // ============================================
  
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;
    
    console.log('[TIMP Dashboard] Conectando a WebSocket:', wsUrl);
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('[TIMP Dashboard] ✅ WebSocket conectado');
      this.isConnected = true;
      this.updateConnectionStatus(true);
    };
    
    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[TIMP Dashboard] 📨 Mensaje recibido:', message.type);
        
        if (message.type === 'connected') {
          this.clientId = message.clientId;
          console.log('[TIMP Dashboard] Cliente ID:', this.clientId);
        } else if (message.type === 'schedule_updated') {
          console.log('[TIMP Dashboard] 📊 Horario actualizado');
          this.handleScheduleUpdate(message.data);
        }
      } catch (error) {
        console.error('[TIMP Dashboard] Error procesando mensaje:', error);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('[TIMP Dashboard] ❌ Error WebSocket:', error);
      this.isConnected = false;
      this.updateConnectionStatus(false);
    };
    
    this.ws.onclose = () => {
      console.log('[TIMP Dashboard] ❌ WebSocket desconectado');
      this.isConnected = false;
      this.updateConnectionStatus(false);
      
      // Reintentar conexión cada 3 segundos
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }
  
  sendMessage(message) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    } else {
      console.error('[TIMP Dashboard] WebSocket no está conectado');
      return false;
    }
  }
  
  // ============================================
  // Event Listeners
  // ============================================
  
  setupEventListeners() {
    // Botón: Extraer Horarios
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.addEventListener('click', () => this.extractToday());
    }
    
    // Botón: Actualizar Datos
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadSchedules());
    }
    
    // Botón: Limpiar Historial
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearHistory());
    }
    
    // Modal: Cerrar
    const modalClose = document.querySelector('.modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => this.closeModal());
    }
    
    const modal = document.getElementById('detailsModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }
  }
  
  // ============================================
  // Acciones
  // ============================================
  
  extractToday() {
    console.log('[TIMP Dashboard] 📤 Solicitando extracción de HOY');
    
    const extractBtn = document.getElementById('extractBtn');
    if (extractBtn) {
      extractBtn.disabled = true;
      extractBtn.textContent = '⏳ Extrayendo...';
    }
    
    this.addLog('⏳ Solicitando extracción de HOY...', 'info');
    
    // Enviar por WebSocket
    const sent = this.sendMessage({
      type: 'extract_today'
    });
    
    if (!sent) {
      // Fallback: usar API REST
      this.extractTodayAPI();
    }
    
    // Resetear botón después de 2 segundos
    setTimeout(() => {
      if (extractBtn) {
        extractBtn.disabled = false;
        extractBtn.textContent = '📤 Extraer Horarios Ahora';
      }
    }, 2000);
  }
  
  extractTodayAPI() {
    console.log('[TIMP Dashboard] Usando API REST para extracción');
    
    fetch('/api/extract/today', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          this.addLog(`✅ Extracción solicitada (${data.extensiones_conectadas} extensiones)`, 'success');
        } else {
          this.addLog('❌ Error en la solicitud de extracción', 'error');
        }
      })
      .catch(error => {
        console.error('[TIMP Dashboard] Error:', error);
        this.addLog('❌ Error de conexión', 'error');
      });
  }
  
  loadStats() {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const stats = data.stats;
          
          // Actualizar elementos
          document.getElementById('extensionsCount').textContent = stats.extensiones_conectadas;
          document.getElementById('totalSchedules').textContent = stats.total_horarios_guardados;
          document.getElementById('todaySchedules').textContent = stats.horarios_hoy;
          
          // Última actualización
          const lastUpdate = new Date(stats.timestamp);
          document.getElementById('lastUpdate').textContent = lastUpdate.toLocaleTimeString('es-ES');
          
          console.log('[TIMP Dashboard] 📊 Stats actualizadas:', stats);
        }
      })
      .catch(error => console.error('[TIMP Dashboard] Error cargando stats:', error));
  }
  
  loadSchedules() {
    console.log('[TIMP Dashboard] 📥 Cargando horarios...');
    
    fetch('/api/schedules/today')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          this.schedules = data.data;
          this.renderSchedules();
          this.addLog(`✅ ${data.count} horarios cargados`, 'success');
        }
      })
      .catch(error => {
        console.error('[TIMP Dashboard] Error cargando horarios:', error);
        this.addLog('❌ Error cargando horarios', 'error');
      });
  }
  
  handleScheduleUpdate(data) {
    if (data.success) {
      this.addLog(`✅ Horario guardado (ID: ${data.id})`, 'success');
      this.loadSchedules();
      this.loadStats();
    } else {
      this.addLog(`❌ Error: ${data.error}`, 'error');
    }
  }
  
  clearHistory() {
    if (confirm('¿Estás seguro de que quieres limpiar el historial?')) {
      this.addLog('🗑️ Limpiando historial...', 'warning');
      // TODO: Implementar endpoint para limpiar
    }
  }
  
  // ============================================
  // UI
  // ============================================
  
  updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    if (status) {
      if (connected) {
        status.textContent = 'Conectado';
        status.className = 'status-badge connected';
      } else {
        status.textContent = 'Desconectado';
        status.className = 'status-badge disconnected';
      }
    }
  }
  
  renderSchedules() {
    const tbody = document.getElementById('scheduleTableBody');
    if (!tbody) return;
    
    if (this.schedules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay datos</td></tr>';
      return;
    }
    
    tbody.innerHTML = this.schedules.map(schedule => `
      <tr>
        <td>${schedule.date_extracted}</td>
        <td>${schedule.clases ? JSON.parse(schedule.clases).length : 0} clases</td>
        <td>${new Date(schedule.timestamp).toLocaleTimeString('es-ES')}</td>
        <td>
          <button class="btn btn-small" onclick="app.showDetails('${schedule.id}')">Ver</button>
        </td>
      </tr>
    `).join('');
    
    // Mostrar último horario
    if (this.schedules.length > 0) {
      const latest = this.schedules[0];
      const clases = JSON.parse(latest.clases);
      
      const container = document.getElementById('latestScheduleContainer');
      if (container) {
        container.innerHTML = `
          <div class="schedule-details">
            <p><strong>Fecha:</strong> ${latest.date_extracted}</p>
            <p><strong>Clases:</strong> ${clases.length}</p>
            <p><strong>Hora:</strong> ${new Date(latest.timestamp).toLocaleTimeString('es-ES')}</p>
            <p><strong>Estado:</strong> ${latest.validation_status}</p>
          </div>
        `;
      }
    }
  }
  
  showDetails(scheduleId) {
    const schedule = this.schedules.find(s => s.id === scheduleId);
    if (!schedule) return;
    
    const clases = JSON.parse(schedule.clases);
    const modalBody = document.getElementById('modalBody');
    
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="details">
          <p><strong>ID:</strong> ${schedule.id}</p>
          <p><strong>Fecha Extraída:</strong> ${schedule.date_extracted}</p>
          <p><strong>Fecha Confirmada:</strong> ${schedule.date_confirmed}</p>
          <p><strong>Timestamp:</strong> ${schedule.timestamp}</p>
          <p><strong>Estado:</strong> ${schedule.validation_status}</p>
          <p><strong>Fuente:</strong> ${schedule.source}</p>
          <h3>Clases (${clases.length})</h3>
          <pre>${JSON.stringify(clases, null, 2)}</pre>
        </div>
      `;
      
      document.getElementById('detailsModal').style.display = 'block';
    }
  }
  
  closeModal() {
    const modal = document.getElementById('detailsModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  addLog(message, type = 'info') {
    const logOutput = document.getElementById('logOutput');
    if (!logOutput) return;
    
    const timestamp = new Date().toLocaleTimeString('es-ES');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logOutput.appendChild(logEntry);
    logOutput.scrollTop = logOutput.scrollHeight;
    
    // Limitar a 100 logs
    while (logOutput.children.length > 100) {
      logOutput.removeChild(logOutput.firstChild);
    }
  }
}

// ============================================
// INICIAR
// ============================================

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new TimPScheduler();
});
