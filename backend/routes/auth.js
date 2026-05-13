const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendWelcome, sendOTP } = require('../utils/emails');
const { getFrontendUrl } = require('../config/urls');

function dispatchEmail(task, label) {
    Promise.resolve(task).catch((error) => {
        console.error(`[email:${label}]`, error.message);
    });
}

// Inscription
router.post('/register', async (req, res) => {
    try {
        const { nom, prenom, email, password, pays } = req.body;

        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: 'Email déjà utilisé' });

        const hashed = await bcrypt.hash(password, 12);
        const user = await User.create({ nom, prenom, email, password: hashed, pays });

        dispatchEmail(sendWelcome(user), 'welcome_register');

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

        res.status(201).json({ message: 'Compte créé avec succès', token, user: { id: user._id, nom, prenom, email, pays, role: user.role } });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// Connexion
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Email ou mot de passe incorrect' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: 'Email ou mot de passe incorrect' });

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

        res.json({ message: 'Connexion réussie', token, user: { id: user._id, nom: user.nom, prenom: user.prenom, email, pays: user.pays, role: user.role } });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// Demande OTP
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'Aucun compte avec cet email' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 15 * 60 * 1000);

        user.otpCode = otp;
        user.otpExpires = expires;
        await user.save();

        await sendOTP(user, otp);

        res.json({ message: 'Code OTP envoyé par email' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// Vérification OTP + nouveau mot de passe
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

        if (user.otpCode !== otp) return res.status(400).json({ message: 'Code OTP incorrect' });
        if (user.otpExpires < new Date()) return res.status(400).json({ message: 'Code OTP expiré' });

        user.password = await bcrypt.hash(newPassword, 12);
        user.otpCode = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.json({ message: 'Mot de passe réinitialisé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

const passport = require('../config/passport');

// Lancer Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Callback Google
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: `${getFrontendUrl()}/login` }),
    async (req, res) => {
        try {
            const jwt = require('jsonwebtoken');
            const token = jwt.sign(
                { id: req.user._id, role: req.user.role },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
            );

            const user = {
                id: req.user._id,
                nom: req.user.nom,
                prenom: req.user.prenom,
                email: req.user.email,
                pays: req.user.pays,
                role: req.user.role,
            };

            dispatchEmail(sendWelcome(req.user), 'welcome_google');
            res.redirect(`${getFrontendUrl()}/login?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
        } catch (error) {
            res.redirect(`${getFrontendUrl()}/login`);
        }
    }
);
const authMiddleware = require('../middleware/auth');

// Modifier profil
router.put('/update-profile', authMiddleware, async (req, res) => {
    try {
        const { nom, prenom, email, pays } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { nom, prenom, email, pays },
            { new: true }
        );
        res.json({ message: 'Profil mis à jour', user });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// Changer mot de passe
router.put('/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);

        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) return res.status(400).json({ message: 'Mot de passe actuel incorrect' });

        user.password = await bcrypt.hash(newPassword, 12);
        await user.save();

        res.json({ message: 'Mot de passe changé avec succès' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});
// Tous les utilisateurs (admin)
router.get('/users', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// Changer rôle utilisateur (admin)
router.put('/users/:id/role', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });
        const { role } = req.body;
        await User.findByIdAndUpdate(req.params.id, { role });
        res.json({ message: 'Rôle mis à jour' });
    } catch (error) {
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

module.exports = router;
