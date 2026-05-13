function resolveApiBase() {
    const configured = window.NOKIPAY_API_URL?.trim();
    if (configured) {
        return configured.replace(/\/$/, '').endsWith('/api')
            ? configured.replace(/\/$/, '')
            : `${configured.replace(/\/$/, '')}/api`;
    }

    if (window.location.protocol === 'file:') {
        return 'http://localhost:5000/api';
    }

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        if (window.location.port === '5000') {
            return `${window.location.origin}/api`;
        }

        return `${window.location.protocol}//${window.location.hostname}:5000/api`;
    }

    if (window.location.port === '5000') {
        return `${window.location.origin}/api`;
    }

    return `${window.location.origin}/api`;
}

const API = resolveApiBase();
const existingToken = localStorage.getItem('token');
const AUTH_PAGES = new Set(['/login', '/register', '/login.html', '/register.html']);

if (existingToken && AUTH_PAGES.has(window.location.pathname)) {
    window.location.href = '/dashboard';
}

// Récupérer token Google après callback
const urlParams = new URLSearchParams(window.location.search);
const googleToken = urlParams.get('token');
const googleUser = urlParams.get('user');

if (googleToken && googleUser) {
    localStorage.setItem('token', googleToken);
    localStorage.setItem('user', googleUser);
    window.location.href = '/dashboard';
}

// Toggle mot de passe
function togglePassword(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input || !toggle) return;

    toggle.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        toggle.textContent = isHidden ? '🙈' : '👁';
    });
}

togglePassword('password', 'toggle-pw');
togglePassword('confirm-password', 'toggle-confirm');

// Force du mot de passe
const passwordInput = document.getElementById('password');
const strengthFill = document.getElementById('strength-fill');
const strengthLabel = document.getElementById('strength-label');

if (passwordInput) {
    passwordInput.addEventListener('input', () => {
        const val = passwordInput.value;
        let score = 0;

        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const levels = [
            { width: '0%',   color: 'transparent', label: '',       style: '' },
            { width: '33%',  color: '#F44336',      label: 'Faible', style: 'color: #F44336' },
            { width: '66%',  color: '#FF9800',      label: 'Moyen',  style: 'color: #FF9800' },
            { width: '100%', color: '#4CAF50',      label: 'Fort',   style: 'color: #4CAF50' },
        ];

        const level = val.length === 0 ? 0 : score <= 1 ? 1 : score <= 3 ? 2 : 3;
        strengthFill.style.width = levels[level].width;
        strengthFill.style.background = levels[level].color;
        strengthLabel.textContent = levels[level].label;
        strengthLabel.style.cssText = levels[level].style;
    });
}

// Confirmation mot de passe
const confirmInput = document.getElementById('confirm-password');
const matchLabel = document.getElementById('match-label');

if (confirmInput) {
    confirmInput.addEventListener('input', () => {
        if (confirmInput.value === '') { matchLabel.textContent = ''; return; }
        const match = confirmInput.value === passwordInput.value;
        matchLabel.textContent = match ? '✓ Les mots de passe correspondent' : '✗ Ne correspondent pas';
        matchLabel.style.color = match ? '#4CAF50' : '#F44336';
    });
}

// Bouton Google
const googleBtn = document.querySelector('.google-btn');
if (googleBtn) {
    googleBtn.addEventListener('click', () => {
        window.location.href = `${API.replace('/api', '')}/api/auth/google`;
    });
}

// Afficher erreur ou succès
function showMessage(msg, type = 'error') {
    let box = document.getElementById('auth-message');
    if (!box) {
        box = document.createElement('div');
        box.id = 'auth-message';
        document.querySelector('.auth-card')?.prepend(box);
    }
    box.textContent = msg;
    box.style.cssText = `
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        margin-bottom: 16px;
        background: ${type === 'error' ? 'rgba(244,67,54,0.1)' : 'rgba(76,175,80,0.1)'};
        color: ${type === 'error' ? '#F44336' : '#4CAF50'};
        border: 1px solid ${type === 'error' ? 'rgba(244,67,54,0.3)' : 'rgba(76,175,80,0.3)'};
    `;
}

function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Chargement...' : btn.dataset.label;
}

// Inscription
const registerForm = document.getElementById('register-form');
if (registerForm) {
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    submitBtn.dataset.label = submitBtn.textContent;

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nom = document.getElementById('nom').value.trim();
        const prenom = document.getElementById('prenom').value.trim();
        const email = document.getElementById('email').value.trim();
        const pays = document.getElementById('pays').value;
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm-password').value;
        const cgu = document.getElementById('cgu').checked;

        if (!nom || !prenom || !email || !password || !confirm) {
            return showMessage('Veuillez remplir tous les champs.');
        }
        if (password !== confirm) {
            return showMessage('Les mots de passe ne correspondent pas.');
        }
        if (!cgu) {
            return showMessage('Veuillez accepter les conditions d\'utilisation.');
        }

        setLoading(submitBtn, true);

        try {
            const res = await fetch(`${API}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nom, prenom, email, password, pays }),
            });

            const data = await res.json();

            if (!res.ok) return showMessage(data.message || 'Erreur lors de l\'inscription.');

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            showMessage('Compte créé ! Redirection...', 'success');
            setTimeout(() => window.location.href = '/dashboard', 1500);

        } catch {
            showMessage('Impossible de contacter le serveur.');
        } finally {
            setLoading(submitBtn, false);
        }
    });
}

// Connexion
const loginForm = document.getElementById('login-form');
if (loginForm) {
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.dataset.label = submitBtn.textContent;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) return showMessage('Veuillez remplir tous les champs.');

        setLoading(submitBtn, true);

        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) return showMessage(data.message || 'Erreur de connexion.');

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            showMessage('Connexion réussie ! Redirection...', 'success');
            setTimeout(() => window.location.href = '/dashboard', 1500);

        } catch {
            showMessage('Impossible de contacter le serveur.');
        } finally {
            setLoading(submitBtn, false);
        }
    });
}

// Réinitialisation — étape 1 : demande OTP
const resetForm = document.getElementById('reset-form');
if (resetForm) {
    const submitBtn = resetForm.querySelector('button[type="submit"]');
    submitBtn.dataset.label = submitBtn.textContent;
    let resetStep = 'request';
    let resetEmail = '';

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (resetStep === 'request') {
            const emailField = document.getElementById('reset-email');
            const email = emailField?.value.trim();
            if (!email) return showMessage('Veuillez entrer votre adresse email.');

            setLoading(submitBtn, true);

            try {
                const res = await fetch(`${API}/auth/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });

                const data = await res.json();
                if (!res.ok) return showMessage(data.message || 'Erreur.');

                resetEmail = email;
                resetStep = 'confirm';
                resetForm.innerHTML = `
                    <div class="form-group">
                        <label>Code OTP reçu par email</label>
                        <input type="text" id="otp-code" placeholder="Ex: 483920" maxlength="6" />
                    </div>
                    <div class="form-group">
                        <label>Nouveau mot de passe</label>
                        <input type="password" id="new-password" placeholder="Minimum 8 caractères" />
                    </div>
                    <button type="submit" class="btn-primary btn-full">Réinitialiser</button>
                `;

                showMessage(`Code OTP envoyé à ${email}`, 'success');
            } catch {
                showMessage('Impossible de contacter le serveur.');
            } finally {
                setLoading(submitBtn, false);
            }

            return;
        }

        const otp = document.getElementById('otp-code')?.value.trim();
        const newPassword = document.getElementById('new-password')?.value;

        if (!otp || !newPassword) return showMessage('Veuillez remplir tous les champs.');

        const confirmBtn = resetForm.querySelector('button[type="submit"]');
        if (confirmBtn) {
            confirmBtn.dataset.label = confirmBtn.textContent;
            setLoading(confirmBtn, true);
        }

        try {
            const res = await fetch(`${API}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: resetEmail, otp, newPassword }),
            });

            const data = await res.json();
            if (!res.ok) return showMessage(data.message || 'Erreur.');

            showMessage('Mot de passe réinitialisé !', 'success');
            setTimeout(() => window.location.href = '/login', 2000);
        } catch {
            showMessage('Impossible de contacter le serveur.');
        } finally {
            if (confirmBtn) {
                setLoading(confirmBtn, false);
            }
        }
    });
}
