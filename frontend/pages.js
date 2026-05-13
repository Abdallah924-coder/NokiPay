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

// Avatar et sidebar communs
const avatarEl = document.getElementById('user-avatar');
if (avatarEl) avatarEl.textContent = user.prenom[0].toUpperCase() + user.nom[0].toUpperCase();

document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
});

document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
});

// =====================
// PAGE CRYPTOS
// =====================
let allCoins = [];
let selectedCoin = null;
let selectedType = 'achat';

async function loadFullCryptos() {
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false');
        allCoins = await res.json();
        renderCryptos(allCoins);
    } catch {
        document.getElementById('crypto-full-list').innerHTML = '<p class="loading-text">Erreur de chargement.</p>';
    }
}

function renderCryptos(coins) {
    const list = document.getElementById('crypto-full-list');
    if (!list) return;
    list.innerHTML = '';

    if (coins.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucune crypto trouvée.</p>';
        return;
    }

    coins.forEach((coin, index) => {
        const change = coin.price_change_percentage_24h;
        const isPositive = change >= 0;

        const row = document.createElement('div');
        row.classList.add('crypto-row');
        row.innerHTML = `
            <span>${index + 1}</span>
            <span class="crypto-name">
                <img src="${coin.image}" alt="${coin.name}">
                <div class="crypto-name-text">
                    <strong>${coin.name}</strong>
                    <small>${coin.symbol}</small>
                </div>
            </span>
            <span>$${coin.current_price.toLocaleString()}</span>
            <span class="${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%
            </span>
            <span>$${(coin.market_cap / 1e9).toFixed(2)}B</span>
            <span><button class="btn-buy" data-id="${coin.id}">Échanger</button></span>
        `;
        list.appendChild(row);
    });

    // Boutons échanger
    document.querySelectorAll('.btn-buy').forEach(btn => {
        btn.addEventListener('click', () => {
            const coin = allCoins.find(c => c.id === btn.dataset.id);
            openModal(coin);
        });
    });
}

// Filtres
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const filter = tab.dataset.filter;
        let filtered = [...allCoins];

        if (filter === 'top10') filtered = allCoins.slice(0, 10);
        else if (filter === 'gainers') filtered = allCoins.filter(c => c.price_change_percentage_24h > 0).sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
        else if (filter === 'losers') filtered = allCoins.filter(c => c.price_change_percentage_24h < 0).sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h);

        renderCryptos(filtered);
    });
});

// Recherche
document.getElementById('search-crypto')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allCoins.filter(c => c.name.toLowerCase().includes(query) || c.symbol.toLowerCase().includes(query));
    renderCryptos(filtered);
});

// Modal
function openModal(coin) {
    selectedCoin = coin;
    document.getElementById('modal-title').textContent = `Échanger ${coin.name}`;
    document.getElementById('modal-crypto-info').innerHTML = `
        <img src="${coin.image}" alt="${coin.name}">
        <div>
            <p class="crypto-price">$${coin.current_price.toLocaleString()}</p>
            <p class="crypto-label">${coin.name} — ${coin.symbol.toUpperCase()}</p>
        </div>
    `;
    document.getElementById('order-amount').value = '';
    document.getElementById('total-estimate').textContent = '$0.00';
    document.getElementById('order-message').innerHTML = '';
    document.getElementById('modal-overlay').classList.add('open');
}

document.getElementById('modal-close')?.addEventListener('click', () => {
    document.getElementById('modal-overlay').classList.remove('open');
});

document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) {
        document.getElementById('modal-overlay').classList.remove('open');
    }
});

document.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedType = tab.dataset.type;
    });
});

document.getElementById('order-amount')?.addEventListener('input', (e) => {
    const amount = parseFloat(e.target.value);
    if (!selectedCoin || isNaN(amount)) {
        document.getElementById('total-estimate').textContent = '$0.00';
        return;
    }
    const total = (amount * selectedCoin.current_price).toFixed(2);
    document.getElementById('total-estimate').textContent = '$' + parseFloat(total).toLocaleString();
});

document.getElementById('confirm-order')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('order-amount').value);
    const msgEl = document.getElementById('order-message');

    if (!amount || amount <= 0) {
        msgEl.innerHTML = '<p style="color:#F44336;font-size:13px;">Veuillez entrer une quantité valide.</p>';
        return;
    }

    const destination = selectedType === 'achat' ? 'acheter.html' : 'vendre.html';
    const params = new URLSearchParams({
        crypto: selectedCoin.symbol.toUpperCase(),
        amount: String(amount),
    });
    window.location.href = `${destination}?${params.toString()}`;
});

// =====================
// PAGE COMMANDES
// =====================
let allOrders = [];

async function loadFullOrders() {
    try {
        const res = await fetch(`${API}/orders/mes-commandes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        allOrders = await res.json();

        document.getElementById('orders-total').textContent = allOrders.length;
        document.getElementById('orders-encours').textContent = allOrders.filter(o => o.status === 'pending' || o.status === 'pending_payment').length;
        document.getElementById('orders-traites').textContent = allOrders.filter(o => o.status === 'validated').length;

        const volume = allOrders.reduce((acc, o) => acc + Number(o.amountUsd || 0), 0);
        document.getElementById('orders-volume').textContent = '$' + volume.toFixed(2);

        renderOrders(allOrders);
    } catch {
        document.getElementById('orders-full-list').innerHTML = '<p class="loading-text">Erreur de chargement.</p>';
    }
}

function renderOrders(orders) {
    const list = document.getElementById('orders-full-list');
    if (!list) return;
    list.innerHTML = '';

    if (orders.length === 0) {
        list.innerHTML = '<p class="loading-text">Aucune commande trouvée.</p>';
        return;
    }

    orders.forEach(order => {
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
}

document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.dataset.filter;
        const filtered = filter === 'all' ? allOrders : allOrders.filter(o => o.status === filter);
        renderOrders(filtered);
    });
});

// =====================
// PAGE PROFIL
// =====================
function loadProfile() {
    const nomEl = document.getElementById('profile-nom');
    if (!nomEl) return;

    document.getElementById('profile-nom').value = user.nom;
    document.getElementById('profile-prenom').value = user.prenom;
    document.getElementById('profile-email-input').value = user.email;
    document.getElementById('profile-pays-select').value = user.pays || 'CG';
    document.getElementById('profile-fullname').textContent = `${user.prenom} ${user.nom}`;
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('profile-pays').textContent = user.pays || 'CG';
    document.getElementById('profile-avatar-big').textContent = user.prenom[0].toUpperCase() + user.nom[0].toUpperCase();
}

function showMsg(elId, msg, type = 'error') {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = `
        <p style="
            font-size:13px;
            padding: 10px 14px;
            border-radius: 8px;
            margin-top: 8px;
            background: ${type === 'error' ? 'rgba(244,67,54,0.1)' : 'rgba(76,175,80,0.1)'};
            color: ${type === 'error' ? '#F44336' : '#4CAF50'};
            border: 1px solid ${type === 'error' ? 'rgba(244,67,54,0.3)' : 'rgba(76,175,80,0.3)'};
        ">${msg}</p>
    `;
}

// Modifier profil
document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Chargement...';

    const nom = document.getElementById('profile-nom').value.trim();
    const prenom = document.getElementById('profile-prenom').value.trim();
    const email = document.getElementById('profile-email-input').value.trim();
    const pays = document.getElementById('profile-pays-select').value;

    try {
        const res = await fetch(`${API}/auth/update-profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ nom, prenom, email, pays }),
        });

        const data = await res.json();
        if (!res.ok) return showMsg('profile-message', data.message || 'Erreur.');

        const updatedUser = { ...user, nom, prenom, email, pays };
        localStorage.setItem('user', JSON.stringify(updatedUser));

        document.getElementById('profile-fullname').textContent = `${prenom} ${nom}`;
        document.getElementById('profile-email').textContent = email;
        document.getElementById('profile-pays').textContent = pays;
        document.getElementById('user-avatar').textContent = prenom[0].toUpperCase() + nom[0].toUpperCase();
        document.getElementById('profile-avatar-big').textContent = prenom[0].toUpperCase() + nom[0].toUpperCase();

        showMsg('profile-message', '✓ Profil mis à jour avec succès.', 'success');

    } catch {
        showMsg('profile-message', 'Erreur de connexion au serveur.');
    } finally {
        btn.disabled = false;
        btn.textContent = btn.dataset.label;
    }
});

// Changer mot de passe
document.getElementById('password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Chargement...';

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmNew = document.getElementById('confirm-new-password').value;

    if (newPassword !== confirmNew) {
        showMsg('password-message', 'Les mots de passe ne correspondent pas.');
        btn.disabled = false;
        btn.textContent = btn.dataset.label;
        return;
    }

    try {
        const res = await fetch(`${API}/auth/change-password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        const data = await res.json();
        if (!res.ok) return showMsg('password-message', data.message || 'Erreur.');

        showMsg('password-message', '✓ Mot de passe changé avec succès.', 'success');
        e.target.reset();

    } catch {
        showMsg('password-message', 'Erreur de connexion au serveur.');
    } finally {
        btn.disabled = false;
        btn.textContent = btn.dataset.label;
    }
});

// Toggle passwords profil
function togglePw(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input || !toggle) return;
    toggle.addEventListener('click', () => {
        const hidden = input.type === 'password';
        input.type = hidden ? 'text' : 'password';
        toggle.textContent = hidden ? '🙈' : '👁';
    });
}

togglePw('current-password', 'toggle-current');
togglePw('new-password', 'toggle-new');
togglePw('confirm-new-password', 'toggle-confirm-new');

// Force nouveau mot de passe
const newPwInput = document.getElementById('new-password');
if (newPwInput) {
    newPwInput.addEventListener('input', () => {
        const val = newPwInput.value;
        let score = 0;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const levels = [
            { width: '0%', color: 'transparent', label: '', style: '' },
            { width: '33%', color: '#F44336', label: 'Faible', style: 'color:#F44336' },
            { width: '66%', color: '#FF9800', label: 'Moyen', style: 'color:#FF9800' },
            { width: '100%', color: '#4CAF50', label: 'Fort', style: 'color:#4CAF50' },
        ];

        const level = val.length === 0 ? 0 : score <= 1 ? 1 : score <= 3 ? 2 : 3;
        const fill = document.getElementById('strength-fill');
        const label = document.getElementById('strength-label');
        if (fill) { fill.style.width = levels[level].width; fill.style.background = levels[level].color; }
        if (label) { label.textContent = levels[level].label; label.style.cssText = levels[level].style; }
    });
}

// Init selon la page
loadProfile();
if (document.getElementById('crypto-full-list')) loadFullCryptos();
if (document.getElementById('orders-full-list')) loadFullOrders();
