/**
 * api.js - Backend API Communication Module for India LIMS
 * All fetch calls to the Flask REST API are centralized here.
 */

const API_BASE = '';  // Same origin; empty string for relative paths

// Shared fetch options to include session cookies
const FETCH_OPTS = {
    credentials: 'include'
};

// ─── Authentication Endpoints ────────────────────────────────────────────────

async function verifyCaptcha(answer) {
    const res = await fetch(`${API_BASE}/api/verify-captcha`, {
        ...FETCH_OPTS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: answer })
    });
    return res.json();
}

async function getCaptcha() {
    const res = await fetch(`${API_BASE}/api/captcha`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    return res.json();
}

async function adminLogin(username, password) {
    const res = await fetch(`${API_BASE}/api/login`, {
        ...FETCH_OPTS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    return res.json();
}

async function logout() {
    const res = await fetch(`${API_BASE}/api/logout`, {
        ...FETCH_OPTS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
}

async function getSessionInfo() {
    const res = await fetch(`${API_BASE}/api/session-info`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    return res.json();
}

// ─── Records Endpoints ───────────────────────────────────────────────────────

async function fetchRecords() {
    const res = await fetch(`${API_BASE}/api/records`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch records');
    }
    return res.json();
}

async function fetchRecord(recordId) {
    const res = await fetch(`${API_BASE}/api/records/${recordId}`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Record not found');
    }
    return res.json();
}

async function searchRecords(query) {
    const res = await fetch(`${API_BASE}/api/records/search?q=${encodeURIComponent(query)}`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Search failed');
    }
    return res.json();
}

async function createRecord(recordData) {
    const res = await fetch(`${API_BASE}/api/records`, {
        ...FETCH_OPTS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordData)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create record');
    }
    return res.json();
}

async function updateRecord(recordId, updateData) {
    const res = await fetch(`${API_BASE}/api/records/${recordId}`, {
        ...FETCH_OPTS,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update record');
    }
    return res.json();
}

async function deleteRecord(recordId) {
    const res = await fetch(`${API_BASE}/api/records/${recordId}`, {
        ...FETCH_OPTS,
        method: 'DELETE'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete record');
    }
    return res.json();
}

// ─── GIS Processing Endpoints ────────────────────────────────────────────────

async function calculateArea(geometry) {
    const res = await fetch(`${API_BASE}/api/calculate-area`, {
        ...FETCH_OPTS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Area calculation failed');
    }
    return res.json();
}

async function validateGeometry(geometry) {
    const res = await fetch(`${API_BASE}/api/validate-geometry`, {
        ...FETCH_OPTS,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Validation failed');
    }
    return res.json();
}

async function fetchLocationFromCoordinates(lat, lng) {
    const res = await fetch(`${API_BASE}/api/location-from-coords?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
        ...FETCH_OPTS,
        method: 'GET'
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Reverse geocoding failed');
    }

    return res.json();
}

// ─── Server-Side Filtering & Analytics (Python-heavy) ────────────────────────

/**
 * Server-side filtering of records.
 * @param {Object} filters - { state, district, village, land_use, search }
 * @returns {Promise<Array>} - Filtered records
 */
async function fetchFilteredRecords(filters = {}) {
    const params = new URLSearchParams();
    if (filters.state) params.set('state', filters.state);
    if (filters.district) params.set('district', filters.district);
    if (filters.village) params.set('village', filters.village);
    if (filters.land_use) params.set('land_use', filters.land_use);
    if (filters.search) params.set('search', filters.search);
    
    const res = await fetch(`${API_BASE}/api/records/filter?${params}`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Filter failed');
    }
    return res.json();
}

/**
 * Pre-computed dashboard analytics from server.
 * @param {Object} filters - Same as fetchFilteredRecords
 * @returns {Promise<Object>} - { kpis, land_use_distribution, district_overview, top_parcel, recent_mutations }
 */
async function fetchDashboardAnalytics(filters = {}) {
    const params = new URLSearchParams();
    if (filters.state) params.set('state', filters.state);
    if (filters.district) params.set('district', filters.district);
    if (filters.village) params.set('village', filters.village);
    if (filters.land_use) params.set('land_use', filters.land_use);
    if (filters.search) params.set('search', filters.search);
    
    const res = await fetch(`${API_BASE}/api/dashboard?${params}`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Dashboard analytics failed');
    }
    return res.json();
}

/**
 * Get location catalog (state > district > village hierarchy).
 * @returns {Promise<Object>} - { state: { district: [villages] } }
 */
async function fetchLocationCatalog() {
    const res = await fetch(`${API_BASE}/api/location-catalog`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch location catalog');
    }
    return res.json();
}

/**
 * Get application config (land use colors, options, etc.).
 * @returns {Promise<Object>} - { land_use_options, land_use_colors, mutation_types }
 */
async function fetchAppConfig() {
    const res = await fetch(`${API_BASE}/api/config`, {
        ...FETCH_OPTS,
        method: 'GET'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch app config');
    }
    return res.json();
}

// ─── Document Generation Endpoints ───────────────────────────────────────────

function getPropertyCardUrl(ulpin) {
    return `${API_BASE}/api/print-card/${ulpin}`;
}

function getVillageExcelUrl(village) {
    const params = village ? `?village=${encodeURIComponent(village)}` : '';
    return `${API_BASE}/api/export-village${params}`;
}

function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    const iconEl = document.getElementById('toast-icon');

    if (!toast || !msgEl) return;

    const icons = {
        success: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
        error: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
        info: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>',
        warning: '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>'
    };

    if (iconEl) iconEl.innerHTML = icons[type] || icons.info;
    msgEl.textContent = message;

    toast.classList.add('show');
    toast.className = toast.className.replace(/success|error|info|warning/g, '').trim();
    toast.classList.add(type);

    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// ─── Real-Time Clock ──────────────────────────────────────────────
function updateRealTimeClock() {
    const timeEl = document.getElementById('rtc-time');
    const dateEl = document.getElementById('rtc-date');
    if (!timeEl || !dateEl) return;

    const now = new Date();
    
    // Time formatted as HH:MM:SS AM/PM
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
    });

    // Date formatted as DD MMM YYYY (e.g. 14 Apr 2026)
    const dateString = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).replace(/ /g, ' ');

    timeEl.textContent = timeString;
    dateEl.textContent = dateString;
}

// Initialize clock if elements exist
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('rtc-time')) {
        updateRealTimeClock();
        setInterval(updateRealTimeClock, 1000);
    }
});
