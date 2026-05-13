const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    reference: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['buy', 'sell', 'exchange'], required: true },
    status: {
        type: String,
        enum: ['pending_payment', 'pending', 'validated', 'rejected', 'failed'],
        default: 'pending',
    },
    crypto: { type: String, default: '' },
    network: { type: String, default: '' },
    amountUsd: { type: Number, default: 0 },
    amountFcfa: { type: Number, default: 0 },
    amountCrypto: { type: Number, default: 0 },
    rateApplied: { type: Number, default: 0 },
    paymentReference: { type: String, default: '' },
    paymentStatus: { type: String, default: '' },
    paymentProvider: { type: String, default: '' },
    walletAddress: { type: String, default: '' },
    binanceId: { type: String, default: '' },
    payoutNumber: { type: String, default: '' },
    depositAddress: { type: String, default: '' },
    screenshotPath: { type: String, default: '' },
    screenshotName: { type: String, default: '' },
    notes: { type: String, default: '' },
    exchangeFrom: { type: String, default: '' },
    exchangeTo: { type: String, default: '' },
    exchangeNetworkFrom: { type: String, default: '' },
    exchangeNetworkTo: { type: String, default: '' },
    exchangeFeePercent: { type: Number, default: 0 },
    exchangeFeeAccepted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
