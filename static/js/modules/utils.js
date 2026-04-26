/**
 * utils.js - General utility functions for India LIMS
 */

function showConfirmModal(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4';
    overlay.style.backdropFilter = 'blur(2px)';
    
    const modal = document.createElement('div');
    modal.className = 'bg-white rounded-lg shadow-xl max-w-sm w-full overflow-hidden fade-in';
    
    const content = document.createElement('div');
    content.className = 'p-6';
    
    const iconContainer = document.createElement('div');
    iconContainer.className = 'mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4';
    iconContainer.innerHTML = '<svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>';
    
    const textContainer = document.createElement('div');
    textContainer.className = 'text-center';
    
    const title = document.createElement('h3');
    title.className = 'text-lg leading-6 font-medium text-gray-900 mb-2';
    title.textContent = 'Confirm Action';
    
    const messageEl = document.createElement('p');
    messageEl.className = 'text-sm text-gray-500 whitespace-pre-line';
    messageEl.textContent = message;
    
    textContainer.appendChild(title);
    textContainer.appendChild(messageEl);
    content.appendChild(iconContainer);
    content.appendChild(textContainer);
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse gap-2';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:w-auto sm:text-sm transition-colors cursor-pointer';
    confirmBtn.textContent = 'Confirm';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:w-auto sm:text-sm transition-colors cursor-pointer';
    cancelBtn.textContent = 'Cancel';
    
    buttonsContainer.appendChild(confirmBtn);
    buttonsContainer.appendChild(cancelBtn);
    modal.appendChild(content);
    modal.appendChild(buttonsContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const close = () => document.body.removeChild(overlay);
    confirmBtn.addEventListener('click', () => { close(); if (onConfirm) onConfirm(); });
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function sortedValues(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function asNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatInr(value) {
    return Math.round(value).toLocaleString('en-IN');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function debounce(fn, wait = 200) {
    let t = null;
    return function(...args) {
        const ctx = this;
        clearTimeout(t);
        t = setTimeout(() => fn.apply(ctx, args), wait);
    };
}

function updateAutofillStatus(message, isError) {
    const statusEl = document.getElementById('map-autofill-status');
    if (!statusEl) return;

    statusEl.textContent = message || '';
    statusEl.classList.toggle('text-red-600', !!isError);
    statusEl.classList.toggle('text-gray-500', !isError);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}
function calculateValuation(areaHa, circleRateInr, landUse) {
    const multipliers = {
        'Commercial': 2.5,
        'Industrial': 1.8,
        'Residential': 1.5,
        'Agricultural': 1.0,
        'Government': 1.2,
        'Forest': 0.8,
        'Wasteland': 0.5
    };
    const multiplier = multipliers[landUse] || 1.0;
    return asNumber(areaHa) * asNumber(circleRateInr) * multiplier;
}
