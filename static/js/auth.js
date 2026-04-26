/**
 * auth.js - Login and CAPTCHA Handling for India LIMS
 * Handles the login page forms: CAPTCHA verification and Admin login.
 */

document.addEventListener('DOMContentLoaded', function() {

    // --- Only run session check on login page ---
    const isLoginPage = window.location.pathname === '/login' || window.location.pathname === '/';
    if (isLoginPage) {
        checkSessionAndRedirect();
    }

    // --- Tab Navigation Handling ---
    const tabPublic = document.getElementById('tab-public');
    const tabAdmin = document.getElementById('tab-admin');
    const panelPublic = document.getElementById('panel-public');
    const panelAdmin = document.getElementById('panel-admin');

    if (tabPublic && tabAdmin && panelPublic && panelAdmin) {
        tabPublic.addEventListener('click', () => {
            panelPublic.classList.remove('hidden');
            panelAdmin.classList.add('hidden');
            
            // Active Public Tab
            tabPublic.classList.add('text-emerald-700', 'border-emerald-500', 'bg-emerald-50/50');
            tabPublic.classList.remove('text-gray-400', 'border-transparent', 'hover:text-orange-600', 'hover:bg-orange-50/30');
            
            // Inactive Admin Tab
            tabAdmin.classList.add('text-gray-400', 'border-transparent', 'hover:text-orange-600', 'hover:bg-orange-50/30');
            tabAdmin.classList.remove('text-orange-700', 'border-orange-500', 'bg-orange-50/50');
        });

        tabAdmin.addEventListener('click', () => {
            panelAdmin.classList.remove('hidden');
            panelPublic.classList.add('hidden');
            
            // Active Admin Tab
            tabAdmin.classList.add('text-orange-700', 'border-orange-500', 'bg-orange-50/50');
            tabAdmin.classList.remove('text-gray-400', 'border-transparent', 'hover:text-orange-600', 'hover:bg-orange-50/30');
            
            // Inactive Public Tab
            tabPublic.classList.add('text-gray-400', 'border-transparent', 'hover:text-emerald-600', 'hover:bg-emerald-50/30');
            tabPublic.classList.remove('text-emerald-700', 'border-emerald-500', 'bg-emerald-50/50');
        });
    }

    // --- CAPTCHA Form Handling ---
    const captchaForm = document.getElementById('captcha-form');
    const captchaAnswer = document.getElementById('captcha-answer');
    const captchaToken = document.getElementById('captcha-token');
    const captchaError = document.getElementById('captcha-error');
    const captchaQuestionEl = document.getElementById('captcha-question');

    if (captchaForm) {
        captchaForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const answer = captchaAnswer.value.trim();
            const token = captchaToken.value.trim();
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
                const result = await verifyCaptcha(answer, token);

                if (result.success) {
                    // Replace current history entry so back button doesn't return to login
                    window.location.replace(result.redirect || '/viewer');
                } else {
                    showCaptchaError(result.message || 'Incorrect answer. Please try again.');
                    // Update CAPTCHA question if a new one was provided
                    if (result.new_question && captchaQuestionEl) {
                        captchaQuestionEl.textContent = result.new_question;
                    }
                    if (result.new_token && captchaToken) {
                        captchaToken.value = result.new_token;
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

    const refreshCaptchaBtn = document.getElementById('refresh-captcha');
    if (refreshCaptchaBtn && captchaQuestionEl && captchaToken) {
        refreshCaptchaBtn.addEventListener('click', async function() {
            try {
                // Optionally show a spinning state
                const originalIcon = refreshCaptchaBtn.innerHTML;
                refreshCaptchaBtn.innerHTML = '<span class="spinner w-4 h-4 mr-1"></span> Regenerating...';
                refreshCaptchaBtn.disabled = true;

                const result = await getCaptcha();
                if (result.question && result.token) {
                    captchaQuestionEl.textContent = result.question;
                    captchaToken.value = result.token;
                    captchaAnswer.value = '';
                    captchaAnswer.focus();
                } else {
                    showCaptchaError('Failed to get new CAPTCHA.');
                }
                
                refreshCaptchaBtn.innerHTML = originalIcon;
                refreshCaptchaBtn.disabled = false;
            } catch (err) {
                showCaptchaError('Error refreshing CAPTCHA.');
                refreshCaptchaBtn.disabled = false;
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

    // --- Admin Login Form Handling ---
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

    const forgotBtn = document.getElementById('btn-forgot-password');
    if (forgotBtn) {
        forgotBtn.addEventListener('click', async () => {
            try {
                const data = await forgotPassword();
                // We use showConfirmModal just as a styled alert here
                showConfirmModal(data.instructions || 'Please contact your administrator.', null);
            } catch (err) {
                showLoginError('Could not fetch recovery instructions.');
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

    // --- Logout Button (present on admin & viewer pages) ---
    // Logout logic should be handled by specific pages to avoid conflicts
});

// --- Session Check Helper ---
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
