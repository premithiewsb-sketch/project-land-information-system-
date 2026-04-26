/**
 * admin.js - Admin UI, User Management, and Audit Logs logic
 */

const roleColors = {
    'superadmin': 'bg-red-100 text-red-800',
    'admin': 'bg-purple-100 text-purple-800',
    'officer': 'bg-blue-100 text-blue-800',
    'viewer': 'bg-gray-100 text-gray-800'
};

function showAuditModal(entries) {
    const container = document.getElementById('audit-entries');
    if (!container) return;

    if (!Array.isArray(entries)) entries = [];
    container.__auditEntries = entries.slice();
    container.__auditPage = 1;
    container.__auditPageSize = 10;

    function getActionBadge(action) {
        const a = (action || '').toLowerCase();
        if (a.includes('delete')) return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Delete</span>';
        if (a.includes('create') || a.includes('add')) return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Create</span>';
        if (a.includes('update') || a.includes('edit')) return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Update</span>';
        if (a.includes('restore')) return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Restore</span>';
        return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">${escapeHtml(action)}</span>`;
    }

    function renderAuditList(page = 1, pageSize = 10, filter = {}) {
        const all = container.__auditEntries || [];
        let filtered = all.filter(e => {
            if (filter.q) {
                const q = filter.q.toLowerCase();
                const hay = [e.action, e.performed_by, e.user, e.record_id, JSON.stringify(e.details || {})].join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (filter.action && filter.action !== 'all') { if (!String(e.action || '').toLowerCase().includes(filter.action)) return false; }
            if (filter.user && filter.user !== 'all') { if (!String((e.performed_by||e.user||'')).toLowerCase().includes(filter.user)) return false; }
            return true;
        });

        const total = filtered.length;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        if (page > pages) page = pages;
        container.__auditPage = page;
        container.__auditPageSize = pageSize;

        const start = (page - 1) * pageSize;
        const pageItems = filtered.slice(start, start + pageSize);

        container.innerHTML = `
            <div class="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                <div class="flex flex-wrap items-center gap-3">
                    <input id="audit-search" placeholder="Search logs..." class="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 focus:ring-orange-500 focus:border-orange-500" value="${escapeHtml(filter.q || '')}" />
                    <select id="audit-action-filter" class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-orange-500 focus:border-orange-500">
                        <option value="all">All Actions</option>
                        <option value="create" ${filter.action === 'create' ? 'selected' : ''}>Create</option>
                        <option value="update" ${filter.action === 'update' ? 'selected' : ''}>Update</option>
                        <option value="delete" ${filter.action === 'delete' ? 'selected' : ''}>Delete</option>
                        <option value="restore" ${filter.action === 'restore' ? 'selected' : ''}>Restore</option>
                    </select>
                    <select id="audit-user-filter" class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-orange-500 focus:border-orange-500">
                        <option value="all">All Users</option>
                    </select>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-sm font-medium text-gray-600">${total} results</div>
                    <select id="audit-page-size" class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-orange-500 focus:border-orange-500">
                        <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 per page</option>
                        <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 per page</option>
                        <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 per page</option>
                    </select>
                    <button id="audit-download" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Export
                    </button>
                </div>
            </div>
            <div class="overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Timestamp</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Record ID</th>
                            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Details</th>
                        </tr>
                    </thead>
                    <tbody id="audit-list" class="bg-white divide-y divide-gray-200"></tbody>
                </table>
            </div>
            <div id="audit-pager" class="mt-4 flex items-center justify-between text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200 shadow-sm"></div>
        `;

        const users = Array.from(new Set(all.map(a => (a.performed_by||a.user||'').toLowerCase()).filter(Boolean))).sort();
        const userFilter = document.getElementById('audit-user-filter');
        users.forEach(u => { const opt = document.createElement('option'); opt.value = u; opt.textContent = u; if (filter.user === u) opt.selected = true; userFilter.appendChild(opt); });

        const listEl = document.getElementById('audit-list');
        if (pageItems.length === 0) {
            listEl.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">No logs found.</td></tr>';
        } else {
            pageItems.forEach(e => {
                const ts = e.timestamp || e.time || e.created_at || '';
                const action = e.action || 'unknown';
                const by = e.performed_by || e.user || 'system';
                const rid = e.record_id || '-';
                let detailsStr = '';
                if (e.details) {
                    if (typeof e.details === 'string') detailsStr = e.details;
                    else {
                        const parts = [];
                        if (e.details.khasra_no) parts.push(`Khasra: ${e.details.khasra_no}`);
                        if (e.details.ulpin) parts.push(`ULPIN: ${e.details.ulpin}`);
                        if (e.details.changes) parts.push(`${Object.keys(e.details.changes).length} field(s) changed`);
                        detailsStr = parts.length > 0 ? parts.join(' | ') : JSON.stringify(e.details).slice(0, 100);
                    }
                }
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50 transition-colors';
                tr.innerHTML = `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(ts).toLocaleString()}</td><td class="px-6 py-4 whitespace-nowrap text-sm">${getActionBadge(action)}</td><td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(by)}</td><td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">${escapeHtml(rid)}</td><td class="px-6 py-4 text-sm text-gray-600 max-w-md"><div class="truncate cursor-pointer hover:text-gray-900" title="${escapeHtml(JSON.stringify(e.details, null, 2))}">${escapeHtml(detailsStr || 'No details')}</div></td>`;
                listEl.appendChild(tr);
            });
        }

        const pager = document.getElementById('audit-pager');
        if (pager) {
            pager.innerHTML = `
                <div class="font-medium text-gray-500">Page ${page} of ${pages}</div>
                <div class="flex gap-2">
                    <button id="audit-prev" class="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 ${page <= 1 ? 'opacity-50' : 'hover:bg-gray-50'}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
                    <button id="audit-next" class="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 ${page >= pages ? 'opacity-50' : 'hover:bg-gray-50'}" ${page >= pages ? 'disabled' : ''}>Next</button>
                </div>
            `;
        }

        const getFilters = () => ({
            q: document.getElementById('audit-search').value,
            action: document.getElementById('audit-action-filter').value,
            user: document.getElementById('audit-user-filter').value
        });

        // Event Listeners (ensure we don't stack them)
        const refresh = () => renderAuditList(1, container.__auditPageSize, getFilters());
        
        document.getElementById('audit-search').oninput = debounce(refresh, 300);
        document.getElementById('audit-action-filter').onchange = refresh;
        document.getElementById('audit-user-filter').onchange = refresh;
        
        document.getElementById('audit-page-size').onchange = (e) => {
            renderAuditList(1, parseInt(e.target.value, 10), getFilters());
        };
        
        document.getElementById('audit-prev').onclick = () => {
            if (container.__auditPage > 1) renderAuditList(container.__auditPage - 1, container.__auditPageSize, getFilters());
        };
        
        document.getElementById('audit-next').onclick = () => {
            if (container.__auditPage < pages) renderAuditList(container.__auditPage + 1, container.__auditPageSize, getFilters());
        };
        
        document.getElementById('audit-download').onclick = () => {
            const dataToExport = filtered.length > 0 ? filtered : all;
            const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Audit logs exported.', 'success');
        };
    }

    renderAuditList(1, 10, {});
}

function showAdminDetails(record) {
    selectedRecordId = record._id;
    selectedRecord = record;
    const detailsPanel = document.getElementById('map-details-panel');
    const detailsActions = document.getElementById('map-details-actions');
    const content = document.getElementById('map-details-content');
    if (detailsPanel) detailsPanel.classList.remove('hidden');
    if (detailsActions) detailsActions.classList.remove('hidden');
    if (!content) return;

    const loc = record.location || {};
    const attrs = record.attributes || {};
    const owner = record.owner || {};
    const mutations = record.mutation_history || [];

    content.innerHTML = `
        <div class="fade-in">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2"><h3 class="text-sm font-bold text-inherit">${record.khasra_no || 'N/A'}</h3>${record.deleted ? `<span class="badge-deleted">Deleted</span>` : ''}</div>
                <span class="land-use-badge badge-${(attrs.land_use || '').toLowerCase()}">${attrs.land_use || 'N/A'}</span>
            </div>
            <div class="space-y-2 text-xs text-inherit">
                <div class="grid grid-cols-2 gap-x-3 gap-y-1 opacity-80">
                    <span class="opacity-60">Role</span><span class="font-bold">${(record.role || 'Officer').toUpperCase()}</span>
                    <span class="opacity-60">ULPIN</span><span class="font-mono">${record.ulpin || 'N/A'}</span>
                    <span class="opacity-60">Area</span><span>${attrs.area_ha || 'N/A'} Ha</span>
                    <span class="opacity-60">Village</span><span>${loc.village || 'N/A'}</span>
                    <span class="opacity-60">District</span><span>${loc.district || 'N/A'}</span>
                </div>
                <hr class="my-2 opacity-10">
                <p class="text-[10px] font-bold opacity-40 uppercase">OWNER</p>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span class="opacity-60">Name</span><span class="font-medium">${owner.name || 'N/A'}</span>
                    <span class="opacity-60">Share</span><span>${owner.share_pct || 'N/A'}%</span>
                </div>
            </div>
            <div class="mt-4"><button id="btn-map-edit-init" class="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs py-2 rounded-lg transition">Edit / Mutate</button></div>
        </div>
    `;
    
    document.getElementById('btn-map-edit-init').addEventListener('click', () => editRecord(record._id));

    if (detailsActions) {
        if (record.deleted) {
            detailsActions.innerHTML = `<button id="btn-map-restore" class="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition">Restore</button><button id="btn-map-hard-delete" class="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition">Hard Delete</button>`;
            document.getElementById('btn-map-restore').addEventListener('click', () => {
                showConfirmModal(`Restore record?`, async () => {
                    await restoreRecord(record._id); loadRecordsOnMap(); detailsPanel.classList.add('hidden');
                });
            });
            document.getElementById('btn-map-hard-delete').addEventListener('click', () => {
                showConfirmModal(`Permanently delete?`, async () => {
                    await deleteRecord(record._id); loadRecordsOnMap(); detailsPanel.classList.add('hidden');
                });
            });
        } else {
            detailsActions.innerHTML = `<button id="btn-map-print" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded-lg transition">Print</button><button id="btn-map-delete" class="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-2 rounded-lg transition">Delete</button>`;
            document.getElementById('btn-map-print').addEventListener('click', () => printCard(record.ulpin));
            document.getElementById('btn-map-delete').addEventListener('click', () => confirmDelete(record._id, record.khasra_no));
        }
    }
}

async function capturePolygonMapForPdf(geometry) {
    return new Promise((resolve) => {
        const W = 800, H = 450;
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99999;opacity:0.01;pointer-events:none;`;
        document.body.appendChild(wrap);
        const pdfMap = L.map(wrap, { zoomControl: false, attributionControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pdfMap);
        if (geometry && geometry.coordinates && geometry.coordinates[0]) {
            const poly = L.polygon(geometry.coordinates[0].map(c => [c[1], c[0]]), { color: '#dc2626', weight: 3, fillColor: '#fca5a5', fillOpacity: 0.35 }).addTo(pdfMap);
            pdfMap.fitBounds(poly.getBounds(), { padding: [55, 55] });
        } else pdfMap.setView([23.5, 77.5], 5);

        setTimeout(async () => {
            try {
                wrap.style.opacity = '1';
                resolve(await window.htmlToImage.toPng(wrap, { pixelRatio: 1.5, width: W, height: H }));
            } catch (e) { resolve(null); }
            finally { pdfMap.remove(); document.body.removeChild(wrap); }
        }, 2500);
    });
}

async function printCard(ulpin) {
    if (!ulpin) return showToast('No ULPIN available.', 'error');
    showToast('Generating PDF — capturing map...', 'info');
    const record = selectedRecord || (allRecordsCache || []).find(r => r.ulpin === ulpin);
    const mapImageBase64 = record && record.geometry ? await capturePolygonMapForPdf(record.geometry) : null;
    try {
        const res = await fetch(getPropertyCardUrl(ulpin), { method: 'POST', headers: { 'Content-Type': 'application/json', ...FETCH_OPTS.headers }, body: JSON.stringify({ map_image: mapImageBase64 }) });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        downloadFile(url, `Property_Card_${ulpin}.pdf`);
        window.URL.revokeObjectURL(url);
    } catch (err) { showToast(err.message, 'error'); }
}

function confirmDelete(recordId, khasraNo) {
    showConfirmModal(`Delete record "${khasraNo}"?`, () => {
        deleteRecord(recordId).then(() => {
            showToast(`Deleted.`, 'success');
            loadRecordsOnMap(); switchMainTab('records');
            document.getElementById('map-details-panel').classList.add('hidden');
        }).catch(err => showToast(`Delete failed: ${err.message}`, 'error'));
    });
}

async function loadProfile() {
    try {
        currentProfile = await fetch(`${API_BASE}/api/profile`, { credentials: 'include' }).then(r => r.json());
        displayProfile(currentProfile);
    } catch (err) {
        console.error('Failed to load profile:', err);
    }
}

function displayProfile(profile) {
    // Original profile card
    const profileName = document.getElementById('profile-display-name');
    const profileRole = document.getElementById('profile-display-role');
    const profileUser = document.getElementById('profile-username');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    const profileDesig = document.getElementById('profile-designation');
    const profileDept = document.getElementById('profile-department');
    const profileOffice = document.getElementById('profile-office');
    const profileLastLogin = document.getElementById('profile-last-login');

    if (profileName) profileName.textContent = profile.full_name || 'N/A';
    if (profileRole) profileRole.textContent = profile.role || 'N/A';
    if (profileUser) profileUser.textContent = profile.username || 'N/A';
    if (profileEmail) profileEmail.textContent = profile.email || 'N/A';
    if (profilePhone) profilePhone.textContent = profile.phone || 'N/A';
    if (profileDesig) profileDesig.textContent = profile.designation || 'N/A';
    if (profileDept) profileDept.textContent = profile.department || 'N/A';
    if (profileOffice) profileOffice.textContent = profile.office_location || 'N/A';
    if (profileLastLogin) profileLastLogin.textContent = profile.last_login ? new Date(profile.last_login).toLocaleString() : 'Never';

    const badge = document.getElementById('profile-status-badge');
    if (badge) {
        badge.textContent = profile.is_active ? 'Active' : 'Inactive';
        badge.className = `inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full ${profile.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
    }

    // Update Top Navbar Badge
    const navRoleBadge = document.querySelector('nav .bg-white\\/30') || document.querySelector('.nav-role-badge');
    if (navRoleBadge) {
        const displayRole = (profile.role || 'Admin').toUpperCase();
        navRoleBadge.textContent = displayRole;
        if (displayRole === 'SUPERADMIN') {
            navRoleBadge.className = 'text-[10px] sm:text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse';
        } else {
            navRoleBadge.className = 'text-[10px] sm:text-xs bg-white/30 text-white px-2 py-0.5 rounded-full font-semibold';
        }
    }

    // Role-based visibility for sidebar tabs
    const role = (profile.role || '').toLowerCase();
    const isFullAdmin = (role === 'admin' || role === 'superadmin');
    isAdmin = isFullAdmin; // Update global state
    
    const usersTabBtn = document.getElementById('btn-users');
    const auditTabBtn = document.getElementById('btn-audit');
    
    if (usersTabBtn) {
        usersTabBtn.classList.toggle('hidden', !isFullAdmin);
    }
    if (auditTabBtn) {
        auditTabBtn.classList.toggle('hidden', !isFullAdmin);
    }

    // New profile view fields
    const viewUser = document.getElementById('profile-view-username');
    const viewName = document.getElementById('profile-view-name');
    const viewEmail = document.getElementById('profile-view-email');
    const viewPhone = document.getElementById('profile-view-phone');
    const viewDesig = document.getElementById('profile-view-designation');
    const viewDept = document.getElementById('profile-view-department');
    const viewOffice = document.getElementById('profile-view-office');
    const viewLastLogin = document.getElementById('profile-view-last-login');

    if (viewUser) viewUser.textContent = profile.username || 'N/A';
    if (viewName) viewName.textContent = profile.full_name || 'N/A';
    if (viewEmail) viewEmail.textContent = profile.email || 'N/A';
    if (viewPhone) viewPhone.textContent = profile.phone || 'N/A';
    if (viewDesig) viewDesig.textContent = profile.designation || 'N/A';
    if (viewDept) viewDept.textContent = profile.department || 'N/A';
    if (viewOffice) viewOffice.textContent = profile.office_location || 'N/A';
    if (viewLastLogin) viewLastLogin.textContent = profile.last_login ? new Date(profile.last_login).toLocaleString() : 'Never';

    // Toggle Recovery Containers based on status
    const createRec = document.getElementById('create-recovery-container');
    const editRec = document.getElementById('edit-recovery-container');
    if (profile.is_recovery) {
        if (createRec) createRec.classList.remove('hidden');
        if (editRec) editRec.classList.remove('hidden');
    } else {
        if (createRec) createRec.classList.add('hidden');
        if (editRec) editRec.classList.add('hidden');
    }
}

// deleteFeedback is defined as a global function later in this file

window.toggleFeedbackStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'New' ? 'Reviewed' : 'New';
    try {
        const res = await fetch(`${API_BASE}/api/feedback/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
            credentials: 'include'
        });
        if (!res.ok) throw new Error('Update failed');
        showToast(`Feedback marked as ${newStatus}.`, 'success');
        loadFeedback();
    } catch (err) { showToast(err.message, 'error'); }
};

async function loadFeedback() {
    try {
        const tbody = document.getElementById('feedback-table-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Loading...</td></tr>';
        
        const res = await fetch(`${API_BASE}/api/feedback`, { credentials: 'include' });
        const feedbackList = await res.json();
        
        tbody.innerHTML = '';
        if (feedbackList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">No feedback submissions found.</td></tr>';
            return;
        }
        
        // Sort by timestamp descending
        feedbackList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        feedbackList.forEach(fb => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-gray-50 transition';
            const d = new Date(fb.timestamp);
            const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const isNew = fb.status === 'New';
            const statusClass = isNew ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800';
            
            tr.innerHTML = `
                <td class="px-4 py-3 whitespace-nowrap text-gray-800 text-xs">${dateStr}</td>
                <td class="px-4 py-3">
                    <div class="text-sm font-medium text-gray-900">${escapeHtml(fb.email)}</div>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800">
                        ${escapeHtml(fb.type)}
                    </span>
                </td>
                <td class="px-4 py-3 text-gray-700 min-w-[200px] break-words text-sm">${escapeHtml(fb.message)}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${statusClass}">
                        ${fb.status || 'New'}
                    </span>
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="toggleFeedbackStatus('${fb.id}', '${fb.status || 'New'}')" class="${isNew ? 'text-blue-600 hover:text-blue-900' : 'text-gray-400 hover:text-gray-600'}" title="${isNew ? 'Mark as Reviewed' : 'Mark as New'}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </button>
                        <button onclick="deleteFeedback('${fb.id}')" class="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition" title="Delete">
                            <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('Failed to load feedback:', err);
    }
}

window.deleteFeedback = function(feedbackId) {
    showConfirmModal("Are you sure you want to delete this feedback report?\n\nThis action is permanent and cannot be recovered.", async () => {
        try {
            const res = await fetch(`${API_BASE}/api/feedback/${feedbackId}`, {
                credentials: 'include',
                method: 'DELETE'
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            showToast("Feedback deleted successfully.", "success");
            loadFeedback(); // Refresh the table
        } catch (err) {
            showToast(`Failed to delete feedback: ${err.message}`, "error");
        }
    });
}

async function loadUsers() {
    try {
        if (!sessionUsername) {
            await getSessionUsername();
        }
        allUsers = await fetch(`${API_BASE}/api/users`, { credentials: 'include' }).then(r => r.json());
        renderUsersTable();
    } catch (err) {
        console.error('Failed to load users:', err);
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    const noUsers = document.getElementById('no-users');
    if (!tbody) return;

    if (!allUsers.length) {
        tbody.innerHTML = '';
        if (noUsers) noUsers.classList.remove('hidden');
        return;
    }

    if (noUsers) noUsers.classList.add('hidden');

    const roleColors = {
        superadmin: 'bg-purple-100 text-purple-800',
        admin: 'bg-orange-100 text-orange-800',
        officer: 'bg-blue-100 text-blue-800',
        viewer: 'bg-green-100 text-green-800'
    };

    const currentUsername = sessionUsername;

    // Update stats
    const totalUsersEl = document.getElementById('stat-total-users');
    const activeUsersEl = document.getElementById('stat-active-users');
    const adminUsersEl = document.getElementById('stat-admin-users');
    const viewerUsersEl = document.getElementById('stat-viewer-users');

    if (totalUsersEl) totalUsersEl.textContent = allUsers.length;
    if (activeUsersEl) activeUsersEl.textContent = allUsers.filter(u => u.is_active).length;
    if (adminUsersEl) adminUsersEl.textContent = allUsers.filter(u => ['Admin', 'SuperAdmin'].includes(u.role)).length;
    if (viewerUsersEl) viewerUsersEl.textContent = allUsers.filter(u => u.role === 'Viewer').length;

    tbody.innerHTML = allUsers.map(user => {
        const isCurrentUser = user.username === currentUsername;
        const roleKey = (user.role || '').toLowerCase();
        const colorClass = roleColors[roleKey] || 'bg-gray-100 text-gray-800';
        return `
        <tr class="hover:bg-gray-50 transition">
            <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-semibold text-xs">
                        ${(user.full_name || user.username || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                        <div class="font-medium text-gray-800">${escapeHtml(user.full_name || 'N/A')}</div>
                        <div class="text-xs text-gray-500">@${escapeHtml(user.username)}</div>
                    </div>
                </div>
            </td>
            <td class="px-4 py-3">
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${colorClass}">${escapeHtml(user.role)}</span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-600">
                ${user.email ? `<div>${escapeHtml(user.email)}</div>` : '<div class="text-gray-400">--</div>'}
                ${user.phone ? `<div class="mt-0.5">${escapeHtml(user.phone)}</div>` : ''}
            </td>
            <td class="px-4 py-3 text-xs text-gray-600">
                ${user.department ? `<div class="font-medium">${escapeHtml(user.department)}</div>` : '<div class="text-gray-400">--</div>'}
                ${user.designation ? `<div class="text-gray-500">${escapeHtml(user.designation)}</div>` : ''}
            </td>
            <td class="px-4 py-3 text-center">
                <span class="px-2 py-1 text-xs font-semibold rounded-full ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${user.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="editUser('${user.user_id}')" class="text-orange-600 hover:text-orange-800 text-xs font-medium px-2 py-1 rounded hover:bg-orange-50 transition">
                        Edit
                    </button>
                    ${!isCurrentUser ? `<button onclick="deleteUser('${user.user_id}', '${escapeHtml(user.username)}')" class="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition">Delete</button>` : '<span class="text-xs text-gray-400">You</span>'}
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

async function getSessionUsername() {
    try {
        const info = await getSessionInfo();
        sessionUsername = info.username || '';
    } catch (err) {
        sessionUsername = '';
    }
}

async function editUser(userId) {
    const user = allUsers.find(u => u.user_id === userId);
    if (!user) return;

    // Populate the edit modal
    const editId = document.getElementById('edit-user-id');
    const editUser = document.getElementById('edit-username');
    const editRole = document.getElementById('edit-role');
    const editFullname = document.getElementById('edit-fullname');
    const editEmail = document.getElementById('edit-email');
    const editPhone = document.getElementById('edit-phone-user');
    const editDesig = document.getElementById('edit-designation-user');
    const editDept = document.getElementById('edit-department-user');
    const editOffice = document.getElementById('edit-office-user');
    const editActive = document.getElementById('edit-is-active');
    const editPass = document.getElementById('edit-new-password');

    if (editId) editId.value = user.user_id;
    if (editUser) editUser.value = user.username;
    
    // Dynamic Role Filtering for Edit Modal
    if (editRole) {
        const myRole = (currentProfile.role || '').toLowerCase();
        const targetRole = (user.role || '').toLowerCase();
        
        // Populate options based on hierarchy
        let roles = ['Officer', 'Viewer'];
        if (myRole === 'superadmin') roles = ['SuperAdmin', 'Admin', 'Officer', 'Viewer'];
        else if (myRole === 'admin') roles = ['Admin', 'Officer', 'Viewer'];

        editRole.innerHTML = roles.map(r => `<option value="${r}">${r}</option>`).join('');
        editRole.value = user.role;

        // Extra safety: If editing a SuperAdmin as a non-SuperAdmin, disable the role dropdown
        if (targetRole === 'superadmin' && myRole !== 'superadmin') {
            editRole.disabled = true;
        } else {
            editRole.disabled = false;
        }
    }

    if (editFullname) editFullname.value = user.full_name || '';
    if (editEmail) editEmail.value = user.email || '';
    if (editPhone) editPhone.value = user.phone || '';
    if (editDesig) editDesig.value = user.designation || '';
    if (editDept) editDept.value = user.department || '';
    if (editOffice) editOffice.value = user.office_location || '';
    if (editActive) editActive.checked = user.is_active !== false;
    const editRec = document.getElementById('edit-is-recovery');
    if (editRec) editRec.checked = user.is_recovery === true;
    if (editPass) editPass.value = '';

    // Show the modal
    const modal = document.getElementById('edit-user-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeEditUserModal() {
    const modal = document.getElementById('edit-user-modal');
    const form = document.getElementById('user-edit-form');
    if (modal) modal.classList.add('hidden');
    if (form) form.reset();
}

function deleteUser(userId, username) {
    showConfirmModal(`Are you sure you want to delete user "${username}"?`, async () => {
        try {
            await fetch(`${API_BASE}/api/users/${userId}`, {
                credentials: 'include',
                method: 'DELETE'
            }).then(async r => {
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                return data;
            });
            
            showToast(`User "${username}" deleted.`, 'success');
            loadUsers();
        } catch (err) {
            showToast(`Failed to delete user: ${err.message}`, 'error');
        }
    });
}

// Edit user modal event listeners (added to admin.js logic)
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Dashboard Data
    loadProfile();
    loadFeedback();
    loadUsers();

    const closeBtn = document.getElementById('btn-close-edit-user');
    const cancelBtn = document.getElementById('btn-cancel-edit-user');
    
    if (closeBtn) closeBtn.addEventListener('click', closeEditUserModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditUserModal);
    
    const modal = document.getElementById('edit-user-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeEditUserModal();
        });
    }
    
    const editUserForm = document.getElementById('user-edit-form');
    if (editUserForm) {
        editUserForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const userId = document.getElementById('edit-user-id').value;
            const updateData = {
                full_name: document.getElementById('edit-fullname').value.trim(),
                email: document.getElementById('edit-email').value.trim(),
                phone: document.getElementById('edit-phone-user').value.trim(),
                designation: document.getElementById('edit-designation-user').value.trim(),
                department: document.getElementById('edit-department-user').value.trim(),
                office_location: document.getElementById('edit-office-user').value.trim(),
                role: document.getElementById('edit-role').value,
                is_active: document.getElementById('edit-is-active').checked,
                is_recovery: document.getElementById('edit-is-recovery') ? document.getElementById('edit-is-recovery').checked : false
            };
            
            const newPassword = document.getElementById('edit-new-password').value;
            if (newPassword) updateData.new_password = newPassword;
            
            try {
                const res = await fetch(`${API_BASE}/api/users/${userId}`, {
                    credentials: 'include',
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData)
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                
                showToast('User updated successfully.', 'success');
                closeEditUserModal();
                loadUsers();
            } catch (err) {
                showToast(`Failed to update user: ${err.message}`, 'error');
            }
        });
    }

    // Create User Form Handler
    const btnCreateUser = document.getElementById('btn-create-user');
    const createUserForm = document.getElementById('create-user-form');
    const userCreateForm = document.getElementById('user-create-form');
    const cancelCreateUserBtn = document.getElementById('btn-cancel-create-user');
    const cancelCreateUserBtn2 = document.getElementById('btn-cancel-create-user-2');

    function hideCreateUserForm() {
        if (createUserForm) createUserForm.classList.add('hidden');
        if (userCreateForm) userCreateForm.reset();
    }

    if (btnCreateUser && createUserForm) {
        btnCreateUser.addEventListener('click', () => {
            createUserForm.classList.remove('hidden');
            createUserForm.scrollIntoView({ behavior: 'smooth' });
            
            // Dynamic Role Filtering for Create Modal
            const createRoleEl = document.getElementById('create-role');
            if (createRoleEl) {
                const myRole = (currentProfile.role || '').toLowerCase();
                let roles = ['Officer', 'Viewer'];
                if (myRole === 'superadmin') roles = ['SuperAdmin', 'Admin', 'Officer', 'Viewer'];
                else if (myRole === 'admin') roles = ['Admin', 'Officer', 'Viewer'];

                createRoleEl.innerHTML = roles.map(r => `<option value="${r}">${r}</option>`).join('');
            }
        });
    }

    if (cancelCreateUserBtn) cancelCreateUserBtn.addEventListener('click', hideCreateUserForm);
    if (cancelCreateUserBtn2) cancelCreateUserBtn2.addEventListener('click', hideCreateUserForm);

    if (userCreateForm) {
        userCreateForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const userData = {
                username: document.getElementById('create-username').value.trim(),
                password: document.getElementById('create-password').value,
                full_name: document.getElementById('create-full-name').value.trim(),
                email: document.getElementById('create-email').value.trim(),
                phone: document.getElementById('create-phone').value.trim(),
                designation: document.getElementById('create-designation').value.trim(),
                department: document.getElementById('create-department').value.trim(),
                role: document.getElementById('create-role').value,
                office_location: document.getElementById('create-office').value.trim(),
                is_active: document.getElementById('create-active').checked,
                is_recovery: document.getElementById('create-is-recovery') ? document.getElementById('create-is-recovery').checked : false
            };

            try {
                const res = await fetch(`${API_BASE}/api/users`, {
                    credentials: 'include',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userData)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                showToast(`User "${userData.username}" created successfully.`, 'success');
                hideCreateUserForm();
                loadUsers();
            } catch (err) {
                showToast(`Failed to create user: ${err.message}`, 'error');
            }
        });
    }

    // Profile Edit Logic
    const btnEditProfile = document.getElementById('btn-edit-profile-inline');
    const btnCancelEditProfile = document.getElementById('btn-cancel-edit-profile');
    const profileView = document.getElementById('profile-view');
    const profileEditForm = document.getElementById('edit-profile-form');
    const profileForm = document.getElementById('profile-form');

    if (btnEditProfile) {
        btnEditProfile.addEventListener('click', () => {
            if (currentProfile) {
                document.getElementById('edit-full-name').value = currentProfile.full_name || '';
                document.getElementById('edit-email').value = currentProfile.email || '';
                document.getElementById('edit-phone').value = currentProfile.phone || '';
                document.getElementById('edit-designation').value = currentProfile.designation || '';
                document.getElementById('edit-department').value = currentProfile.department || '';
                document.getElementById('edit-office').value = currentProfile.office_location || '';
                
                // Reset password fields
                document.getElementById('edit-current-password').value = '';
                document.getElementById('edit-new-password').value = '';
            }
            if (profileView) profileView.classList.add('hidden');
            if (profileEditForm) profileEditForm.classList.remove('hidden');
        });
    }

    if (btnCancelEditProfile) {
        btnCancelEditProfile.addEventListener('click', () => {
            if (profileView) profileView.classList.remove('hidden');
            if (profileEditForm) profileEditForm.classList.add('hidden');
        });
    }

    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const updateData = {
                full_name: document.getElementById('edit-full-name').value.trim(),
                email: document.getElementById('edit-email').value.trim(),
                phone: document.getElementById('edit-phone').value.trim(),
                designation: document.getElementById('edit-designation').value.trim(),
                department: document.getElementById('edit-department').value.trim(),
                office_location: document.getElementById('edit-office').value.trim()
            };

            const currentPass = document.getElementById('edit-current-password').value;
            const newPass = document.getElementById('edit-new-password').value;

            if (newPass) {
                if (!currentPass) {
                    showToast('Current password is required to set a new password.', 'error');
                    return;
                }
                updateData.current_password = currentPass;
                updateData.new_password = newPass;
            }

            try {
                const res = await fetch(`${API_BASE}/api/profile`, {
                    credentials: 'include',
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData)
                });
                
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                showToast('Profile updated successfully.', 'success');
                
                // Update global state and UI
                currentProfile = data.profile;
                displayProfile(currentProfile);
                
                // Switch back to view mode
                if (profileView) profileView.classList.remove('hidden');
                if (profileEditForm) profileEditForm.classList.add('hidden');
            } catch (err) {
                showToast(`Update failed: ${err.message}`, 'error');
            }
        });
    }

    // Refresh Buttons
    const btnRefreshDashboard = document.getElementById('btn-refresh-dashboard');
    if (btnRefreshDashboard) {
        btnRefreshDashboard.addEventListener('click', async () => {
            btnRefreshDashboard.classList.add('animate-spin');
            try {
                await loadRecordsOnMap(); 
                showToast('Dashboard data refreshed.', 'success');
            } finally {
                setTimeout(() => btnRefreshDashboard.classList.remove('animate-spin'), 600);
            }
        });
    }

    const btnRefreshFeedback = document.getElementById('btn-refresh-feedback');
    if (btnRefreshFeedback) {
        btnRefreshFeedback.addEventListener('click', async () => {
            btnRefreshFeedback.classList.add('animate-spin');
            try {
                await loadFeedback();
                showToast('Feedback list updated.', 'success');
            } finally {
                setTimeout(() => btnRefreshFeedback.classList.remove('animate-spin'), 600);
            }
        });
    }

    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            const village = document.getElementById('village-filter')?.value || '';
            const url = getVillageExcelUrl(village);
            showToast('Preparing village ledger (Excel)...', 'info');
            window.location.href = url;
        });
    }

    const btnRefreshRecords = document.getElementById('btn-refresh-records');
    if (btnRefreshRecords) {
        btnRefreshRecords.addEventListener('click', async () => {
            btnRefreshRecords.classList.add('animate-spin');
            try {
                await loadRecordsOnMap();
                showToast('Records refreshed.', 'success');
            } finally {
                setTimeout(() => btnRefreshRecords.classList.remove('animate-spin'), 600);
            }
        });
    }
    // Header Actions
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            showConfirmModal('Are you sure you want to log out?', async () => {
                const data = await logout();
                window.location.href = data.redirect || '/login';
            });
        });
    }

    // Theme toggle is now handled globally in admin_dashboard.html
});
