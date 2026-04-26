/**
 * dashboard.js - Dashboard rendering and analytics logic
 */

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
                <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="currentColor" stroke-opacity="0.1" stroke-width="${stroke}"/>
                ${arcs}
                <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="central" style="font-size:11px;font-weight:700;fill:currentColor;">${total}</text>
                <text x="${CX}" y="${CY+12}" text-anchor="middle" dominant-baseline="central" style="font-size:7px;fill:currentColor;opacity:0.6;">parcels</text>
            </svg>
            <div style="flex:1;min-width:0;">
                ${slices.map((s, i) => `
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                        <div style="width:10px;height:10px;border-radius:2px;background:${colors[i % colors.length]};flex-shrink:0;"></div>
                        <span style="font-size:11px;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;" title="${escapeHtml(s.label)}">${escapeHtml(s.label)}</span>
                        <span style="margin-left:auto;font-size:11px;font-weight:700;color:inherit;">${s.value}</span>
                        <span style="font-size:10px;color:inherit;opacity:0.6;">(${(s.value/total*100).toFixed(0)}%)</span>
                    </div>`).join('')}
            </div>
        </div>`;
}

function buildRankedList(items, colors) {
    const max = Math.max(...items.map(x => x.value), 1);
    return items.map((item, i) => {
        const pct = Math.max((item.value / max) * 100, 4);
        const color = colors[i % colors.length];
        return `
            <div style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
                    <span style="font-size:11px;font-weight:600;color:inherit;">${escapeHtml(item.label)}</span>
                    <span style="font-size:11px;font-weight:700;color:${color};white-space:nowrap;margin-left:8px;">${item.sublabel}</span>
                </div>
                <div style="background:currentColor;background-opacity:0.1;background-color:rgba(0,0,0,0.05);border-radius:99px;height:6px;">
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
        <div class="text-sm font-semibold text-inherit">${escapeHtml(topRecord.khasra_no || 'N/A')} (${escapeHtml(topRecord.ulpin || 'N/A')})</div>
        <div class="mt-1 text-xs text-inherit opacity-70">${escapeHtml(loc.village || 'N/A')}, ${escapeHtml(loc.district || 'N/A')} | ${escapeHtml(attrs.land_use || 'N/A')}</div>
        <div class="mt-1 text-xs text-inherit opacity-60">Area: ${asNumber(attrs.area_ha).toFixed(2)} Ha | Estimated: Rs. ${formatInr(topValue)}</div>
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
        <div class="dashboard-row text-xs border-b border-gray-100 p-2">
            <div class="font-semibold text-inherit">${escapeHtml(item.khasraNo)} | ${escapeHtml(item.mutationType)}</div>
            <div class="mt-1 text-inherit opacity-70">${escapeHtml(item.previousOwner)} -> ${escapeHtml(item.mutationDate)}</div>
            <div class="text-inherit opacity-50">${escapeHtml(item.district)} | Ref: ${escapeHtml(item.mutationRef)}</div>
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
        <div class="text-sm font-semibold text-inherit">${escapeHtml(parcel.khasra_no)} (${escapeHtml(parcel.ulpin)})</div>
        <div class="mt-1 text-xs text-inherit opacity-70">${escapeHtml(parcel.village)}, ${escapeHtml(parcel.district)} | ${escapeHtml(parcel.land_use)}</div>
        <div class="mt-1 text-xs text-inherit opacity-60">Area: ${parcel.area_ha} Ha | Estimated: Rs. ${formatInr(parcel.estimated_value)}</div>
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
        <div class="dashboard-row text-xs border-b border-gray-100 p-2">
            <div class="font-semibold text-inherit">${escapeHtml(m.khasra_no)} | ${escapeHtml(m.mutation_type)}</div>
            <div class="mt-1 text-inherit opacity-70">${escapeHtml(m.previous_owner)} -> ${escapeHtml(m.mutation_date)}</div>
        </div>
    `).join('');
}
