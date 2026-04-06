let currentPage = 1;
const limit = 20;
let authToken = localStorage.getItem('logs_token');
let currentLogs = []; // Armazenar logs da página atual

// Elementos da UI
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginBtn = document.getElementById('login-btn');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const applyFiltersBtn = document.getElementById('apply-filters-btn');
const refreshBtn = document.getElementById('refresh-btn');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const logsTbody = document.getElementById('logs-tbody');
const paginationInfo = document.getElementById('pagination-info');

// Modal
const logModal = document.getElementById('log-modal');
const modalContent = document.getElementById('modal-content');
const closeModalBtn = document.getElementById('close-modal-btn');

// Filtros
const routeFilter = document.getElementById('route-filter');
const statusFilter = document.getElementById('status-filter');
const dateStartFilter = document.getElementById('date-start-filter');
const dateEndFilter = document.getElementById('date-end-filter');

// Inicialização
checkAuth();

function checkAuth() {
    if (authToken) {
        loginContainer.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        loadLogs();
    } else {
        loginContainer.classList.remove('hidden');
        dashboardContainer.classList.add('hidden');
    }
}

// Login
loginBtn.addEventListener('click', async () => {
    const password = passwordInput.value;
    try {
        const response = await fetch('/api/logs/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('logs_token', authToken);
            checkAuth();
        } else {
            loginError.classList.remove('hidden');
        }
    } catch (err) {
        console.error('Erro no login:', err);
    }
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});

// Logout
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('logs_token');
    authToken = null;
    checkAuth();
});

// Carregar Logs
async function loadLogs() {
    const route = routeFilter.value;
    const status = statusFilter.value;
    const dateStart = dateStartFilter.value;
    const dateEnd = dateEndFilter.value;

    const query = new URLSearchParams({
        page: currentPage,
        limit,
        route,
        status,
        dateStart,
        dateEnd
    });

    try {
        const response = await fetch(`/api/logs/data?${query.toString()}`, {
            headers: { 'Authorization': authToken }
        });
        
        if (response.status === 401) {
            logoutBtn.click();
            return;
        }

        const data = await response.json();
        currentLogs = data.data; // Salva para uso no modal
        renderLogs(currentLogs);
        updatePagination(data.total, data.page, data.totalPages);
    } catch (err) {
        console.error('Erro ao buscar logs:', err);
    }
}

function renderLogs(logs) {
    logsTbody.innerHTML = '';
    logs.forEach((log, index) => {
        const row = document.createElement('tr');
        const date = new Date(log.timestamp).toLocaleString('pt-BR');
        const statusClass = log.success ? 'success' : 'fail';
        
        const cleanUrl = log.url.split('?')[0];
        row.innerHTML = `
            <td style="color: var(--text-muted); font-size: 0.8rem;">${date}</td>
            <td><span style="font-weight: 700; color: ${log.method === 'GET' ? '#10b981' : '#f59e0b'};">${log.method}</span></td>
            <td style="font-family: monospace; color: var(--primary);">${cleanUrl}</td>
            <td style="color: var(--text-muted);">${log.ip}</td>
            <td><span class="status-badge ${statusClass}">${log.status}</span></td>
            <td style="color: var(--text-muted); font-style: italic;">${log.duration}</td>
        `;

        // Evento de clique para detalhes
        row.addEventListener('click', () => showLogDetails(index));
        
        logsTbody.appendChild(row);
    });
}

function showLogDetails(index) {
    const log = currentLogs[index];
    if (!log) return;

    const q = log.query || {};
    
    modalContent.innerHTML = `
        <div class="detail-section">
            <div class="detail-title">Informações Básicas</div>
            <div class="detail-content" style="color: var(--text-main);">
                Método: ${log.method} | URL: ${log.url} | Status: ${log.status} | Sucesso: ${log.success}<br>
                IP: ${log.ip} | Data: ${new Date(log.timestamp).toLocaleString('pt-BR')} | Duração: ${log.duration}
            </div>
        </div>

        <div class="detail-section">
            <div class="detail-title">Parâmetros da URL (Query)</div>
            <div class="detail-content">${JSON.stringify(q.url_query || {}, null, 2)}</div>
        </div>

        <div class="detail-section">
            <div class="detail-title">Parâmetros de Rota</div>
            <div class="detail-content">${JSON.stringify(q.params || {}, null, 2)}</div>
        </div>

        <div class="detail-section">
            <div class="detail-title">Corpo da Requisição (Body)</div>
            <div class="detail-content">${JSON.stringify(q.body || {}, null, 2)}</div>
        </div>
    `;

    logModal.classList.remove('hidden');
}

// Fechar Modal
closeModalBtn.addEventListener('click', () => logModal.classList.add('hidden'));
logModal.addEventListener('click', (e) => {
    if (e.target === logModal) logModal.classList.add('hidden');
});

function updatePagination(total, page, totalPages) {
    paginationInfo.textContent = `Página ${page} de ${totalPages} (Total: ${total})`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
}

// Ações
applyFiltersBtn.addEventListener('click', () => {
    currentPage = 1;
    loadLogs();
});

refreshBtn.addEventListener('click', () => {
    loadLogs();
});

prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        loadLogs();
    }
});

nextBtn.addEventListener('click', () => {
    currentPage++;
    loadLogs();
});

// Exportar
exportBtn.addEventListener('click', async () => {
    const route = routeFilter.value;
    const status = statusFilter.value;
    const dateStart = dateStartFilter.value;
    const dateEnd = dateEndFilter.value;

    const query = new URLSearchParams({ route, status, dateStart, dateEnd });
    
    try {
        const response = await fetch(`/api/logs/export?${query.toString()}`, {
            headers: { 'Authorization': authToken }
        });
        
        if (response.status === 401) {
            logoutBtn.click();
            return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs_api_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        console.error('Erro ao exportar:', err);
    }
});

// Limpar Logs Filtrados
clearBtn.addEventListener('click', async () => {
    const route = routeFilter.value;
    const status = statusFilter.value;
    const dateStart = dateStartFilter.value;
    const dateEnd = dateEndFilter.value;

    if (!route && !status && !dateStart && !dateEnd) {
        alert('Por favor, aplique algum filtro antes de tentar limpar os logs.');
        return;
    }

    let filterDesc = [];
    if (route) filterDesc.push(`Rota: ${route}`);
    if (status) filterDesc.push(`Status: ${status}`);
    if (dateStart) filterDesc.push(`Início: ${dateStart}`);
    if (dateEnd) filterDesc.push(`Fim: ${dateEnd}`);

    if (confirm(`AVISO CRÍTICO!\nVocê deseja apagar PERMANENTEMENTE os logs que batem com os seguintes critérios?\n\n${filterDesc.join('\n')}\n\nEsta ação não poderá ser desfeita.`)) {
        const query = new URLSearchParams({ route, status, dateStart, dateEnd });
        
        try {
            const response = await fetch(`/api/logs/clear?${query.toString()}`, {
                method: 'DELETE',
                headers: { 'Authorization': authToken }
            });
            
            const data = await response.json();
            if (data.success) {
                alert(`Limpeza concluída! ${data.removedCount} logs foram removidos.`);
                loadLogs();
            } else {
                alert('Erro ao realizar a limpeza: ' + data.error);
            }
        } catch (err) {
            console.error('Erro ao limpar logs:', err);
            alert('Erro de conexão ao tentar limpar os logs.');
        }
    }
});
