function isTelegramEnabled() {
    return !!`${process.env.TELEGRAM_BOT_TOKEN || ''}`.trim() && !!`${process.env.TELEGRAM_ADMIN_CHAT_ID || ''}`.trim();
}

function typeLabel(type) {
    return type === 'buy' ? 'Achat' : type === 'sell' ? 'Vente' : type === 'exchange' ? 'Echange' : type;
}

function buildAdminMessage(order) {
    const parts = [
        'Nouvelle transaction NokiPay',
        `Reference: ${order.reference}`,
        `Type: ${typeLabel(order.type)}`,
        `Client: ${order.email}`,
        `Telephone: ${order.phone || order.payoutNumber || '-'}`,
        `Montant USD: $${Number(order.amountUsd || 0).toFixed(2)}`,
        `Statut: ${order.status}`,
    ];

    if (order.type === 'exchange') {
        parts.push(`Paire: ${order.exchangeFrom} -> ${order.exchangeTo}`);
    } else {
        parts.push(`Actif: ${order.crypto} ${order.network ? `(${order.network})` : ''}`.trim());
    }

    return parts.join('\n');
}

async function sendTelegramAdminAlert(order) {
    if (!isTelegramEnabled()) return;

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
            text: buildAdminMessage(order),
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Telegram API error (${response.status}): ${errorBody}`);
    }
}

module.exports = {
    sendTelegramAdminAlert,
};
