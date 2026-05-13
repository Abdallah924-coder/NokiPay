const hamb = document.querySelector('#hamb');
const nav = document.querySelector('#nav');
const isAuthenticated = !!localStorage.getItem('token');

document.querySelectorAll('[data-guest-only]').forEach((element) => {
    if (isAuthenticated) {
        element.remove();
    }
});

if (hamb && nav) {
    hamb.addEventListener('click', () => {
        hamb.classList.toggle('hamb-open');
        nav.classList.toggle('nav-open');
    });
}
const cards = document.querySelectorAll('.feature-card');
const particles = document.getElementById('particles');

if (cards.length) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, index * 150);
            }
        });
    }, { threshold: 0.2 });

    cards.forEach(card => observer.observe(card));
}

function createSpark() {
    if (!particles) return;

    const spark = document.createElement('span');
    spark.classList.add('spark');
    spark.style.left = Math.random() * 100 + '%';
    spark.style.top = Math.random() * 100 + '%';
    spark.style.animationDelay = Math.random() * 2 + 's';
    particles.appendChild(spark);
    setTimeout(() => spark.remove(), 2500);
}

if (particles) {
    setInterval(createSpark, 300);
}
async function fetchCryptos() {
    const list = document.getElementById('crypto-list');
    if (!list) return;

    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,binancecoin,ripple,cardano,dogecoin,toncoin&order=market_cap_desc&sparkline=false');
        const data = await response.json();
        list.innerHTML = '';

        data.forEach((coin, index) => {
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
                    ${isPositive ? '+' : ''}${change.toFixed(2)}%
                </span>
                <span>$${(coin.market_cap / 1e9).toFixed(2)}B</span>
            `;

            list.appendChild(row);
        });

    } catch (error) {
        list.innerHTML = '<p class="loading">Erreur de chargement.</p>';
    }
}

if (document.getElementById('crypto-list')) {
    fetchCryptos();
    setInterval(fetchCryptos, 60000);
}
function animateCount(el) {
    const target = +el.dataset.target;
    const duration = 10000;
    const step = target / (duration / 16);
    let current = 0;

    const timer = setInterval(() => {
        current += step;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        el.textContent = target >= 1000000
            ? '$' + (current / 1000000).toFixed(1) + 'M'
            : Math.floor(current).toLocaleString() + (el.dataset.target === '99' ? '%' : '+');
    }, 16);
}

const statNumbers = document.querySelectorAll('.stat-number');

if (statNumbers.length) {
    const statObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCount(entry.target);
                statObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => statObserver.observe(el));
}
