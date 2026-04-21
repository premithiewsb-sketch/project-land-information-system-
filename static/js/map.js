/**
 * map.js - Leaflet map and parcel workflow logic for India LIMS.
 * Handles map initialization, polygon drawing, record rendering,
 * location filtering, and admin form interactions.
 */

let map = null;
let viewRecordMap = null; // Small map in view record tab
let addRecordMap = null; // Map in add record tab
let addRecordDrawnItems = null; // Drawing layer for add record
let baseLayers = {};
let currentBaseLayer = null;
let parcelLayers = [];
let drawnItems = null;
let currentSketchLayer = null;
let isAdmin = false;
let selectedRecordId = null;
let selectedRecord = null;
let reverseGeocodeTimer = null;
let lastGeocodeKey = '';
let lastAutoLocation = { state: '', district: '', village: '' };
let lastGpsDetectedLocation = { state: '', district: '', village: '' };
let allRecordsCache = [];
let filteredRecordsCache = [];
let recordsViewMode = 'cards';

const DEFAULT_SNAP_DISTANCE = 20;
let locationCatalog = {};

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

function ensureLocationInCatalog(state, district, village) {
    if (!state || !district || !village) return;

    if (!locationCatalog[state]) {
        locationCatalog[state] = {};
    }
    if (!locationCatalog[state][district]) {
        locationCatalog[state][district] = [];
    }
    if (!locationCatalog[state][district].includes(village)) {
        locationCatalog[state][district].push(village);
        locationCatalog[state][district] = sortedValues(locationCatalog[state][district]);
    }
}

function syncLocationCatalogWithRecords(records) {
    records.forEach(rec => {
        const loc = rec.location || {};
        ensureLocationInCatalog(loc.state, loc.district, loc.village);
    });
}

function populateStateFilter(records) {
    const stateFilterEl = document.getElementById('state-filter');
    if (!stateFilterEl) return;

    const selected = stateFilterEl.value || '';
    const states = sortedValues(records
        .map(rec => (rec.location && rec.location.state) || '')
        .filter(Boolean));

    stateFilterEl.innerHTML = '<option value="">All States</option>';
    states.forEach(state => {
        const option = document.createElement('option');
        option.value = state;
        option.textContent = state;
        stateFilterEl.appendChild(option);
    });

    if (selected && states.includes(selected)) {
        stateFilterEl.value = selected;
    }
}

function populateDistrictFilter(records) {
    const districtFilterEl = document.getElementById('district-filter');
    if (!districtFilterEl) return;

    const selected = districtFilterEl.value || '';
    const districts = sortedValues(records
        .map(rec => (rec.location && rec.location.district) || '')
        .filter(Boolean));

    districtFilterEl.innerHTML = '<option value="">All Districts</option>';
    districts.forEach(district => {
        const option = document.createElement('option');
        option.value = district;
        option.textContent = district;
        districtFilterEl.appendChild(option);
    });

    if (selected && districts.includes(selected)) {
        districtFilterEl.value = selected;
    }
}

function getAdminFilterState() {
    const query = (document.getElementById('search-input') || {}).value || '';
    const landUse = (document.getElementById('land-use-filter') || {}).value || '';
    const district = (document.getElementById('district-filter') || {}).value || '';
    const state = (document.getElementById('state-filter') || {}).value || '';

    return {
        query: query.trim().toLowerCase(),
        landUse,
        district,
        state
    };
}

function filterRecordsByState(records, filterState) {
    return records.filter(rec => {
        const attrs = rec.attributes || {};
        const loc = rec.location || {};
        const owner = rec.owner || {};
        const searchText = [
            rec.khasra_no,
            rec.ulpin,
            rec.khata_no,
            loc.village,
            loc.district,
            loc.state,
            owner.name,
            attrs.land_use
        ].join(' ').toLowerCase();

        const queryMatch = !filterState.query || searchText.includes(filterState.query);
        const landUseMatch = !filterState.landUse || attrs.land_use === filterState.landUse;
        const stateMatch = !filterState.state || loc.state === filterState.state;
        const districtMatch = !filterState.district || loc.district === filterState.district;

        return queryMatch && landUseMatch && stateMatch && districtMatch;
    });
}

function renderKpiCards(records) {
    const totalParcelsEl = document.getElementById('kpi-total-parcels');
    const totalAreaEl = document.getElementById('kpi-total-area');
    const estimatedValueEl = document.getElementById('kpi-estimated-value');
    const mutationEl = document.getElementById('kpi-mutations');

    if (!totalParcelsEl || !totalAreaEl || !estimatedValueEl || !mutationEl) return;

    let totalArea = 0;
    let totalValue = 0;
    let totalMutations = 0;

    records.forEach(rec => {
        const attrs = rec.attributes || {};
        const area = asNumber(attrs.area_ha);
        const rate = asNumber(attrs.circle_rate_inr);

        totalArea += area;
        totalValue += area * rate;
        totalMutations += (rec.mutation_history || []).length;
    });

    totalParcelsEl.textContent = String(records.length);
    totalAreaEl.textContent = totalArea.toFixed(2);
    estimatedValueEl.textContent = formatInr(totalValue);
    mutationEl.textContent = String(totalMutations);
}

function buildDonutChart(slices, colors) {
    // slices: [{label, value, extra}]
    const total = slices.reduce((s, x) => s + x.value, 0);
    if (total === 0) return '<p style="color:#9ca3af;font-size:12px;">No data</p>';
    const R = 40, CX = 50, CY = 50, stroke = 18;
    let cumAngle = -90;
    const arcs = slices.map((s, i) => {
        const pct = s.value / total;
        const angle = pct * 360;
        const r1 = (cumAngle * Math.PI) / 180;
        const r2 = ((cumAngle + angle) * Math.PI) / 180;
        const x1 = CX + R * Math.cos(r1), y1 = CY + R * Math.sin(r1);
        const x2 = CX + R * Math.cos(r2), y2 = CY + R * Math.sin(r2);
        const large = angle > 180 ? 1 : 0;
        const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
        cumAngle += angle;
        return `<path d="${d}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="${stroke}" stroke-linecap="butt"/>`;
    }).join('');
    return `
        <div style="display:flex;align-items:center;gap:16px;">
            <svg viewBox="0 0 100 100" style="width:90px;height:90px;flex-shrink:0;">
                <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#f3f4f6" stroke-width="${stroke}"/>
                ${arcs}
                <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="central" style="font-size:11px;font-weight:700;fill:#374151;">${total}</text>
                <text x="${CX}" y="${CY+12}" text-anchor="middle" dominant-baseline="central" style="font-size:7px;fill:#9ca3af;">parcels</text>
            </svg>
            <div style="flex:1;min-width:0;">
                ${slices.map((s, i) => `
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <div style="width:10px;height:10px;border-radius:2px;background:${colors[i % colors.length]};flex-shrink:0;"></div>
                        <span style="font-size:11px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;" title="${escapeHtml(s.label)}">${escapeHtml(s.label)}</span>
                        <span style="margin-left:auto;font-size:11px;font-weight:700;color:#111827;">${s.value}</span>
                        <span style="font-size:10px;color:#9ca3af;">(${(s.value/total*100).toFixed(0)}%)</span>
                    </div>`).join('')}
            </div>
        </div>`;
}

function buildRankedList(items, colors) {
    // items: [{label, value, sublabel}]
    const max = Math.max(...items.map(x => x.value), 1);
    return items.map((item, i) => {
        const pct = Math.max((item.value / max) * 100, 4);
        const color = colors[i % colors.length];
        return `
            <div style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
                    <span style="font-size:11px;font-weight:600;color:#374151;">${escapeHtml(item.label)}</span>
                    <span style="font-size:11px;font-weight:700;color:${color};white-space:nowrap;margin-left:8px;">${item.sublabel}</span>
                </div>
                <div style="background:#f3f4f6;border-radius:99px;height:6px;">
                    <div style="background:${color};width:${pct}%;height:100%;border-radius:99px;transition:width 0.5s ease;"></div>
                </div>
            </div>`;
    }).join('');
}

function renderLandUseDistribution(records) {
    const target = document.getElementById('dashboard-land-use');
    if (!target) return;
    if (!records.length) { target.innerHTML = '<p style="color:#9ca3af;font-size:12px;">No records yet.</p>'; return; }
    const metrics = {};
    records.forEach(rec => {
        const lu = (rec.attributes && rec.attributes.land_use) || 'Unknown';
        if (!metrics[lu]) metrics[lu] = { count: 0, area: 0 };
        metrics[lu].count++;
        metrics[lu].area += asNumber(rec.attributes && rec.attributes.area_ha);
    });
    const COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#f59e0b','#ef4444'];
    const slices = Object.entries(metrics).sort((a,b)=>b[1].count-a[1].count)
        .map(([label, v]) => ({ label, value: v.count, extra: v.area.toFixed(1)+' Ha' }));
    target.innerHTML = buildDonutChart(slices, COLORS);
}

function renderDistrictOverview(records) {
    const target = document.getElementById('dashboard-districts');
    if (!target) return;
    if (!records.length) { target.innerHTML = '<p style="color:#9ca3af;font-size:12px;">No district data.</p>'; return; }
    const districtMap = {};
    records.forEach(rec => {
        const d = (rec.location && rec.location.district) || 'Unknown';
        if (!districtMap[d]) districtMap[d] = { count: 0, area: 0, value: 0 };
        const area = asNumber(rec.attributes && rec.attributes.area_ha);
        districtMap[d].count++;
        districtMap[d].area += area;
        districtMap[d].value += area * asNumber(rec.attributes && rec.attributes.circle_rate_inr);
    });
    const COLORS = ['#6366f1','#f97316','#10b981','#f59e0b','#f43f5e','#a855f7'];
    const items = Object.entries(districtMap).sort((a,b)=>b[1].count-a[1].count).slice(0,6)
        .map(([label, v]) => ({
            label,
            value: v.count,
            sublabel: `${v.count} parcels · ${v.area.toFixed(1)} Ha`
        }));
    target.innerHTML = buildRankedList(items, COLORS);
}

function renderTopValueParcel(records) {
    const target = document.getElementById('dashboard-top-parcel');
    if (!target) return;

    if (!records.length) {
        target.textContent = 'No parcel data yet.';
        return;
    }

    let topRecord = null;
    let topValue = -1;

    records.forEach(rec => {
        const area = asNumber(rec.attributes && rec.attributes.area_ha);
        const rate = asNumber(rec.attributes && rec.attributes.circle_rate_inr);
        const value = area * rate;
        if (value > topValue) {
            topValue = value;
            topRecord = rec;
        }
    });

    if (!topRecord) {
        target.textContent = 'No parcel data yet.';
        return;
    }

    const loc = topRecord.location || {};
    const attrs = topRecord.attributes || {};
    target.innerHTML = `
        <div class="text-sm font-semibold text-gray-800">${escapeHtml(topRecord.khasra_no || 'N/A')} (${escapeHtml(topRecord.ulpin || 'N/A')})</div>
        <div class="mt-1 text-xs text-gray-500">${escapeHtml(loc.village || 'N/A')}, ${escapeHtml(loc.district || 'N/A')} | ${escapeHtml(attrs.land_use || 'N/A')}</div>
        <div class="mt-1 text-xs text-gray-600">Area: ${asNumber(attrs.area_ha).toFixed(2)} Ha | Estimated: Rs. ${formatInr(topValue)}</div>
    `;
}

function renderRecentMutations(records) {
    const target = document.getElementById('dashboard-mutations');
    if (!target) return;

    const entries = [];
    records.forEach(rec => {
        (rec.mutation_history || []).forEach(item => {
            entries.push({
                khasraNo: rec.khasra_no || 'N/A',
                district: (rec.location && rec.location.district) || 'N/A',
                previousOwner: item.previous_owner || 'N/A',
                mutationType: item.mutation_type || 'N/A',
                mutationDate: item.mutation_date || 'N/A',
                mutationRef: item.mutation_ref || 'N/A'
            });
        });
    });

    entries.sort((a, b) => String(b.mutationDate).localeCompare(String(a.mutationDate)));

    if (!entries.length) {
        target.innerHTML = '<div class="dashboard-row text-xs text-gray-500">No mutation history available for selected filters.</div>';
        return;
    }

    target.innerHTML = entries.slice(0, 6).map(item => `
        <div class="dashboard-row text-xs">
            <div class="font-semibold text-gray-700">${escapeHtml(item.khasraNo)} | ${escapeHtml(item.mutationType)}</div>
            <div class="mt-1 text-gray-500">${escapeHtml(item.previousOwner)} -> ${escapeHtml(item.mutationDate)}</div>
            <div class="text-gray-400">${escapeHtml(item.district)} | Ref: ${escapeHtml(item.mutationRef)}</div>
        </div>
    `).join('');
}

function renderDashboardAnalytics(filteredRecords) {
    renderKpiCards(filteredRecords);
    renderLandUseDistribution(filteredRecords);
    renderDistrictOverview(filteredRecords);
    renderTopValueParcel(filteredRecords);
    renderRecentMutations(filteredRecords);
}

function applyAdminFilters(notify) {
    if (!isAdmin) return;

    const filterState = getAdminFilterState();
    
    // Use server-side filtering
    fetchFilteredRecords({
        state: filterState.query ? '' : filterState.state,
        district: filterState.query ? '' : filterState.district,
        village: filterState.query ? '' : filterState.village,
        land_use: filterState.landUse,
        search: filterState.query
    }).then(filtered => {
        filteredRecordsCache = filtered;
        
        // Update map
        clearMapLayers();
        addRecordsToMap(filtered);
        
        // Update records list
        renderRecordsList(filtered);
        
        // Update dashboard from server
        fetchDashboardAnalytics({
            state: filterState.state,
            land_use: filterState.landUse,
            district: filterState.district,
            search: filterState.query
        }).then(analytics => {
            renderKpiCardsFromServer(analytics.kpis);
            renderLandUseDistributionFromServer(analytics.land_use_distribution);
            renderDistrictOverviewFromServer(analytics.district_overview);
            renderTopValueParcelFromServer(analytics.top_parcel);
            renderRecentMutationsFromServer(analytics.recent_mutations);
        }).catch(err => {
            console.error('Dashboard analytics failed:', err);
        });

        if (notify) {
            showToast(`Showing ${filtered.length} record(s).`, 'info');
        }
    }).catch(err => {
        console.error('Server-side filtering failed:', err);
        // Fallback to client-side
        const filtered = filterRecordsByState(allRecordsCache, filterState);
        filteredRecordsCache = filtered;
        clearMapLayers();
        addRecordsToMap(filtered);
        renderRecordsList(filtered);
        renderDashboardAnalytics(filtered);
        if (notify) showToast(`Showing ${filtered.length} record(s).`, 'info');
    });
}

// Server-side rendering helpers
function renderKpiCardsFromServer(kpis) {
    const totalParcelsEl = document.getElementById('kpi-total-parcels');
    const totalAreaEl = document.getElementById('kpi-total-area');
    const estimatedValueEl = document.getElementById('kpi-estimated-value');
    const mutationEl = document.getElementById('kpi-mutations');
    
    if (totalParcelsEl) totalParcelsEl.textContent = String(kpis.total_parcels || 0);
    if (totalAreaEl) totalAreaEl.textContent = (kpis.total_area || 0).toFixed(2);
    if (estimatedValueEl) estimatedValueEl.textContent = formatInr(kpis.estimated_value || 0);
    if (mutationEl) mutationEl.textContent = String(kpis.total_mutations || 0);
}

function renderLandUseDistributionFromServer(stats) {
    const target = document.getElementById('dashboard-land-use');
    if (!target) return;
    const entries = Object.entries(stats || {});
    if (!entries.length) { target.innerHTML = '<p style="color:#9ca3af;font-size:12px;">No records yet.</p>'; return; }
    const COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#f59e0b','#ef4444'];
    const slices = entries.sort((a,b)=>b[1].count-a[1].count)
        .map(([label, s]) => ({ label, value: s.count, extra: s.area.toFixed(1)+' Ha' }));
    target.innerHTML = buildDonutChart(slices, COLORS);
}

function renderDistrictOverviewFromServer(districts) {
    const target = document.getElementById('dashboard-districts');
    if (!target) return;
    if (!districts || !districts.length) { target.innerHTML = '<p style="color:#9ca3af;font-size:12px;">No district data.</p>'; return; }
    const COLORS = ['#6366f1','#f97316','#10b981','#f59e0b','#f43f5e','#a855f7'];
    const items = districts.map(d => ({
        label: d.name,
        value: d.count,
        sublabel: `${d.count} parcels · ${d.area.toFixed(1)} Ha`
    }));
    target.innerHTML = buildRankedList(items, COLORS);
}

function renderTopValueParcelFromServer(parcel) {
    const target = document.getElementById('dashboard-top-parcel');
    if (!target) return;
    
    if (!parcel) {
        target.textContent = 'No parcel data yet.';
        return;
    }
    
    target.innerHTML = `
        <div class="text-sm font-semibold text-gray-800">${escapeHtml(parcel.khasra_no)} (${escapeHtml(parcel.ulpin)})</div>
        <div class="mt-1 text-xs text-gray-500">${escapeHtml(parcel.village)}, ${escapeHtml(parcel.district)} | ${escapeHtml(parcel.land_use)}</div>
        <div class="mt-1 text-xs text-gray-600">Area: ${parcel.area_ha} Ha | Estimated: Rs. ${formatInr(parcel.estimated_value)}</div>
    `;
}

function renderRecentMutationsFromServer(mutations) {
    const target = document.getElementById('dashboard-mutations');
    if (!target) return;
    
    if (!mutations || !mutations.length) {
        target.innerHTML = '<div class="dashboard-row text-xs text-gray-500">No mutation history available for selected filters.</div>';
        return;
    }
    
    target.innerHTML = mutations.slice(0, 6).map(m => `
        <div class="dashboard-row text-xs">
            <div class="font-semibold text-gray-700">${escapeHtml(m.khasra_no)} | ${escapeHtml(m.mutation_type)}</div>
            <div class="mt-1 text-gray-500">${escapeHtml(m.previous_owner)} -> ${escapeHtml(m.mutation_date)}</div>
        </div>
    `).join('');
}

function getFormElements() {
    return {
        stateEl: document.getElementById('form-state'),
        districtEl: document.getElementById('form-district'),
        villageEl: document.getElementById('form-village'),
        manualOverrideEl: document.getElementById('location-manual-override'),
        manualFieldsEl: document.getElementById('location-manual-fields'),
        stateManualEl: document.getElementById('form-state-manual'),
        districtManualEl: document.getElementById('form-district-manual'),
        villageManualEl: document.getElementById('form-village-manual'),
        sourceEl: document.getElementById('form-location-source')
    };
}

function populateSelect(selectEl, values, placeholder, selectedValue) {
    if (!selectEl) return;

    const current = selectedValue || '';
    selectEl.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    selectEl.appendChild(placeholderOption);

    values.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        selectEl.appendChild(option);
    });

    if (current && !values.includes(current)) {
        const customOption = document.createElement('option');
        customOption.value = current;
        customOption.textContent = current;
        selectEl.appendChild(customOption);
    }

    selectEl.value = current;
}

function refreshStateOptions(selectedState) {
    const { stateEl } = getFormElements();
    if (!stateEl) return;
    const states = sortedValues(Object.keys(locationCatalog));
    populateSelect(stateEl, states, 'Select State', selectedState || '');
}

function refreshDistrictOptions(selectedDistrict) {
    const { stateEl, districtEl } = getFormElements();
    if (!stateEl || !districtEl) return;

    const state = stateEl.value;
    const districts = state && locationCatalog[state] ? sortedValues(Object.keys(locationCatalog[state])) : [];
    populateSelect(districtEl, districts, 'Select District', selectedDistrict || '');
}

function refreshVillageOptions(selectedVillage) {
    const { stateEl, districtEl, villageEl } = getFormElements();
    if (!stateEl || !districtEl || !villageEl) return;

    const state = stateEl.value;
    const district = districtEl.value;
    const villages = state && district && locationCatalog[state] && locationCatalog[state][district]
        ? sortedValues(locationCatalog[state][district])
        : [];

    populateSelect(villageEl, villages, 'Select Village / Ward', selectedVillage || '');
}

function setLocationValues(state, district, village) {
    ensureLocationInCatalog(state, district, village);

    refreshStateOptions(state || '');
    refreshDistrictOptions(district || '');
    refreshVillageOptions(village || '');

    const { stateManualEl, districtManualEl, villageManualEl } = getFormElements();
    if (stateManualEl && !stateManualEl.value.trim()) {
        stateManualEl.value = state || '';
    }
    if (districtManualEl && !districtManualEl.value.trim()) {
        districtManualEl.value = district || '';
    }
    if (villageManualEl && !villageManualEl.value.trim()) {
        villageManualEl.value = village || '';
    }
}

function setLocationSource(text) {
    const { sourceEl } = getFormElements();
    if (sourceEl) {
        sourceEl.textContent = text;
    }
}

function isManualLocationOverrideEnabled() {
    const { manualOverrideEl } = getFormElements();
    return !!(manualOverrideEl && manualOverrideEl.checked);
}

function toggleManualLocationOverride(enabled) {
    const {
        stateEl,
        districtEl,
        villageEl,
        manualFieldsEl,
        stateManualEl,
        districtManualEl,
        villageManualEl
    } = getFormElements();

    if (!stateEl || !districtEl || !villageEl || !manualFieldsEl || !stateManualEl || !districtManualEl || !villageManualEl) {
        return;
    }

    manualFieldsEl.classList.toggle('hidden', !enabled);
    stateEl.disabled = enabled;
    districtEl.disabled = enabled;
    villageEl.disabled = enabled;

    stateEl.required = !enabled;
    districtEl.required = !enabled;
    villageEl.required = !enabled;

    stateManualEl.required = enabled;
    districtManualEl.required = enabled;
    villageManualEl.required = enabled;

    if (enabled) {
        stateManualEl.value = stateEl.value || stateManualEl.value;
        districtManualEl.value = districtEl.value || districtManualEl.value;
        villageManualEl.value = villageEl.value || villageManualEl.value;
        setLocationSource('Source: manual override enabled');
    } else {
        setLocationSource('Source: map auto-fill enabled');
    }
}

function getEffectiveLocationValues() {
    const {
        stateEl,
        districtEl,
        villageEl,
        stateManualEl,
        districtManualEl,
        villageManualEl
    } = getFormElements();

    if (isManualLocationOverrideEnabled()) {
        return {
            state: (stateManualEl ? stateManualEl.value : '').trim(),
            district: (districtManualEl ? districtManualEl.value : '').trim(),
            village: (villageManualEl ? villageManualEl.value : '').trim()
        };
    }

    return {
        state: stateEl ? stateEl.value : '',
        district: districtEl ? districtEl.value : '',
        village: villageEl ? villageEl.value : ''
    };
}

function initializeLocationFilters() {
    const {
        stateEl,
        districtEl,
        villageEl,
        manualOverrideEl,
        stateManualEl,
        districtManualEl,
        villageManualEl
    } = getFormElements();

    if (!stateEl || !districtEl || !villageEl) return;

    locationCatalog = {};

    refreshStateOptions('');
    refreshDistrictOptions('');
    refreshVillageOptions('');

    stateEl.addEventListener('change', function() {
        lastAutoLocation = { state: '', district: '', village: '' };
        refreshDistrictOptions('');
        refreshVillageOptions('');
    });

    districtEl.addEventListener('change', function() {
        lastAutoLocation = { state: '', district: '', village: '' };
        refreshVillageOptions('');
    });

    if (manualOverrideEl) {
        manualOverrideEl.addEventListener('change', function() {
            toggleManualLocationOverride(this.checked);
        });
    }

    if (stateManualEl && districtManualEl && villageManualEl) {
        const onManualEntry = function() {
            if (!isManualLocationOverrideEnabled()) return;
            lastAutoLocation = {
                state: stateManualEl.value.trim(),
                district: districtManualEl.value.trim(),
                village: villageManualEl.value.trim()
            };
        };

        stateManualEl.addEventListener('input', onManualEntry);
        districtManualEl.addEventListener('input', onManualEntry);
        villageManualEl.addEventListener('input', onManualEntry);
    }

    toggleManualLocationOverride(false);
}

function updateAutofillStatus(message, isError) {
    const statusEl = document.getElementById('map-autofill-status');
    if (!statusEl) return;

    statusEl.textContent = message || '';
    statusEl.classList.toggle('text-red-600', !!isError);
    statusEl.classList.toggle('text-gray-500', !isError);
}

function isMapAutofillEnabled() {
    const enabledEl = document.getElementById('map-autofill-enabled');
    return enabledEl ? enabledEl.checked : false;
}

function shouldApplyLocationUpdate(nextLocation, forceUpdate) {
    const { stateEl, districtEl, villageEl } = getFormElements();
    if (!stateEl || !districtEl || !villageEl) return false;

    if (isManualLocationOverrideEnabled()) return false;

    if (forceUpdate) return true;

    const current = {
        state: stateEl.value || '',
        district: districtEl.value || '',
        village: villageEl.value || ''
    };

    const currentIsEmpty = !current.state && !current.district && !current.village;
    const currentIsPreviousAuto =
        current.state === (lastAutoLocation.state || '') &&
        current.district === (lastAutoLocation.district || '') &&
        current.village === (lastAutoLocation.village || '');

    const nextLooksUseful = nextLocation.state || nextLocation.district || nextLocation.village;
    return !!nextLooksUseful && (currentIsEmpty || currentIsPreviousAuto);
}

function applyResolvedLocation(locationData, forceUpdate) {
    const nextLocation = {
        state: locationData.state || '',
        district: locationData.district || '',
        village: locationData.village || ''
    };

    if (!shouldApplyLocationUpdate(nextLocation, forceUpdate)) {
        updateAutofillStatus('Map location detected. Location fields kept as manually selected.', false);
        return;
    }

    setLocationValues(nextLocation.state, nextLocation.district, nextLocation.village);
    lastAutoLocation = nextLocation;
    setLocationSource(`Source: ${locationData.display_name || 'Map reverse geocoding'}`);
    updateAutofillStatus(`Auto-filled: ${nextLocation.district || 'District N/A'}, ${nextLocation.state || 'State N/A'}`, false);
}

function scheduleMapLocationLookup(lat, lng, forceUpdate) {
    if (!isAdmin || !isMapAutofillEnabled()) return;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const geocodeKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (!forceUpdate && geocodeKey === lastGeocodeKey) return;
    lastGeocodeKey = geocodeKey;

    if (reverseGeocodeTimer) {
        clearTimeout(reverseGeocodeTimer);
    }

    reverseGeocodeTimer = setTimeout(async function() {
        updateAutofillStatus('Detecting state and district from map...', false);
        try {
            const locationData = await fetchLocationFromCoordinates(lat, lng);
            applyResolvedLocation(locationData, forceUpdate);
        } catch (err) {
            updateAutofillStatus(err.message || 'Map location detection failed.', true);
        }
    }, 650);
}

function initializeFormTabs() {
    const tabButtons = document.querySelectorAll('.form-tab-btn');
    if (!tabButtons.length) return;

    tabButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            switchFormTab(this.dataset.formTab);
        });
    });

    switchFormTab('location');
}

function switchFormTab(tabName) {
    const tabButtons = document.querySelectorAll('.form-tab-btn');
    const panels = document.querySelectorAll('.form-tab-panel');

    tabButtons.forEach(btn => {
        const isActive = btn.dataset.formTab === tabName;
        btn.classList.toggle('active', isActive);
    });

    panels.forEach(panel => {
        panel.classList.toggle('hidden', panel.id !== `form-tab-${tabName}`);
    });
}

function setMutationMode(enabled) {
    const mutationSection = document.getElementById('mutation-section');
    const mutationTabBtn = document.getElementById('form-mutation-tab-btn');

    if (!mutationSection || !mutationTabBtn) return;

    mutationSection.classList.toggle('hidden', !enabled);
    mutationTabBtn.classList.toggle('hidden', !enabled);
}

function updateSnapDistanceLabel() {
    const slider = document.getElementById('snap-distance');
    const valueLabel = document.getElementById('snap-distance-value');
    if (!slider || !valueLabel) return;

    valueLabel.textContent = `${slider.value}px`;
}

function getDrawSettings() {
    const snapEnabledEl = document.getElementById('snap-enabled');
    const snapDistanceEl = document.getElementById('snap-distance');

    return {
        snappable: snapEnabledEl ? snapEnabledEl.checked : true,
        snapDistance: snapDistanceEl ? parseInt(snapDistanceEl.value, 10) || DEFAULT_SNAP_DISTANCE : DEFAULT_SNAP_DISTANCE,
        continueDrawing: false,
        allowSelfIntersection: false
    };
}

function clearMetricsUI() {
    const areaInput = document.getElementById('form-area');
    const areaAuto = document.getElementById('area-auto');
    const areaEquivalents = document.getElementById('area-equivalents');
    const geometryMetrics = document.getElementById('geometry-metrics');
    const perimeterEl = document.getElementById('metric-perimeter');
    const centroidEl = document.getElementById('metric-centroid');

    if (areaInput) areaInput.value = '';
    if (areaAuto) areaAuto.textContent = '';
    if (areaEquivalents) {
        areaEquivalents.classList.add('hidden');
        areaEquivalents.innerHTML = '';
    }
    if (geometryMetrics) {
        geometryMetrics.classList.add('hidden');
    }
    if (perimeterEl) perimeterEl.textContent = '--';
    if (centroidEl) centroidEl.textContent = '--';
}

function clearGeometrySelection(alsoDisableDraw) {
    const geometryInput = document.getElementById('form-geometry');
    if (geometryInput) {
        geometryInput.value = '';
    }

    clearMetricsUI();

    if (drawnItems) {
        drawnItems.clearLayers();
    }
    currentSketchLayer = null;

    if (alsoDisableDraw && map) {
        map.pm.disableDraw();
    }
}

function startPolygonDraw() {
    if (!isAdmin || !map) return;

    const drawSettings = getDrawSettings();
    map.pm.disableDraw();
    map.pm.enableDraw('Polygon', drawSettings);

    showToast('Drawing started. Click points on map and double-click to finish.', 'info', 5000);
}

function finishPolygonDraw() {
    if (!isAdmin || !map) return;
    map.pm.disableDraw();
    showToast('Drawing mode closed.', 'info');
}

function cancelPolygonSelection() {
    if (!isAdmin) return;
    clearGeometrySelection(true);
    showToast('Polygon selection canceled.', 'warning');
}

function clearPolygonSelection() {
    if (!isAdmin) return;
    clearGeometrySelection(false);
    showToast('Selection cleared.', 'info');
}

function initializeDrawSettingsPanel() {
    const panel = document.getElementById('draw-settings-panel');
    if (!panel) return;

    const startBtn = document.getElementById('btn-start-draw');
    const finishBtn = document.getElementById('btn-finish-draw');
    const cancelBtn = document.getElementById('btn-cancel-selection');
    const clearBtn = document.getElementById('btn-clear-selection');
    const snapDistance = document.getElementById('snap-distance');
    const mapAutofillEnabled = document.getElementById('map-autofill-enabled');

    if (startBtn) {
        startBtn.addEventListener('click', startPolygonDraw);
    }
    if (finishBtn) {
        finishBtn.addEventListener('click', finishPolygonDraw);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelPolygonSelection);
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', clearPolygonSelection);
    }

    if (snapDistance) {
        snapDistance.addEventListener('input', updateSnapDistanceLabel);
        updateSnapDistanceLabel();
    }

    if (mapAutofillEnabled) {
        mapAutofillEnabled.addEventListener('change', function() {
            if (this.checked && map) {
                const center = map.getCenter();
                scheduleMapLocationLookup(center.lat, center.lng, false);
                updateAutofillStatus('Auto-fill enabled. Move map to update location.', false);
            } else {
                updateAutofillStatus('Auto-fill paused.', false);
            }
        });
    }

    updateAutofillStatus('Move map or draw parcel to auto-detect location.', false);
}

async function updateGeometryMetrics(geometry, options) {
    const shouldRefreshMetrics = options && options.shouldRefreshMetrics;

    if (!geometry) return;

    const geometryInput = document.getElementById('form-geometry');
    if (geometryInput) {
        geometryInput.value = JSON.stringify(geometry);
    }

    if (!shouldRefreshMetrics) {
        return;
    }

    try {
        const result = await calculateArea(geometry);

        if (!result.area) {
            return;
        }

        const area = result.area;
        const perimeter = result.perimeter || {};
        const centroid = result.centroid || {};

        const areaInput = document.getElementById('form-area');
        const areaAuto = document.getElementById('area-auto');
        const areaEquivalents = document.getElementById('area-equivalents');
        const geometryMetrics = document.getElementById('geometry-metrics');
        const perimeterEl = document.getElementById('metric-perimeter');
        const centroidEl = document.getElementById('metric-centroid');

        if (areaInput) {
            areaInput.value = area.area_ha;
        }
        if (areaAuto) {
            areaAuto.textContent = '(auto)';
        }

        if (areaEquivalents) {
            areaEquivalents.classList.remove('hidden');
            areaEquivalents.innerHTML = `
                <span><strong>${area.area_acres}</strong> Acres</span>
                <span><strong>${area.area_guntha}</strong> Guntha</span>
                <span><strong>${area.area_bigha_mp}</strong> Bigha</span>
            `;
        }

        if (geometryMetrics) {
            geometryMetrics.classList.remove('hidden');
        }

        if (perimeterEl) {
            perimeterEl.textContent = perimeter.perimeter_m
                ? `${perimeter.perimeter_m} m (${perimeter.perimeter_km || 0} km)`
                : '--';
        }

        if (centroidEl) {
            centroidEl.textContent = typeof centroid.lat === 'number' && typeof centroid.lng === 'number'
                ? `${centroid.lat.toFixed(6)}, ${centroid.lng.toFixed(6)}`
                : '--';
        }

        if (typeof centroid.lat === 'number' && typeof centroid.lng === 'number') {
            scheduleMapLocationLookup(centroid.lat, centroid.lng, true);
        }
    } catch (err) {
        console.error('Area calculation failed:', err);
        showToast('Area metrics could not be calculated.', 'warning');
    }
}

function switchBaseLayer(layerName) {
    if (!baseLayers[layerName] || layerName === currentBaseLayer) return;

    map.removeLayer(baseLayers[currentBaseLayer]);
    baseLayers[layerName].addTo(map);
    currentBaseLayer = layerName;
}

// Add India boundary mask to dim everything outside India
async function addIndiaMask(mapInstance) {
    try {
        const response = await fetch('/api/boundary');
        if (!response.ok) return;
        
        const indiaGeoJSON = await response.json();
        
        // Create a mask: large rectangle with India cut out as a hole
        const worldBounds = [
            [-180, -90],
            [180, -90],
            [180, 90],
            [-180, 90],
            [-180, -90]
        ];
        
        let maskCoordinates = [worldBounds];
        const geometry = indiaGeoJSON.features[0].geometry;
        
        if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(polygon => {
                maskCoordinates.push(polygon[0]); // Add exterior ring of each polygon as a hole
            });
        } else if (geometry.type === 'Polygon') {
            maskCoordinates.push(geometry.coordinates[0]);
        }
        
        // Create a GeoJSON with the mask (world minus India)
        const maskGeoJSON = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: maskCoordinates  // Exterior ring is world, holes are India's parts
            }
        };
        
        // Add the mask layer
        const maskLayer = L.geoJSON(maskGeoJSON, {
            style: {
                color: '#1f2937',
                weight: 2,
                fillColor: '#1f2937',
                fillOpacity: 0.7
            },
            interactive: false  // Allow clicks to pass through
        });
        
        maskLayer.addTo(mapInstance);
        
        // Add India border outline for clarity
        const indiaBorder = L.geoJSON(indiaGeoJSON, {
            style: {
                color: '#f97316',  // Orange border
                weight: 3,
                fillColor: 'transparent',
                fillOpacity: 0,
                opacity: 0.9
            },
            interactive: false
        });
        
        indiaBorder.addTo(mapInstance);
        
    } catch (err) {
        console.warn('Failed to load India boundary mask:', err);
    }
}

function initMap(adminMode) {
    isAdmin = adminMode || false;

    // Expanded India bounding box with generous margins
    const indiaBounds = L.latLngBounds(
        L.latLng(4.0, 60.0),   // Southwest (extended into ocean)
        L.latLng(40.0, 105.0)  // Northeast (extended into China/Myanmar)
    );

    map = L.map('map', {
        center: [23.5, 77.5],
        zoom: 7,
        minZoom: 4,
        maxZoom: 18,
        maxBounds: indiaBounds,
        maxBoundsViscosity: 1.0,
        zoomControl: true,
        attributionControl: true
    });

    baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        crossOrigin: true
    });

    baseLayers.google = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 20,
        crossOrigin: true
    });

    baseLayers.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 18,
        crossOrigin: true
    });

    baseLayers.osm.addTo(map);
    currentBaseLayer = 'osm';

    document.querySelectorAll('input[name="basemap"]').forEach(radio => {
        radio.addEventListener('change', function() {
            switchBaseLayer(this.value);
        });
    });

    // Add India boundary mask
    addIndiaMask(map);

    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    if (isAdmin) {
        // For Map View tab, disable all drawing controls
        map.pm.addControls({
            position: 'topleft',
            drawPolygon: false,
            drawMarker: false,
            drawCircleMarker: false,
            drawPolyline: false,
            drawRectangle: false,
            drawCircle: false,
            editMode: false,
            dragMode: false,
            cutPolygon: false,
            removalMode: false,
            rotateMode: false
        });

        // Hide Geoman toolbar by default (only shown in Add Record tab)
        setTimeout(() => {
            const geomanToolbar = document.querySelector('.leaflet-pm-toolbar');
            if (geomanToolbar) {
                geomanToolbar.style.display = 'none';
            }
        }, 100);

        map.pm.setPathOptions({
            color: '#ea580c',
            fillColor: '#fed7aa',
            fillOpacity: 0.3,
            weight: 3
        });

        map.on('pm:create', async function(e) {
            const layer = e.layer;

            drawnItems.clearLayers();
            drawnItems.addLayer(layer);
            currentSketchLayer = layer;

            map.pm.disableDraw();

            const geometry = layer.toGeoJSON().geometry;
            await updateGeometryMetrics(geometry, {
                shouldRefreshMetrics: true
            });

            switchMainTab('add-record');
            switchFormTab('parcel');

            const drawInstruction = document.getElementById('draw-instruction');
            if (drawInstruction) {
                drawInstruction.style.display = 'none';
            }

            showToast('Polygon ready. Review parcel details and save.', 'success');
        });

        map.on('pm:edit', async function(e) {
            const layer = e.layer;
            if (!layer) return;

            currentSketchLayer = layer;
            const geometry = layer.toGeoJSON().geometry;
            await updateGeometryMetrics(geometry, {
                shouldRefreshMetrics: true
            });
        });

        map.on('pm:remove', function() {
            clearGeometrySelection(false);
        });
    }

    map.on('mousemove', function(e) {
        const coordsEl = document.getElementById('cursor-coords');
        if (coordsEl) {
            coordsEl.textContent = `Lat: ${e.latlng.lat.toFixed(6)}, Lng: ${e.latlng.lng.toFixed(6)}`;
        }
    });

    if (isAdmin) {
        map.on('moveend', function() {
            const center = map.getCenter();
            scheduleMapLocationLookup(center.lat, center.lng, false);
        });

        map.on('click', function(e) {
            if (map.pm && typeof map.pm.globalDrawModeEnabled === 'function' && map.pm.globalDrawModeEnabled()) {
                return;
            }
            scheduleMapLocationLookup(e.latlng.lat, e.latlng.lng, true);
        });
    }

    loadRecordsOnMap();
}

async function loadRecordsOnMap() {
    try {
        const records = await fetchRecords();
        allRecordsCache = records;

        if (isAdmin) {
            syncLocationCatalogWithRecords(records);
            populateStateFilter(records);
            populateDistrictFilter(records);

            const { stateEl, districtEl, villageEl } = getFormElements();
            const selectedState = stateEl ? stateEl.value : '';
            const selectedDistrict = districtEl ? districtEl.value : '';
            const selectedVillage = villageEl ? villageEl.value : '';

            refreshStateOptions(selectedState);
            refreshDistrictOptions(selectedDistrict);
            refreshVillageOptions(selectedVillage);

            applyAdminFilters(false);
            return;
        }

        clearMapLayers();
        addRecordsToMap(records);
    } catch (err) {
        console.error('Failed to load records:', err);
        showToast('Failed to load land records.', 'error');
    }
}

function clearMapLayers() {
    parcelLayers.forEach(layer => {
        map.removeLayer(layer);
    });
    parcelLayers = [];
}

function addRecordsToMap(records) {
    records.forEach(record => {
        if (!record.geometry || record.geometry.type !== 'Polygon') return;

        const landUse = (record.attributes && record.attributes.land_use) || 'agricultural';
        const color = getLandUseColor(landUse);

        const geoJsonLayer = L.geoJSON(record.geometry, {
            style: function() {
                return {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.25,
                    weight: 2.5,
                    opacity: 0.9
                };
            },
            onEachFeature: function(_feature, layer) {
                layer.on('click', function() {
                    onParcelClick(record, layer);
                });

                layer.on('mouseover', function() {
                    this.setStyle({ fillOpacity: 0.45, weight: 3.5 });
                });
                layer.on('mouseout', function() {
                    this.setStyle({ fillOpacity: 0.25, weight: 2.5 });
                });

                const attrs = record.attributes || {};
                const owner = record.owner || {};
                const loc = record.location || {};

                layer.bindTooltip(
                    `<div class="tooltip-content">
                        <div class="tooltip-title">${record.khasra_no || 'N/A'}</div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">ULPIN:</span>
                            <span class="tooltip-value">${record.ulpin || 'N/A'}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Land Use:</span>
                            <span class="tooltip-value">${landUse}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Area:</span>
                            <span class="tooltip-value">${attrs.area_ha || '?'} Ha</span>
                        </div>
                        <div class="tooltip-divider"></div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Owner:</span>
                            <span class="tooltip-value">${owner.name || 'N/A'}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Location:</span>
                            <span class="tooltip-value">${loc.village || '?'}, ${loc.district || '?'}</span>
                        </div>
                        <div class="tooltip-hint">Click to view details →</div>
                    </div>`,
                    { sticky: true, className: 'parcel-tooltip', direction: 'top', offset: [0, -10] }
                );
            }
        });

        geoJsonLayer.addTo(map);
        geoJsonLayer._recordId = record._id;
        parcelLayers.push(geoJsonLayer);
    });

    if (isAdmin) {
        renderRecordsList(records);
    }
}

function getLandUseColor(landUse) {
    const colors = {
        Agricultural: '#22c55e',
        Residential: '#3b82f6',
        Commercial: '#f59e0b',
        Industrial: '#8b5cf6',
        Government: '#ef4444',
        Forest: '#065f46',
        Wasteland: '#9ca3af'
    };
    return colors[landUse] || '#6b7280';
}

function onParcelClick(record) {
    if (isAdmin) {
        showAdminDetails(record);
        flyToRecord(record);
    } else if (typeof showViewerInfo === 'function') {
        showViewerInfo(record);
    }
}

function flyToRecord(record) {
    if (!record.geometry) return;
    const geoJsonLayer = L.geoJSON(record.geometry);
    const bounds = geoJsonLayer.getBounds();
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
}

function switchRecordsView(mode) {
    const cardsContainer = document.getElementById('records-list-cards');
    const tableContainer = document.getElementById('records-list-table');

    if (!cardsContainer || !tableContainer) return;

    recordsViewMode = mode === 'table' ? 'table' : 'cards';

    cardsContainer.classList.toggle('hidden', recordsViewMode !== 'cards');
    tableContainer.classList.toggle('hidden', recordsViewMode !== 'table');

    document.querySelectorAll('.records-view-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === recordsViewMode);
    });
}

function renderRecordsList(records) {
    const cardsEl = document.getElementById('records-list-cards');
    const tableEl = document.getElementById('records-list-table');
    const noRecordsEl = document.getElementById('no-records');
    const countLabel = document.getElementById('records-count-label');

    if (!cardsEl || !tableEl) return;

    if (countLabel) {
        countLabel.textContent = String(records.length);
    }

    if (records.length === 0) {
        cardsEl.innerHTML = '';
        tableEl.innerHTML = '';
        if (noRecordsEl) noRecordsEl.classList.remove('hidden');
        return;
    }

    if (noRecordsEl) noRecordsEl.classList.add('hidden');

    cardsEl.innerHTML = records.map(rec => {
        const attrs = rec.attributes || {};
        const owner = rec.owner || {};
        const loc = rec.location || {};
        const landUse = attrs.land_use || 'Unknown';
        const badgeClass = 'badge-' + landUse.toLowerCase();

        return `
            <div class="record-card fade-in ${selectedRecordId === rec._id ? 'active' : ''}"
                 data-id="${rec._id}">
                <div class="flex items-center justify-between mb-1">
                    <span class="font-semibold text-gray-800 text-sm">${rec.khasra_no || 'N/A'}</span>
                    <span class="land-use-badge ${badgeClass}">${landUse}</span>
                </div>
                <div class="text-xs text-gray-500 space-y-0.5">
                    <div>ULPIN: <span class="font-mono">${rec.ulpin || 'N/A'}</span></div>
                    <div>${owner.name || 'No Owner'} | ${attrs.area_ha || '?'} Ha</div>
                    <div>${loc.village || ''}, ${loc.district || ''}</div>
                </div>
                <div class="flex items-center justify-between mt-2">
                    <div class="text-xs text-gray-500">
                        <div>${loc.state || ''} • ${loc.district || ''}</div>
                    </div>
                    <button type="button" class="view-record-btn bg-orange-600 hover:bg-orange-700 text-white text-xs px-4 py-1.5 rounded-lg transition font-medium">
                        View
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Attach click handlers for view buttons
    cardsEl.querySelectorAll('.view-record-btn').forEach((btn, index) => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.record-card');
            if (card) {
                viewRecordDetails(records[index]._id);
            }
        });
    });

    tableEl.innerHTML = records.map((rec, index) => {
        const attrs = rec.attributes || {};
        const loc = rec.location || {};
        const landUse = attrs.land_use || 'Unknown';
        const recordValue = asNumber(attrs.area_ha) * asNumber(attrs.circle_rate_inr);

        return `
            <div class="record-table-row ${selectedRecordId === rec._id ? 'active' : ''}" data-id="${rec._id}">
                <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-gray-800 truncate">${escapeHtml(rec.khasra_no || 'N/A')}</p>
                        <p class="text-[11px] text-gray-500 truncate">${escapeHtml(rec.ulpin || 'N/A')} | ${escapeHtml(loc.district || 'N/A')}</p>
                    </div>
                    <button type="button" class="view-record-btn-table bg-orange-600 hover:bg-orange-700 text-white text-[11px] px-2 py-1 rounded">View</button>
                </div>
                <div class="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                    <span>${escapeHtml(landUse)}</span>
                    <span>${asNumber(attrs.area_ha).toFixed(2)} Ha</span>
                    <span>Rs. ${formatInr(recordValue)}</span>
                </div>
            </div>
        `;
    }).join('');

    // Attach click handlers for table view buttons
    tableEl.querySelectorAll('.view-record-btn-table').forEach((btn, index) => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const row = this.closest('.record-table-row');
            if (row) {
                viewRecordDetails(records[index]._id);
            }
        });
    });

    switchRecordsView(recordsViewMode);
}

async function selectRecord(recordId) {
    selectedRecordId = recordId;

    document.querySelectorAll('.record-card').forEach(el => {
        el.classList.toggle('active', el.dataset.id === recordId);
    });

    document.querySelectorAll('.record-table-row').forEach(el => {
        el.classList.toggle('active', el.dataset.id === recordId);
    });

    try {
        const record = await fetchRecord(recordId);
        flyToRecord(record);
        showAdminDetails(record);
    } catch (_err) {
        showToast('Failed to load record details.', 'error');
    }
}

// View record details in full screen tab
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
        
        const value = asNumber(attrs.area_ha) * asNumber(attrs.circle_rate_inr);
        document.getElementById('view-value').textContent = 'Rs. ' + formatInr(value);
        
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
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium text-gray-800">${m.previous_owner} (${m.previous_share_pct}%)</span>
                        <span class="text-xs text-gray-500">${m.mutation_type}</span>
                    </div>
                    <p class="text-xs text-gray-600 mt-1">Date: ${m.mutation_date} | Ref: ${m.mutation_ref || 'N/A'}</p>
                    ${docLinkHTML}
                </div>
            `;
            }).join('');
        } else {
            mutationsEl.innerHTML = '<p class="text-sm text-gray-500">No mutation history</p>';
        }
        
        // Initialize small map after tab switch
        setTimeout(() => initViewRecordMap(record), 200);
        
    } catch (_err) {
        showToast('Failed to load record details.', 'error');
    }
}

// Initialize small map for view record tab
function initViewRecordMap(record) {
    if (!document.getElementById('view-record-map')) return;
    
    // Destroy existing map if any
    if (viewRecordMap) {
        viewRecordMap.remove();
        viewRecordMap = null;
    }
    
    // Expanded India bounding box with generous margins
    const indiaBounds = L.latLngBounds(
        L.latLng(4.0, 60.0),   // Southwest (extended into ocean)
        L.latLng(40.0, 105.0)  // Northeast (extended into China/Myanmar)
    );

    viewRecordMap = L.map('view-record-map', {
        center: [23.5, 77.5],
        zoom: 7,
        minZoom: 4,
        maxZoom: 18,
        maxBounds: indiaBounds,
        maxBoundsViscosity: 1.0,
        zoomControl: true
    });
    
    // Add basemap layers for view record map
    const viewBaseLayers = {};
    viewBaseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
        crossOrigin: true
    });
    viewBaseLayers.google = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 20,
        crossOrigin: true
    });
    viewBaseLayers.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 18,
        crossOrigin: true
    });
    
    viewBaseLayers.osm.addTo(viewRecordMap);
    let currentViewBaseLayer = 'osm';
    
    // Handle layer switching for view record map
    document.querySelectorAll('input[name="view-basemap"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (viewBaseLayers[this.value] && this.value !== currentViewBaseLayer) {
                viewRecordMap.removeLayer(viewBaseLayers[currentViewBaseLayer]);
                viewBaseLayers[this.value].addTo(viewRecordMap);
                currentViewBaseLayer = this.value;
            }
        });
    });
    
    // Coordinate display
    viewRecordMap.on('mousemove', function(e) {
        const coordsEl = document.getElementById('view-cursor-coords');
        if (coordsEl) {
            coordsEl.textContent = `Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}`;
        }
    });
    
    // Add parcel geometry
    if (record.geometry) {
        const landUse = (record.attributes && record.attributes.land_use) || '';
        const color = getLandUseColor(landUse);
        
        const geoJsonLayer = L.geoJSON(record.geometry, {
            style: {
                color: color || '#ea580c',
                fillColor: color || '#ea580c',
                fillOpacity: 0.35,
                weight: 3
            }
        });
        
        geoJsonLayer.addTo(viewRecordMap);
        
        const bounds = geoJsonLayer.getBounds();
        viewRecordMap.fitBounds(bounds, { padding: [40, 40] });
    }
    
    setTimeout(() => {
        viewRecordMap.invalidateSize();
        // Add India mask to view record map
        addIndiaMask(viewRecordMap);
    }, 200);
}

function showAdminDetails(record) {
    selectedRecordId = record._id;
    selectedRecord = record; // Save for print/delete buttons

    // Show details in the map overlay panel instead of sidebar
    const detailsPanel = document.getElementById('map-details-panel');
    const detailsActions = document.getElementById('map-details-actions');
    if (detailsPanel) {
        detailsPanel.classList.remove('hidden');
    }
    if (detailsActions) {
        detailsActions.classList.remove('hidden');
    }
    
    const content = document.getElementById('map-details-content');
    if (!content) return;

    const loc = record.location || {};
    const attrs = record.attributes || {};
    const owner = record.owner || {};
    const mutations = record.mutation_history || [];

    let mutationHtml = '';
    if (mutations.length > 0) {
        mutationHtml = `
            <div class="mt-3">
                <p class="text-xs font-semibold text-gray-500 mb-1">MUTATION HISTORY</p>
                <div class="space-y-2">
                    ${mutations.map(m => `
                        <div class="bg-yellow-50 p-2 rounded text-xs">
                            <div class="font-semibold">${m.previous_owner} (${m.previous_share_pct}%)</div>
                            <div class="text-gray-500">${m.mutation_type} on ${m.mutation_date}</div>
                            <div class="text-gray-400">Ref: ${m.mutation_ref || 'N/A'}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    content.innerHTML = `
        <div class="fade-in">
            <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-bold text-gray-800">${record.khasra_no || 'N/A'}</h3>
                <span class="land-use-badge badge-${(attrs.land_use || '').toLowerCase()}">${attrs.land_use || 'N/A'}</span>
            </div>

            <div class="space-y-2 text-xs">
                <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span class="text-gray-500">ULPIN</span>
                    <span class="font-mono">${record.ulpin || 'N/A'}</span>
                    <span class="text-gray-500">Khata No.</span>
                    <span>${record.khata_no || 'N/A'}</span>
                    <span class="text-gray-500">Area</span>
                    <span>${attrs.area_ha || 'N/A'} Ha</span>
                    <span class="text-gray-500">Circle Rate</span>
                    <span>Rs. ${(attrs.circle_rate_inr || 0).toLocaleString()}/ha</span>
                    <span class="text-gray-500">Village</span>
                    <span>${loc.village || 'N/A'}</span>
                    <span class="text-gray-500">District</span>
                    <span>${loc.district || 'N/A'}</span>
                    <span class="text-gray-500">State</span>
                    <span>${loc.state || 'N/A'}</span>
                </div>

                <hr class="my-2">
                <p class="text-xs font-semibold text-gray-500">OWNER</p>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span class="text-gray-500">Name</span>
                    <span class="font-medium">${owner.name || 'N/A'}</span>
                    <span class="text-gray-500">Share</span>
                    <span>${owner.share_pct || 'N/A'}%</span>
                    <span class="text-gray-500">Aadhaar</span>
                    <span class="font-mono">${owner.aadhaar_mask || 'N/A'}</span>
                </div>

                ${mutationHtml}
            </div>

            <div class="mt-4">
                <button id="btn-map-edit"
                    class="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs py-2 rounded-lg transition flex items-center justify-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    Edit / Mutate
                </button>
            </div>
        </div>
    `;
    
    // Attach edit button handler
    const editBtn = document.getElementById('btn-map-edit');
    if (editBtn) {
        editBtn.addEventListener('click', function() {
            editRecord(record._id);
        });
    }
}

async function editRecord(recordId) {
    try {
        const record = await fetchRecord(recordId);
        switchMainTab('add-record');
        
        // Wait for tab to show
        await new Promise(resolve => setTimeout(resolve, 200));

        const { manualOverrideEl } = getFormElements();
        if (manualOverrideEl) {
            manualOverrideEl.checked = false;
        }
        toggleManualLocationOverride(false);

        document.getElementById('form-record-id').value = record._id;
        document.getElementById('form-title').textContent = 'Edit Record: ' + (record.khasra_no || '');
        document.getElementById('form-khasra').value = record.khasra_no || '';
        document.getElementById('form-khata').value = record.khata_no || '';
        document.getElementById('form-ulpin').value = record.ulpin || '';
        document.getElementById('form-land-use').value = (record.attributes && record.attributes.land_use) || '';
        document.getElementById('form-area').value = (record.attributes && record.attributes.area_ha) || '';
        document.getElementById('form-circle-rate').value = (record.attributes && record.attributes.circle_rate_inr) || 0;
        document.getElementById('form-owner-name').value = (record.owner && record.owner.name) || '';
        document.getElementById('form-share').value = (record.owner && record.owner.share_pct) || 100;
        document.getElementById('form-aadhaar').value = (record.owner && record.owner.aadhaar_mask) || '';

        const loc = record.location || {};
        setLocationValues(loc.state || '', loc.district || '', loc.village || '');
        setLocationSource('Source: loaded from existing record');

        const geometry = record.geometry || null;
        if (geometry) {
            // Update geometry metrics
            await updateGeometryMetricsForAddRecord(geometry);
            
            // Clear existing layers on add record map
            if (addRecordDrawnItems) {
                addRecordDrawnItems.clearLayers();
            }
            
            // Add existing geometry to add record map
            const editableLayer = L.geoJSON(geometry, {
                style: {
                    color: '#ea580c',
                    fillColor: '#fed7aa',
                    fillOpacity: 0.4,
                    weight: 3
                }
            });

            editableLayer.eachLayer(layer => {
                if (addRecordDrawnItems) {
                    addRecordDrawnItems.addLayer(layer);
                }
                currentSketchLayer = layer;
            });
            
            // Enable editing on the layer
            if (addRecordMap) {
                // Fly to the parcel
                const bounds = editableLayer.getBounds();
                addRecordMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                
                // Enable edit mode
                setTimeout(() => {
                    editableLayer.eachLayer(layer => {
                        if (layer.pm) {
                            layer.pm.enable();
                        }
                    });
                }, 300);
            }
        }

        setMutationMode(true);
        document.getElementById('form-submit-btn').textContent = 'Update Record';

        const drawInstruction = document.getElementById('draw-instruction');
        if (drawInstruction) {
            drawInstruction.style.display = 'none';
        }

        const drawStatus = document.getElementById('draw-status');
        if (drawStatus) {
            drawStatus.innerHTML = '<strong>Editing existing record.</strong> You can modify the polygon on the map.';
            drawStatus.className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
        }

        switchFormTab('location');
    } catch (_err) {
        showToast('Failed to load record for editing.', 'error');
    }
}

async function capturePolygonMapForPdf(geometry) {
    return new Promise((resolve) => {
        const W = 800, H = 450;
        const wrap = document.createElement('div');
        // Must be in-viewport for tiles to load and html-to-image to work
        // Use opacity near-zero so user never sees it
        wrap.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99999;opacity:0.01;pointer-events:none;`;
        document.body.appendChild(wrap);

        const pdfMap = L.map(wrap, { zoomControl: false, attributionControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(pdfMap);

        if (geometry && geometry.coordinates && geometry.coordinates[0]) {
            const latlngs = geometry.coordinates[0].map(c => [c[1], c[0]]);
            const poly = L.polygon(latlngs, {
                color: '#dc2626', weight: 3,
                fillColor: '#fca5a5', fillOpacity: 0.35
            }).addTo(pdfMap);
            pdfMap.fitBounds(poly.getBounds(), { padding: [55, 55] });
        } else {
            pdfMap.setView([23.5, 77.5], 5);
        }

        setTimeout(async () => {
            try {
                // Briefly make fully visible for capture
                wrap.style.opacity = '1';
                const dataUrl = await window.htmlToImage.toPng(wrap, { pixelRatio: 1.5, width: W, height: H });
                resolve(dataUrl);
            } catch (e) {
                console.warn('PDF map capture error:', e);
                resolve(null);
            } finally {
                try { pdfMap.remove(); } catch (_) {}
                try { document.body.removeChild(wrap); } catch (_) {}
            }
        }, 2500);
    });
}

async function printCard(ulpin) {
    if (!ulpin) {
        showToast('No ULPIN available for this record.', 'error');
        return;
    }

    showToast('Generating PDF — capturing map, please wait...', 'info');

    // Get geometry from selected record or cache
    const record = selectedRecord || (allRecordsCache || []).find(r => r.ulpin === ulpin);
    const geometry = record && record.geometry;

    let mapImageBase64 = null;
    if (geometry && typeof window.htmlToImage !== 'undefined') {
        mapImageBase64 = await capturePolygonMapForPdf(geometry);
    }

    try {
        const res = await fetch(getPropertyCardUrl(ulpin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...FETCH_OPTS.headers },
            body: JSON.stringify({ map_image: mapImageBase64 })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to generate property card');
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        downloadFile(url, `Property_Card_${ulpin}.pdf`);
        window.URL.revokeObjectURL(url);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function confirmDelete(recordId, khasraNo) {
    showConfirmModal(`Are you sure you want to delete record "${khasraNo}"?\n\nThis action cannot be undone.`, () => {
        deleteRecord(recordId).then(() => {
            showToast(`Record "${khasraNo}" deleted successfully.`, 'success');
            selectedRecordId = null;
            selectedRecord = null;
            
            // Hide details panel
            const detailsPanel = document.getElementById('map-details-panel');
            const detailsActions = document.getElementById('map-details-actions');
            if (detailsPanel) detailsPanel.classList.add('hidden');
            if (detailsActions) detailsActions.classList.add('hidden');
            
            loadRecordsOnMap();
            switchMainTab('records');
        }).catch(err => {
            showToast(`Delete failed: ${err.message}`, 'error');
        });
    });
}

// Initialize Add Record map (split view)
function initAddRecordMap() {
    if (!document.getElementById('add-record-map')) return;

    // Expanded India bounding box with generous margins
    const indiaBounds = L.latLngBounds(
        L.latLng(4.0, 60.0),   // Southwest (extended into ocean)
        L.latLng(40.0, 105.0)  // Northeast (extended into China/Myanmar)
    );

    addRecordMap = L.map('add-record-map', {
        center: [23.5, 77.5],
        zoom: 7,
        minZoom: 4,
        maxZoom: 18,
        maxBounds: indiaBounds,
        maxBoundsViscosity: 1.0,
        zoomControl: true
    });
    
    // Add basemap layers for add record map
    const addBaseLayers = {};
    addBaseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    });
    addBaseLayers.google = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 20
    });
    addBaseLayers.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 18
    });
    
    addBaseLayers.osm.addTo(addRecordMap);
    let currentAddBaseLayer = 'osm';
    
    // Handle layer switching for add record map
    document.querySelectorAll('input[name="add-basemap"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (addBaseLayers[this.value] && this.value !== currentAddBaseLayer) {
                addRecordMap.removeLayer(addBaseLayers[currentAddBaseLayer]);
                addBaseLayers[this.value].addTo(addRecordMap);
                currentAddBaseLayer = this.value;
            }
        });
    });
    
    addRecordDrawnItems = new L.FeatureGroup();
    addRecordMap.addLayer(addRecordDrawnItems);

    // Add India mask to add record map
    addIndiaMask(addRecordMap);

    // Debug: verify PM is initialized
    console.log('Add Record Map PM initialized:', !!addRecordMap.pm);
    
    // Handle polygon creation on add record map
    addRecordMap.on('pm:create', async function(e) {
        console.log('pm:create fired on add-record-map', e);
        const layer = e.layer;
        addRecordDrawnItems.clearLayers();
        addRecordDrawnItems.addLayer(layer);
        currentSketchLayer = layer;
        
        // Make polygon editable
        if (layer.pm) {
            layer.pm.enable();
        }
        
        const geometry = layer.toGeoJSON().geometry;
        
        // Set geometry IMMEDIATELY
        const geometryInput = document.getElementById('form-geometry');
        if (geometryInput) {
            geometryInput.value = JSON.stringify(geometry);
            console.log('Geometry set to:', geometryInput.value.substring(0, 50) + '...');
        }
        
        await updateGeometryMetricsForAddRecord(geometry);
        
        // Auto-fill location from drawn parcel centroid
        const centroid = L.geoJSON(geometry).getBounds().getCenter();
        lookupLocationForAddRecord(centroid.lat, centroid.lng);
        
        document.getElementById('draw-status').innerHTML = '<strong>Polygon ready!</strong> Location auto-filled. Fill in the details below.';
        document.getElementById('draw-status').className = 'bg-green-50 border-l-4 border-green-500 rounded-r-lg p-3 text-sm text-green-800';
        
        showToast('Polygon drawn and saved. Fill in parcel details and save.', 'success');
    });
    
    // Handle edits to existing polygons
    addRecordMap.on('pm:edit', async function(e) {
        const layer = e.layer;
        if (!layer) return;
        
        currentSketchLayer = layer;
        const geometry = layer.toGeoJSON().geometry;
        await updateGeometryMetricsForAddRecord(geometry);
    });
    
    // Handle removal
    addRecordMap.on('pm:remove', function() {
        document.getElementById('form-geometry').value = '';
        clearMetricsUI();
        document.getElementById('draw-status').innerHTML = '<strong>Waiting for map drawing...</strong> Draw a parcel on the map to continue.';
        document.getElementById('draw-status').className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
    });
    
    // Auto-fill location on map move
    addRecordMap.on('moveend', function() {
        const center = addRecordMap.getCenter();
        lookupLocationForAddRecord(center.lat, center.lng);
    });
    
    // Add draw button handler - start drawing polygon
    const startDrawBtn = document.getElementById('btn-start-draw-new');
    if (startDrawBtn) {
        startDrawBtn.addEventListener('click', function() {
            // Clear any existing shapes first
            addRecordDrawnItems.clearLayers();
            document.getElementById('form-geometry').value = '';
            clearMetricsUI();
            
            // Start drawing mode
            addRecordMap.pm.enableDraw('Polygon', {
                snappable: true,
                snapDistance: 20,
                continueDrawing: false,
                allowSelfIntersection: false,
                finishOn: 'dblclick'
            });
            
            document.getElementById('draw-status').innerHTML = '<strong>Drawing mode active.</strong> Click to add points. Double-click to finish.';
            document.getElementById('draw-status').className = 'bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg p-3 text-sm text-yellow-800';
            
            showToast('Click points on the map to draw. Double-click to finish the polygon.', 'info', 5000);
        });
    }
    
    // Finish drawing button
    const finishDrawBtn = document.getElementById('btn-finish-draw-new');
    if (finishDrawBtn) {
        finishDrawBtn.addEventListener('click', function() {
            addRecordMap.pm.disableDraw();
            showToast('Drawing mode closed.', 'info');
        });
    }
    
    // Cancel drawing button
    const cancelDrawBtn = document.getElementById('btn-cancel-draw-new');
    if (cancelDrawBtn) {
        cancelDrawBtn.addEventListener('click', function() {
            addRecordMap.pm.disableDraw();
            addRecordDrawnItems.clearLayers();
            currentSketchLayer = null;
            document.getElementById('form-geometry').value = '';
            clearMetricsUI();
            document.getElementById('draw-status').innerHTML = '<strong>Waiting for map drawing...</strong> Draw a parcel on the map to continue.';
            document.getElementById('draw-status').className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
            showToast('Drawing cancelled.', 'warning');
        });
    }
    
    // Clear selection button
    const clearDrawBtn = document.getElementById('btn-clear-draw-new');
    if (clearDrawBtn) {
        clearDrawBtn.addEventListener('click', function() {
            addRecordMap.pm.disableDraw();
            addRecordDrawnItems.clearLayers();
            currentSketchLayer = null;
            document.getElementById('form-geometry').value = '';
            clearMetricsUI();
            document.getElementById('draw-status').innerHTML = '<strong>Waiting for map drawing...</strong> Draw a parcel on the map to continue.';
            document.getElementById('draw-status').className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
            showToast('Drawing cleared.', 'info');
        });
    }
    
    setTimeout(() => addRecordMap.invalidateSize(), 200);
}

// Lookup location for Add Record map
let addRecordLookupTimer = null;
function lookupLocationForAddRecord(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    
    // Check if manual override is enabled
    const manualOverride = document.getElementById('location-manual-override');
    if (manualOverride && manualOverride.checked) return;
    
    if (addRecordLookupTimer) {
        clearTimeout(addRecordLookupTimer);
    }

    // Show "Detecting..." in the GPS banner
    const gpsBanner = document.getElementById('gps-detected-banner');
    if (gpsBanner) {
        gpsBanner.classList.remove('hidden');
        gpsBanner.innerHTML = `
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-green-600 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                <span class="text-xs font-semibold text-green-700">Detecting location from GPS coordinates...</span>
            </div>`;
    }
    
    addRecordLookupTimer = setTimeout(async function() {
        try {
            const locationData = await fetchLocationFromCoordinates(lat, lng);
            if (locationData && locationData.state && locationData.district && locationData.village) {
                // Store what GPS detected
                lastGpsDetectedLocation = {
                    state: locationData.state,
                    district: locationData.district,
                    village: locationData.village
                };

                // Update form dropdowns if not in manual override mode
                const manualOverrideNow = document.getElementById('location-manual-override');
                if (!manualOverrideNow || !manualOverrideNow.checked) {
                    setLocationValues(locationData.state, locationData.district, locationData.village);
                    document.getElementById('form-location-source').textContent = `Source: ${locationData.display_name || 'Map reverse geocoding'}`;
                }

                // Update GPS banner with confirmed location
                if (gpsBanner) {
                    gpsBanner.innerHTML = `
                        <div class="flex items-start gap-2">
                            <svg class="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                            <div>
                                <p class="text-xs font-bold text-green-800">GPS Detected Location</p>
                                <p class="text-xs text-green-700 mt-0.5">
                                    <span class="font-semibold">${escapeHtml(locationData.state)}</span> &rsaquo;
                                    <span class="font-semibold">${escapeHtml(locationData.district)}</span> &rsaquo;
                                    ${escapeHtml(locationData.village)}
                                </p>
                            </div>
                        </div>`;
                }
            } else {
                lastGpsDetectedLocation = { state: '', district: '', village: '' };
                if (gpsBanner) gpsBanner.classList.add('hidden');
            }
        } catch (err) {
            console.error('Location lookup failed:', err);
            if (gpsBanner) gpsBanner.classList.add('hidden');
        }
    }, 800);
}

async function updateGeometryMetricsForAddRecord(geometry) {
    const geometryInput = document.getElementById('form-geometry');
    
    // Set geometry IMMEDIATELY so form can save
    if (geometryInput) geometryInput.value = JSON.stringify(geometry);
    
    // Now fetch area metrics
    try {
        const result = await calculateArea(geometry);
        
        // API returns: { area: { area_ha, area_acres, ... }, perimeter: {...}, centroid: {...} }
        const areaData = result.area || result;
        const perimeterData = result.perimeter || {};
        const centroidData = result.centroid || {};
        
        const areaInput = document.getElementById('form-area');
        const areaAuto = document.getElementById('area-auto');
        const areaEquivalents = document.getElementById('area-equivalents');
        const geometryMetrics = document.getElementById('geometry-metrics');
        const perimeterEl = document.getElementById('metric-perimeter');
        const centroidEl = document.getElementById('metric-centroid');
        
        if (areaInput) areaInput.value = areaData.area_ha || '';
        if (areaAuto) areaAuto.textContent = `(Auto-calculated)`;
        
        if (areaEquivalents) {
            areaEquivalents.classList.remove('hidden');
            const bigha = areaData.area_bigha_assam || (areaData.area_ha * 7.4752).toFixed(2);
            const lecha = areaData.area_lecha_assam || Math.round(areaData.area_ha * 747.52);
            areaEquivalents.innerHTML = `
                <div><strong>${areaData.area_ha || '?'}</strong> Ha</div>
                <div><strong>${areaData.area_acres || '?'}</strong> Acres</div>
                <div><strong>${areaData.area_guntha || '?'}</strong> Guntha</div>
                <div style="color:#ea580c"><strong>${bigha}</strong> Bigha</div>
                <div style="color:#ea580c"><strong>${lecha}</strong> Lecha</div>
            `;
        }
        
        if (geometryMetrics) {
            geometryMetrics.classList.remove('hidden');
            if (perimeterEl) perimeterEl.textContent = perimeterData.perimeter ? perimeterData.perimeter + ' m' : '--';
            if (centroidEl) centroidEl.textContent = centroidData.lat ? centroidData.lat.toFixed(4) + ', ' + (centroidData.lng || centroidData.lon).toFixed(4) : '--';
        }
    } catch (err) {
        console.error('Failed to calculate area:', err);
        showToast('Area calculation failed but geometry is saved. You can still save the record.', 'warning');
    }
}

function switchSidebarTab(tabName) {
    // Legacy function - redirect to new main tab switching
    switchMainTab(tabName);
}

function switchMainTab(tabName) {
    const dashboardPanel = document.getElementById('main-tab-dashboard');
    const recordsPanel = document.getElementById('main-tab-records');
    const mapPanel = document.getElementById('main-tab-map');
    const addRecordPanel = document.getElementById('main-tab-add-record');
    const viewRecordPanel = document.getElementById('main-tab-view-record');
    const profilePanel = document.getElementById('main-tab-profile');
    const usersPanel = document.getElementById('main-tab-users');
    const reportsPanel = document.getElementById('main-tab-reports');

    document.querySelectorAll('.main-tab-btn').forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
        if (isActive) tab.classList.add('bg-green-50', 'text-green-700');
        else tab.classList.remove('bg-green-50', 'text-green-700');
    });

    if (dashboardPanel) dashboardPanel.classList.toggle('hidden', tabName !== 'dashboard');
    if (recordsPanel) recordsPanel.classList.toggle('hidden', tabName !== 'records');
    if (mapPanel) mapPanel.classList.toggle('hidden', tabName !== 'map');
    if (addRecordPanel) addRecordPanel.classList.toggle('hidden', tabName !== 'add-record');
    if (viewRecordPanel) viewRecordPanel.classList.toggle('hidden', tabName !== 'view-record');
    if (profilePanel) profilePanel.classList.toggle('hidden', tabName !== 'profile');
    if (usersPanel) usersPanel.classList.toggle('hidden', tabName !== 'users');
    if (reportsPanel) reportsPanel.classList.toggle('hidden', tabName !== 'reports');

    // Show/hide Geoman toolbar based on tab
    const geomanToolbar = document.querySelector('.leaflet-pm-toolbar');
    if (geomanToolbar) {
        // Only show toolbar in Add Record tab (for drawing)
        if (tabName === 'add-record') {
            geomanToolbar.style.display = 'block';
        } else {
            geomanToolbar.style.display = 'none';
        }
    }

    // Load users when switching to users tab
    if (tabName === 'users') {
        loadUsers();
    }
    
    // Load feedback when switching to reports tab
    if (tabName === 'reports') {
        loadFeedback();
    }

    // Invalidate map size when switching to map tabs
    if (tabName === 'map' && map) {
        setTimeout(() => map.invalidateSize(), 100);
    }
    if (tabName === 'add-record' && addRecordMap) {
        setTimeout(() => addRecordMap.invalidateSize(), 100);
    }
    if (tabName === 'view-record' && viewRecordMap) {
        setTimeout(() => viewRecordMap.invalidateSize(), 100);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Basic setup
    const refreshBtn = document.getElementById('btn-refresh-feedback');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadFeedback);
    }

    // Check if we're on the admin dashboard
    if (!document.getElementById('map')) return;

    // --- Prevent back button from exiting to login page ---
    // Push a state when page loads so back button stays within the app
    history.pushState({ page: 'admin', tab: 'records' }, '', window.location.href);

    // Intercept back button
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.page === 'admin') {
            // User pressed back, but we push state again to keep them in the app
            // Optionally, you could navigate to a previous tab instead
            history.pushState({ page: 'admin', tab: 'records' }, '', window.location.href);
            switchMainTab('records');
        }
    });

    initializeFormTabs();
    initializeLocationFilters();

    initMap(true);
    initializeDrawSettingsPanel();
    initAddRecordMap();

    // Initialize main tab buttons
    document.querySelectorAll('.main-tab-btn').forEach(tab => {
        tab.addEventListener('click', function() {
            switchMainTab(this.dataset.tab);
        });
    });
    
    // Start with dashboard tab active
    switchMainTab('dashboard');
    
    // Back to records button
    const backBtn = document.getElementById('btn-back-to-records');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            switchMainTab('records');
        });
    }
    
    // View record tab action buttons
    const viewEditBtn = document.getElementById('btn-view-edit');
    if (viewEditBtn) {
        viewEditBtn.addEventListener('click', function() {
            if (selectedRecord) editRecord(selectedRecord._id);
        });
    }
    
    const viewPrintBtn = document.getElementById('btn-view-print');
    if (viewPrintBtn) {
        viewPrintBtn.addEventListener('click', function() {
            if (selectedRecord && selectedRecord.ulpin) printCard(selectedRecord.ulpin);
            else showToast('No ULPIN available.', 'error');
        });
    }
    
    const viewDeleteBtn = document.getElementById('btn-view-delete');
    if (viewDeleteBtn) {
        viewDeleteBtn.addEventListener('click', function() {
            if (selectedRecord) confirmDelete(selectedRecord._id, selectedRecord.khasra_no || '');
            else showToast('No record selected.', 'error');
        });
    }

    // Close map details button
    const closeMapDetails = document.getElementById('close-map-details');
    if (closeMapDetails) {
        closeMapDetails.addEventListener('click', function() {
            const detailsPanel = document.getElementById('map-details-panel');
            if (detailsPanel) detailsPanel.classList.add('hidden');
            const detailsActions = document.getElementById('map-details-actions');
            if (detailsActions) detailsActions.classList.add('hidden');
            selectedRecordId = null;
            selectedRecord = null;
        });
    }

    // Map details print/delete buttons
    const printBtn = document.getElementById('btn-map-print');
    if (printBtn) {
        printBtn.addEventListener('click', function() {
            if (selectedRecord && selectedRecord.ulpin) printCard(selectedRecord.ulpin);
            else showToast('No ULPIN available.', 'error');
        });
    }

    const mapDeleteBtn = document.getElementById('btn-map-delete');
    if (mapDeleteBtn) {
        mapDeleteBtn.addEventListener('click', function() {
            if (selectedRecord) confirmDelete(selectedRecord._id, selectedRecord.khasra_no || '');
            else showToast('No record selected.', 'error');
        });
    }
    
    const mapEditBtn = document.getElementById('btn-map-edit');
    if (mapEditBtn) {
        mapEditBtn.addEventListener('click', function() {
            if (selectedRecord) editRecord(selectedRecord._id);
        });
    }

    document.querySelectorAll('.records-view-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchRecordsView(this.dataset.view);
        });
    });

    const addRecordBtn = document.getElementById('btn-add-record-new');
    if (addRecordBtn) {
        addRecordBtn.addEventListener('click', function() {
            resetForm();
            switchMainTab('add-record');
            switchFormTab('location');
        });
    }

    const exportBtn = document.getElementById('btn-export-excel');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            const url = getVillageExcelUrl();
            downloadFile(url, 'Village_Ledger.xlsx');
            showToast('Generating Excel ledger...', 'info');
        });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let searchDebounceTimer = null;
        
        searchInput.addEventListener('input', function() {
            // Debounce: wait 300ms after last keystroke before filtering
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                applyAdminFilters(false);
            }, 300);
        });

        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
                performAdminSearch();
            }
        });
    }

    const landUseFilter = document.getElementById('land-use-filter');
    if (landUseFilter) {
        landUseFilter.addEventListener('change', function() {
            applyAdminFilters(false);
        });
    }

    const districtFilter = document.getElementById('district-filter');
    if (districtFilter) {
        districtFilter.addEventListener('change', function() {
            applyAdminFilters(false);
        });
    }

    const stateFilter = document.getElementById('state-filter');
    if (stateFilter) {
        stateFilter.addEventListener('change', function() {
            applyAdminFilters(false);
        });
    }

    const clearFiltersBtn = document.getElementById('btn-clear-filters');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            if (searchInput) searchInput.value = '';
            if (landUseFilter) landUseFilter.value = '';
            if (districtFilter) districtFilter.value = '';
            if (stateFilter) stateFilter.value = '';
            applyAdminFilters(true);
        });
    }

    const recordForm = document.getElementById('record-form');
    if (recordForm) {
        recordForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await handleFormSubmit();
        });
    }

    const cancelBtn = document.getElementById('form-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            resetForm();
            switchMainTab('records');
        });
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            try {
                await logout();
            } catch (_err) {
                // Ignore logout errors and continue redirect.
            }
            window.location.href = '/login';
        });
    }

    // --- Profile Tab Event Handlers ---
    // Load profile and users when profile tab is first opened
    let profileLoaded = false;
    
    const profileTabBtn = document.querySelector('.main-tab-btn[data-tab="profile"]');
    if (profileTabBtn) {
        profileTabBtn.addEventListener('click', function() {
            if (!profileLoaded) {
                loadProfile();
                loadUsers();
                getSessionUsername();
                profileLoaded = true;
            }
        });
    }
    
    // Edit profile button
    const editProfileBtn = document.getElementById('btn-edit-profile');
    const editProfileBtnInline = document.getElementById('btn-edit-profile-inline');
    
    function showProfileEditForm() {
        document.getElementById('edit-profile-form').classList.remove('hidden');
        document.getElementById('profile-view').classList.add('hidden');
        if (editProfileBtn) editProfileBtn.classList.add('hidden');

        // Populate form
        if (currentProfile) {
            document.getElementById('edit-full-name').value = currentProfile.full_name || '';
            document.getElementById('edit-email').value = currentProfile.email || '';
            document.getElementById('edit-phone').value = currentProfile.phone || '';
            document.getElementById('edit-designation').value = currentProfile.designation || '';
            document.getElementById('edit-department').value = currentProfile.department || '';
            document.getElementById('edit-office').value = currentProfile.office_location || '';
        }
    }
    
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', showProfileEditForm);
    }
    
    if (editProfileBtnInline) {
        editProfileBtnInline.addEventListener('click', showProfileEditForm);
    }

    // Cancel edit profile
    const cancelEditProfileBtn = document.getElementById('btn-cancel-edit-profile');
    if (cancelEditProfileBtn) {
        cancelEditProfileBtn.addEventListener('click', function() {
            document.getElementById('edit-profile-form').classList.add('hidden');
            document.getElementById('profile-view').classList.remove('hidden');
            if (editProfileBtn) editProfileBtn.classList.remove('hidden');
        });
    }
    
    // Submit edit profile
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', async function(e) {
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
            
            if (currentPass && newPass) {
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
                currentProfile = data.profile;
                displayProfile(currentProfile);
                document.getElementById('edit-profile-form').classList.add('hidden');
                document.getElementById('profile-view').classList.remove('hidden');
                if (editProfileBtn) editProfileBtn.classList.remove('hidden');
            } catch (err) {
                showToast(`Failed to update profile: ${err.message}`, 'error');
            }
        });
    }

    // Create user button
    const createUserBtn = document.getElementById('btn-create-user');
    if (createUserBtn) {
        createUserBtn.addEventListener('click', function() {
            document.getElementById('create-user-form').classList.remove('hidden');
        });
    }

    // Cancel create user (both buttons)
    const cancelCreateUserBtn = document.getElementById('btn-cancel-create-user');
    const cancelCreateUserBtn2 = document.getElementById('btn-cancel-create-user-2');
    
    function hideCreateUserForm() {
        document.getElementById('create-user-form').classList.add('hidden');
        document.getElementById('user-create-form').reset();
    }
    
    if (cancelCreateUserBtn) {
        cancelCreateUserBtn.addEventListener('click', hideCreateUserForm);
    }
    
    if (cancelCreateUserBtn2) {
        cancelCreateUserBtn2.addEventListener('click', hideCreateUserForm);
    }
    
    // Submit create user
    const userCreateForm = document.getElementById('user-create-form');
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
                is_active: document.getElementById('create-active').checked
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
                document.getElementById('create-user-form').classList.add('hidden');
                userCreateForm.reset();
                loadUsers();
            } catch (err) {
                showToast(`Failed to create user: ${err.message}`, 'error');
            }
        });
    }
});

async function performAdminSearch() {
    applyAdminFilters(true);

    if (filteredRecordsCache.length === 1) {
        const record = filteredRecordsCache[0];
        // If on map tab, fly to record
        const mapPanel = document.getElementById('main-tab-map');
        if (mapPanel && !mapPanel.classList.contains('hidden')) {
            flyToRecord(record);
        }
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function handleFormSubmit() {
    const recordId = document.getElementById('form-record-id').value;
    const geometryStr = document.getElementById('form-geometry').value;

    
    const locationValues = {
        state: document.getElementById('form-state-manual').value || document.getElementById('form-state').value,
        district: document.getElementById('form-district-manual').value || document.getElementById('form-district').value,
        village: document.getElementById('form-village-manual').value || document.getElementById('form-village').value
    };

    if (!locationValues.state || !locationValues.district || !locationValues.village) {
        showToast('Location (State, District, Village) is required.', 'error');
        switchFormTab('location');
        return;
    }

    // GPS Mismatch Warning: Only check if we have GPS data AND manual override is active
    const manualOverrideEl = document.getElementById('location-manual-override');
    const isManualOverride = manualOverrideEl && manualOverrideEl.checked;
    const hasGpsData = lastGpsDetectedLocation.state && lastGpsDetectedLocation.district;

    if (isManualOverride && hasGpsData) {
        const stateMatch = locationValues.state.trim().toLowerCase() === lastGpsDetectedLocation.state.trim().toLowerCase();
        const districtMatch = locationValues.district.trim().toLowerCase() === lastGpsDetectedLocation.district.trim().toLowerCase();

        if (!stateMatch || !districtMatch) {
            // Show a blocking mismatch warning modal
            const proceed = await new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.className = 'fixed inset-0 bg-black bg-opacity-60 z-[9999] flex items-center justify-center p-4';
                overlay.style.backdropFilter = 'blur(3px)';

                overlay.innerHTML = `
                    <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div class="bg-yellow-50 border-b-4 border-yellow-400 px-6 py-4 flex items-center gap-3">
                            <svg class="w-8 h-8 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            <h3 class="text-lg font-bold text-yellow-800">Location Mismatch Warning</h3>
                        </div>
                        <div class="px-6 py-5">
                            <p class="text-sm text-gray-600 mb-4">The location you entered does not match the GPS coordinates of the parcel you drew on the map.</p>
                            <div class="grid grid-cols-2 gap-3 mb-4">
                                <div class="bg-green-50 rounded-lg p-3 border border-green-200">
                                    <p class="text-xs font-bold text-green-700 mb-1">📡 GPS Detected</p>
                                    <p class="text-sm font-semibold text-green-800">${escapeHtml(lastGpsDetectedLocation.state)}</p>
                                    <p class="text-xs text-green-600">${escapeHtml(lastGpsDetectedLocation.district)}</p>
                                </div>
                                <div class="bg-red-50 rounded-lg p-3 border border-red-200">
                                    <p class="text-xs font-bold text-red-700 mb-1">✏️ You Entered</p>
                                    <p class="text-sm font-semibold text-red-800">${escapeHtml(locationValues.state)}</p>
                                    <p class="text-xs text-red-600">${escapeHtml(locationValues.district)}</p>
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 mb-5">Are you sure you want to continue with the manually entered location? This may cause incorrect revenue records.</p>
                            <div class="flex gap-3">
                                <button id="mismatch-cancel" class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">← Use GPS Location</button>
                                <button id="mismatch-force" class="flex-1 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition">Force Save Anyway</button>
                            </div>
                        </div>
                    </div>`;

                document.body.appendChild(overlay);
                overlay.querySelector('#mismatch-cancel').addEventListener('click', () => {
                    // Auto-fill with GPS-detected location
                    const manualOvEl = document.getElementById('location-manual-override');
                    if (manualOvEl) manualOvEl.checked = false;
                    toggleManualLocationOverride(false);
                    setLocationValues(lastGpsDetectedLocation.state, lastGpsDetectedLocation.district, lastGpsDetectedLocation.village);
                    document.body.removeChild(overlay);
                    resolve(false);
                });
                overlay.querySelector('#mismatch-force').addEventListener('click', () => {
                    document.body.removeChild(overlay);
                    resolve(true);
                });
            });

            if (!proceed) return; // User chose to fix location — abort save
        }
    }

    // Validate parcel fields
    const khasra = document.getElementById('form-khasra').value.trim();
    const khata = document.getElementById('form-khata').value.trim();
    const landUse = document.getElementById('form-land-use').value;
    
    if (!khasra) {
        showToast('Khasra No. is required.', 'error');
        switchFormTab('parcel');
        return;
    }
    if (!khata) {
        showToast('Khata No. is required.', 'error');
        switchFormTab('parcel');
        return;
    }
    if (!landUse) {
        showToast('Land Use is required.', 'error');
        switchFormTab('parcel');
        return;
    }

    // Validate geometry
    if (!geometryStr) {
        showToast('Please draw a polygon on the map first.', 'error');
        switchFormTab('parcel');
        return;
    }

    // Validate owner (only for new records)
    if (!recordId) {
        const ownerName = document.getElementById('form-owner-name').value.trim();
        if (!ownerName) {
            showToast('Owner Name is required.', 'error');
            switchFormTab('owner');
            return;
        }
    }

    ensureLocationInCatalog(locationValues.state, locationValues.district, locationValues.village);

    let geometry;
    try {
        geometry = JSON.parse(geometryStr);
    } catch (_err) {
        showToast('Invalid geometry data.', 'error');
        return;
    }

    const submitBtn = document.getElementById('form-submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        let ownerDocB64 = undefined;
        const ownerDocFile = document.getElementById('form-owner-doc')?.files[0];
        if (ownerDocFile) ownerDocB64 = await fileToBase64(ownerDocFile);

        let mutationDocB64 = undefined;
        const mutationDocFile = document.getElementById('form-mutation-doc')?.files[0];
        if (mutationDocFile) mutationDocB64 = await fileToBase64(mutationDocFile);

        if (recordId) {
            const updateData = {
                khasra_no: document.getElementById('form-khasra').value,
                khata_no: document.getElementById('form-khata').value,
                land_use: document.getElementById('form-land-use').value,
                circle_rate_inr: parseFloat(document.getElementById('form-circle-rate').value) || 0,
                share_pct: parseFloat(document.getElementById('form-share').value) || 100,
                aadhaar_mask: document.getElementById('form-aadhaar').value,
                geometry: geometry,
                location: locationValues,
                owner_proof_doc_b64: ownerDocB64
            };

            const newOwner = document.getElementById('form-new-owner').value.trim();
            if (newOwner) {
                updateData.mutation = true;
                updateData.new_owner_name = newOwner;
                updateData.new_share_pct = parseFloat(document.getElementById('form-new-share').value) || 100;
                updateData.mutation_type = document.getElementById('form-mutation-type').value;
                updateData.mutation_date = document.getElementById('form-mutation-date').value || new Date().toISOString().split('T')[0];
                updateData.mutation_proof_doc_b64 = mutationDocB64;
            }

            await updateRecord(recordId, updateData);
            showToast('Record updated successfully.', 'success');
        } else {
            const recordData = {
                khasra_no: document.getElementById('form-khasra').value,
                khata_no: document.getElementById('form-khata').value,
                ulpin: document.getElementById('form-ulpin').value || undefined,
                land_use: document.getElementById('form-land-use').value,
                circle_rate_inr: parseFloat(document.getElementById('form-circle-rate').value) || 0,
                owner_name: document.getElementById('form-owner-name').value,
                share_pct: parseFloat(document.getElementById('form-share').value) || 100,
                aadhaar_mask: document.getElementById('form-aadhaar').value || 'XXXX-XXXX-XXXX',
                geometry: geometry,
                location: locationValues,
                owner_proof_doc_b64: ownerDocB64
            };

            const result = await createRecord(recordData);
            if (result.area_details && result.area_details.area) {
                showToast(`Record created. Area: ${result.area_details.area.area_ha} Ha (${result.area_details.area.area_acres} Acres)`, 'success', 5000);
            } else {
                showToast('Record created successfully.', 'success');
            }
        }

        resetForm();
        switchMainTab('records');
        loadRecordsOnMap();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function resetForm() {
    const form = document.getElementById('record-form');
    if (form) {
        form.reset();
    }

    const {
        manualOverrideEl,
        stateManualEl,
        districtManualEl,
        villageManualEl
    } = getFormElements();

    if (manualOverrideEl) {
        manualOverrideEl.checked = false;
    }
    if (stateManualEl) stateManualEl.value = '';
    if (districtManualEl) districtManualEl.value = '';
    if (villageManualEl) villageManualEl.value = '';
    toggleManualLocationOverride(false);

    document.getElementById('form-record-id').value = '';
    document.getElementById('form-title').textContent = 'Add New Land Record';

    setMutationMode(false);
    switchFormTab('location');

    refreshStateOptions('');
    refreshDistrictOptions('');
    refreshVillageOptions('');

    lastAutoLocation = { state: '', district: '', village: '' };
    lastGeocodeKey = '';
    updateAutofillStatus('Move map or draw parcel to auto-detect location.', false);

    document.getElementById('form-submit-btn').textContent = 'Save Record';

    const drawInstruction = document.getElementById('draw-instruction');
    if (drawInstruction) {
        drawInstruction.style.display = '';
    }

    // Clear both maps
    clearGeometrySelection(true);
    if (addRecordDrawnItems) {
        addRecordDrawnItems.clearLayers();
    }
    if (addRecordMap) {
        addRecordMap.pm.disableDraw();
    }
    currentSketchLayer = null;
    document.getElementById('form-geometry').value = '';
    clearMetricsUI();
    
    const drawStatus = document.getElementById('draw-status');
    if (drawStatus) {
        drawStatus.innerHTML = '<strong>Waiting for map drawing...</strong> Draw a parcel on the map to continue.';
        drawStatus.className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
    }
}

// --- Profile & User Management ---
let currentProfile = null;
let allUsers = [];

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
    document.getElementById('profile-display-name').textContent = profile.full_name || 'N/A';
    document.getElementById('profile-display-role').textContent = profile.role || 'N/A';
    document.getElementById('profile-username').textContent = profile.username || 'N/A';
    document.getElementById('profile-email').textContent = profile.email || 'N/A';
    document.getElementById('profile-phone').textContent = profile.phone || 'N/A';
    document.getElementById('profile-designation').textContent = profile.designation || 'N/A';
    document.getElementById('profile-department').textContent = profile.department || 'N/A';
    document.getElementById('profile-office').textContent = profile.office_location || 'N/A';
    document.getElementById('profile-last-login').textContent = profile.last_login ? new Date(profile.last_login).toLocaleString() : 'Never';

    const badge = document.getElementById('profile-status-badge');
    if (badge) {
        badge.textContent = profile.is_active ? 'Active' : 'Inactive';
        badge.className = `inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full ${profile.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
    }

    // New profile view fields
    document.getElementById('profile-view-username').textContent = profile.username || 'N/A';
    document.getElementById('profile-view-name').textContent = profile.full_name || 'N/A';
    document.getElementById('profile-view-email').textContent = profile.email || 'N/A';
    document.getElementById('profile-view-phone').textContent = profile.phone || 'N/A';
    document.getElementById('profile-view-designation').textContent = profile.designation || 'N/A';
    document.getElementById('profile-view-department').textContent = profile.department || 'N/A';
    document.getElementById('profile-view-office').textContent = profile.office_location || 'N/A';
    document.getElementById('profile-view-last-login').textContent = profile.last_login ? new Date(profile.last_login).toLocaleString() : 'Never';
}

async function loadFeedback() {
    try {
        const tbody = document.getElementById('feedback-table-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Loading...</td></tr>';
        
        const res = await fetch(`${API_BASE}/api/feedback`, { credentials: 'include' });
        const feedbackList = await res.json();
        
        if (tbody) {
            tbody.innerHTML = '';
            if (feedbackList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">No feedback forms right now.</td></tr>';
                return;
            }
            
            // Sort by timestamp descending
            feedbackList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            feedbackList.forEach(fb => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-50 transition cursor-pointer';
                const d = new Date(fb.timestamp);
                const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                tr.innerHTML = `
                    <td class="px-4 py-3 whitespace-nowrap text-gray-800">${dateStr}</td>
                    <td class="px-4 py-3 text-gray-600 truncate max-w-[150px]" title="${escapeHtml(fb.email)}">${escapeHtml(fb.email)}</td>
                    <td class="px-4 py-3">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            ${escapeHtml(fb.type)}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-gray-700 min-w-[200px] break-words">${escapeHtml(fb.message)}</td>
                    <td class="px-4 py-3 text-right">
                        <button onclick="deleteFeedback('${fb.id}')" class="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition" title="Delete">
                            <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error('Failed to load feedback:', err);
    }
}

function deleteFeedback(feedbackId) {
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
        noUsers.classList.remove('hidden');
        return;
    }

    noUsers.classList.add('hidden');

    const roleColors = {
        SuperAdmin: 'bg-purple-100 text-purple-800',
        Admin: 'bg-orange-100 text-orange-800',
        Officer: 'bg-blue-100 text-blue-800',
        Viewer: 'bg-green-100 text-green-800'
    };

    const currentUsername = sessionUsername;

    // Update stats
    document.getElementById('stat-total-users').textContent = allUsers.length;
    document.getElementById('stat-active-users').textContent = allUsers.filter(u => u.is_active).length;
    document.getElementById('stat-admin-users').textContent = allUsers.filter(u => ['Admin', 'SuperAdmin'].includes(u.role)).length;
    document.getElementById('stat-viewer-users').textContent = allUsers.filter(u => u.role === 'Viewer').length;

    tbody.innerHTML = allUsers.map(user => {
        const isCurrentUser = user.username === currentUsername;
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
                <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${roleColors[user.role] || 'bg-gray-100 text-gray-800'}">${escapeHtml(user.role)}</span>
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

let sessionUsername = '';

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
    document.getElementById('edit-user-id').value = user.user_id;
    document.getElementById('edit-username').value = user.username;
    document.getElementById('edit-role').value = user.role;
    document.getElementById('edit-fullname').value = user.full_name || '';
    document.getElementById('edit-email').value = user.email || '';
    document.getElementById('edit-phone-user').value = user.phone || '';
    document.getElementById('edit-designation-user').value = user.designation || '';
    document.getElementById('edit-department-user').value = user.department || '';
    document.getElementById('edit-office-user').value = user.office_location || '';
    document.getElementById('edit-is-active').checked = user.is_active !== false;
    document.getElementById('edit-new-password').value = '';

    // Show the modal
    document.getElementById('edit-user-modal').classList.remove('hidden');
}

// Close edit user modal
function closeEditUserModal() {
    document.getElementById('edit-user-modal').classList.add('hidden');
    document.getElementById('user-edit-form').reset();
}

// Edit user modal event listeners
document.addEventListener('DOMContentLoaded', function() {
    const closeBtn = document.getElementById('btn-close-edit-user');
    const cancelBtn = document.getElementById('btn-cancel-edit-user');
    
    if (closeBtn) closeBtn.addEventListener('click', closeEditUserModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditUserModal);
    
    // Close on backdrop click
    const modal = document.getElementById('edit-user-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeEditUserModal();
            }
        });
    }
    
    // Submit edit user form
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
                is_active: document.getElementById('edit-is-active').checked
            };
            
            const newPassword = document.getElementById('edit-new-password').value;
            if (newPassword) {
                updateData.new_password = newPassword;
            }
            
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
});

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
