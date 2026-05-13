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
const TOKEN = localStorage.getItem('token');
const USER_RAW = localStorage.getItem('user');
const PROTECTED_TRANSACTION_PAGES = new Set([
    '/acheter',
    '/acheter.html',
    '/vendre',
    '/vendre.html',
    '/echanger',
    '/echanger.html',
    '/attente',
    '/attente.html',
]);

if (PROTECTED_TRANSACTION_PAGES.has(window.location.pathname) && (!TOKEN || !USER_RAW)) {
    window.location.href = '/login';
}

const SUCCESSFUL_PAYMENT_STATUSES = new Set(['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID']);
const FAILED_PAYMENT_STATUSES = new Set(['FAILED', 'CANCELLED']);
const PRICE_MAP = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    USDT: 'tether',
    BNB: 'binancecoin',
    SOL: 'solana',
    XRP: 'ripple',
};

let transactionMetaPromise = null;
let marketPricesPromise = null;
let paymentPollingTimer = null;

function authHeaders() {
    return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

function formatCurrency(value, currency) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency,
        maximumFractionDigits: currency === 'XAF' ? 0 : 2,
    }).format(value || 0);
}

function showBox(box, message, type) {
    if (!box) return;
    box.textContent = message;
    box.className = `message-box visible ${type}`;
}

function clearBox(box) {
    if (!box) return;
    box.textContent = '';
    box.className = 'message-box';
}

function setButtonLoading(button, loading, loadingLabel) {
    if (!button) return;
    if (!button.dataset.label) {
        button.dataset.label = button.textContent;
    }
    button.disabled = loading;
    button.textContent = loading ? loadingLabel : button.dataset.label;
}

function normalizeCgPhone(phone) {
    const digits = `${phone || ''}`.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('242') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length === 9) return `242${digits}`;
    return digits;
}

function isValidCgPhone(phone) {
    return /^2420[1-9]\d{7}$/.test(normalizeCgPhone(phone));
}

function typeLabel(type) {
    return type === 'buy' ? 'Achat' : type === 'sell' ? 'Vente' : 'Echange';
}

async function getTransactionMeta() {
    if (!transactionMetaPromise) {
        transactionMetaPromise = fetch(`${API}/orders/meta`).then((response) => response.json());
    }
    return transactionMetaPromise;
}

async function getMarketPrices() {
    if (!marketPricesPromise) {
        const ids = Object.values(PRICE_MAP).join(',');
        marketPricesPromise = fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`)
            .then((response) => response.json());
    }
    return marketPricesPromise;
}

function populateNetworks(select, networks, value) {
    select.innerHTML = '<option value="">Choisir un réseau</option>';
    networks.forEach((network) => {
        const option = document.createElement('option');
        option.value = network;
        option.textContent = network;
        select.appendChild(option);
    });
    if (value && networks.includes(value)) {
        select.value = value;
    }
}

function prefills() {
    return new URLSearchParams(window.location.search);
}

async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function postOrder(payload) {
    const response = await fetch(`${API}/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erreur lors de la création de la transaction.');
    localStorage.setItem('nokipayPendingOrder', JSON.stringify(data.order));
    window.location.href = '/attente';
}

async function initBuyPage() {
    const form = document.getElementById('buy-form');
    if (!form) return;

    const meta = await getTransactionMeta();
    const params = prefills();
    const cryptoInput = document.getElementById('crypto');
    const networkInput = document.getElementById('network');
    const amountInput = document.getElementById('amount-usd');
    const fcfaOutput = document.getElementById('fcfa-value');
    const paymentMessage = document.getElementById('payment-message');
    const paymentStatusNote = document.getElementById('payment-status-note');
    const reviewMessage = document.getElementById('review-message');
    const paymentStep = document.getElementById('payment-step');
    const deliveryStep = document.getElementById('delivery-step');
    const deliveryLockMessage = document.getElementById('delivery-lock-message');
    const paymentBtn = document.getElementById('initiate-payment');
    const verifyBtn = document.getElementById('verify-payment');
    const submitOrderBtn = document.getElementById('submit-order');

    cryptoInput.value = params.get('crypto') || '';
    amountInput.value = params.get('amount') || '';

    function updateBuyNetworks() {
        populateNetworks(networkInput, meta.networks[cryptoInput.value] || [], networkInput.value);
    }

    function updateBuyConversion() {
        const amount = Number(amountInput.value) || 0;
        fcfaOutput.textContent = `${Math.round(amount * meta.rates.buy).toLocaleString('fr-FR')} FCFA`;
    }

    cryptoInput.addEventListener('change', updateBuyNetworks);
    amountInput.addEventListener('input', updateBuyConversion);
    updateBuyNetworks();
    updateBuyConversion();

    function setDeliveryAccess(enabled) {
        submitOrderBtn.disabled = !enabled;
        if (deliveryLockMessage) {
            deliveryLockMessage.textContent = enabled
                ? 'Paiement confirmé. Vous pouvez maintenant finaliser votre commande.'
                : 'Validez d’abord le paiement pour poursuivre.';
        }
    }

    function stopPaymentPolling() {
        if (paymentPollingTimer) {
            clearInterval(paymentPollingTimer);
            paymentPollingTimer = null;
        }
    }

    async function verifyPaymentStatus(mode = 'manual') {
        const reference = paymentStep.dataset.reference;
        if (!reference) {
            showBox(paymentMessage, 'Aucune référence OpenPay trouvée. Relancez le paiement.', 'error');
            return false;
        }

        try {
            if (mode === 'manual') {
                showBox(paymentStatusNote, 'Vérification du paiement en cours...', 'success');
            }

            const response = await fetch(`${API}/orders/payment/${reference}`, {
                headers: authHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Impossible de vérifier le paiement.');

            const normalizedStatus = `${data.status || ''}`.toUpperCase();

            if (SUCCESSFUL_PAYMENT_STATUSES.has(normalizedStatus)) {
                stopPaymentPolling();
                deliveryStep.classList.add('active');
                deliveryStep.dataset.paymentReference = reference;
                setDeliveryAccess(true);
                showBox(paymentMessage, 'Paiement confirmé par OpenPay. Vous pouvez finaliser la commande.', 'success');
                showBox(paymentStatusNote, 'Succès: le paiement a été effectué. La suite du formulaire est maintenant disponible.', 'success');
                deliveryStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return true;
            }

            if (FAILED_PAYMENT_STATUSES.has(normalizedStatus)) {
                stopPaymentPolling();
                setDeliveryAccess(false);
                const failureMessage = normalizedStatus === 'FAILED'
                    ? 'Le paiement a échoué. Cela peut venir d’un solde insuffisant, d’un refus opérateur ou d’une erreur de confirmation. Veuillez réessayer.'
                    : 'Le paiement a été annulé. Le client doit relancer puis revalider la demande.';
                showBox(paymentMessage, failureMessage, 'error');
                showBox(paymentStatusNote, `Statut OpenPay: ${data.status || 'inconnu'}.`, 'error');
                return false;
            }

            setDeliveryAccess(false);
            if (mode === 'manual') {
                showBox(paymentMessage, `Paiement en attente. Statut OpenPay: ${data.status || 'inconnu'}.`, 'error');
                showBox(paymentStatusNote, 'Le paiement est encore en cours de traitement. Le client doit d’abord confirmer la demande sur son téléphone, puis vous pouvez revérifier.', 'error');
            } else {
                showBox(paymentStatusNote, `Paiement en attente. Statut OpenPay: ${data.status || 'pending'}. Nouvelle vérification automatique en cours...`, 'success');
            }
            return false;
        } catch (error) {
            if (mode === 'manual') {
                setDeliveryAccess(false);
                showBox(paymentMessage, error.message, 'error');
                showBox(paymentStatusNote, 'Impossible de confirmer le paiement pour le moment. Réessayez après validation sur le téléphone du client.', 'error');
            }
            return false;
        }
    }

    function startPaymentPolling() {
        stopPaymentPolling();
        let attempts = 0;
        paymentPollingTimer = setInterval(async () => {
            attempts += 1;
            const isResolved = await verifyPaymentStatus('auto');
            if (isResolved || attempts >= 12) {
                stopPaymentPolling();
            }
        }, 5000);
    }

    setDeliveryAccess(false);

    paymentBtn.addEventListener('click', async () => {
        clearBox(paymentMessage);
        clearBox(paymentStatusNote);
        clearBox(reviewMessage);
        stopPaymentPolling();
        setDeliveryAccess(false);
        deliveryStep.dataset.paymentReference = '';
        const payload = {
            email: document.getElementById('email').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            amountFcfa: Math.round((Number(amountInput.value) || 0) * meta.rates.buy),
            type: 'buy',
        };

        if (!payload.email || !payload.phone || !cryptoInput.value || !networkInput.value || !amountInput.value) {
            showBox(paymentMessage, 'Complétez l’email, le téléphone, la crypto, le réseau et le montant avant de lancer le paiement.', 'error');
            return;
        }
        if (!isValidCgPhone(payload.phone)) {
            showBox(paymentMessage, 'Le numéro doit être au format Congo valide: 242066203420 ou 066203420.', 'error');
            showBox(paymentStatusNote, 'Corrigez le numéro avant de lancer le paiement.', 'error');
            return;
        }
        payload.phone = normalizeCgPhone(payload.phone);

        try {
            setButtonLoading(paymentBtn, true, 'Initialisation...');
            showBox(paymentStatusNote, 'Initialisation du paiement en cours. Veuillez patienter...', 'success');
            const response = await fetch(`${API}/orders/payment/initiate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders(),
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Impossible d’initier le paiement OpenPay.');

            paymentStep.classList.add('active');
            const statusReference = data.statusReference || data.providerTransactionId || data.referenceId;
            paymentStep.dataset.reference = statusReference;
            paymentStep.dataset.displayReference = data.referenceId || statusReference || '';
            const sentTo = data.recipientPhone ? ` au numero ${data.recipientPhone}` : '';
            showBox(paymentMessage, `Paiement OpenPay lance.${sentTo} Le client doit valider la demande sur son telephone.`, 'success');
            showBox(paymentStatusNote, 'OpenPay a bien repondu a l’initialisation. Verification automatique en cours pendant que le client valide la demande.', 'success');

            const normalizedInitStatus = `${data.status || ''}`.toUpperCase();
            if (SUCCESSFUL_PAYMENT_STATUSES.has(normalizedInitStatus)) {
                deliveryStep.classList.add('active');
                deliveryStep.dataset.paymentReference = statusReference;
                setDeliveryAccess(true);
                showBox(paymentMessage, 'Paiement confirmé immédiatement par OpenPay. Vous pouvez finaliser la commande.', 'success');
                showBox(paymentStatusNote, 'Succès: le paiement a déjà été confirmé par OpenPay.', 'success');
            } else if (FAILED_PAYMENT_STATUSES.has(normalizedInitStatus)) {
                setDeliveryAccess(false);
                showBox(paymentMessage, 'Le paiement a été refusé dès l’initialisation. Vérifiez le téléphone, le réseau et le solde du client puis réessayez.', 'error');
                showBox(paymentStatusNote, `Statut OpenPay: ${data.status || 'inconnu'}.`, 'error');
            } else {
                startPaymentPolling();
            }
        } catch (error) {
            showBox(paymentMessage, error.message, 'error');
            showBox(paymentStatusNote, 'L’initialisation du paiement a echoue. Corrigez les informations puis relancez.', 'error');
        } finally {
            setButtonLoading(paymentBtn, false, 'Initialisation...');
        }
    });

    verifyBtn.addEventListener('click', async () => {
        await verifyPaymentStatus('manual');
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearBox(reviewMessage);

        const screenshot = document.getElementById('proof').files[0];
        const walletAddress = document.getElementById('wallet-destination').value.trim();
        const binanceId = document.getElementById('binance-id').value.trim();
        const paymentReference = deliveryStep.dataset.paymentReference;

        if (!paymentReference) {
            showBox(reviewMessage, 'Le paiement OpenPay doit être confirmé avant validation.', 'error');
            return;
        }
        if (!walletAddress && !binanceId) {
            showBox(reviewMessage, 'Ajoutez une adresse crypto ou un ID Binance.', 'error');
            return;
        }
        if (!screenshot) {
            showBox(reviewMessage, 'La capture d’écran du paiement est requise.', 'error');
            return;
        }

        try {
            await postOrder({
                type: 'buy',
                email: document.getElementById('email').value.trim(),
                phone: normalizeCgPhone(document.getElementById('phone').value.trim()),
                crypto: cryptoInput.value,
                network: networkInput.value,
                amountUsd: Number(amountInput.value),
                paymentReference,
                walletAddress,
                binanceId,
                screenshotDataUrl: await readFileAsDataUrl(screenshot),
                notes: document.getElementById('notes').value.trim(),
            });
        } catch (error) {
            showBox(reviewMessage, error.message, 'error');
        }
    });
}

async function initSellPage() {
    const form = document.getElementById('sell-form');
    if (!form) return;

    const [meta, prices] = await Promise.all([getTransactionMeta(), getMarketPrices()]);
    const params = prefills();
    const cryptoInput = document.getElementById('sell-crypto');
    const networkInput = document.getElementById('sell-network');
    const amountCryptoInput = document.getElementById('sell-amount-crypto');
    const amountUsdOutput = document.getElementById('sell-usd-value');
    const amountFcfaOutput = document.getElementById('sell-fcfa-value');
    const depositAddressOutput = document.getElementById('sell-deposit-address');
    const formMessage = document.getElementById('sell-message');

    cryptoInput.value = params.get('crypto') || '';
    amountCryptoInput.value = params.get('amount') || '';

    function updateSellNetworks() {
        populateNetworks(networkInput, meta.networks[cryptoInput.value] || [], networkInput.value);
        updateSellSummary();
    }

    function updateSellSummary() {
        const cryptoCode = cryptoInput.value;
        const amountCrypto = Number(amountCryptoInput.value) || 0;
        const priceKey = PRICE_MAP[cryptoCode];
        const usdPrice = priceKey ? Number(prices[priceKey]?.usd || 0) : 0;
        const amountUsd = amountCrypto * usdPrice;
        const amountFcfa = amountUsd * meta.rates.sell;

        amountUsdOutput.textContent = `$${amountUsd.toFixed(2)}`;
        amountFcfaOutput.textContent = `${Math.round(amountFcfa).toLocaleString('fr-FR')} FCFA`;
        depositAddressOutput.textContent = meta.depositAddresses[cryptoCode]?.[networkInput.value] || 'Choisissez une crypto et un réseau.';
    }

    cryptoInput.addEventListener('change', updateSellNetworks);
    networkInput.addEventListener('change', updateSellSummary);
    amountCryptoInput.addEventListener('input', updateSellSummary);
    updateSellNetworks();
    updateSellSummary();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearBox(formMessage);

        const screenshot = document.getElementById('sell-proof').files[0];
        if (!screenshot) {
            showBox(formMessage, 'La capture d’écran du dépôt crypto est requise.', 'error');
            return;
        }

        const cryptoCode = cryptoInput.value;
        const amountCrypto = Number(amountCryptoInput.value) || 0;
        const priceKey = PRICE_MAP[cryptoCode];
        const amountUsd = amountCrypto * Number(prices[priceKey]?.usd || 0);

        try {
            await postOrder({
                type: 'sell',
                email: document.getElementById('sell-email').value.trim(),
                phone: document.getElementById('sell-phone').value.trim(),
                crypto: cryptoCode,
                network: networkInput.value,
                amountCrypto,
                amountUsd,
                screenshotDataUrl: await readFileAsDataUrl(screenshot),
                notes: document.getElementById('sell-notes').value.trim(),
            });
        } catch (error) {
            showBox(formMessage, error.message, 'error');
        }
    });
}

async function initExchangePage() {
    const form = document.getElementById('exchange-form');
    if (!form) return;

    const meta = await getTransactionMeta();
    const fromInput = document.getElementById('exchange-from');
    const fromNetworkInput = document.getElementById('exchange-network-from');
    const toInput = document.getElementById('exchange-to');
    const toNetworkInput = document.getElementById('exchange-network-to');
    const amountInput = document.getElementById('exchange-amount-usd');
    const feeOutput = document.getElementById('exchange-fee-value');
    const finalOutput = document.getElementById('exchange-final-value');
    const depositAddressOutput = document.getElementById('exchange-deposit-address');
    const formMessage = document.getElementById('exchange-message');

    function updateNetworks() {
        populateNetworks(fromNetworkInput, meta.networks[fromInput.value] || [], fromNetworkInput.value);
        populateNetworks(toNetworkInput, meta.networks[toInput.value] || [], toNetworkInput.value);
        updateExchangeSummary();
    }

    function updateExchangeSummary() {
        const amountUsd = Number(amountInput.value) || 0;
        const feeUsd = amountUsd * (meta.rates.exchangeFeePercent / 100);
        feeOutput.textContent = `$${feeUsd.toFixed(2)}`;
        finalOutput.textContent = `$${(amountUsd - feeUsd).toFixed(2)}`;
        depositAddressOutput.textContent = meta.depositAddresses[fromInput.value]?.[fromNetworkInput.value] || 'Choisissez une crypto source et un réseau.';
    }

    fromInput.addEventListener('change', updateNetworks);
    toInput.addEventListener('change', updateNetworks);
    fromNetworkInput.addEventListener('change', updateExchangeSummary);
    toNetworkInput.addEventListener('change', updateExchangeSummary);
    amountInput.addEventListener('input', updateExchangeSummary);
    updateNetworks();
    updateExchangeSummary();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearBox(formMessage);

        const screenshot = document.getElementById('exchange-proof').files[0];
        if (!screenshot) {
            showBox(formMessage, 'La capture d’écran du dépôt est requise pour l’échange.', 'error');
            return;
        }

        if (!document.getElementById('exchange-fee-accepted').checked) {
            showBox(formMessage, 'Vous devez accepter les frais de 2% avant validation.', 'error');
            return;
        }

        try {
            await postOrder({
                type: 'exchange',
                email: document.getElementById('exchange-email').value.trim(),
                phone: document.getElementById('exchange-phone').value.trim(),
                exchangeFrom: fromInput.value,
                exchangeTo: toInput.value,
                exchangeNetworkFrom: fromNetworkInput.value,
                exchangeNetworkTo: toNetworkInput.value,
                amountUsd: Number(amountInput.value),
                exchangeFeeAccepted: true,
                walletAddress: document.getElementById('exchange-wallet-address').value.trim(),
                screenshotDataUrl: await readFileAsDataUrl(screenshot),
                notes: document.getElementById('exchange-notes').value.trim(),
            });
        } catch (error) {
            showBox(formMessage, error.message, 'error');
        }
    });
}

function initWaitingPage() {
    const summary = document.getElementById('waiting-summary');
    if (!summary) return;

    const rawOrder = localStorage.getItem('nokipayPendingOrder');
    if (!rawOrder) {
        summary.innerHTML = '<li>Aucune transaction en attente trouvée. Retournez sur une page de transaction pour démarrer.</li>';
        return;
    }

    const order = JSON.parse(rawOrder);
    const lines = [
        `<li><strong>Référence:</strong> ${order.reference}</li>`,
        `<li><strong>Type:</strong> ${typeLabel(order.type)}</li>`,
    ];

    if (order.type === 'exchange') {
        lines.push(`<li><strong>Paire:</strong> ${order.exchangeFrom} (${order.exchangeNetworkFrom}) → ${order.exchangeTo} (${order.exchangeNetworkTo})</li>`);
        lines.push(`<li><strong>Montant:</strong> ${formatCurrency(order.amountUsd, 'USD')}</li>`);
    } else {
        lines.push(`<li><strong>Crypto:</strong> ${order.crypto} sur ${order.network}</li>`);
        lines.push(`<li><strong>Montant:</strong> ${formatCurrency(order.amountUsd, 'USD')} soit ${formatCurrency(order.amountFcfa, 'XAF')}</li>`);
    }

    if (order.depositAddress) lines.push(`<li><strong>Adresse de dépôt:</strong> ${order.depositAddress}</li>`);
    if (order.walletAddress) lines.push(`<li><strong>Adresse de réception:</strong> ${order.walletAddress}</li>`);
    if (order.binanceId) lines.push(`<li><strong>ID Binance:</strong> ${order.binanceId}</li>`);
    if (order.phone) lines.push(`<li><strong>Contact:</strong> ${order.phone}</li>`);

    summary.innerHTML = lines.join('');
}

initBuyPage();
initSellPage();
initExchangePage();
initWaitingPage();
