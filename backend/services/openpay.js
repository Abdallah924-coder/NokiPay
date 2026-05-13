function normalizePhone(phone) {
    const digits = `${phone || ''}`.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('242')) return digits;
    if (digits.startsWith('0')) return `242${digits.slice(1)}`;
    return digits;
}

const PAYMENT_PROVIDER_NAME = 'OpenPay';

function isDebugEnabled() {
    return `${process.env.OPENPAY_DEBUG || ''}`.trim().toLowerCase() === 'true';
}

function getBaseUrl() {
    return (process.env.OPENPAY_API_BASE_URL || 'https://api.openpay-cg.com').replace(/\/$/, '');
}

function ensureOpenPayConfig() {
    const required = ['OPENPAY_API_KEY'];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length) {
        const error = new Error(`Configuration OpenPay manquante: ${missing.join(', ')}`);
        error.code = 'OPENPAY_CONFIG_MISSING';
        throw error;
    }
}

function buildHeaders() {
    ensureOpenPayConfig();
    return {
        'XO-API-KEY': process.env.OPENPAY_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

async function parseApiResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

function collectMessages(value, bucket = []) {
    if (!value) return bucket;

    if (typeof value === 'string') {
        const text = value.trim();
        if (text) bucket.push(text);
        return bucket;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectMessages(item, bucket));
        return bucket;
    }

    if (typeof value === 'object') {
        Object.values(value).forEach((item) => collectMessages(item, bucket));
    }

    return bucket;
}

function extractApiMessage(data) {
    const candidates = [
        data?.message,
        data?.error,
        data?.errors,
        data?.detail,
        data?.details,
        data?.data?.message,
        data?.data?.error,
        data?.data?.errors,
    ];

    for (const candidate of candidates) {
        const messages = collectMessages(candidate);
        if (messages.length) return messages.join(' ');
    }

    return '';
}

function normalizeOpenPayError(status, data) {
    const apiMessage = extractApiMessage(data);
    const compact = apiMessage.toLowerCase();

    if (status === 401 || status === 403) {
        return 'Le service de paiement est momentanement indisponible. Reessayez plus tard.';
    }

    if (status === 422) {
        if (compact.includes('phone') || compact.includes('msisdn') || compact.includes('number')) {
            return 'Le numero de telephone n’est pas valide pour le paiement. Verifiez le format et reessayez.';
        }
        if (compact.includes('amount') || compact.includes('montant')) {
            return 'Le montant de paiement est invalide. Verifiez le montant saisi puis reessayez.';
        }
        if (compact.includes('provider')) {
            return 'Le reseau mobile selectionne n’est pas accepte pour ce paiement.';
        }

        return 'Impossible d’initier le paiement avec ces informations. Verifiez le numero et le montant, puis reessayez.';
    }

    if (status >= 500) {
        return 'Le service de paiement rencontre un probleme temporaire. Reessayez dans un instant.';
    }

    return apiMessage || `Erreur OpenPay (${status}).`;
}

function logOpenPayError(stage, details) {
    const payload = {
        stage,
        ...details,
    };

    if (isDebugEnabled()) {
        console.error('[openpay]', JSON.stringify(payload, null, 2));
        return;
    }

    console.error('[openpay]', JSON.stringify(payload));
}

function extractReferenceId(data, fallbackReference) {
    return data?.reference
        || data?.referenceId
        || data?.reference_id
        || data?.transactionId
        || data?.transaction_id
        || data?.id
        || data?.data?.reference
        || data?.data?.referenceId
        || data?.data?.reference_id
        || data?.data?.transactionId
        || data?.data?.transaction_id
        || data?.data?.id
        || fallbackReference;
}

function extractStatus(data, fallbackStatus = 'PENDING') {
    return data?.status
        || data?.payment_status
        || data?.transaction_status
        || data?.state
        || data?.data?.status
        || data?.data?.payment_status
        || data?.data?.transaction_status
        || data?.data?.state
        || fallbackStatus;
}

async function initiatePaymentRequest({ amountFcfa, phone, externalId, customerName, email, transactionType }) {
    const payload = {
        amount: Math.round(Number(amountFcfa) || 0),
        payment_phone_number: normalizePhone(phone),
        customer_external_id: externalId,
        customer: {
            name: customerName || 'Client NokiPay',
            phone: normalizePhone(phone),
        },
        provider: process.env.OPENPAY_PROVIDER || 'MTN',
        metadata: {
            email: email || '',
            transaction_type: transactionType || 'buy',
        },
    };

    let response;
    try {
        response = await fetch(`${getBaseUrl()}/v1/transaction/payment`, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(payload),
        });
    } catch (error) {
        logOpenPayError('initiate_network_error', {
            message: error.message,
            paymentPhoneNumber: payload.payment_phone_number,
            provider: payload.provider,
            amount: payload.amount,
        });
        throw new Error('Impossible de joindre OpenPay pour le moment. Verifiez votre connexion serveur puis reessayez.');
    }

    const data = await parseApiResponse(response);
    if (!response.ok) {
        logOpenPayError('initiate_http_error', {
            status: response.status,
            apiMessage: extractApiMessage(data),
            paymentPhoneNumber: payload.payment_phone_number,
            provider: payload.provider,
            amount: payload.amount,
        });
        throw new Error(normalizeOpenPayError(response.status, data));
    }

    const referenceId = extractReferenceId(data, externalId);
    return {
        referenceId,
        status: extractStatus(data),
        provider: PAYMENT_PROVIDER_NAME,
        recipientPhone: normalizePhone(phone),
        apiAcknowledged: true,
        raw: data,
    };
}

function buildStatusCandidates(referenceId) {
    const customTemplate = process.env.OPENPAY_STATUS_ENDPOINT_TEMPLATE;
    if (customTemplate) {
        return [customTemplate.replace('{referenceId}', encodeURIComponent(referenceId))];
    }

    return [
        `/v1/transaction/status/${encodeURIComponent(referenceId)}`,
    ];
}

async function getPaymentStatus(referenceId) {
    ensureOpenPayConfig();

    let lastError = null;
    for (const candidate of buildStatusCandidates(referenceId)) {
        const url = candidate.startsWith('http') ? candidate : `${getBaseUrl()}${candidate}`;
        let response;
        try {
            response = await fetch(url, {
                method: 'GET',
                headers: buildHeaders(),
            });
        } catch (error) {
            logOpenPayError('status_network_error', {
                message: error.message,
                referenceId,
                url,
            });
            throw new Error('Impossible de verifier le statut OpenPay pour le moment. Reessayez dans un instant.');
        }

        if (response.status === 404) {
            lastError = new Error(`OpenPay status endpoint introuvable: ${url}`);
            continue;
        }

        const data = await parseApiResponse(response);
        if (!response.ok) {
            logOpenPayError('status_http_error', {
                status: response.status,
                apiMessage: extractApiMessage(data),
                referenceId,
                url,
            });
            throw new Error(normalizeOpenPayError(response.status, data));
        }

        return {
            referenceId: extractReferenceId(data, referenceId),
            status: extractStatus(data),
            provider: PAYMENT_PROVIDER_NAME,
            raw: data,
        };
    }

    throw lastError || new Error('Impossible de récupérer le statut OpenPay.');
}

module.exports = {
    PAYMENT_PROVIDER_NAME,
    normalizePhone,
    initiatePaymentRequest,
    getPaymentStatus,
};
