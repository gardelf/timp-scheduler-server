/**
 * Panel Web - TIMP Scheduler
 * Interfaz centralizada para gestionar horarios
 */

class TIMPPanel {
    constructor() {
        this.ws = null;
        this.schedules = [];
        this.init();
    }

    init() {
        console.log('🚀 Inicializando panel...');
        this.setupEventListeners();
        this.connectWebSocket();
        this.loadSchedules();
        this.updateStats();
    }

    setupEventListeners() {
        document.getElementById('extractBtn').addEventListener('click', () => this.requestExtraction());
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadSchedules());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearHistory());
        document.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;

        console.log(`🔌 Conectando a WebSocket: ${wsUrl}`);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('✅ WebSocket conectado');
            this.updateConnectionStatus(true);
            this.log('✅ Conectado al servidor', 'success');
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('❌ Error WebSocket:', error);
            this.log('❌ Error de conexión', 'error');
        };

        this.ws.onclose = () => {
            console.log('❌ WebSocket desconectado');
            this.updateConnectionStatus(false);
            this.log('❌ Desconectado del servidor', 'error');
            // Intentar reconectar cada 5 segundos
            setTimeout(() => this.connectWebSocket(), 5000);
        };
    }

    handleMessage(message) {
        console.log('📨 Mensaje recibido:', message.type);

        switch (message.type) {
            case 'connected':
                this.log(`✅ ${message.message}`, 'success');
                break;

            case 'schedule_updated':
                this.handleScheduleUpdate(message.data);
                break;

            case 'extract_success':
                this.log('✅ Extracción completada', 'success');
                this.loadSchedules();
                break;

            case 'extract_request':
                this.log('📤 Solicitud de extracción enviada', 'info');
                break;

            default:
                console.warn('⚠️ Tipo de mensaje desconocido:', message.type);
        }
    }

    handleScheduleUpdate(data) {
        console.log('💾 Horarios actualizados:', data);
        this.schedules.unshift(data);
        this.updateLatestSchedule(data);
        this.updateScheduleTable();
        this.updateStats();
        this.log(`✅ Horarios actualizados (${data.data.clases.length} clases)`, 'success');
    }

    requestExtraction() {
        console.log('📤 Solicitando extracción...');
        this.log('📤 Solicitando extracción de horarios...', 'info');

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'extract_request',
                requestId: this.generateId()
            }));
        } else {
            this.log('❌ No conectado al servidor', 'error');
        }
    }

    loadSchedules() {
        console.log('📥 Cargando horarios...');

        fetch('/api/schedules?limit=20')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    this.schedules = data.data;
                    this.updateScheduleTable();
                    if (data.data.length > 0) {
                        this.updateLatestSchedule(data.data[0]);
                    }
                    this.log(`✅ ${data.count} horarios cargados`, 'success');
                }
            })
            .catch(error => {
                console.error('❌ Error cargando horarios:', error);
                this.log('❌ Error cargando horarios', 'error');
            });

        this.updateStats();
    }

    updateStats() {
        fetch('/api/stats')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('totalSchedules').textContent = data.stats.total_horarios_guardados;
                    document.getElementById('extensionsCount').textContent = data.stats.extensiones_conectadas;
                }
            })
            .catch(error => console.error('❌ Error cargando estadísticas:', error));

        fetch('/api/schedules/today')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('todaySchedules').textContent = data.count;
                }
            })
            .catch(error => console.error('❌ Error cargando horarios de hoy:', error));
    }

    updateLatestSchedule(scheduleEntry) {
        const container = document.getElementById('latestScheduleContainer');
        const data = scheduleEntry.data;

        if (!data.clases || data.clases.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay clases</p>';
            return;
        }

        let html = `<div class="schedule-item">`;
        html += `<div class="clase-header">`;
        html += `<span class="clase-nombre">📅 ${data.fecha}</span>`;
        html += `<span class="clase-horario">${new Date(data.timestamp).toLocaleTimeString('es-ES')}</span>`;
        html += `</div>`;

        data.clases.forEach(clase => {
            html += `
                <div class="schedule-item" style="margin-top: 10px; padding: 10px; background: white; border-radius: 4px;">
                    <div class="clase-header">
                        <span class="clase-nombre">${clase.nombre}</span>
                        <span class="clase-horario">${clase.horaInicio} - ${clase.horaFin}</span>
                    </div>
                    <div class="clase-details">
                        <div class="clase-detail-item">
                            <span class="clase-detail-label">Instructor:</span>
                            <span>${clase.instructor}</span>
                        </div>
                        <div class="clase-detail-item">
                            <span class="clase-detail-label">Reservas:</span>
                            <span>${clase.reservas}</span>
                        </div>
                        <div class="clase-detail-item">
                            <span class="clase-detail-label">Asistidos:</span>
                            <span style="color: var(--success);">${clase.asistidos}</span>
                        </div>
                        <div class="clase-detail-item">
                            <span class="clase-detail-label">No asistidos:</span>
                            <span style="color: var(--danger);">${clase.noAsistidos}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;

        document.getElementById('lastUpdate').textContent = new Date(data.timestamp).toLocaleTimeString('es-ES');
    }

    updateScheduleTable() {
        const tbody = document.getElementById('scheduleTableBody');

        if (this.schedules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay datos</td></tr>';
            return;
        }

        tbody.innerHTML = this.schedules.map(schedule => `
            <tr>
                <td>${schedule.data.fecha}</td>
                <td>${schedule.data.clases.length}</td>
                <td>${new Date(schedule.timestamp).toLocaleString('es-ES')}</td>
                <td>
                    <button class="btn-view" onclick="panel.viewDetails('${schedule.id}')">Ver</button>
                </td>
            </tr>
        `).join('');
    }

    viewDetails(scheduleId) {
        const schedule = this.schedules.find(s => s.id === scheduleId);
        if (!schedule) return;

        const modal = document.getElementById('detailsModal');
        const modalBody = document.getElementById('modalBody');

        let html = `<pre>${JSON.stringify(schedule.data, null, 2)}</pre>`;
        modalBody.innerHTML = html;
        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('detailsModal').classList.remove('active');
    }

    clearHistory() {
        if (confirm('¿Estás seguro de que quieres limpiar el historial?')) {
            this.schedules = [];
            this.updateScheduleTable();
            document.getElementById('latestScheduleContainer').innerHTML = '<p class="empty-state">Esperando datos...</p>';
            this.log('🗑️ Historial limpiado', 'info');
        }
    }

    updateConnectionStatus(connected) {
        const badge = document.getElementById('connectionStatus');
        if (connected) {
            badge.textContent = 'Conectado';
            badge.classList.add('connected');
            badge.classList.remove('disconnected');
        } else {
            badge.textContent = 'Desconectado';
            badge.classList.remove('connected');
            badge.classList.add('disconnected');
        }
    }

    log(message, type = 'info') {
        const logOutput = document.getElementById('logOutput');
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString('es-ES')}] ${message}`;
        logOutput.appendChild(entry);
        logOutput.scrollTop = logOutput.scrollHeight;

        // Mantener solo los últimos 100 logs
        while (logOutput.children.length > 100) {
            logOutput.removeChild(logOutput.firstChild);
        }
    }

    generateId() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    }
}

// Inicializar panel cuando carga la página
const panel = new TIMPPanel();
