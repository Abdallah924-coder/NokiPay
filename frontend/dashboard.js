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

// Protection — redirige si pas connecté
const token = localStorage.getItem('token');
const userRaw = localStorage.getItem('user');

if (!token || !userRaw) {
    window.location.href = '/login';
}

const user = JSON.parse(userRaw);

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

// Afficher nom et avatar
document.getElementById('welcome-title').textContent = `Bonjour, ${user.prenom} 👋`;
document.getElementById('user-avatar').textContent = user.prenom[0].toUpperCase() + user.nom[0].toUpperCase();

// Date
const now = new Date();
document.getElementById('welcome-date').textContent = now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});

// Déconnexion
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
});

// Toggle sidebar mobile
document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// Charger cryptos
async function loadCryptos() {
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin&order=market_cap_desc&sparkline=false');
        const data = await res.json();

        const grid = document.getElementById('crypto-mini-grid');
        grid.innerHTML = '';

        data.forEach(coin => {
            const change = coin.price_change_percentage_24h;
            const isPositive = change >= 0;

            const card = document.createElement('div');
            card.classList.add('crypto-mini-card');
            card.innerHTML = `
                <div class="crypto-mini-top">
                    <img src="${coin.image}" alt="${coin.name}">
                    <div>
                        <p class="crypto-mini-name">${coin.name}</p>
                        <p class="crypto-mini-symbol">${coin.symbol}</p>
                    </div>
                </div>
                <p class="crypto-mini-price">$${coin.current_price.toLocaleString()}</p>
                <p class="crypto-mini-change ${isPositive ? 'positive' : 'negative'}">
                    ${isPositive ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%
                </p>
            `;
            grid.appendChild(card);
        });
    } catch {
        document.getElementById('crypto-mini-grid').innerHTML = '<p class="loading-text">Erreur de chargement.</p>';
    }
}

// Charger commandes
async function loadOrders() {
    try {
        const res = await fetch(`${API}/orders/mes-commandes`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const orders = await res.json();
        const list = document.getElementById('orders-list');

        // Stats
        document.getElementById('stat-total').textContent = orders.length;
        document.getElementById('stat-encours').textContent = orders.filter(o => o.status === 'pending' || o.status === 'pending_payment').length;
        document.getElementById('stat-traites').textContent = orders.filter(o => o.status === 'validated').length;

        const solde = orders
            .filter(o => o.status === 'validated')
            .reduce((acc, o) => acc + Number(o.amountUsd || 0), 0);
        document.getElementById('stat-solde').textContent = '$' + solde.toFixed(2);

        if (orders.length === 0) {
            list.innerHTML = '<p class="loading-text">Aucune commande pour le moment.</p>';
            return;
        }

        list.innerHTML = '';
        orders.slice(0, 5).forEach(order => {
            const date = new Date(order.createdAt).toLocaleDateString('fr-FR');
            const badge = statusMeta(order.status);
            const assetLabel = order.type === 'exchange'
                ? `${order.exchangeFrom} → ${order.exchangeTo}`
                : `${order.crypto} ${order.network ? `(${order.network})` : ''}`;
            const amountLabel = order.type === 'exchange'
                ? `$${Number(order.amountUsd || 0).toFixed(2)}`
                : `${Number(order.amountCrypto || 0)} ${order.crypto}`;

            const row = document.createElement('div');
            row.classList.add('order-row');
            row.innerHTML = `
                <span>${assetLabel}</span>
                <span>${typeLabel(order.type)}</span>
                <span>${amountLabel}</span>
                <span>$${Number(order.amountUsd || 0).toFixed(2)}</span>
                <span><span class="${badge.css}">${badge.label}</span></span>
                <span>${date}</span>
            `;
            list.appendChild(row);
        });

    } catch {
        document.getElementById('orders-list').innerHTML = '<p class="loading-text">Erreur de chargement.</p>';
    }
}

loadCryptos();
loadOrders();
setInterval(loadCryptos, 60000);
