// ===== GROUP MANAGEMENT MODULE =====
const GROUP_COLORS = [
  { name: 'Azul', fill: '#3b82f6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)' },
  { name: 'Esmeralda', fill: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' },
  { name: 'Ámbar', fill: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' },
  { name: 'Rosa', fill: '#f43f5e', bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.4)' },
  { name: 'Violeta', fill: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)' },
  { name: 'Cyan', fill: '#06b6d4', bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.4)' },
  { name: 'Naranja', fill: '#f97316', bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)' },
  { name: 'Lima', fill: '#84cc16', bg: 'rgba(132,204,22,0.15)', border: 'rgba(132,204,22,0.4)' },
  { name: 'Fucsia', fill: '#d946ef', bg: 'rgba(217,70,239,0.15)', border: 'rgba(217,70,239,0.4)' },
  { name: 'Teal', fill: '#14b8a6', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.4)' },
];

class GroupManager {
  constructor(map, markersData, locations) {
    this.map = map;
    this.markersData = markersData;
    this.locations = locations;
    this.groups = [];
    this.polygons = [];
    this.colorIndex = 0;
    this.activeGroupId = null;
    this.isAssigning = false;
    this.init();
  }

  init() {
    this.renderPanel();
    this.bindEvents();
    this.load();
  }

  generateId() { return 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5); }

  getNextColor() {
    const c = GROUP_COLORS[this.colorIndex % GROUP_COLORS.length];
    this.colorIndex++;
    return c;
  }

  createGroup(name) {
    const color = this.getNextColor();
    const group = { id: this.generateId(), name, color, locationIds: [] };
    this.groups.push(group);
    this.save();
    this.renderGroupList();
    return group;
  }

  deleteGroup(id) {
    this.groups = this.groups.filter(g => g.id !== id);
    if (this.activeGroupId === id) { this.activeGroupId = null; this.isAssigning = false; }
    this.save();
    this.renderGroupList();
    this.drawAllZones();
    this.updateMarkerColors();
  }

  toggleLocation(groupId, locId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    // Remove from other groups first
    this.groups.forEach(g => { if (g.id !== groupId) g.locationIds = g.locationIds.filter(l => l !== locId); });
    const idx = group.locationIds.indexOf(locId);
    if (idx >= 0) group.locationIds.splice(idx, 1);
    else group.locationIds.push(locId);
    this.save();
    this.renderGroupList();
    this.drawAllZones();
    this.updateMarkerColors();
  }

  removeLocationFromGroup(groupId, locId) {
    const group = this.groups.find(g => g.id === groupId);
    if (!group) return;
    group.locationIds = group.locationIds.filter(l => l !== locId);
    this.save();
    this.renderGroupList();
    this.drawAllZones();
    this.updateMarkerColors();
  }

  getGroupForLocation(locId) {
    return this.groups.find(g => g.locationIds.includes(locId)) || null;
  }

  save() { localStorage.setItem('jne_groups', JSON.stringify(this.groups)); localStorage.setItem('jne_colorIdx', this.colorIndex); }
  load() {
    try {
      const d = localStorage.getItem('jne_groups');
      const ci = localStorage.getItem('jne_colorIdx');
      if (d) { this.groups = JSON.parse(d); this.renderGroupList(); this.drawAllZones(); this.updateMarkerColors(); }
      if (ci) this.colorIndex = parseInt(ci);
    } catch(e) {}
  }

  // Convex hull (Graham scan)
  convexHull(points) {
    if (points.length < 3) return points;
    const pts = points.map(p => ({ ...p }));
    pts.sort((a, b) => a.lng - b.lng || a.lat - b.lat);
    const cross = (O, A, B) => (A.lng - O.lng) * (B.lat - O.lat) - (A.lat - O.lat) * (B.lng - O.lng);
    const lower = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  expandPolygon(points, factor) {
    if (points.length < 2) return points;
    const cLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const cLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    return points.map(p => ({ lat: cLat + (p.lat - cLat) * factor, lng: cLng + (p.lng - cLng) * factor }));
  }

  drawAllZones() {
    this.polygons.forEach(p => p.setMap(null));
    this.polygons = [];
    this.groups.forEach(group => {
      const locs = this.locations.filter(l => group.locationIds.includes(l.id));
      if (locs.length === 0) return;
      if (locs.length === 1) {
        const c = new google.maps.Circle({ map: this.map, center: { lat: locs[0].lat, lng: locs[0].lng }, radius: 50000, fillColor: group.color.fill, fillOpacity: 0.12, strokeColor: group.color.fill, strokeOpacity: 0.5, strokeWeight: 2, clickable: false, zIndex: 1 });
        this.polygons.push(c);
        return;
      }
      if (locs.length === 2) {
        const line = new google.maps.Polyline({ map: this.map, path: locs.map(l => ({ lat: l.lat, lng: l.lng })), strokeColor: group.color.fill, strokeOpacity: 0.6, strokeWeight: 3, clickable: false, zIndex: 1 });
        this.polygons.push(line);
        [0,1].forEach(i => {
          const c = new google.maps.Circle({ map: this.map, center: { lat: locs[i].lat, lng: locs[i].lng }, radius: 30000, fillColor: group.color.fill, fillOpacity: 0.1, strokeColor: group.color.fill, strokeOpacity: 0.3, strokeWeight: 1, clickable: false, zIndex: 1 });
          this.polygons.push(c);
        });
        return;
      }
      const pts = locs.map(l => ({ lat: l.lat, lng: l.lng }));
      let hull = this.convexHull(pts);
      hull = this.expandPolygon(hull, 1.15);
      const poly = new google.maps.Polygon({ map: this.map, paths: hull, fillColor: group.color.fill, fillOpacity: 0.1, strokeColor: group.color.fill, strokeOpacity: 0.6, strokeWeight: 2, clickable: false, zIndex: 1 });
      this.polygons.push(poly);
    });
  }

  updateMarkerColors() {
    this.markersData.forEach(md => {
      const group = this.getGroupForLocation(md.data.id);
      if (group) {
        const icon = md.marker.getIcon();
        md.marker.setIcon({ ...icon, strokeColor: group.color.fill, strokeWeight: 3 });
      } else {
        const icon = md.marker.getIcon();
        md.marker.setIcon({ ...icon, strokeColor: '#ffffff', strokeWeight: 2 });
      }
    });
  }

  startAssigning(groupId) {
    this.activeGroupId = groupId;
    this.isAssigning = true;
    
    // Show banner
    const group = this.groups.find(g => g.id === groupId);
    const banner = document.getElementById('gp-assign-banner');
    if (banner && group) {
      banner.style.display = 'flex';
      banner.querySelector('.gp-ab-target').textContent = `(Click derecho en mapa)`;
      banner.style.borderColor = group.color.border;
      banner.querySelector('.gp-ab-pulse').style.background = group.color.fill;
      banner.style.background = group.color.bg;
    }

    this.renderGroupList();
    // Add click listeners to markers
    this.markersData.forEach(md => {
      if (md._groupClickListener) google.maps.event.removeListener(md._groupClickListener);
      md._groupClickListener = md.marker.addListener('rightclick', () => {
        if (this.isAssigning) this.toggleLocation(this.activeGroupId, md.data.id);
      });
    });
  }

  stopAssigning() {
    this.isAssigning = false;
    this.activeGroupId = null;
    
    // Hide banner
    const banner = document.getElementById('gp-assign-banner');
    if (banner) banner.style.display = 'none';

    this.markersData.forEach(md => {
      if (md._groupClickListener) { google.maps.event.removeListener(md._groupClickListener); md._groupClickListener = null; }
    });
    this.renderGroupList();
  }

  renderPanel() {
    const panel = document.getElementById('groups-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="gp-header">
        <div class="gp-header-left">
          <div class="gp-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h3 class="gp-title">Zonas de Trabajo</h3>
        </div>
        <div class="gp-count-badge">
          <span class="gp-count-dot"></span>
          <span class="gp-count">${this.groups.length}</span>
        </div>
      </div>
      <div class="gp-create">
        <div class="gp-input-wrapper">
          <svg class="gp-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <input type="text" id="gp-name-input" placeholder="Nombre de nueva zona..." class="gp-input" />
        </div>
        <button id="gp-create-btn" class="gp-create-btn" title="Crear nueva zona">
          <span>Crear</span>
        </button>
      </div>
      <div id="gp-assign-banner" class="gp-assign-banner" style="display: none;">
        <div class="gp-ab-content">
          <div class="gp-ab-pulse"></div>
          <span class="gp-ab-text">Asignando sedes... <span class="gp-ab-target"></span></span>
        </div>
        <button class="gp-ab-btn" title="Finalizar asignación">Hecho</button>
      </div>
      <div id="gp-list" class="gp-list"></div>
    `;
    this.renderGroupList();
  }

  renderGroupList() {
    const list = document.getElementById('gp-list');
    if (!list) return;
    if (this.groups.length === 0) {
      list.innerHTML = `
        <div class="gp-empty">
          <div class="gp-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </div>
          <h4>Sin zonas de trabajo</h4>
          <p>Escribe un nombre arriba y crea una zona para agrupar sedes JEE.</p>
        </div>
      `;
      return;
    }
    list.innerHTML = this.groups.map(g => {
      const totalUnits = this.locations.filter(l => g.locationIds.includes(l.id)).reduce((s,l) => s + l.polosUnidades, 0);
      const totalKg = this.locations.filter(l => g.locationIds.includes(l.id)).reduce((s,l) => s + l.polosKg, 0);
      const isActive = this.isAssigning && this.activeGroupId === g.id;
      const locNames = this.locations.filter(l => g.locationIds.includes(l.id));
      return `
        <div class="gp-card ${isActive ? 'gp-card-active' : ''}" style="--gc: ${g.color.fill}; --gc-bg: ${g.color.bg}; --gc-border: ${g.color.border};">
          <div class="gp-card-indicator" style="background:${g.color.fill}"></div>
          <div class="gp-card-content">
            <div class="gp-card-header">
              <span class="gp-card-name">${g.name}</span>
              <div class="gp-card-actions">
                <button class="gp-btn-assign ${isActive ? 'active' : ''}" data-gid="${g.id}" title="${isActive ? 'Asignando sedes (Finalizar)' : 'Asignar sedes a esta zona'}">
                  ${isActive 
                    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>'
                    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
                  }
                </button>
                <button class="gp-btn-delete" data-gid="${g.id}" title="Eliminar zona">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
            <div class="gp-card-stats">
              <div class="gp-stat" title="Sedes asignadas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${g.locationIds.length}</div>
              <div class="gp-stat" title="Unidades totales"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> ${totalUnits.toLocaleString()}</div>
              <div class="gp-stat" title="Peso en Kg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="1" y="6" width="22" height="12" rx="2"/><path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg> ${totalKg.toLocaleString()}kg</div>
            </div>
            ${locNames.length > 0 ? `<div class="gp-card-locs">${locNames.map(l => `<span class="gp-loc-tag" data-gid="${g.id}" data-lid="${l.id}"><span class="gp-loc-dot" style="background:${g.color.fill}"></span>${l.name} <span class="gp-loc-x">×</span></span>`).join('')}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    // update panel header count
    const countEl = document.querySelector('.gp-count');
    if (countEl) countEl.textContent = this.groups.length;
  }

  bindEvents() {
    // Create group
    document.addEventListener('click', (e) => {
      if (e.target.closest('#gp-create-btn')) {
        const input = document.getElementById('gp-name-input');
        const name = input?.value.trim();
        if (name) { this.createGroup(name); input.value = ''; }
      }
      if (e.target.closest('.gp-btn-assign')) {
        const gid = e.target.closest('.gp-btn-assign').dataset.gid;
        if (this.isAssigning && this.activeGroupId === gid) this.stopAssigning();
        else { this.stopAssigning(); this.startAssigning(gid); }
      }
      if (e.target.closest('.gp-btn-delete')) {
        const gid = e.target.closest('.gp-btn-delete').dataset.gid;
        this.deleteGroup(gid);
      }
      if (e.target.closest('.gp-ab-btn')) {
        this.stopAssigning();
      }
      if (e.target.closest('.gp-loc-x')) {
        const tag = e.target.closest('.gp-loc-tag');
        if (tag) { this.removeLocationFromGroup(tag.dataset.gid, parseInt(tag.dataset.lid)); }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement?.id === 'gp-name-input') {
        document.getElementById('gp-create-btn')?.click();
      }
      if (e.key === 'Escape' && this.isAssigning) this.stopAssigning();
    });
  }
}

window.GroupManager = GroupManager;
