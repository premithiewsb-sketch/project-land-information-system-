/**
 * map.js - Entry point for India LIMS client-side logic.
 * Loads modules and initializes the application.
 */

// --- Global State is now in modules/state.js ---

// --- Global Event Listeners & Initialization ---
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // 1. Identify mode
        const mapEl = document.getElementById('map');
        const adminMode = mapEl ? mapEl.dataset.mode === 'admin' : false;
        
        // 2. Initialize Core Map
        if (mapEl) {
            initMap(adminMode);
        }

        // 3. Admin-only initializations
        if (adminMode) {
            isAdmin = true;
            
            // Load essential data
            try {
                const catalog = await fetchLocationCatalog();
                locationCatalog = catalog;
                console.log('Location catalog loaded:', Object.keys(catalog).length, 'states');
            } catch (err) {
                console.warn('Could not load location catalog:', err);
            }

            loadProfile();
            initializeLocationFilters();
            initializeRecordFilters();
            
            // Tab switching logic
            setupTabSwitching();
            switchMainTab('dashboard');
            
            // Search handler
            const searchBtn = document.getElementById('btn-search');
            if (searchBtn) {
                searchBtn.addEventListener('click', performAdminSearch);
            }
            
            // Form submission
            const recordForm = document.getElementById('record-form');
            if (recordForm) {
                recordForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    handleFormSubmit();
                });
            }

            // Reset form button
            const resetBtn = document.getElementById('btn-reset-form');
            if (resetBtn) resetBtn.addEventListener('click', resetForm);

            // Logout is handled by admin.js with confirmation

            // Refresh feedback
            const refreshFeedbackBtn = document.getElementById('btn-refresh-feedback');
            if (refreshFeedbackBtn) {
                refreshFeedbackBtn.addEventListener('click', loadFeedback);
            }
        }
        
    } catch (e) {
        console.error('Initialization error:', e);
    }
});

// --- Tab Switching Logic ---
function setupTabSwitching() {
    // Main Tabs (Dashboard, Map, Records, Add Record, etc.)
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            if (tabId) switchMainTab(tabId);
        });
    });

    // Form Tabs (Location, Parcel, Owner, Mutation)
    document.querySelectorAll('.form-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.formTab || this.dataset.tab;
            if (tabId) switchFormTab(tabId);
        });
    });
}

function switchMainTab(tabId) {
    // Hide all panels
    document.querySelectorAll('.main-tab-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    
    // Show target panel
    const target = document.getElementById('main-tab-' + tabId);
    if (target) {
        target.classList.remove('hidden');
    }
    
    // Update button states
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('active', active);
        // Tailwind active classes
        if (active) {
            btn.classList.add('bg-orange-50', 'text-orange-700', 'border-orange-500');
            btn.classList.remove('text-gray-500', 'border-transparent');
        } else {
            btn.classList.remove('bg-orange-50', 'text-orange-700', 'border-orange-500');
            btn.classList.add('text-gray-500', 'border-transparent');
        }
    });

    // Special handling for maps when switching tabs
    if (tabId === 'map' && map) {
        setTimeout(() => map.invalidateSize(), 100);
    } else if (tabId === 'add-record') {
        if (!addRecordMap) initAddRecordMap();
        else setTimeout(() => addRecordMap.invalidateSize(), 100);
    } else if (tabId === 'users') {
        loadUsers();
    } else if (tabId === 'audit') {
        fetch(`${API_BASE}/api/audit`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => showAuditModal(data));
    } else if (tabId === 'feedback') {
        loadFeedback();
    }
}

function switchFormTab(tabId) {
    document.querySelectorAll('.form-tab-panel').forEach(content => {
        content.classList.add('hidden');
    });
    
    const target = document.getElementById('form-tab-' + tabId);
    if (target) {
        target.classList.remove('hidden');
    }
    
    document.querySelectorAll('.form-tab-btn').forEach(btn => {
        const active = (btn.dataset.formTab || btn.dataset.tab) === tabId;
        btn.classList.toggle('active', active);
        if (active) {
            btn.classList.add('border-orange-500', 'text-orange-600');
            btn.classList.remove('border-transparent', 'text-gray-500');
        } else {
            btn.classList.remove('border-orange-500', 'text-orange-600');
            btn.classList.add('border-transparent', 'text-gray-500');
        }
    });

    if (tabId === 'parcel' && addRecordMap) {
        setTimeout(() => addRecordMap.invalidateSize(), 100);
    }
}

async function performAdminSearch() {
    applyAdminFilters(true);
}

async function viewRecordDetails(recordId) {
    selectedRecordId = recordId;
    selectedRecord = null; // Will be populated

    try {
        const record = await fetchRecord(recordId);
        selectedRecord = record;
        
        // Switch to view record tab
        switchMainTab('view-record');
        
        // Populate details
        const loc = record.location || {};
        const attrs = record.attributes || {};
        const owner = record.owner || {};
        const mutations = record.mutation_history || [];
        
        document.getElementById('view-khasra').textContent = record.khasra_no || 'N/A';
        document.getElementById('view-ulpin').textContent = 'ULPIN: ' + (record.ulpin || 'N/A');
        document.getElementById('view-land-use-badge').textContent = attrs.land_use || 'Unknown';
        document.getElementById('view-land-use-badge').className = 'land-use-badge badge-' + (attrs.land_use || '').toLowerCase();
        document.getElementById('view-state').textContent = loc.state || 'N/A';
        document.getElementById('view-district').textContent = loc.district || 'N/A';
        document.getElementById('view-village').textContent = loc.village || 'N/A';
        document.getElementById('view-khata').textContent = record.khata_no || 'N/A';
        document.getElementById('view-area').textContent = attrs.area_ha ? attrs.area_ha + ' Ha' : 'N/A';
        document.getElementById('view-rate').textContent = attrs.circle_rate_inr ? 'Rs. ' + Number(attrs.circle_rate_inr).toLocaleString() + '/ha' : 'N/A';
        
        const value = calculateValuation(attrs.area_ha, attrs.circle_rate_inr, attrs.land_use || '');
        if (value > 0) {
            document.getElementById('view-value').textContent = 'Rs. ' + formatInr(value);
        } else {
            document.getElementById('view-value').textContent = 'Rs. 0';
        }
        
        document.getElementById('view-owner').textContent = owner.name || 'N/A';
        document.getElementById('view-share').textContent = owner.share_pct ? owner.share_pct + '%' : 'N/A';
        document.getElementById('view-aadhaar').textContent = owner.aadhaar_mask || 'N/A';
        
        // Owner document logic
        const ownerDocContainer = document.getElementById('view-owner-doc-container');
        const ownerDocLink = document.getElementById('view-owner-doc-link');
        if (owner.proof_doc_b64) {
            ownerDocContainer.classList.remove('hidden');
            ownerDocLink.href = owner.proof_doc_b64;
        } else {
            ownerDocContainer.classList.add('hidden');
        }

        // Mutation history
        const mutationsEl = document.getElementById('view-mutations');
        if (mutations.length > 0) {
            mutationsEl.innerHTML = mutations.map(m => {
                const docLinkHTML = m.proof_doc_b64 ? `<a href="${m.proof_doc_b64}" download="Mutation_Proof" class="text-blue-600 hover:text-blue-800 font-medium underline flex items-center gap-1 mt-2 text-xs"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Download Proof</a>` : '';
                return `
                <div class="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-3 shadow-sm mb-2">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-bold text-gray-800">${m.previous_owner}</span>
                        <span class="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">${m.mutation_type}</span>
                    </div>
                    <div class="text-[11px] text-gray-600 space-y-0.5">
                        <div class="flex justify-between"><span>Share: ${m.previous_share_pct}%</span><span>Aadhaar: ${m.previous_aadhaar_mask || 'N/A'}</span></div>
                        <div class="flex justify-between"><span>Date: ${m.mutation_date}</span><span class="font-mono">Ref: ${m.mutation_ref || 'N/A'}</span></div>
                    </div>
                    ${docLinkHTML}
                </div>
            `;
            }).join('');
        } else {
            mutationsEl.innerHTML = '<p class="text-sm text-gray-500 italic">No historical mutations found for this parcel.</p>';
        }
        
        // Initialize small map after tab switch
        setTimeout(() => {
            if (typeof initViewRecordMap === 'function') {
                initViewRecordMap(record);
            }
        }, 200);

        // Wire buttons (if not already wired)
        const backBtn = document.getElementById('btn-back-to-records');
        if (backBtn) backBtn.onclick = () => switchMainTab('records');

        const editBtn = document.getElementById('btn-view-edit');
        if (editBtn) editBtn.onclick = () => { if (typeof editRecord === 'function') editRecord(record._id); };

        const printBtn = document.getElementById('btn-view-print');
        if (printBtn) printBtn.onclick = () => { if (typeof printCard === 'function') printCard(record.ulpin); };

        const delBtn = document.getElementById('btn-view-delete');
        if (delBtn) delBtn.onclick = () => { if (typeof confirmDelete === 'function') confirmDelete(record._id, record.khasra_no); };
        
    } catch (_err) {
        if (typeof showToast === 'function') {
            showToast('Failed to load record details.', 'error');
        }
    }
}
