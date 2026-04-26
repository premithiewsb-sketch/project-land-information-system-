/**
 * records.js - Records list and filtering logic
 */

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

function populateVillageFilter(records) {
    const villageFilterEl = document.getElementById('village-filter');
    if (!villageFilterEl) return;

    const selected = villageFilterEl.value || '';
    const villages = sortedValues(records
        .map(rec => (rec.location && rec.location.village) || '')
        .filter(Boolean));

    villageFilterEl.innerHTML = '<option value="">All Villages</option>';
    villages.forEach(v => {
        const option = document.createElement('option');
        option.value = v;
        option.textContent = v;
        villageFilterEl.appendChild(option);
    });

    if (selected && villages.includes(selected)) {
        villageFilterEl.value = selected;
    }
}

function getAdminFilterState() {
    const query = (document.getElementById('record-search') || {}).value || '';
    const landUse = (document.getElementById('land-use-filter') || {}).value || '';
    const state = (document.getElementById('state-filter') || {}).value || '';
    const district = (document.getElementById('district-filter') || {}).value || '';
    const village = (document.getElementById('village-filter') || {}).value || '';

    return {
        query: query.trim().toLowerCase(),
        landUse,
        state,
        district,
        village
    };
}

function initializeRecordFilters() {
    const filters = ['state-filter', 'district-filter', 'village-filter', 'land-use-filter'];
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => applyAdminFilters(true));
    });

    const searchInput = document.getElementById('record-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => applyAdminFilters(true), 400));
    }

    const clearBtn = document.getElementById('btn-clear-filters');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            filters.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            if (searchInput) searchInput.value = '';
            applyAdminFilters(true);
        });
    }
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
                    <div class="flex items-center gap-2">
                        <span class="font-semibold text-inherit text-sm">${rec.khasra_no || 'N/A'}</span>
                        ${rec.deleted ? `<span class="badge-deleted">Deleted</span>` : ''}
                    </div>
                    <span class="land-use-badge ${badgeClass}">${landUse}</span>
                </div>
                <div class="text-xs text-inherit opacity-70 space-y-0.5">
                    <div>ULPIN: <span class="font-mono">${rec.ulpin || 'N/A'}</span></div>
                    <div>${owner.name || 'No Owner'} | ${attrs.area_ha || '?'} Ha</div>
                    <div>${loc.village || ''}, ${loc.district || ''}</div>
                </div>
                <div class="flex items-center justify-between mt-2">
                    <div class="text-xs text-inherit opacity-50">
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
        const recordValue = calculateValuation(attrs.area_ha, attrs.circle_rate_inr, landUse);

        return `
            <div class="record-table-row ${selectedRecordId === rec._id ? 'active' : ''} ${rec.deleted ? 'deleted' : ''}" data-id="${rec._id}">
                <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-inherit truncate">${escapeHtml(rec.khasra_no || 'N/A')} ${rec.deleted ? '<span class="badge-deleted ml-2">Deleted</span>' : ''}</p>
                        <p class="text-[11px] text-inherit opacity-70 truncate">${escapeHtml(rec.ulpin || 'N/A')} | ${escapeHtml(loc.district || 'N/A')}</p>
                    </div>
                    <button type="button" class="view-record-btn-table bg-orange-600 hover:bg-orange-700 text-white text-[11px] px-2 py-1 rounded">View</button>
                </div>
                <div class="mt-2 grid grid-cols-3 gap-2 text-[11px] text-inherit opacity-60">
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
        console.error('Filter failed:', err);
        showToast('Failed to filter records.', 'error');
    });
}
