const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { getGoogleCallbackUrl } = require('./urls');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: getGoogleCallbackUrl(),
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ email: profile.emails[0].value });

        if (user) return done(null, user);

        user = await User.create({
            nom: profile.name.familyName || profile.displayName,
            prenom: profile.name.givenName || profile.displayName,
            email: profile.emails[0].value,
            password: Math.random().toString(36).slice(-12),
            pays: 'CG',
            isVerified: true,
        });

        const { sendWelcome } = require('../utils/emails');
        await sendWelcome(user);

        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

module.exports = passport;
