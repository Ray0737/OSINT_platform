// OSINT GOTHAM — main application

// ─── GRATICULE ────────────────────────────────────────────────────────────────
let graticuleLayer = null;
let graticuleEnabled = true;

function buildGraticule(zoom) {
  const g = L.layerGroup();
  const step = zoom >= 8 ? 1 : 10;
  const primary = { color: 'rgba(203,166,247,0.10)', weight: 0.5, interactive: false, smoothFactor: 2 };
  const major   = { color: 'rgba(203,166,247,0.22)', weight: 0.8, interactive: false, smoothFactor: 2 };
  for (let lat = -80; lat <= 80; lat += step) {
    L.polyline([[lat, -180], [lat, 180]], lat % 30 === 0 ? major : primary).addTo(g);
  }
  for (let lng = -180; lng <= 180; lng += step) {
    L.polyline([[-90, lng], [90, lng]], lng % 30 === 0 ? major : primary).addTo(g);
  }
  return g;
}

function refreshGraticule() {
  if (!graticuleEnabled) return;
  if (graticuleLayer) map.removeLayer(graticuleLayer);
  graticuleLayer = buildGraticule(map.getZoom());
  graticuleLayer.addTo(map);
}

function toggleGraticule() {
  const btn = document.getElementById('btn-grid');
  graticuleEnabled = !graticuleEnabled;
  if (!graticuleEnabled) {
    if (graticuleLayer) { map.removeLayer(graticuleLayer); graticuleLayer = null; }
    btn.classList.remove('active');
    log('LAYER', 'Grid hidden');
  } else {
    refreshGraticule();
    btn.classList.add('active');
    log('LAYER', 'Grid visible');
  }
}

const TILE_LAYERS = {
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri World Imagery', maxZoom: 19
  }),
  street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'OpenStreetMap', maxZoom: 19
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: 'CartoDB', maxZoom: 19
  })
};

let map, currentTile = 'dark', drawControl, drawLayer;
let activeTool = null;
let userMarkers = [];
let selectedFeature = null;
let measurePoints = [], measureLayer = null;
let pendingLatLng = null;
let selectedStamp = STAMP_TYPES[0];

// ─── SVG icons ───────────────────────────────────────────────────────────────
function makeDiamond(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="8" height="8" viewBox="0 0 8 8"><rect x="0.5" y="0.5" width="7" height="7" transform="rotate(45 4 4)" fill="none" stroke="${color}" stroke-width="1"/></svg>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4]
  });
}
function makeSquare(color, fill = 'none') {
  return L.divIcon({
    className: '',
    html: `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="${fill}" fill-opacity="0.3" stroke="${color}" stroke-width="1"/></svg>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5]
  });
}
function makeCircleIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="${color}" stroke-width="1"/><circle cx="5" cy="5" r="1" fill="${color}"/></svg>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5]
  });
}
function makeStampIcon(stamp) {
  return L.divIcon({
    className: '',
    html: `<svg width="14" height="14" viewBox="0 0 14 14">
      <rect x="0.5" y="0.5" width="13" height="13" fill="none" stroke="${stamp.color}" stroke-width="1"/>
      <line x1="0" y1="0" x2="14" y2="14" stroke="${stamp.color}" stroke-width="0.5" opacity="0.4"/>
    </svg>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

// ─── MAP INIT ────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: [42.5, -101.5],
    zoom: 5,
    minZoom: 3,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: false,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0
  });

  TILE_LAYERS.dark.addTo(map);

  drawLayer = new L.FeatureGroup();
  map.addLayer(drawLayer);

  drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      polyline: { shapeOptions: { color: '#cba6f7', weight: 1.5 } },
      polygon:  { shapeOptions: { color: '#cba6f7', weight: 1.5, fillColor: '#cba6f7', fillOpacity: 0.08 } },
      rectangle:{ shapeOptions: { color: '#f9e2af', weight: 1.5, fillColor: '#f9e2af', fillOpacity: 0.08 } },
      circle:   { shapeOptions: { color: '#89b4fa', weight: 1.5, fillColor: '#89b4fa', fillOpacity: 0.05 } },
      marker: false,
      circlemarker: false
    },
    edit: { featureGroup: drawLayer, remove: true }
  });

  map.addControl(drawControl);
  // hide default draw toolbar (we use our own buttons)
  document.querySelector('.leaflet-draw')?.style.setProperty('display', 'none');

  map.on('mousemove', onMouseMove);
  map.on('click', onMapClick);
  map.on('zoomend', refreshGraticule);
  map.on('popupclose', () => {
    ['sel-name','sel-type','sel-lat','sel-lng','sel-mgrs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    selectedFeature = null;
  });
  map.on('draw:created', onDrawCreated);
  map.on('draw:deleted', onDrawDeleted);
  map.on('draw:edited', () => log('EDIT', 'Geometry edited'));

  refreshGraticule();
  loadSilos();
  loadInstallations();
  loadUserData();
  renderBottomSilos();
  renderBottomBases();
  updateStats();
  log('SYS', 'OSINT GOTHAM initialized');
}

// ─── TILE LAYER SWITCH ───────────────────────────────────────────────────────
function setTile(name) {
  Object.values(TILE_LAYERS).forEach(t => { if (map.hasLayer(t)) map.removeLayer(t); });
  TILE_LAYERS[name].addTo(map);
  currentTile = name;
  document.querySelectorAll('.fab-btn[data-tile]').forEach(b => {
    b.classList.toggle('active', b.dataset.tile === name);
  });
  log('VIEW', `Tile: ${name}`);
}

// ─── SILO MARKERS ────────────────────────────────────────────────────────────
const siloCluster = L.layerGroup();

const wingColors = { '341': '#cba6f7', '91': '#89b4fa', '90': '#a6e3a1' };

function loadSilos() {
  ICBM_SILOS.forEach(s => {
    const color = wingColors[s.wing] || '#cba6f7';
    const isMaf = s.type === 'MAF';
    const icon = isMaf ? makeSquare(color, color) : makeDiamond(color);
    const typeLabel = isMaf ? 'MISSILE ALERT FACILITY' : 'ICBM SILO';
    const m = L.marker([s.lat, s.lng], { icon });
    m.bindPopup(buildPopup(s.label, `${s.wing}th MW · Flight ${s.maf} · ${typeLabel}`, s.lat, s.lng, s.status, null));
    m.on('click', () => selectFeature(s.label, `${typeLabel} · ${s.wing}th MW`, s.lat, s.lng));
    m.featureData = s;
    siloCluster.addLayer(m);
  });
  siloCluster.addTo(map);
}

// ─── INSTALLATION MARKERS ────────────────────────────────────────────────────
const typeColors = {
  // from data.js old format
  BOMBER: '#f9e2af', ICBM: '#cba6f7', COMMAND: '#f38ba8',
  FIGHTER: '#89b4fa', AIRLIFT: '#89dceb', TANKER: '#89dceb',
  SUPPORT: '#a6adc8', SSBN: '#a6e3a1', SPACE: '#b4befe',
  RADAR: '#fab387', MISSILE_DEF: '#f38ba8',
  // from globalMilIntelligence types
  air:    '#f9e2af',
  naval:  '#89b4fa',
  army:   '#a6e3a1',
  marine: '#89dceb',
  bunker: '#f38ba8',
  infra:  '#fab387',
  gov:    '#cdd6f4',
  radar:  '#89dceb',
  comms:  '#b4befe',
  airport:'#6c7086'
};
const installLayer = L.layerGroup();

function loadInstallations() {
  INSTALLATIONS.forEach(inst => {
    const color = typeColors[inst.type] || '#6c7086';
    const sub = inst.unit || inst.units || '';
    const info = inst.aircraft ? `${sub} · ${inst.aircraft}` : (inst.info ? `${sub} · ${inst.info}` : sub);
    const m = L.marker([inst.lat, inst.lng], { icon: makeSquare(color, color) });
    m.bindPopup(buildPopup(inst.name, info, inst.lat, inst.lng, 'operational', null));
    m.on('click', () => selectFeature(inst.name, (inst.type || '').toUpperCase() + ' INSTALLATION', inst.lat, inst.lng));
    m.featureData = inst;
    installLayer.addLayer(m);
  });
  installLayer.addTo(map);
}

function buildPopup(name, sub, lat, lng, status, imgSrc) {
  const imgHtml = imgSrc ? `<img src="${imgSrc}" class="popup-img" />` : '';
  const lngLabel = lng < 0 ? `${Math.abs(lng).toFixed(4)}°W` : `${lng.toFixed(4)}°E`;
  const latLabel = lat >= 0 ? `${lat.toFixed(4)}°N` : `${Math.abs(lat).toFixed(4)}°S`;
  return `<div style="line-height:1.4">
    <div style="color:var(--purple);font-weight:500;font-size:9.5px;margin-bottom:1px;letter-spacing:0.04em">${name}</div>
    <div style="color:var(--overlay0);font-size:8px;margin-bottom:4px;line-height:1.3">${sub}</div>
    <div style="display:flex;gap:6px;align-items:center">
      <span style="color:var(--yellow);font-size:8.5px">${latLabel}</span>
      <span style="color:var(--surface1)">·</span>
      <span style="color:var(--yellow);font-size:8.5px">${lngLabel}</span>
    </div>
    <div style="font-size:7.5px;color:var(--green);margin-top:2px;letter-spacing:0.08em">${status.toUpperCase()}</div>
    ${imgHtml}
  </div>`;
}

// ─── USER MARKERS ────────────────────────────────────────────────────────────
function loadUserData() {
  const saved = localStorage.getItem('gotham_markers');
  if (!saved) return;
  JSON.parse(saved).forEach(d => addUserMarker(d, false));
  log('SYS', `Loaded ${userMarkers.length} saved markers`);
}

function saveUserData() {
  const data = userMarkers.map(m => m._gothamData);
  localStorage.setItem('gotham_markers', JSON.stringify(data));
}

function addUserMarker(data, doSave = true) {
  let icon;
  if (data.kind === 'stamp') {
    const st = STAMP_TYPES.find(s => s.id === data.stamp) || STAMP_TYPES[0];
    icon = makeStampIcon(st);
  } else {
    icon = makeCircleIcon('#cba6f7');
  }
  const m = L.marker([data.lat, data.lng], { icon, draggable: true });
  m._gothamData = data;
  m.bindPopup(buildPopup(data.name || 'USER POINT', data.notes || '', data.lat, data.lng, data.stamp || 'custom', data.img || null));
  m.on('click', () => selectFeature(data.name || 'USER POINT', data.kind === 'stamp' ? data.stamp : 'CUSTOM MARKER', data.lat, data.lng));
  m.on('dragend', () => {
    const ll = m.getLatLng();
    data.lat = ll.lat; data.lng = ll.lng;
    m._gothamData = data;
    saveUserData();
    log('EDIT', `Moved: ${data.name}`);
  });
  m.addTo(map);
  userMarkers.push(m);
  if (doSave) {
    saveUserData();
    log('ADD', `Marker: ${data.name}`);
    refreshRightMarkers();
  }
}

function removeUserMarker(idx) {
  const m = userMarkers[idx];
  if (!m) return;
  map.removeLayer(m);
  userMarkers.splice(idx, 1);
  saveUserData();
  refreshRightMarkers();
  log('DEL', `Removed marker`);
}

// ─── MOUSE EVENTS ────────────────────────────────────────────────────────────
function onMouseMove(e) {
  const lat = e.latlng.lat.toFixed(5);
  const lng = e.latlng.lng.toFixed(5);
  document.getElementById('cursor-lat').textContent = lat;
  document.getElementById('cursor-lng').textContent = lng;
  document.getElementById('rp-lat').textContent = lat + '°';
  document.getElementById('rp-lng').textContent = lng + '°';
  document.getElementById('rp-zoom').textContent = map.getZoom();

  if (activeTool === 'measure-dist' && measurePoints.length === 1) {
    const d = distKm(measurePoints[0], e.latlng);
    const tip = document.getElementById('measure-tip');
    tip.style.display = 'block';
    tip.style.left = (e.originalEvent.clientX + 14) + 'px';
    tip.style.top  = (e.originalEvent.clientY - 10) + 'px';
    tip.textContent = `${d.toFixed(2)} km`;
  }
}

function onMapClick(e) {
  if (activeTool === 'add-point') {
    pendingLatLng = e.latlng;
    openPointModal();
    return;
  }
  if (activeTool === 'add-stamp') {
    pendingLatLng = e.latlng;
    openStampModal();
    return;
  }
  if (activeTool === 'measure-dist') {
    measurePoints.push(e.latlng);
    if (measurePoints.length === 2) {
      const d = distKm(measurePoints[0], measurePoints[1]);
      const polyline = L.polyline(measurePoints, { color: '#f9e2af', weight: 1.5, dashArray: '4 3' }).addTo(map);
      polyline.bindPopup(`<span style="color:var(--yellow)">DISTANCE: ${d.toFixed(3)} km / ${(d*0.621371).toFixed(3)} mi / ${(d*0.539957).toFixed(3)} nm</span>`).openPopup();
      measurePoints = [];
      document.getElementById('measure-tip').style.display = 'none';
      log('MEAS', `Distance: ${d.toFixed(2)} km`);
      setTool(null);
    }
  }
  if (activeTool === 'measure-area') {
    // handled by Leaflet.draw polygon
  }
}

// ─── DRAWING ─────────────────────────────────────────────────────────────────
function onDrawCreated(e) {
  const layer = e.layer;
  drawLayer.addLayer(layer);
  if (e.layerType === 'polygon' || e.layerType === 'rectangle') {
    const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
    const km2 = (area / 1e6).toFixed(3);
    layer.bindPopup(`<span style="color:var(--yellow)">AREA: ${km2} km²</span>`).openPopup();
    log('DRAW', `${e.layerType}: ${km2} km²`);
  } else if (e.layerType === 'circle') {
    const r = (layer.getRadius() / 1000).toFixed(2);
    layer.bindPopup(`<span style="color:var(--yellow)">RADIUS: ${r} km</span>`).openPopup();
    log('DRAW', `Circle radius: ${r} km`);
  } else {
    log('DRAW', `${e.layerType} added`);
  }
  setTool(null);
}

function onDrawDeleted(e) {
  log('DEL', `${e.layers.getLayers().length} shape(s) removed`);
}

function startDraw(type) {
  setTool(type);
  const drawMap = {
    'draw-line': new L.Draw.Polyline(map, { shapeOptions: { color: '#cba6f7', weight: 1.5 } }),
    'draw-circle': new L.Draw.Circle(map, { shapeOptions: { color: '#89b4fa', weight: 1.5, fillColor: '#89b4fa', fillOpacity: 0.05 } }),
    'draw-rect': new L.Draw.Rectangle(map, { shapeOptions: { color: '#f9e2af', weight: 1.5, fillColor: '#f9e2af', fillOpacity: 0.08 } }),
    'draw-polygon': new L.Draw.Polygon(map, { shapeOptions: { color: '#cba6f7', weight: 1.5, fillColor: '#cba6f7', fillOpacity: 0.08 } })
  };
  if (drawMap[type]) drawMap[type].enable();
}

// ─── TOOLS ───────────────────────────────────────────────────────────────────
function setTool(tool) {
  activeTool = tool;
  measurePoints = [];
  document.getElementById('measure-tip').style.display = 'none';
  document.querySelectorAll('.fab-btn[data-tool]').forEach(b => {
    b.classList.toggle('active-tool', b.dataset.tool === tool);
  });
  map.getContainer().style.cursor = tool ? 'crosshair' : '';
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openPointModal() {
  document.getElementById('modal-point').classList.add('open');
  document.getElementById('pt-name').focus();
}
function closePointModal() {
  document.getElementById('modal-point').classList.remove('open');
  document.getElementById('pt-name').value = '';
  document.getElementById('pt-notes').value = '';
  document.getElementById('pt-img').value = '';
  pendingLatLng = null;
  setTool(null);
}
function submitPoint() {
  if (!pendingLatLng) return;
  const name  = document.getElementById('pt-name').value.trim() || 'POINT';
  const notes = document.getElementById('pt-notes').value.trim();
  const imgFile = document.getElementById('pt-img').files[0];
  const doAdd = (imgSrc) => {
    addUserMarker({ kind: 'point', lat: pendingLatLng.lat, lng: pendingLatLng.lng, name, notes, img: imgSrc || null });
    closePointModal();
  };
  if (imgFile) {
    const reader = new FileReader();
    reader.onload = e => doAdd(e.target.result);
    reader.readAsDataURL(imgFile);
  } else {
    doAdd(null);
  }
}

function openStampModal() {
  document.getElementById('modal-stamp').classList.add('open');
}
function closeStampModal() {
  document.getElementById('modal-stamp').classList.remove('open');
  pendingLatLng = null;
  setTool(null);
}
function submitStamp() {
  if (!pendingLatLng) return;
  const name  = document.getElementById('st-name').value.trim() || selectedStamp.label;
  const notes = document.getElementById('st-notes').value.trim();
  addUserMarker({ kind: 'stamp', lat: pendingLatLng.lat, lng: pendingLatLng.lng, name, notes, stamp: selectedStamp.id });
  closeStampModal();
  document.getElementById('st-name').value = '';
  document.getElementById('st-notes').value = '';
}

// ─── SELECTION ────────────────────────────────────────────────────────────────
function selectFeature(name, type, lat, lng) {
  document.getElementById('sel-name').textContent = name;
  document.getElementById('sel-type').textContent = type;
  document.getElementById('sel-lat').textContent = lat.toFixed(5) + '°N';
  document.getElementById('sel-lng').textContent = Math.abs(lng).toFixed(5) + '°W';
  document.getElementById('sel-mgrs').textContent = toMGRS(lat, lng);
  selectedFeature = { name, type, lat, lng };
}

// ─── UTIL ─────────────────────────────────────────────────────────────────────
function distKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const aa = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
}

function toMGRS(lat, lng) {
  // simplified UTM zone display
  const zone = Math.floor((lng + 180) / 6) + 1;
  const band = 'CDEFGHJKLMNPQRSTUVWX'[Math.floor((lat + 80) / 8)];
  return `${zone}${band}`;
}

function ts() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
}

function log(type, msg) {
  const container = document.getElementById('log-list');
  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-ts">${ts()}</span><span class="log-type">${type}</span><span class="log-msg">${msg}</span>`;
  container.prepend(el);
  if (container.children.length > 100) container.lastChild.remove();
}

function updateStats() {
  document.getElementById('stat-silos').textContent = ICBM_SILOS.length;
  document.getElementById('stat-bases').textContent = INSTALLATIONS.length;
  document.getElementById('stat-markers').textContent = userMarkers.length;
}

// ─── BOTTOM TABS ─────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.bp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.bp-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
}

function updateColCounts() {
  [['personnel-tbody','cnt-personnel'],['silos-tbody','cnt-silos'],['bases-tbody','cnt-bases'],['markers-tbody','cnt-markers']].forEach(([tid, cid]) => {
    const tbody = document.getElementById(tid);
    const cel   = document.getElementById(cid);
    if (tbody && cel) cel.textContent = tbody.querySelectorAll('tr:not([style*="none"])').length;
  });
}

function renderBottomSilos() {
  const tbody = document.getElementById('silos-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const wings = { '341': '#cba6f7', '91': '#89b4fa', '90': '#a6e3a1' };
  // Show only MAF (command) entries — one per flight of ~10 silos
  ICBM_SILOS.filter(s => s.type === 'MAF').forEach(s => {
    const color = wings[s.wing] || '#cba6f7';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:${color}">${s.maf || s.id}</td>
      <td style="color:${color};font-size:8px">${s.wing}th MW</td>
      <td>${s.lat.toFixed(4)}</td>
      <td>${s.lng.toFixed(4)}</td>`;
    tr.addEventListener('click', () => {
      map.setView([s.lat, s.lng], 11);
      selectFeature(s.label, `MAF · ${s.wing}th MW`, s.lat, s.lng);
    });
    tbody.appendChild(tr);
  });
  updateColCounts();
}

function renderBottomBases() {
  const tbody = document.getElementById('bases-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  INSTALLATIONS.forEach(inst => {
    const color = typeColors[inst.type] || '#6c7086';
    const sub   = (inst.unit || inst.units || '').substring(0, 22);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:${color}">${inst.name}</td>
      <td style="color:${color};font-size:8px">${(inst.type||'').toUpperCase()}</td>
      <td>${inst.lat.toFixed(4)}</td>
      <td>${inst.lng.toFixed(4)}</td>
      <td style="font-size:8px;color:var(--subtext)">${sub}</td>`;
    tr.addEventListener('click', () => {
      map.setView([inst.lat, inst.lng], 11);
      selectFeature(inst.name, (inst.type||'').toUpperCase() + ' INSTALLATION', inst.lat, inst.lng);
    });
    tbody.appendChild(tr);
  });
  updateColCounts();
}

function refreshRightMarkers() {
  const list = document.getElementById('marker-list');
  list.innerHTML = '';
  userMarkers.forEach((m, i) => {
    const d = m._gothamData;
    const el = document.createElement('div');
    el.className = 'ml-item';
    el.innerHTML = `<span class="ml-name">${d.name}</span><span class="ml-sub">${d.kind === 'stamp' ? d.stamp : 'POINT'} · ${d.lat.toFixed(4)}</span>`;
    el.addEventListener('click', () => {
      map.setView([d.lat, d.lng], 13);
      selectFeature(d.name, d.kind === 'stamp' ? d.stamp : 'USER MARKER', d.lat, d.lng);
    });
    list.appendChild(el);
  });
  renderBottomMarkers();
  updateStats();
}

function renderBottomMarkers() {
  const tbody = document.getElementById('markers-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  userMarkers.forEach(m => {
    const d = m._gothamData;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="hl-purple">${d.name || 'USER POINT'}</td>
      <td style="font-size:8px;color:var(--subtext)">${d.kind === 'stamp' ? d.stamp : 'POINT'}</td>
      <td>${d.lat.toFixed(4)}</td>
      <td>${d.lng.toFixed(4)}</td>
      <td style="font-size:8px;color:var(--overlay0)">${(d.notes||'').substring(0,28)}</td>`;
    tr.addEventListener('click', () => {
      map.setView([d.lat, d.lng], 13);
      selectFeature(d.name || 'USER POINT', d.kind === 'stamp' ? d.stamp : 'USER MARKER', d.lat, d.lng);
    });
    tbody.appendChild(tr);
  });
  updateColCounts();
}

// ─── LAYER TOGGLES ───────────────────────────────────────────────────────────
function toggleSilos() {
  const btn = document.getElementById('btn-silos');
  if (map.hasLayer(siloCluster)) {
    map.removeLayer(siloCluster);
    btn.classList.remove('active');
    log('LAYER', 'Silos hidden');
  } else {
    siloCluster.addTo(map);
    btn.classList.add('active');
    log('LAYER', 'Silos visible');
  }
}
function toggleBases() {
  const btn = document.getElementById('btn-bases');
  if (map.hasLayer(installLayer)) {
    map.removeLayer(installLayer);
    btn.classList.remove('active');
    log('LAYER', 'Bases hidden');
  } else {
    installLayer.addTo(map);
    btn.classList.add('active');
    log('LAYER', 'Bases visible');
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initMap();

  // Tile buttons
  document.querySelectorAll('.fab-btn[data-tile]').forEach(b => {
    b.addEventListener('click', () => setTile(b.dataset.tile));
  });
  // default active
  document.querySelector('.fab-btn[data-tile="dark"]').classList.add('active');

  // Tool buttons
  document.querySelectorAll('.fab-btn[data-tool]').forEach(b => {
    b.addEventListener('click', () => {
      const tool = b.dataset.tool;
      if (activeTool === tool) { setTool(null); return; }
      if (tool.startsWith('draw-')) startDraw(tool);
      else setTool(tool);
    });
  });

  // Layer toggle buttons
  document.getElementById('btn-silos').classList.add('active');
  document.getElementById('btn-bases').classList.add('active');
  document.getElementById('btn-grid').classList.add('active');
  document.getElementById('btn-silos').addEventListener('click', toggleSilos);
  document.getElementById('btn-bases').addEventListener('click', toggleBases);
  document.getElementById('btn-grid').addEventListener('click', toggleGraticule);

  // (tabs removed — all 3 columns always visible)

  // Stamp picker
  const grid = document.getElementById('stamp-grid');
  STAMP_TYPES.forEach(st => {
    const el = document.createElement('div');
    el.className = 'stamp-opt' + (st.id === selectedStamp.id ? ' selected' : '');
    el.textContent = st.label;
    el.style.color = st.color;
    el.style.borderColor = st.id === selectedStamp.id ? st.color : '';
    el.addEventListener('click', () => {
      selectedStamp = st;
      document.querySelectorAll('.stamp-opt').forEach(s => {
        s.classList.remove('selected');
        s.style.borderColor = '';
      });
      el.classList.add('selected');
      el.style.borderColor = st.color;
    });
    grid.appendChild(el);
  });

  // Timezone clocks
  const TZ_DEFS = [
    { id: 'tz-de',   zone: 'Europe/Berlin'       },
    { id: 'tz-dc',   zone: 'America/New_York'    },
    { id: 'tz-la',   zone: 'America/Los_Angeles' },
    { id: 'tz-zulu', zone: 'UTC'                 },
    { id: 'tz-jp',   zone: 'Asia/Tokyo'          },
    { id: 'tz-cn',   zone: 'Asia/Shanghai'       }
  ];
  function updateClocks() {
    const now = new Date();
    TZ_DEFS.forEach(tz => {
      const el = document.getElementById(tz.id);
      if (!el) return;
      el.textContent = now.toLocaleTimeString('en-GB', {
        timeZone: tz.zone, hour12: false,
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    });
  }
  updateClocks();
  setInterval(updateClocks, 1000);

  // Grid ruler — SVG line + ticks + labels like tactical display
  function updateRuler() {
    const bounds = map.getBounds();
    const west  = bounds.getWest();
    const east  = bounds.getEast();
    const zoom  = map.getZoom();
    const step  = zoom >= 9 ? 1 : zoom >= 6 ? 5 : 10;

    ['map-ruler-top', 'map-ruler-bot'].forEach(rid => {
      const ruler = document.getElementById(rid);
      if (!ruler) return;
      const W = ruler.offsetWidth || map.getContainer().offsetWidth;
      const H = 26; // ruler height

      // Top ruler: line near bottom, labels above, ticks hang down
      // Bot ruler: line near top, labels below, ticks point up
      const isBot  = rid === 'map-ruler-bot';
      const lineY  = isBot ? 6 : H - 6;
      const tickDir = isBot ? -1 : 1; // +1 = downward, -1 = upward

      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);

      // Horizontal baseline
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', 0); line.setAttribute('x2', W);
      line.setAttribute('y1', lineY); line.setAttribute('y2', lineY);
      line.setAttribute('stroke', 'rgba(255,255,255,0.45)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const firstLng = Math.ceil(west / step) * step;
      for (let lng = firstLng; lng <= east; lng += step) {
        const px = map.latLngToContainerPoint([0, lng]).x;
        if (px < -20 || px > W + 20) continue;

        const isMajor = lng % 30 === 0 || (step <= 5 && lng % 10 === 0);
        const tickLen = isMajor ? 9 : 5;
        const strokeOpacity = isMajor ? 0.7 : 0.35;

        // Tick mark
        const tick = document.createElementNS(ns, 'line');
        tick.setAttribute('x1', px); tick.setAttribute('x2', px);
        tick.setAttribute('y1', lineY);
        tick.setAttribute('y2', lineY + tickDir * tickLen);
        tick.setAttribute('stroke', `rgba(255,255,255,${strokeOpacity})`);
        tick.setAttribute('stroke-width', isMajor ? '1' : '0.6');
        svg.appendChild(tick);

        // Label (show on every major tick, or every step if step ≥ 5)
        if (isMajor || step >= 5) {
          const absLng = Math.abs(lng);
          const label  = lng === 0 ? '000'
            : (lng < 0 ? `W${String(absLng).padStart(3,'0')}` : `E${String(absLng).padStart(3,'0')}`);
          const labelY = isBot ? lineY + tickLen + 9 : lineY - tickLen - 3;

          const txt = document.createElementNS(ns, 'text');
          txt.setAttribute('x', px);
          txt.setAttribute('y', labelY);
          txt.setAttribute('text-anchor', 'middle');
          txt.setAttribute('fill', isMajor ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.50)');
          txt.setAttribute('font-size', isMajor ? '8.5' : '7.5');
          txt.setAttribute('font-family', 'JetBrains Mono, monospace');
          txt.setAttribute('letter-spacing', '0.06em');
          txt.textContent = label;
          svg.appendChild(txt);
        }
      }

      ruler.innerHTML = '';
      ruler.appendChild(svg);
    });
  }
  map.on('moveend', updateRuler);
  map.on('zoomend', updateRuler);
  setTimeout(updateRuler, 50);

  // Search — filters all 4 columns simultaneously
  const searchInput = document.getElementById('bp-search');
  const searchCount = document.getElementById('bp-search-count');

  const COL_TBODIES = [
    { id: 'personnel-tbody', cnt: 'cnt-personnel' },
    { id: 'silos-tbody',     cnt: 'cnt-silos'     },
    { id: 'bases-tbody',     cnt: 'cnt-bases'     },
    { id: 'markers-tbody',   cnt: 'cnt-markers'   }
  ];

  function updateColCountsLocal() {
    COL_TBODIES.forEach(c => {
      const tbody = document.getElementById(c.id);
      const el    = document.getElementById(c.cnt);
      if (tbody && el) el.textContent = tbody.querySelectorAll('tr:not([style*="none"])').length;
    });
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    let total = 0;
    COL_TBODIES.forEach(c => {
      const tbody = document.getElementById(c.id);
      const cnt   = document.getElementById(c.cnt);
      if (!tbody) return;
      let vis = 0;
      tbody.querySelectorAll('tr').forEach(row => {
        const show = !q || row.textContent.toLowerCase().includes(q);
        row.style.display = show ? '' : 'none';
        if (show) vis++;
      });
      if (cnt) cnt.textContent = vis;
      total += vis;
    });
    searchCount.textContent = q ? String(total) : '';
  });

  // Initialize personnel bottom panel widget
  if (typeof initPersonnelWidget === 'function') initPersonnelWidget();

  // (col counts updated by renderBottom* functions)
});
