const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const Order = require('../models/Order');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { RATES, getNetworks, getDepositAddress } = require('../config/transactions');
const { initiatePaymentRequest, getPaymentStatus, PAYMENT_PROVIDER_NAME } = require('../services/openpay');
const { sendTransactionPending, sendTransactionValidated, sendAdminAlert } = require('../utils/emails');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');

function statusLabel(status) {
    if (status === 'validated') return 'validated';
    if (status === 'rejected') return 'rejected';
    if (status === 'pending_payment') return 'pending_payment';
    if (status === 'failed') return 'failed';
    return 'pending';
}

function formatPublicOrder(order) {
    return {
        _id: order._id,
        reference: order.reference,
        type: order.type,
        status: statusLabel(order.status),
        email: order.email,
        phone: order.phone,
        crypto: order.crypto,
        network: order.network,
        amountUsd: order.amountUsd,
        amountFcfa: order.amountFcfa,
        amountCrypto: order.amountCrypto,
        rateApplied: order.rateApplied,
        walletAddress: order.walletAddress,
        binanceId: order.binanceId,
        payoutNumber: order.payoutNumber,
        depositAddress: order.depositAddress,
        screenshotUrl: order.screenshotPath ? `/uploads/${path.basename(order.screenshotPath)}` : '',
        exchangeFrom: order.exchangeFrom,
        exchangeTo: order.exchangeTo,
        exchangeNetworkFrom: order.exchangeNetworkFrom,
        exchangeNetworkTo: order.exchangeNetworkTo,
        exchangeFeePercent: order.exchangeFeePercent,
        exchangeFeeAccepted: order.exchangeFeeAccepted,
        paymentReference: order.paymentReference,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
    };
}

function normalizeEmail(email) {
    return `${email || ''}`.trim().toLowerCase();
}

function firstNameFromEmail(email) {
    return normalizeEmail(email).split('@')[0] || 'client';
}

function parseNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function normalizePaymentStatus(status) {
    return `${status || ''}`.trim().toLowerCase();
}

function dispatchEmail(task, label) {
    Promise.resolve(task).catch((error) => {
        console.error(`[email:${label}]`, error.message);
    });
}

function isSuccessfulPaymentStatus(status) {
    return normalizePaymentStatus(status) === 'success';
}

function isFailedPaymentStatus(status) {
    const normalized = normalizePaymentStatus(status);
    return normalized === 'failed' || normalized === 'cancelled';
}

function validateScreenshotDataUrl(dataUrl) {
    return typeof dataUrl === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(dataUrl);
}

async function saveScreenshot(dataUrl, fileNamePrefix) {
    if (!validateScreenshotDataUrl(dataUrl)) return { screenshotPath: '', screenshotName: '' };

    await fs.mkdir(uploadsDir, { recursive: true });

    const [, mime, base64Data] = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/) || [];
    const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `${fileNamePrefix}-${Date.now()}.${extension}`;
    const filePath = path.join(uploadsDir, fileName);

    await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));

    return {
        screenshotPath: filePath,
        screenshotName: fileName,
    };
}

async function resolveLinkedUser(req, email) {
    if (req.user?.id) {
        return User.findById(req.user.id);
    }

    return User.findOne({ email: normalizeEmail(email) });
}

router.get('/meta', async (_req, res) => {
    res.json({
        rates: RATES,
        networks: {
            USDT: getNetworks('USDT'),
            BTC: getNetworks('BTC'),
            ETH: getNetworks('ETH'),
            BNB: getNetworks('BNB'),
            SOL: getNetworks('SOL'),
            XRP: getNetworks('XRP'),
        },
        depositAddresses: {
            USDT: {
                TRC20: getDepositAddress('USDT', 'TRC20'),
                BEP20: getDepositAddress('USDT', 'BEP20'),
                ERC20: getDepositAddress('USDT', 'ERC20'),
            },
            BTC: {
                BTC: getDepositAddress('BTC', 'BTC'),
                BEP20: getDepositAddress('BTC', 'BEP20'),
            },
            ETH: {
                ERC20: getDepositAddress('ETH', 'ERC20'),
                BEP20: getDepositAddress('ETH', 'BEP20'),
            },
            BNB: {
                BEP20: getDepositAddress('BNB', 'BEP20'),
            },
            SOL: {
                SOL: getDepositAddress('SOL', 'SOL'),
            },
            XRP: {
                XRP: getDepositAddress('XRP', 'XRP'),
            },
        },
    });
});

router.post('/payment/initiate', authMiddleware, async (req, res) => {
    try {
        const { phone, amountFcfa, email, type } = req.body;
        if (!phone || !amountFcfa || !email) {
            return res.status(400).json({ message: 'Téléphone, montant et email sont requis.' });
        }

        const externalId = crypto.randomUUID();
        const payment = await initiatePaymentRequest({
            amountFcfa,
            phone,
            externalId,
            customerName: req.user?.prenom || firstNameFromEmail(email),
            email: normalizeEmail(email),
            transactionType: type || 'buy',
        });

        return res.status(201).json(payment);
    } catch (error) {
        const status = error.code === 'OPENPAY_CONFIG_MISSING' ? 503 : 500;
        return res.status(status).json({ message: error.message });
    }
});

router.get('/payment/:referenceId', authMiddleware, async (req, res) => {
    try {
        const data = await getPaymentStatus(req.params.referenceId);
        res.json(data);
    } catch (error) {
        const status = error.code === 'OPENPAY_STATUS_ENDPOINT_UNAVAILABLE' ? 503 : 500;
        res.status(status).json({
            message: error.message,
            code: error.code || 'OPENPAY_STATUS_ERROR',
        });
    }
});

router.post('/payment/callback', async (req, res) => {
    try {
        const payload = req.body || {};
        const paymentReference = `${payload.reference || payload.referenceId || ''}`.trim();
        const paymentStatus = normalizePaymentStatus(payload.status);

        if (!paymentReference) {
            return res.status(200).json({ success: true, ignored: true, reason: 'missing_reference' });
        }

        const order = await Order.findOne({ paymentReference });
        if (!order) {
            return res.status(200).json({ success: true, ignored: true, reason: 'order_not_found' });
        }

        order.paymentReference = paymentReference;
        order.paymentProvider = PAYMENT_PROVIDER_NAME;
        order.paymentStatus = paymentStatus || order.paymentStatus;

        if (isFailedPaymentStatus(paymentStatus)) {
            order.status = 'failed';
        } else if (isSuccessfulPaymentStatus(paymentStatus) && order.status === 'pending_payment') {
            order.status = 'pending';
        }

        await order.save();

        return res.status(200).json({ success: true });
    } catch (_error) {
        return res.status(200).json({ success: true });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const type = req.body.type;
        if (!['buy', 'sell', 'exchange'].includes(type)) {
            return res.status(400).json({ message: 'Type de transaction invalide.' });
        }

        const email = normalizeEmail(req.body.email);
        const phone = `${req.body.phone || ''}`.trim();

        if (!email) {
            return res.status(400).json({ message: 'Email requis.' });
        }

        const linkedUser = await resolveLinkedUser(req, email);
        const reference = `NKP-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const screenshot = await saveScreenshot(req.body.screenshotDataUrl, reference);

        const baseOrder = {
            user: linkedUser?._id || null,
            email,
            phone,
            reference,
            type,
            status: 'pending',
            screenshotPath: screenshot.screenshotPath,
            screenshotName: screenshot.screenshotName,
            notes: `${req.body.notes || ''}`.trim(),
        };

        let orderPayload;

        if (type === 'buy') {
            if (!phone) {
                return res.status(400).json({ message: 'Le numéro mobile money est requis pour l’achat.' });
            }
            const paymentReference = `${req.body.paymentReference || ''}`.trim();
            if (!paymentReference) {
                return res.status(400).json({ message: 'Le paiement OpenPay doit être initié avant la soumission.' });
            }

            const paymentStatus = await getPaymentStatus(paymentReference);
            const normalizedPaymentStatus = `${paymentStatus.status || ''}`.toUpperCase();
            if (!['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'PAID'].includes(normalizedPaymentStatus)) {
                return res.status(400).json({ message: `Le paiement OpenPay n'est pas confirmé. Statut actuel: ${paymentStatus.status || 'inconnu'}` });
            }

            const cryptoCode = `${req.body.crypto || ''}`.trim();
            const network = `${req.body.network || ''}`.trim();
            const amountUsd = parseNumber(req.body.amountUsd);

            orderPayload = {
                ...baseOrder,
                crypto: cryptoCode,
                network,
                amountUsd,
                amountFcfa: Math.round(amountUsd * RATES.buy),
                amountCrypto: 0,
                rateApplied: RATES.buy,
                paymentReference,
                paymentStatus: paymentStatus.status || 'SUCCESSFUL',
                paymentProvider: PAYMENT_PROVIDER_NAME,
                walletAddress: `${req.body.walletAddress || ''}`.trim(),
                binanceId: `${req.body.binanceId || ''}`.trim(),
            };

            if (!orderPayload.walletAddress && !orderPayload.binanceId) {
                return res.status(400).json({ message: 'Adresse crypto ou ID Binance requis.' });
            }
        }

        if (type === 'sell') {
            if (!phone) {
                return res.status(400).json({ message: 'Le numéro de téléphone est requis pour la vente.' });
            }
            const cryptoCode = `${req.body.crypto || ''}`.trim();
            const network = `${req.body.network || ''}`.trim();
            const amountCrypto = parseNumber(req.body.amountCrypto);
            const amountUsd = parseNumber(req.body.amountUsd);
            const depositAddress = getDepositAddress(cryptoCode, network);

            if (!depositAddress) {
                return res.status(400).json({ message: 'Aucune adresse de dépôt configurée pour cette crypto et ce réseau.' });
            }

            orderPayload = {
                ...baseOrder,
                crypto: cryptoCode,
                network,
                amountCrypto,
                amountUsd,
                amountFcfa: Math.round(amountUsd * RATES.sell),
                rateApplied: RATES.sell,
                payoutNumber: phone,
                depositAddress,
            };
        }

        if (type === 'exchange') {
            const exchangeFrom = `${req.body.exchangeFrom || ''}`.trim();
            const exchangeTo = `${req.body.exchangeTo || ''}`.trim();
            const exchangeNetworkFrom = `${req.body.exchangeNetworkFrom || ''}`.trim();
            const exchangeNetworkTo = `${req.body.exchangeNetworkTo || ''}`.trim();
            const amountUsd = parseNumber(req.body.amountUsd);
            const depositAddress = getDepositAddress(exchangeFrom, exchangeNetworkFrom);
            const walletAddress = `${req.body.walletAddress || ''}`.trim();
            const exchangeFeeAccepted = !!req.body.exchangeFeeAccepted;

            if (!exchangeFeeAccepted) {
                return res.status(400).json({ message: 'Les frais de 2% doivent être acceptés pour poursuivre l’échange.' });
            }
            if (!depositAddress) {
                return res.status(400).json({ message: 'Aucune adresse de dépôt configurée pour cette crypto source et ce réseau.' });
            }
            if (!walletAddress) {
                return res.status(400).json({ message: 'Adresse de réception requise pour l’échange.' });
            }

            orderPayload = {
                ...baseOrder,
                amountUsd,
                rateApplied: RATES.exchangeFeePercent,
                exchangeFrom,
                exchangeTo,
                exchangeNetworkFrom,
                exchangeNetworkTo,
                depositAddress,
                walletAddress,
                exchangeFeePercent: RATES.exchangeFeePercent,
                exchangeFeeAccepted,
            };
        }

        if (!orderPayload.screenshotPath) {
            return res.status(400).json({ message: 'La capture d’écran est requise.' });
        }

        const order = await Order.create(orderPayload);

        dispatchEmail(sendTransactionPending(order.email, linkedUser?.prenom || firstNameFromEmail(order.email), order), 'transaction_pending');
        dispatchEmail(sendAdminAlert(order), 'admin_alert');

        res.status(201).json({
            message: 'Transaction créée avec succès.',
            order: formatPublicOrder(order),
        });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

router.get('/mes-commandes', authMiddleware, async (req, res) => {
    try {
        const account = await User.findById(req.user.id).select('email');
        const orders = await Order.find({
            $or: [
                { user: req.user.id },
                { email: account?.email || '__no_match__' },
            ],
        }).sort({ createdAt: -1 });
        res.json(orders.map(formatPublicOrder));
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

router.get('/all', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });
        const orders = await Order.find().populate('user', 'nom prenom email').sort({ createdAt: -1 });
        res.json(orders.map((order) => ({
            ...formatPublicOrder(order),
            user: order.user ? {
                id: order.user._id,
                nom: order.user.nom,
                prenom: order.user.prenom,
                email: order.user.email,
            } : null,
        })));
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

router.put('/:id/status', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });

        const { status } = req.body;
        if (!['pending', 'validated', 'rejected', 'failed'].includes(status)) {
            return res.status(400).json({ message: 'Statut invalide.' });
        }

        const order = await Order.findById(req.params.id).populate('user', 'prenom');
        if (!order) return res.status(404).json({ message: 'Commande introuvable.' });

        order.status = status;
        await order.save();

        if (status === 'validated') {
            dispatchEmail(sendTransactionValidated(order.email, order.user?.prenom || firstNameFromEmail(order.email), order), 'transaction_validated');
        }

        res.json({ message: 'Statut mis à jour', order: formatPublicOrder(order) });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

module.exports = router;
