require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const passport = require('./config/passport');
const connectDB = require('./config/db');

const app = express();
const frontendDir = path.join(__dirname, '..', 'frontend');

connectDB();

app.use(cors({
    origin(origin, callback) {
        // Allow browser requests from the configured frontend, local dev origins,
        // and non-browser tools that do not send an Origin header.
        if (!origin) return callback(null, true);

        const allowedOrigins = new Set([
            process.env.FRONTEND_URL,
            'http://localhost:3000',
            'http://127.0.0.1:3000',
        ].filter(Boolean));

        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        try {
            const requestUrl = new URL(origin);
            const configuredUrl = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL) : null;

            if (
                requestUrl.hostname === 'localhost' ||
                requestUrl.hostname === '127.0.0.1' ||
                (configuredUrl && requestUrl.hostname === configuredUrl.hostname)
            ) {
                return callback(null, true);
            }
        } catch (error) {
            return callback(error);
        }

        return callback(new Error(`Origin non autorisée: ${origin}`));
    },
    credentials: true,
}));
app.use(express.json({ limit: '12mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use(express.static(frontendDir));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'nokipay-api' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Serveur NokiPay démarré sur le port ${PORT}`));
