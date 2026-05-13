function resolveApiBase() {
    if (window.NOKIPAY_API_URL?.trim()) {
        const configured = window.NOKIPAY_API_URL.trim().replace(/\/$/, '');
        return configured.endsWith('/api') ? configured : `${configured}/api`;
    }

    if (window.location.protocol === 'file:') return 'http://localhost:5000/api';
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        if (window.location.port === '5000') return `${window.location.origin}/api`;
        return `${window.location.protocol}//${window.location.hostname}:5000/api`;
    }
    if (window.location.port === '5000') return `${window.location.origin}/api`;
    return `${window.location.origin}/api`;
}

const API = resolveApiBase();

const token = localStorage.getItem('token');
const userRaw = localStorage.getItem('user');

if (!token || !userRaw) window.location.href = 'login.html';

const user = JSON.parse(userRaw);
if (user.role !== 'admin') window.location.href = 'dashboard.html';

function typeLabel(type) {
    return type === 'buy' ? 'Achat' : type === 'sell' ? 'Vente' : type === 'exchange' ? 'Echange' : type;
}

function statusMeta(status) {
    if (status === 'validated') return { css: 'badge-traite', label: 'Confirmée' };
    if (status === 'rejected') return { css: 'badge-annule', label: 'Rejetée' };
    if (status === 'failed') return { css: 'badge-annule', label: 'Échouée' };
    if (status === 'pending_payment') return { css: 'badge-encours', label: 'Paiement en attente' };
    return { css: 'badge-encours', label: 'En attente' };
}

// Init
document.getElementById('user-avatar').textContent = user.prenom[0].toUpperCase() + user.nom[0].toUpperCase();
document.getElementById('admin-date').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
});

document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// Navigation vues
let allOrdersData = [];
let allUsersData = [];

function showView(view) {
    document.getElementById('view-overview').style.display = 'none';
    document.getElementById('view-users').style.display = 'none';
    document.getElementById('view-orders').style.display = 'none';
    document.getElementById(`view-${view}`).style.display = 'block';

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

    const titles = { overview: 'Vue générale', users: 'Utilisateurs', orders: 'Commandes' };
    document.getElementById('admin-title').textContent = titles[view];
}

document.getElementById('nav-users').addEventListener('click', () => {
    showView('users');
    document.getElementById('nav-users').classList.add('active');
    loadUsers();
});

document.getElementById('nav-orders').addEventListener('click', () => {
    showView('orders');
    document.getElementById('nav-orders').classList.add('active');
    loadAllOrders();
});

document.getElementById('btn-all-orders')?.addEventListener('click', () => {
    showView('orders');
    document.getElementById('nav-orders').classList.add('active');
    loadAllOrders();
});

// Charger stats + commandes récentes
async function loadOverview() {
    try {
        const [ordersRes, usersRes] = await Promise.all([
            fetch(`${API}/orders/all`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API}/auth/users`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const orders = await ordersRes.json();
        const users = await usersRes.json();

        allOrdersData = orders;
        allUsersData = users;

        document.getElementById('stat-users').textContent = users.length;
        document.getElementById('stat-orders').textContent = orders.length;
        document.getElementById('stat-pending').textContent = orders.filter(o => o.status === 'pending' || o.status === 'pending_payment').length;

        const volume = orders.reduce((acc, o) => acc + Number(o.amountUsd || 0), 0);
        document.getElementById('stat-volume').textContent = '$' + volume.toFixed(2);

        renderAdminOrders(orders.slice(0, 8), 'recent-orders-list');

    } catch {
        document.getElementById('recent-orders-list').innerHTML = '<p class="loading-text">Erreur de chargement.</p>';
    }
}

// Render commandes admin
function renderAdminOrders(orders, containerId) {
    const list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = '';

    if (orders.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucune commande.</p>';
        return;
    }

    orders.forEach(order => {
        const userName = order.user ? `${order.user.prenom} ${order.user.nom}` : order.email;
        const badge = statusMeta(order.status);
        const assetLabel = order.type === 'exchange'
            ? `${order.exchangeFrom} → ${order.exchangeTo}`
            : `${order.crypto} ${order.network ? `(${order.network})` : ''}`;
        const details = [];

        if (order.type === 'buy') {
            details.push(`Paiement ${order.paymentProvider || 'OpenPay'}: ${order.paymentStatus || 'SUCCESSFUL'}`);
            details.push(order.walletAddress ? `Wallet: ${order.walletAddress}` : `Binance: ${order.binanceId}`);
        } else if (order.type === 'sell') {
            details.push(`Dépôt: ${order.depositAddress}`);
            details.push(`Téléphone: ${order.payoutNumber || order.phone}`);
        } else {
            details.push(`Réseaux: ${order.exchangeNetworkFrom} → ${order.exchangeNetworkTo}`);
            details.push(`Réception: ${order.walletAddress}`);
        }

        const row = document.createElement('div');
        row.classList.add('admin-order-row');
        row.innerHTML = `
            <span>${userName}</span>
            <span>
                <strong style="color:#fff;">${assetLabel}</strong>
                <small style="display:block;color:#8A8578;font-size:12px;">${details.join(' · ')}</small>
            </span>
            <span>${typeLabel(order.type)}</span>
            <span>$${Number(order.amountUsd || 0).toFixed(2)}</span>
            <span><span class="${badge.css}">${badge.label}</span></span>
            <span>
                <select class="status-select" data-id="${order._id}">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>En attente</option>
                    <option value="validated" ${order.status === 'validated' ? 'selected' : ''}>Valider</option>
                    <option value="rejected" ${order.status === 'rejected' ? 'selected' : ''}>Rejeter</option>
                    <option value="failed" ${order.status === 'failed' ? 'selected' : ''}>Échouée</option>
                </select>
                ${order.screenshotUrl ? `<a href="${API.replace('/api', '')}${order.screenshotUrl}" target="_blank" rel="noopener noreferrer" style="display:block;color:#E8C96A;font-size:12px;margin-top:6px;">Capture</a>` : ''}
            </span>
        `;
        list.appendChild(row);
    });

    // Écouter changements de statut
    list.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', async () => {
            const id = select.dataset.id;
            const status = select.value;

            try {
                const res = await fetch(`${API}/orders/${id}/status`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ status }),
                });

                if (res.ok) {
                    loadOverview();
                    if (containerId === 'all-orders-list') loadAllOrders();
                }
            } catch {
                console.error('Erreur mise à jour statut');
            }
        });
    });
}

// Charger tous les utilisateurs
async function loadUsers() {
    try {
        const res = await fetch(`${API}/auth/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const users = await res.json();
        allUsersData = users;
        renderUsers(users);
    } catch {
        document.getElementById('users-list').innerHTML = '<p class="loading-text">Erreur de chargement.</p>';
    }
}

function renderUsers(users) {
    const list = document.getElementById('users-list');
    if (!list) return;
    list.innerHTML = '';

    if (users.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucun utilisateur.</p>';
        return;
    }

    users.forEach(u => {
        const date = new Date(u.createdAt).toLocaleDateString('fr-FR');
        const initials = (u.prenom?.[0] || '?').toUpperCase() + (u.nom?.[0] || '?').toUpperCase();

        const row = document.createElement('div');
        row.classList.add('admin-user-row');
        row.innerHTML = `
            <span>
                <div class="admin-user-info">
                    <div class="admin-user-avatar">${initials}</div>
                    <div>
                        <p class="admin-user-name">${u.prenom} ${u.nom}</p>
                    </div>
                </div>
            </span>
            <span style="color:#8A8578;font-size:13px;">${u.email}</span>
            <span style="color:#8A8578;font-size:13px;">${u.pays || '—'}</span>
            <span><span class="${u.role === 'admin' ? 'role-badge-admin' : 'role-badge-user'}">${u.role}</span></span>
            <span style="color:#8A8578;font-size:13px;">${date}</span>
            <span>
                <select class="status-select role-select" data-id="${u._id}">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </span>
        `;
        list.appendChild(row);
    });

    // Changer rôle
    list.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async () => {
            const id = select.dataset.id;
            const role = select.value;

            try {
                await fetch(`${API}/auth/users/${id}/role`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ role }),
                });
                loadUsers();
            } catch {
                console.error('Erreur changement rôle');
            }
        });
    });
}

// Recherche utilisateurs
document.getElementById('search-users')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allUsersData.filter(u =>
        u.nom.toLowerCase().includes(q) ||
        u.prenom.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
    renderUsers(filtered);
});

// Charger toutes les commandes
async function loadAllOrders() {
    try {
        const res = await fetch(`${API}/orders/all`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        allOrdersData = await res.json();
        renderAdminOrders(allOrdersData, 'all-orders-list');
    } catch {
        document.getElementById('all-orders-list').innerHTML = '<p class="loading-text">Erreur de chargement.</p>';
    }
}

// Filtres commandes
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.dataset.filter;
        const filtered = filter === 'all' ? allOrdersData : allOrdersData.filter(o => o.status === filter);
        renderAdminOrders(filtered, 'all-orders-list');
    });
});

loadOverview();
