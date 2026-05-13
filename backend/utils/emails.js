const transporter = require('../config/mailer');

function appShell(title, body) {
    return `
    <div style="font-family:Poppins,sans-serif;background:#1C1C1C;padding:40px;color:#fff;max-width:600px;margin:0 auto;border-radius:16px;">
        <h1 style="color:#E8C96A;">Noki<span style="color:#fff;">Pay</span></h1>
        <h2 style="margin-top:24px;">${title}</h2>
        ${body}
        <p style="color:#8A8578;font-size:12px;margin-top:40px;">© 2025 NokiPay. Tous droits réservés.</p>
    </div>
    `;
}

function typeLabel(type) {
    return type === 'buy' ? 'Achat' : type === 'sell' ? 'Vente' : type === 'exchange' ? 'Echange' : type;
}

function transactionSummary(order) {
    const lines = [];

    lines.push(`<p style="margin:8px 0;color:#8A8578;">Référence : <span style="color:#fff;">${order.reference}</span></p>`);
    lines.push(`<p style="margin:8px 0;color:#8A8578;">Type : <span style="color:#fff;">${typeLabel(order.type)}</span></p>`);

    if (order.type === 'exchange') {
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Vous envoyez : <span style="color:#fff;">${order.exchangeFrom} (${order.exchangeNetworkFrom})</span></p>`);
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Vous recevez : <span style="color:#fff;">${order.exchangeTo} (${order.exchangeNetworkTo})</span></p>`);
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Montant USD : <span style="color:#E8C96A;">$${Number(order.amountUsd || 0).toFixed(2)}</span></p>`);
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Frais admin : <span style="color:#fff;">${order.exchangeFeePercent || 0}% ${order.exchangeFeeAccepted ? '(acceptés)' : ''}</span></p>`);
    } else {
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Crypto : <span style="color:#fff;">${order.crypto}</span></p>`);
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Réseau : <span style="color:#fff;">${order.network}</span></p>`);
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Montant crypto : <span style="color:#fff;">${Number(order.amountCrypto || 0)}</span></p>`);
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Montant USD : <span style="color:#fff;">$${Number(order.amountUsd || 0).toFixed(2)}</span></p>`);
        lines.push(`<p style="margin:8px 0;color:#8A8578;">Montant FCFA : <span style="color:#E8C96A;">${Math.round(order.amountFcfa || 0).toLocaleString('fr-FR')} FCFA</span></p>`);
    }

    return `
    <div style="background:#222;border:1px solid rgba(232,201,106,0.3);border-radius:12px;padding:24px;margin:24px 0;">
        ${lines.join('')}
    </div>
    `;
}

const sendWelcome = async (user) => {
    await transporter.sendMail({
        from: `"NokiPay" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Bienvenue sur NokiPay',
        html: appShell(
            `Bienvenue ${user.prenom} !`,
            `
            <p style="color:#8A8578;line-height:1.7;">Votre compte NokiPay a été créé avec succès. Vous pouvez maintenant acheter, vendre et échanger vos cryptomonnaies.</p>
            <a href="${process.env.FRONTEND_URL}/login.html" style="display:inline-block;margin-top:24px;background:#E8C96A;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Accéder à mon compte</a>
            `
        ),
    });
};

const sendOTP = async (user, otp) => {
    await transporter.sendMail({
        from: `"NokiPay" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Code de réinitialisation NokiPay',
        html: appShell(
            'Réinitialisation du mot de passe',
            `
            <p style="color:#8A8578;line-height:1.7;">Voici votre code OTP valable 15 minutes :</p>
            <div style="background:#222;border:1px solid #E8C96A;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
                <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#E8C96A;">${otp}</span>
            </div>
            <p style="color:#8A8578;font-size:13px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            `
        ),
    });
};

const sendTransactionPending = async (email, firstName, order) => {
    await transporter.sendMail({
        from: `"NokiPay" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `${typeLabel(order.type)} en attente - ${order.reference}`,
        html: appShell(
            'Votre transaction est en attente',
            `
            <p style="color:#8A8578;line-height:1.7;">Bonjour ${firstName || ''}, votre transaction a bien été reçue. Elle est maintenant en attente de vérification par notre équipe.</p>
            ${transactionSummary(order)}
            <p style="color:#8A8578;line-height:1.7;">Vous recevrez un nouvel email dès que la transaction sera confirmée par l’administrateur.</p>
            `
        ),
    });
};

const sendTransactionValidated = async (email, firstName, order) => {
    await transporter.sendMail({
        from: `"NokiPay" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `${typeLabel(order.type)} confirmée - ${order.reference}`,
        html: appShell(
            'Votre transaction a été confirmée',
            `
            <p style="color:#8A8578;line-height:1.7;">Bonjour ${firstName || ''}, votre transaction a été confirmée et traitée par l’équipe NokiPay.</p>
            ${transactionSummary(order)}
            <p style="color:#8A8578;line-height:1.7;">Merci d’avoir utilisé NokiPay.</p>
            `
        ),
    });
};

const sendAdminAlert = async (order) => {
    await transporter.sendMail({
        from: `"NokiPay Admin" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: `Nouvelle transaction ${typeLabel(order.type)} - ${order.reference}`,
        html: appShell(
            'Nouvelle transaction reçue',
            `
            <p style="color:#8A8578;line-height:1.7;">Une nouvelle transaction client nécessite une vérification dans le panel admin.</p>
            ${transactionSummary(order)}
            <p style="color:#8A8578;line-height:1.7;">Email client : <span style="color:#fff;">${order.email}</span><br>Téléphone : <span style="color:#fff;">${order.phone}</span></p>
            `
        ),
    });
};

module.exports = {
    sendWelcome,
    sendOTP,
    sendTransactionPending,
    sendTransactionValidated,
    sendAdminAlert,
};
