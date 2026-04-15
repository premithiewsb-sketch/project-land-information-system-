/**
 * auth.js - Login and CAPTCHA Handling for India LIMS
 * Handles the login page forms: CAPTCHA verification and Admin login.
 */

document.addEventListener('DOMContentLoaded', function() {

    // ─── Only run session check on login page ───────────────────────────────
    const isLoginPage = window.location.pathname === '/login' || window.location.pathname === '/';
    if (isLoginPage) {
        checkSessionAndRedirect();
    }

    // ─── CAPTCHA Form Handling ──────────────────────────────────────────────
    const captchaForm = document.getElementById('captcha-form');
    const captchaAnswer = document.getElementById('captcha-answer');
    const captchaError = document.getElementById('captcha-error');
    const captchaQuestionEl = document.getElementById('captcha-question');

    if (captchaForm) {
        captchaForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const answer = captchaAnswer.value.trim();
            if (!answer) {
                showCaptchaError('Please enter the answer.');
                return;
            }

            // Disable button while processing
            const submitBtn = captchaForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Verifying...';

            try {
                const result = await verifyCaptcha(answer);

                if (result.success) {
                    // Replace current history entry so back button doesn't return to login
                    window.location.replace(result.redirect || '/viewer');
                } else {
                    showCaptchaError(result.message || 'Incorrect answer. Please try again.');
                    // Update CAPTCHA question if a new one was provided
                    if (result.new_question && captchaQuestionEl) {
                        captchaQuestionEl.textContent = result.new_question;
                    }
                    captchaAnswer.value = '';
                    captchaAnswer.focus();
                }
            } catch (err) {
                showCaptchaError('An error occurred. Please try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    function showCaptchaError(msg) {
        if (captchaError) {
            captchaError.textContent = msg;
            captchaError.classList.remove('hidden');
            setTimeout(() => captchaError.classList.add('hidden'), 5000);
        }
    }

    // ─── Admin Login Form Handling ──────────────────────────────────────────
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');

    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const username = usernameInput.value.trim();
            const password = passwordInput.value;

            if (!username || !password) {
                showLoginError('Please enter both username and password.');
                return;
            }

            // Disable button while processing
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';

            try {
                const result = await adminLogin(username, password);

                if (result.success) {
                    // Redirect to admin dashboard
                    window.location.replace(result.redirect || '/admin');
                } else {
                    showLoginError(result.error || 'Invalid credentials.');
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            } catch (err) {
                showLoginError('An error occurred during login. Please try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    function showLoginError(msg) {
        if (loginError) {
            loginError.textContent = msg;
            loginError.classList.remove('hidden');
            setTimeout(() => loginError.classList.add('hidden'), 5000);
        }
    }

    // ─── Logout Button (present on admin & viewer pages) ────────────────────
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            try {
                await logout();
                // Clear browser history and redirect to login
                window.location.replace('/login');
            } catch (err) {
                // Ignore errors, redirect anyway
                window.location.replace('/login');
            }
        });
    }
});

// ─── Session Check Helper ────────────────────────────────────────────────────
async function checkSessionAndRedirect() {
    // Check sessionStorage cache first (5-minute TTL)
    const CACHE_KEY = 'lims_session_cache';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
    try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const { timestamp, sessionInfo } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_TTL) {
                // Use cached session
                if (sessionInfo.is_authenticated) {
                    if (sessionInfo.role === 'admin') {
                        window.location.replace('/admin');
                    } else if (sessionInfo.role === 'viewer') {
                        window.location.replace('/viewer');
                    }
                }
                return;
            }
        }
    } catch (err) {
        // Cache invalid, continue to API call
    }
    
    try {
        const sessionInfo = await getSessionInfo();
        
        // Update cache
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                sessionInfo
            }));
        } catch (err) {
            // sessionStorage not available, ignore
        }
        
        if (sessionInfo.is_authenticated) {
            // User is already logged in, redirect to their dashboard
            if (sessionInfo.role === 'admin') {
                window.location.replace('/admin');
            } else if (sessionInfo.role === 'viewer') {
                window.location.replace('/viewer');
            }
        }
    } catch (err) {
        // Session check failed, stay on login page
        console.log('No active session found');
    }
}
