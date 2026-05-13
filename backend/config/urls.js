function normalizeUrl(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed) return null;

    try {
        return new URL(trimmed).toString().replace(/\/$/, '');
    } catch {
        return null;
    }
}

function firstValidUrl(...values) {
    for (const value of values) {
        const normalized = normalizeUrl(value);
        if (normalized) return normalized;
    }

    return null;
}

function getPublicAppUrl() {
    const renderUrl = process.env.RENDER_EXTERNAL_URL
        || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : null);

    const frontendUrl = normalizeUrl(process.env.FRONTEND_URL);
    const callbackUrl = normalizeUrl(process.env.GOOGLE_CALLBACK_URL);

    const frontendIsLocal = frontendUrl && /localhost|127\.0\.0\.1/.test(frontendUrl);
    const callbackIsLocal = callbackUrl && /localhost|127\.0\.0\.1/.test(callbackUrl);

    return firstValidUrl(
        process.env.PUBLIC_APP_URL,
        renderUrl,
        frontendIsLocal ? null : frontendUrl,
        callbackIsLocal ? null : callbackUrl && callbackUrl.replace(/\/api\/auth\/google\/callback$/, ''),
        'http://localhost:5000'
    );
}

function getFrontendUrl() {
    return getPublicAppUrl();
}

function getGoogleCallbackUrl() {
    const explicit = normalizeUrl(process.env.GOOGLE_CALLBACK_URL);
    const explicitIsLocal = explicit && /localhost|127\.0\.0\.1/.test(explicit);

    if (process.env.NODE_ENV === 'production' && explicitIsLocal) {
        return `${getPublicAppUrl()}/api/auth/google/callback`;
    }

    return explicit || `${getPublicAppUrl()}/api/auth/google/callback`;
}

module.exports = {
    getFrontendUrl,
    getGoogleCallbackUrl,
    getPublicAppUrl,
};
