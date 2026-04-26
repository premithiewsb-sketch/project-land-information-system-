/**
 * map_engine.js - Leaflet map initialization, layers, and drawing logic
 */

function switchBaseLayer(layerName) {
    if (!baseLayers[layerName] || layerName === currentBaseLayer) return;

    map.removeLayer(baseLayers[currentBaseLayer]);
    baseLayers[layerName].addTo(map);
    currentBaseLayer = layerName;
}

async function addIndiaMask(mapInstance) {
    try {
        const response = await fetch('/api/boundary');
        if (!response.ok) return;
        
        const indiaGeoJSON = await response.json();
        const worldBounds = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]];
        let maskCoordinates = [worldBounds];
        const geometry = indiaGeoJSON.features[0].geometry;
        
        if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach(polygon => { maskCoordinates.push(polygon[0]); });
        } else if (geometry.type === 'Polygon') {
            maskCoordinates.push(geometry.coordinates[0]);
        }
        
        const maskGeoJSON = { type: 'Feature', geometry: { type: 'Polygon', coordinates: maskCoordinates } };
        const maskLayer = L.geoJSON(maskGeoJSON, {
            style: { color: '#1f2937', weight: 2, fillColor: '#1f2937', fillOpacity: 0.7 },
            interactive: false
        });
        maskLayer.addTo(mapInstance);
        
        const indiaBorder = L.geoJSON(indiaGeoJSON, {
            style: { color: '#f97316', weight: 3, fillColor: 'transparent', fillOpacity: 0, opacity: 0.9 },
            interactive: false
        });
        indiaBorder.addTo(mapInstance);
    } catch (err) {
        console.warn('Failed to load India boundary mask:', err);
    }
}

function initMap(adminMode) {
    isAdmin = adminMode || false;
    const indiaBounds = L.latLngBounds(L.latLng(4.0, 60.0), L.latLng(40.0, 105.0));

    map = L.map('map', {
        center: [23.5, 77.5], zoom: 7, minZoom: 4, maxZoom: 18,
        maxBounds: indiaBounds, maxBoundsViscosity: 1.0,
        zoomControl: true, attributionControl: true
    });

    baseLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19, crossOrigin: true });
    baseLayers.google = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { attribution: '&copy; Google Maps', maxZoom: 20, crossOrigin: true });
    baseLayers.esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 18, crossOrigin: true });

    baseLayers.osm.addTo(map);
    currentBaseLayer = 'osm';

    document.querySelectorAll('input[name="basemap"]').forEach(radio => {
        radio.addEventListener('change', function() { switchBaseLayer(this.value); });
    });

    addIndiaMask(map);
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    if (isAdmin) {
        // map.pm.addControls is removed to use custom draw tools box
        map.pm.setPathOptions({ color: '#ea580c', fillColor: '#fed7aa', fillOpacity: 0.3, weight: 3 });

        map.on('pm:create', async function(e) {
            const layer = e.layer;
            drawnItems.clearLayers();
            drawnItems.addLayer(layer);
            currentSketchLayer = layer;
            map.pm.disableDraw();
            const geometry = layer.toGeoJSON().geometry;
            await updateGeometryMetrics(geometry, { shouldRefreshMetrics: true });
            switchMainTab('add-record');
            switchFormTab('parcel');
            const inst = document.getElementById('draw-instruction'); if (inst) inst.style.display = 'none';
            showToast('Polygon ready. Review parcel details and save.', 'success');
        });

        map.on('pm:edit', async function(e) {
            const layer = e.layer; if (!layer) return;
            currentSketchLayer = layer;
            const geometry = layer.toGeoJSON().geometry;
            await updateGeometryMetrics(geometry, { shouldRefreshMetrics: true });
        });

        map.on('pm:remove', function() { clearGeometrySelection(false); });
    }

    map.on('mousemove', function(e) {
        const coordsEl = document.getElementById('cursor-coords');
        if (coordsEl) coordsEl.textContent = `Lat: ${e.latlng.lat.toFixed(6)}, Lng: ${e.latlng.lng.toFixed(6)}`;
    });

    if (isAdmin) {
        map.on('moveend', function() { scheduleMapLocationLookup(map.getCenter().lat, map.getCenter().lng, false); });
        map.on('click', function(e) {
            if (map.pm && typeof map.pm.globalDrawModeEnabled === 'function' && map.pm.globalDrawModeEnabled()) return;
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
            refreshStateOptions(stateEl ? stateEl.value : '');
            refreshDistrictOptions(districtEl ? districtEl.value : '');
            refreshVillageOptions(villageEl ? villageEl.value : '');
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
    parcelLayers.forEach(layer => { map.removeLayer(layer); });
    parcelLayers = [];
}

function addRecordsToMap(records) {
    records.forEach(record => {
        if (!record.geometry || record.geometry.type !== 'Polygon') return;
        const landUse = (record.attributes && record.attributes.land_use) || 'Agricultural';
        const color = getLandUseColor(landUse);

        const geoJsonLayer = L.geoJSON(record.geometry, {
            style: { color: color, fillColor: color, fillOpacity: 0.25, weight: 2.5, opacity: 0.9 },
            onEachFeature: function(_f, layer) {
                layer.on('click', () => onParcelClick(record, layer));
                layer.on('mouseover', function() { this.setStyle({ fillOpacity: 0.45, weight: 3.5 }); });
                layer.on('mouseout', function() { this.setStyle({ fillOpacity: 0.25, weight: 2.5 }); });
                const attrs = record.attributes || {};
                const owner = record.owner || {};
                const loc = record.location || {};
                layer.bindTooltip(`<div class="tooltip-content"><div class="tooltip-title">${record.khasra_no || 'N/A'}</div><div class="tooltip-row"><span class="tooltip-label">ULPIN:</span><span class="tooltip-value">${record.ulpin || 'N/A'}</span></div><div class="tooltip-row"><span class="tooltip-label">Land Use:</span><span class="tooltip-value">${landUse}</span></div><div class="tooltip-row"><span class="tooltip-label">Area:</span><span class="tooltip-value">${attrs.area_ha || '?'} Ha</span></div><div class="tooltip-divider"></div><div class="tooltip-row"><span class="tooltip-label">Owner:</span><span class="tooltip-value">${owner.name || 'N/A'}</span></div><div class="tooltip-row"><span class="tooltip-label">Location:</span><span class="tooltip-value">${loc.village || '?'}, ${loc.district || '?'}</span></div><div class="tooltip-hint">Click to view details →</div></div>`, { sticky: true, className: 'parcel-tooltip', direction: 'top', offset: [0, -10] });
            }
        });
        geoJsonLayer.addTo(map);
        geoJsonLayer._recordId = record._id;
        parcelLayers.push(geoJsonLayer);
    });
    if (isAdmin) renderRecordsList(records);
}

function getLandUseColor(landUse) {
    const colors = { Agricultural: '#22c55e', Residential: '#3b82f6', Commercial: '#f59e0b', Industrial: '#8b5cf6', Government: '#ef4444', Forest: '#065f46', Wasteland: '#9ca3af' };
    return colors[landUse] || '#6b7280';
}

function onParcelClick(record) {
    if (isAdmin) { showAdminDetails(record); flyToRecord(record); }
    else if (typeof showViewerInfo === 'function') { showViewerInfo(record); }
}

function flyToRecord(record) {
    if (!record.geometry) return;
    const bounds = L.geoJSON(record.geometry).getBounds();
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
}

function initViewRecordMap(record) {
    const target = document.getElementById('view-record-map');
    if (!target) return;
    if (viewRecordMap) { viewRecordMap.remove(); viewRecordMap = null; }
    const indiaBounds = L.latLngBounds(L.latLng(4.0, 60.0), L.latLng(40.0, 105.0));
    viewRecordMap = L.map('view-record-map', { center: [23.5, 77.5], zoom: 7, minZoom: 4, maxZoom: 18, maxBounds: indiaBounds, maxBoundsViscosity: 1.0, zoomControl: true });
    
    const layers = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
        google: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20 }),
        esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 })
    };
    layers.osm.addTo(viewRecordMap);
    let current = 'osm';

    document.querySelectorAll('input[name="view-basemap"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (layers[this.value] && this.value !== current) {
                viewRecordMap.removeLayer(layers[current]);
                layers[this.value].addTo(viewRecordMap);
                current = this.value;
            }
        });
    });

    viewRecordMap.on('mousemove', e => {
        const el = document.getElementById('view-cursor-coords');
        if (el) el.textContent = `Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}`;
    });

    if (record.geometry) {
        const lu = (record.attributes && record.attributes.land_use) || '';
        const color = getLandUseColor(lu);
        const layer = L.geoJSON(record.geometry, { style: { color: color || '#ea580c', fillColor: color || '#ea580c', fillOpacity: 0.35, weight: 3 } });
        layer.addTo(viewRecordMap);
        viewRecordMap.fitBounds(layer.getBounds(), { padding: [40, 40] });
    }
    setTimeout(() => { viewRecordMap.invalidateSize(); addIndiaMask(viewRecordMap); }, 200);
}

function initAddRecordMap() {
    const target = document.getElementById('add-record-map');
    if (!target) return;
    const indiaBounds = L.latLngBounds(L.latLng(4.0, 60.0), L.latLng(40.0, 105.0));
    addRecordMap = L.map('add-record-map', { center: [23.5, 77.5], zoom: 7, minZoom: 4, maxZoom: 18, maxBounds: indiaBounds, maxBoundsViscosity: 1.0, zoomControl: true });
    
    const layers = {
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }),
        google: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20 }),
        esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18 })
    };
    layers.osm.addTo(addRecordMap);
    document.querySelectorAll('input[name="add-basemap"]').forEach(r => {
        r.addEventListener('change', function() {
            Object.values(layers).forEach(l => addRecordMap.removeLayer(l));
            layers[this.value].addTo(addRecordMap);
        });
    });

    addRecordDrawnItems = new L.FeatureGroup();
    addRecordMap.addLayer(addRecordDrawnItems);
    // map.pm.addControls is removed to use custom draw tools box
    addRecordMap.pm.setPathOptions({ color: '#ea580c', fillColor: '#fed7aa', fillOpacity: 0.4, weight: 3 });

    addRecordMap.on('pm:create', async e => {
        addRecordDrawnItems.clearLayers();
        const layer = e.layer;
        addRecordDrawnItems.addLayer(layer);
        currentSketchLayer = layer;
        if (layer.pm) {
            layer.pm.enable();
        }
        const geometry = layer.toGeoJSON().geometry;
        await updateGeometryMetricsForAddRecord(geometry);
        if (typeof scheduleMapLocationLookup === 'function') {
            const centroid = layer.getBounds().getCenter();
            scheduleMapLocationLookup(centroid.lat, centroid.lng, true);
        }
    });

    addRecordMap.on('pm:edit', async e => {
        currentSketchLayer = e.layer;
        await updateGeometryMetricsForAddRecord(e.layer.toGeoJSON().geometry);
    });

    addRecordMap.on('moveend', function() {
        if (typeof scheduleMapLocationLookup === 'function') {
            scheduleMapLocationLookup(addRecordMap.getCenter().lat, addRecordMap.getCenter().lng, false);
        }
    });
    
    addRecordMap.on('click', function(e) {
        if (addRecordMap.pm && typeof addRecordMap.pm.globalDrawModeEnabled === 'function' && addRecordMap.pm.globalDrawModeEnabled()) return;
        if (typeof scheduleMapLocationLookup === 'function') {
            scheduleMapLocationLookup(e.latlng.lat, e.latlng.lng, true);
        }
    });

    const startDrawBtn = document.getElementById('btn-start-draw-new');
    if (startDrawBtn) {
        startDrawBtn.addEventListener('click', function() {
            addRecordDrawnItems.clearLayers();
            const formGeom = document.getElementById('form-geometry');
            if (formGeom) formGeom.value = '';
            if (typeof clearMetricsUI === 'function') clearMetricsUI();
            addRecordMap.pm.enableDraw('Polygon', { snappable: true, snapDistance: 20, continueDrawing: false, allowSelfIntersection: false, finishOn: 'dblclick' });
            const drawStatus = document.getElementById('draw-status');
            if (drawStatus) {
                drawStatus.innerHTML = '<strong>Drawing mode active.</strong> Click to add points. Double-click to finish.';
                drawStatus.className = 'bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg p-3 text-sm text-yellow-800';
            }
        });
    }

    const finishDrawBtn = document.getElementById('btn-finish-draw-new');
    if (finishDrawBtn) {
        finishDrawBtn.addEventListener('click', function() {
            addRecordMap.pm.disableDraw();
        });
    }

    const cancelDrawBtn = document.getElementById('btn-cancel-draw-new');
    if (cancelDrawBtn) {
        cancelDrawBtn.addEventListener('click', function() {
            addRecordMap.pm.disableDraw();
            addRecordDrawnItems.clearLayers();
            currentSketchLayer = null;
            const formGeom = document.getElementById('form-geometry');
            if (formGeom) formGeom.value = '';
            if (typeof clearMetricsUI === 'function') clearMetricsUI();
            const drawStatus = document.getElementById('draw-status');
            if (drawStatus) {
                drawStatus.innerHTML = '<strong>Waiting for map drawing...</strong> Draw a parcel on the map to continue.';
                drawStatus.className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
            }
        });
    }

    const clearDrawBtn = document.getElementById('btn-clear-draw-new');
    if (clearDrawBtn) {
        clearDrawBtn.addEventListener('click', function() {
            addRecordDrawnItems.clearLayers();
            currentSketchLayer = null;
            const formGeom = document.getElementById('form-geometry');
            if (formGeom) formGeom.value = '';
            if (typeof clearMetricsUI === 'function') clearMetricsUI();
            const drawStatus = document.getElementById('draw-status');
            if (drawStatus) {
                drawStatus.innerHTML = '<strong>Waiting for map drawing...</strong> Draw a parcel on the map to continue.';
                drawStatus.className = 'bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 text-sm text-blue-800';
            }
        });
    }

    setTimeout(() => { addRecordMap.invalidateSize(); addIndiaMask(addRecordMap); }, 200);
}
