/**
 * gis.js - GIS-related UI updates (area, perimeter, centroid)
 */

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
            perimeterEl.textContent = `${Math.round(perimeter.perimeter_m || 0)} m`;
        }
        if (centroidEl) {
            centroidEl.textContent = `${centroid.lat.toFixed(5)}, ${centroid.lng.toFixed(5)}`;
        }
    } catch (err) {
        console.error('Failed to update geometry metrics:', err);
    }
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

        if (geometryMetrics) geometryMetrics.classList.remove('hidden');
        if (perimeterEl) perimeterEl.textContent = perimeterData.perimeter_m ? `${Math.round(perimeterData.perimeter_m)} m` : 'N/A';
        if (centroidEl) centroidEl.textContent = centroidData.lat ? `${centroidData.lat.toFixed(5)}, ${centroidData.lng.toFixed(5)}` : 'N/A';

        const drawStatus = document.getElementById('draw-status');
        if (drawStatus) {
            drawStatus.innerHTML = `<strong>Parcel geometry captured.</strong> Area: ${areaData.area_ha} Ha. Ready to save.`;
            drawStatus.className = 'bg-green-50 border-l-4 border-green-500 rounded-r-lg p-3 text-sm text-green-800';
        }

        // Trigger live valuation update in forms.js
        if (typeof updateLiveValuation === 'function') {
            updateLiveValuation();
        }
    } catch (err) {
        console.error('Failed to fetch geometry metrics:', err);
        updateAutofillStatus('Failed to calculate area.', true);
    }
}

function clearMetricsUI() {
    const areaInput = document.getElementById('form-area');
    const areaAuto = document.getElementById('area-auto');
    const areaEquivalents = document.getElementById('area-equivalents');
    const geometryMetrics = document.getElementById('geometry-metrics');

    if (areaInput) areaInput.value = '';
    if (areaAuto) areaAuto.textContent = '(Draw on map)';
    if (areaEquivalents) {
        areaEquivalents.classList.add('hidden');
        areaEquivalents.innerHTML = '';
    }
    if (geometryMetrics) {
        geometryMetrics.classList.add('hidden');
    }
}

function clearGeometrySelection(clearAddRecordMap) {
    if (drawnItems) {
        drawnItems.clearLayers();
    }
    if (clearAddRecordMap && addRecordDrawnItems) {
        addRecordDrawnItems.clearLayers();
    }
    currentSketchLayer = null;
    const geomInput = document.getElementById('form-geometry');
    if (geomInput) geomInput.value = '';

    clearMetricsUI();
}
