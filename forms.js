/**
 * forms.js - Form handling and location auto-fill logic
 */

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

    // Reset catalog (will be repopulated from records)
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

    ['form-area', 'form-circle-rate', 'form-land-use'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => window.updateLiveValuation());
            el.addEventListener('change', () => window.updateLiveValuation());
        }
    });
}

// Live Valuation Logic
window.updateLiveValuation = function() {
    const areaInput = document.getElementById('form-area');
    const rateInput = document.getElementById('form-circle-rate');
    const luInput = document.getElementById('form-land-use');
    
    if (!areaInput || !rateInput || !luInput) return;

    const area = asNumber(areaInput.value);
    const rate = asNumber(rateInput.value);
    const landUse = luInput.value;
    
    const total = calculateValuation(area, rate, landUse);
    
    const valEl = document.getElementById('form-live-value');
    const multEl = document.getElementById('form-live-multiplier');
    
    if (valEl) valEl.textContent = 'Rs. ' + formatInr(total);
    if (multEl) {
        const multipliers = {
            'Commercial': 2.5, 'Industrial': 1.8, 'Residential': 1.5,
            'Agricultural': 1.0, 'Government': 1.2, 'Forest': 0.8, 'Wasteland': 0.5
        };
        const multiplier = multipliers[landUse] || 1.0;
        multEl.textContent = multiplier.toFixed(1) + 'x';
    }
};

function isMapAutofillEnabled() {
    const enabledEl = document.getElementById('map-autofill-enabled');
    return enabledEl ? enabledEl.checked : true;
}

function updateGpsBanner(locationData) {
    const gpsBanner = document.getElementById('gps-detected-banner');
    if (!gpsBanner) return;

    if (!locationData) {
        gpsBanner.classList.add('hidden');
        return;
    }

    gpsBanner.classList.remove('hidden');
    
    if (locationData.loading) {
        gpsBanner.innerHTML = `
            <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-green-600 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                <span class="text-xs font-semibold text-green-700">Detecting location from GPS coordinates...</span>
            </div>`;
        return;
    }

    if (locationData.state && locationData.district) {
        const villageDisplay = locationData.village ? `${escapeHtml(locationData.village)}, ` : '';
        gpsBanner.innerHTML = `
            <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <div>
                        <p class="text-xs font-bold text-green-800">GPS Detected Location</p>
                        <p class="text-xs text-green-700 mt-0.5">
                            <span class="font-semibold">${escapeHtml(locationData.state)}</span> &rsaquo;
                            <span class="font-semibold">${escapeHtml(locationData.district)}</span> &rsaquo;
                            ${escapeHtml(locationData.village || 'N/A')}
                        </p>
                    </div>
                </div>
                <button type="button" id="btn-sync-gps" class="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors shadow-sm">
                    USE THIS
                </button>
            </div>`;
        
        const syncBtn = document.getElementById('btn-sync-gps');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                applyResolvedLocation(locationData, true);
                showToast('Form updated with GPS location.', 'success');
            });
        }
    } else {
        gpsBanner.classList.add('hidden');
    }
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

    const currentIsEmpty = !current.state && !current.district;
    
    // Loosened check: if state and district match previous auto, we can still update village
    // OR if the new location is in a completely different state/district, we should probably update if it was auto-filled
    const currentIsPreviousAuto =
        current.state === (lastAutoLocation.state || '') &&
        current.district === (lastAutoLocation.district || '');

    const nextLooksUseful = nextLocation.state || nextLocation.district;
    return !!nextLooksUseful && (currentIsEmpty || currentIsPreviousAuto);
}

function applyResolvedLocation(locationData, forceUpdate) {
    const nextLocation = {
        state: locationData.state || '',
        district: locationData.district || '',
        village: locationData.village || ''
    };

    // Update the GPS detected state for mismatch validation
    if (nextLocation.state && nextLocation.district) {
        lastGpsDetectedLocation = { ...nextLocation };
        updateGpsBanner(nextLocation);
    } else {
        lastGpsDetectedLocation = { state: '', district: '', village: '' };
        updateGpsBanner(null);
    }

    if (!shouldApplyLocationUpdate(nextLocation, forceUpdate)) {
        updateAutofillStatus('Map location detected. Location fields kept as manually selected.', false);
        return;
    }

    setLocationValues(nextLocation.state, nextLocation.district, nextLocation.village);
    lastAutoLocation = nextLocation;
    setLocationSource(`Source: ${locationData.display_name || 'Map reverse geocoding'}`);
    
    const displayVillage = nextLocation.village ? `${nextLocation.village}, ` : '';
    updateAutofillStatus(`Auto-filled: ${displayVillage}${nextLocation.district || 'District N/A'}, ${nextLocation.state || 'State N/A'}`, false);
}

function scheduleMapLocationLookup(lat, lng, forceUpdate) {
    if (!isAdmin) return;
    
    // Stop tracker if manual override is enabled
    if (isManualLocationOverrideEnabled()) {
        updateGpsBanner(null);
        return;
    }
    
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const geocodeKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (!forceUpdate && geocodeKey === lastGeocodeKey) return;
    lastGeocodeKey = geocodeKey;

    if (reverseGeocodeTimer) {
        clearTimeout(reverseGeocodeTimer);
    }

    // Show loading state in GPS banner
    updateGpsBanner({ loading: true });

    reverseGeocodeTimer = setTimeout(async function() {
        updateAutofillStatus('Detecting state and district from map...', false);
        try {
            const locationData = await fetchLocationFromCoordinates(lat, lng);
            applyResolvedLocation(locationData, forceUpdate);
        } catch (err) {
            updateAutofillStatus(err.message || 'Map location detection failed.', true);
            updateGpsBanner(null);
        }
    }, 650);
}

function setMutationMode(enabled) {
    const mutationSection = document.getElementById('mutation-section');
    const mutationTabBtn = document.getElementById('form-mutation-tab-btn');

    if (!mutationSection || !mutationTabBtn) return;

    mutationSection.classList.toggle('hidden', !enabled);
    mutationTabBtn.classList.toggle('hidden', !enabled);
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
            await updateGeometryMetricsForAddRecord(geometry);
            if (addRecordDrawnItems) addRecordDrawnItems.clearLayers();
            const editableLayer = L.geoJSON(geometry, {
                style: { color: '#ea580c', fillColor: '#fed7aa', fillOpacity: 0.4, weight: 3 }
            });
            editableLayer.eachLayer(layer => {
                if (addRecordDrawnItems) addRecordDrawnItems.addLayer(layer);
                currentSketchLayer = layer;
            });
            if (addRecordMap) {
                const bounds = editableLayer.getBounds();
                addRecordMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                setTimeout(() => {
                    editableLayer.eachLayer(layer => { if (layer.pm) layer.pm.enable(); });
                }, 300);
            }
        }

        setMutationMode(true);
        document.getElementById('form-submit-btn').textContent = 'Update Record';

        const drawInstruction = document.getElementById('draw-instruction');
        if (drawInstruction) drawInstruction.style.display = 'none';

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

    const manualOverrideEl = document.getElementById('location-manual-override');
    const isManualOverride = manualOverrideEl && manualOverrideEl.checked;
    const hasGpsData = lastGpsDetectedLocation.state && lastGpsDetectedLocation.district;

    if (isManualOverride && hasGpsData) {
        const stateMatch = locationValues.state.trim().toLowerCase() === lastGpsDetectedLocation.state.trim().toLowerCase();
        const districtMatch = locationValues.district.trim().toLowerCase() === lastGpsDetectedLocation.district.trim().toLowerCase();

        if (!stateMatch || !districtMatch) {
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
                            <p class="text-xs text-gray-500 mb-5">Are you sure you want to continue with the manually entered location?</p>
                            <div class="flex gap-3">
                                <button id="mismatch-cancel" class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">← Use GPS Location</button>
                                <button id="mismatch-force" class="flex-1 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition">Force Save Anyway</button>
                            </div>
                        </div>
                    </div>`;

                document.body.appendChild(overlay);
                overlay.querySelector('#mismatch-cancel').addEventListener('click', () => {
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

            if (!proceed) return;
        }
    }

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

    if (!geometryStr) {
        showToast('Please draw a parcel on the map first.', 'error');
        switchFormTab('parcel');
        return;
    }

    if (!recordId) {
        const ownerName = document.getElementById('form-owner-name').value.trim();
        if (!ownerName) {
            showToast('Owner Name is required.', 'error');
            switchFormTab('owner');
            return;
        }
    }

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
    submitBtn.innerHTML = 'Saving...';

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
            showToast('Record created successfully.', 'success');
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
    if (form) form.reset();

    document.getElementById('form-record-id').value = '';
    document.getElementById('form-title').textContent = 'Add New Record';
    document.getElementById('form-submit-btn').textContent = 'Create Record';
    document.getElementById('form-geometry').value = '';

    setMutationMode(false);
    clearGeometrySelection(true);

    const { manualOverrideEl } = getFormElements();
    if (manualOverrideEl) manualOverrideEl.checked = false;
    toggleManualLocationOverride(false);

    const drawInstruction = document.getElementById('draw-instruction');
    if (drawInstruction) drawInstruction.style.display = 'block';

    const drawStatus = document.getElementById('draw-status');
    if (drawStatus) {
        drawStatus.innerHTML = '<strong>Waiting for map drawing...</strong> Draw a parcel on the map to continue.';
        drawStatus.className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
    }

    lastGpsDetectedLocation = { state: '', district: '', village: '' };
    updateGpsBanner(null);

    switchFormTab('location');
}

/**
 * Ensures a location exists in the local catalog so it can be selected in dropdowns.
 * Used primarily when map auto-detection finds a location not yet in our database.
 */
function ensureLocationInCatalog(state, district, village) {
    if (!state) return;
    if (!locationCatalog) locationCatalog = {};
    if (!locationCatalog[state]) locationCatalog[state] = {};
    if (district) {
        if (!locationCatalog[state][district]) locationCatalog[state][district] = [];
        if (village && !locationCatalog[state][district].includes(village)) {
            locationCatalog[state][district].push(village);
            locationCatalog[state][district].sort();
        }
    }
}
