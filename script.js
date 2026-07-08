'use strict';

const CONFIG = {
  data: {
    escuelasGeoJSON: 'data/indicemantenimiento.json',
    escuelasCSV: 'data/basededatosrm08cc.csv',
    alcaldias: 'data/alcaldias.json',
    ageb: 'data/ageb.json',
    subsidencias: 'data/subsidencias.json',
    fracturamiento: 'data/fracturamiento.json'
  },
  fields: {
    alcaldia: 'alcaldia', nivel: 'principal', nombre: 'inmueble', coordX: 'coord_x', coordY: 'coord_y', indice: 'Indice_Man', ccts: ['cct1','cct2','cct3','cct4']
  },
  maintenance: [
    'impermeabi','interior','exterior1','loseta','ventanas','ventanas1','ventanas2','puertas','escaleras','pluviales','techos','desazolve','deterioro','concreto','tinacos','cisterna','agua','agua1','hidrosanit','sanitarios','luminarias','electrica','transforma','lamina'
  ],
  maintenanceLabels: {
    impermeabi:'Impermeabilización', interior:'Pintura interior', exterior1:'Pintura exterior', loseta:'Loseta', ventanas:'Vidrios/ventanas', ventanas1:'Cancelería de aluminio/ventanas', ventanas2:'Cancelería de herrería por aluminio/ventanas', puertas:'Puertas', escaleras:'Barandales, pasillos o escaleras', pluviales:'Bajadas pluviales', techos:'Muros o techos', desazolve:'Desazolve', deterioro:'Deterioro', concreto:'Concreto', tinacos:'Tinacos', cisterna:'Cisterna', agua:'Agua', agua1:'Sistema de agua', hidrosanit:'Hidrosanitario', sanitarios:'Sanitarios', luminarias:'Luminarias', electrica:'Instalación eléctrica', transforma:'Transformador', lamina:'Lámina'
  },
  zoom: { alcaldiaMax: 11, agebMax: 13 }
};

const state = {
  allSchools: [], filteredSchools: [], schoolMarkers: new Map(), selectedFracture: null,
  layers: {}, geo: {}, filters: { alcaldia:'', nivel:'', need:'', cct:'', nombre:'' }
};

const map = L.map('map', { zoomControl: false }).setView([19.43, -99.13], 10);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

const baseLayers = {
  'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
  'Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
  'Mapa claro': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '&copy; CARTO' }),
  'Mapa oscuro': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '&copy; CARTO' })
};
baseLayers['Mapa claro'].addTo(map);
L.control.layers(baseLayers, {}, { position: 'topright', collapsed: true }).addTo(map);

state.layers.alcaldias = L.geoJSON(null, { style: { color:'#607d8b', weight:1.2, fill:false } });
state.layers.ageb = L.geoJSON(null, { style: { color:'#95a5a6', weight:.8, fill:false, opacity:.65 } });
state.layers.subsidencias = L.geoJSON(null, { style: f => ({ color:'#555', weight:.2, fillColor: colorSubsidencia(f.properties.gridcode), fillOpacity:.48 }), onEachFeature: onSubFeature });
state.layers.fracturamiento = L.geoJSON(null, { style: { color:'#552583', weight:2.2, opacity:.85 }, onEachFeature: onFractureFeature });
state.layers.schools = L.markerClusterGroup({ maxClusterRadius: 36, disableClusteringAtZoom: 14, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
state.layers.summary = L.layerGroup();

async function init(){
  bindUI();
  await Promise.all([loadBoundaries(), loadExtras(), loadSchools()]);
  populateFilters();
  applyFilters();
  state.layers.alcaldias.addTo(map);
}

async function loadJSON(url){
  const res = await fetch(url, { cache:'no-store' });
  if(!res.ok) throw new Error(`No se pudo cargar ${url}`);
  return res.json();
}
async function loadBoundaries(){
  try{ state.geo.alcaldias = await loadJSON(CONFIG.data.alcaldias); state.layers.alcaldias.addData(normalizeGeoJSON(state.geo.alcaldias)); }catch(e){ console.warn(e.message); }
  try{ state.geo.ageb = await loadJSON(CONFIG.data.ageb); state.layers.ageb.addData(normalizeGeoJSON(state.geo.ageb)); }catch(e){ console.warn(e.message); }
}
async function loadExtras(){
  try{ const sub = normalizeGeoJSON(await loadJSON(CONFIG.data.subsidencias)); state.layers.subsidencias.addData(sub); }catch(e){ console.warn(e.message); }
  try{ const frac = normalizeGeoJSON(await loadJSON(CONFIG.data.fracturamiento)); state.layers.fracturamiento.addData(frac); }catch(e){ console.warn(e.message); }
}
async function loadSchools(){
  let loaded = false;
  try{
    const geo = normalizeGeoJSON(await loadJSON(CONFIG.data.escuelasGeoJSON));
    if(geo.features && geo.features.length){
      state.allSchools = geo.features.map((f,i) => featureToSchool(f, i)).filter(Boolean); loaded = true;
    }
  }catch(e){ console.warn('Se usará CSV como respaldo:', e.message); }
  if(!loaded){
    const csv = await fetch(CONFIG.data.escuelasCSV, { cache:'no-store' }).then(r => r.text());
    const parsed = Papa.parse(csv, { header:true, dynamicTyping:false, skipEmptyLines:true });
    state.allSchools = parsed.data.map((row,i)=>rowToSchool(row,i)).filter(Boolean);
  }
}
function featureToSchool(f,i){
  const p = f.properties || {};
  let coords = null;
  if(f.geometry && f.geometry.type === 'Point') coords = f.geometry.coordinates;
  if(!coords && p[CONFIG.fields.coordX] && p[CONFIG.fields.coordY]) coords = [Number(p[CONFIG.fields.coordX]), Number(p[CONFIG.fields.coordY])];
  if(!coords) return null;
  const ll = normalizePoint(coords[0], coords[1]);
  if(!ll) return null;
  return buildSchool(p, ll.lat, ll.lng, i);
}
function rowToSchool(row,i){
  const ll = normalizePoint(Number(row[CONFIG.fields.coordX]), Number(row[CONFIG.fields.coordY]));
  if(!ll) return null;
  return buildSchool(row, ll.lat, ll.lng, i);
}
function buildSchool(p, lat, lng, id){
  const idx = Number(p[CONFIG.fields.indice]);
  const indice = Number.isFinite(idx) ? idx : CONFIG.maintenance.reduce((s,k)=>s + (Number(p[k]) === 1 ? 1 : 0), 0);
  return { id, lat, lng, p, indice, clase: classifyIndex(indice), ccts: CONFIG.fields.ccts.map(k=>String(p[k]||'').trim()).filter(Boolean) };
}
function normalizePoint(x,y){
  if(!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if(Math.abs(x) <= 180 && Math.abs(y) <= 90) return { lng:x, lat:y };
  if(Math.abs(y) <= 180 && Math.abs(x) <= 90) return { lng:y, lat:x };
  const ll = utmToLatLng(x,y,14,true);
  return ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng) ? ll : null;
}
function normalizeGeoJSON(gj){
  if(!gj || !gj.type) return { type:'FeatureCollection', features:[] };
  const name = gj.crs?.properties?.name || '';
  const needsUTM = /32614|UTM/i.test(name) || hasLargeCoords(gj);
  if(!needsUTM) return gj;
  const copy = JSON.parse(JSON.stringify(gj));
  copy.crs = { type:'name', properties:{ name:'EPSG:4326' } };
  copy.features?.forEach(f => { if(f.geometry) f.geometry.coordinates = transformCoords(f.geometry.coordinates); });
  return copy;
}
function hasLargeCoords(gj){
  const f = gj.features?.[0]; let c = f?.geometry?.coordinates;
  while(Array.isArray(c?.[0])) c = c[0];
  return Array.isArray(c) && (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90);
}
function transformCoords(c){
  if(typeof c?.[0] === 'number') { const ll = utmToLatLng(c[0], c[1], 14, true); return [ll.lng, ll.lat]; }
  return c.map(transformCoords);
}
function utmToLatLng(easting,northing,zone,northern){
  const a=6378137, e=0.081819191, e1sq=0.006739497, k0=0.9996;
  let x=easting-500000, y=northing; if(!northern) y-=10000000;
  const lon0=(zone-1)*6-180+3, m=y/k0, mu=m/(a*(1-e*e/4-3*Math.pow(e,4)/64-5*Math.pow(e,6)/256));
  const e1=(1-Math.sqrt(1-e*e))/(1+Math.sqrt(1-e*e));
  const j1=3*e1/2-27*Math.pow(e1,3)/32, j2=21*e1*e1/16-55*Math.pow(e1,4)/32, j3=151*Math.pow(e1,3)/96, j4=1097*Math.pow(e1,4)/512;
  const fp=mu+j1*Math.sin(2*mu)+j2*Math.sin(4*mu)+j3*Math.sin(6*mu)+j4*Math.sin(8*mu);
  const c1=e1sq*Math.pow(Math.cos(fp),2), t1=Math.pow(Math.tan(fp),2), r1=a*(1-e*e)/Math.pow(1-e*e*Math.pow(Math.sin(fp),2),1.5), n1=a/Math.sqrt(1-e*e*Math.pow(Math.sin(fp),2)), d=x/(n1*k0);
  const q1=n1*Math.tan(fp)/r1, q2=d*d/2, q3=(5+3*t1+10*c1-4*c1*c1-9*e1sq)*Math.pow(d,4)/24, q4=(61+90*t1+298*c1+45*t1*t1-252*e1sq-3*c1*c1)*Math.pow(d,6)/720;
  const lat=fp-q1*(q2-q3+q4);
  const q5=d, q6=(1+2*t1+c1)*Math.pow(d,3)/6, q7=(5-2*c1+28*t1-3*c1*c1+8*e1sq+24*t1*t1)*Math.pow(d,5)/120;
  const lon=(lon0*Math.PI/180)+(q5-q6+q7)/Math.cos(fp);
  return { lat: lat*180/Math.PI, lng: lon*180/Math.PI };
}
function classifyIndex(v){
  if(v <= 6) return 'Muy baja'; if(v <= 10) return 'Baja'; if(v <= 14) return 'Media'; if(v <= 18) return 'Alta'; return 'Muy alta';
}
function colorIndex(v){
  if(v <= 6) return '#2a9d55'; if(v <= 10) return '#a6d96a'; if(v <= 14) return '#ffd65a'; if(v <= 18) return '#f28e2b'; return '#c62828';
}
function colorSubsidencia(g){ return ({1:'#006837',2:'#66bd63',3:'#ffd92f',4:'#fdae61',5:'#d7191c'})[Number(g)] || '#bdbdbd'; }
function labelSubsidencia(g){ return ({1:'Muy baja (0–7 cm)',2:'Baja (8–15 cm)',3:'Media (16–23 cm)',4:'Alta (24–31 cm)',5:'Muy alta (32–40 cm)'})[Number(g)] || 'Sin clasificación'; }

function populateFilters(){
  fillSelect('filterAlcaldia', unique(state.allSchools.map(s=>s.p[CONFIG.fields.alcaldia])));
  fillSelect('filterNivel', unique(state.allSchools.map(s=>s.p[CONFIG.fields.nivel])));
  const need = document.getElementById('filterNeed');
  CONFIG.maintenance.forEach(k => need.insertAdjacentHTML('beforeend', `<option value="${k}">${CONFIG.maintenanceLabels[k] || k}</option>`));
  fillDatalist('cctList', unique(state.allSchools.flatMap(s=>s.ccts)));
  fillDatalist('nombreList', unique(state.allSchools.map(s=>s.p[CONFIG.fields.nombre])));
}
function unique(arr){ return [...new Set(arr.map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')); }
function fillSelect(id, values){ const el=document.getElementById(id); values.forEach(v=>el.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(v)}">${escapeHTML(v)}</option>`)); }
function fillDatalist(id, values){ document.getElementById(id).innerHTML = values.map(v=>`<option value="${escapeAttr(v)}"></option>`).join(''); }

function bindUI(){
  ['filterAlcaldia','filterNivel','filterNeed'].forEach(id => document.getElementById(id).addEventListener('change', e => { state.filters[id.replace('filter','').toLowerCase()] = e.target.value; applyFilters(); if(id==='filterAlcaldia' && e.target.value) zoomToAlcaldia(e.target.value); }));
  document.getElementById('searchCCT').addEventListener('change', e => selectByCCT(e.target.value));
  document.getElementById('searchNombre').addEventListener('change', e => selectByName(e.target.value));
  document.getElementById('btnClear').addEventListener('click', clearFilters);
  document.getElementById('btnCollapse').addEventListener('click', () => { document.getElementById('sidebar').classList.add('hidden'); document.getElementById('btnOpenMenu').classList.remove('hidden'); });
  document.getElementById('btnOpenMenu').addEventListener('click', () => { document.getElementById('sidebar').classList.remove('hidden'); document.getElementById('btnOpenMenu').classList.add('hidden'); });
  document.getElementById('closeInfo').addEventListener('click', () => document.getElementById('infoPanel').classList.add('hidden'));
  document.querySelectorAll('.section-toggle').forEach(b => b.addEventListener('click', () => b.closest('.collapsible').classList.toggle('open')));
  document.getElementById('toggleLegend').addEventListener('click', () => document.getElementById('legendBody').classList.toggle('hidden'));
  document.getElementById('toggleSubsidencias').addEventListener('change', e => toggleLayer(state.layers.subsidencias, e.target.checked, 'subLegend'));
  document.getElementById('toggleFracturamiento').addEventListener('change', e => toggleLayer(state.layers.fracturamiento, e.target.checked));
  document.getElementById('toggleAlcaldias').addEventListener('change', e => toggleLayer(state.layers.alcaldias, e.target.checked));
  document.getElementById('toggleAGEB').addEventListener('change', e => toggleLayer(state.layers.ageb, e.target.checked));
  map.on('zoomend moveend', refreshSchoolLayer);
}
function toggleLayer(layer,on,legendId){ on ? layer.addTo(map) : map.removeLayer(layer); if(legendId) document.getElementById(legendId).classList.toggle('hidden', !on); }
function clearFilters(){
  state.filters = { alcaldia:'', nivel:'', need:'', cct:'', nombre:'' };
  ['filterAlcaldia','filterNivel','filterNeed','searchCCT','searchNombre'].forEach(id=>document.getElementById(id).value='');
  applyFilters();
}
function applyFilters(){
  const f = state.filters;
  state.filteredSchools = state.allSchools.filter(s =>
    (!f.alcaldia || String(s.p[CONFIG.fields.alcaldia]||'') === f.alcaldia) &&
    (!f.nivel || String(s.p[CONFIG.fields.nivel]||'') === f.nivel) &&
    (!f.need || Number(s.p[f.need]) === 1)
  );
  updateMiniStats(); refreshSchoolLayer();
}
function refreshSchoolLayer(){
  map.removeLayer(state.layers.schools); map.removeLayer(state.layers.summary);
  state.layers.schools.clearLayers(); state.layers.summary.clearLayers(); state.schoolMarkers.clear();
  const z = map.getZoom();
  if(z <= CONFIG.zoom.alcaldiaMax && state.geo.alcaldias?.features?.length) drawSummary(state.geo.alcaldias, CONFIG.fields.alcaldia);
  else if(z <= CONFIG.zoom.agebMax && state.geo.ageb?.features?.length) drawSummary(state.geo.ageb, null);
  else drawSchoolMarkers();
}
function drawSchoolMarkers(){
  state.filteredSchools.forEach(s => {
    const marker = L.circleMarker([s.lat, s.lng], { radius:7, color:'#fff', weight:1.5, fillColor:colorIndex(s.indice), fillOpacity:.95 })
      .bindPopup(schoolPopup(s), { maxWidth:260 })
      .on('click', () => openSchoolPanel(s));
    state.schoolMarkers.set(s.id, marker); state.layers.schools.addLayer(marker);
  });
  state.layers.schools.addTo(map);
}
function drawSummary(geo, alcaldiaField){
  const groups = [];
  geo.features.forEach((f,i) => {
    const b = L.geoJSON(f).getBounds(); if(!b.isValid()) return;
    let schools;
    if(alcaldiaField){ const name = bestProp(f.properties, ['NOMGEO','nomgeo','alcaldia','NOM_MUN','nombre']); schools = state.filteredSchools.filter(s => norm(s.p[CONFIG.fields.alcaldia]) === norm(name)); }
    else { schools = state.filteredSchools.filter(s => b.contains([s.lat, s.lng])); }
    if(schools.length) groups.push({ center:b.getCenter(), count:schools.length, avg: schools.reduce((a,s)=>a+s.indice,0)/schools.length, i });
  });
  groups.forEach(g => {
    const size = Math.max(34, Math.min(62, 28 + Math.sqrt(g.count)*4));
    const icon = L.divIcon({ html:`<div class="summary-marker" style="width:${size}px;height:${size}px;background:${colorIndex(g.avg)}">${g.count}</div>`, className:'', iconSize:[size,size] });
    L.marker(g.center, { icon }).addTo(state.layers.summary).bindTooltip(`Escuelas: ${g.count}<br>Promedio índice: ${g.avg.toFixed(1)}`);
  });
  state.layers.summary.addTo(map);
}
function updateMiniStats(){
  const n = state.filteredSchools.length, avg = n ? state.filteredSchools.reduce((a,s)=>a+s.indice,0)/n : 0;
  document.getElementById('statTotal').textContent = n.toLocaleString('es-MX');
  document.getElementById('statProm').textContent = avg.toFixed(1);
}
function schoolPopup(s){
  const needs = needsOf(s).slice(0,8).map(x=>`<li>${escapeHTML(x)}</li>`).join('') || '<li>Sin necesidades registradas</li>';
  return `<div class="popup-title">${escapeHTML(s.p[CONFIG.fields.nombre]||'Sin nombre')}</div><div class="popup-meta">CCT: ${escapeHTML(s.ccts.join(', ')||'N/D')}<br>Índice: ${s.indice} · ${s.clase}</div><details class="popup-details"><summary>Necesidades detectadas</summary><ul>${needs}</ul></details>`;
}
function openSchoolPanel(s){
  const needs = needsOf(s);
  const html = `<h2>${escapeHTML(s.p[CONFIG.fields.nombre]||'Sin nombre')}</h2><div class="sub">${escapeHTML(s.ccts.join(', ')||'CCT no disponible')}</div><span class="badge" style="background:${colorIndex(s.indice)}22;color:${colorIndex(s.indice)}">${s.clase}</span><div class="info-grid"><div><span>Alcaldía</span>${escapeHTML(s.p[CONFIG.fields.alcaldia]||'N/D')}</div><div><span>Nivel</span>${escapeHTML(s.p[CONFIG.fields.nivel]||'N/D')}</div><div><span>Índice</span>${s.indice}</div><div><span>Necesidades</span>${needs.length}</div></div><h3>Resumen</h3><p>${summaryText(s)}</p><h3>Necesidades detectadas</h3><ul class="need-list">${(needs.length?needs:['Sin necesidades registradas']).map(n=>`<li>${escapeHTML(n)}</li>`).join('')}</ul>`;
  document.getElementById('infoContent').innerHTML = html; document.getElementById('infoPanel').classList.remove('hidden');
}
function needsOf(s){ return CONFIG.maintenance.filter(k => Number(s.p[k]) === 1).map(k => CONFIG.maintenanceLabels[k] || k); }
function summaryText(s){
  if(s.indice <= 6) return 'El inmueble presenta una prioridad baja de atención según el índice de mantenimiento.';
  if(s.indice <= 10) return 'El inmueble presenta necesidades moderadas y puede incorporarse a programación preventiva.';
  if(s.indice <= 14) return 'El inmueble requiere seguimiento técnico y priorización intermedia.';
  if(s.indice <= 18) return 'El inmueble concentra varias necesidades y requiere atención prioritaria.';
  return 'El inmueble se ubica en prioridad muy alta por concentración de necesidades de mantenimiento.';
}
function selectByCCT(value){ if(!value) return; const s = state.allSchools.find(x => x.ccts.some(c => norm(c) === norm(value))); if(s) focusSchool(s); }
function selectByName(value){ if(!value) return; const s = state.allSchools.find(x => norm(x.p[CONFIG.fields.nombre]) === norm(value)); if(s) focusSchool(s); }
function focusSchool(s){
  state.filters.alcaldia=''; state.filters.nivel=''; state.filters.need=''; applyFilters();
  map.setView([s.lat,s.lng], 17);
  setTimeout(()=>{ drawSchoolMarkers(); const m = state.schoolMarkers.get(s.id); if(m){ m.openPopup(); openSchoolPanel(s); } }, 250);
}
function zoomToAlcaldia(name){
  let found=null; state.layers.alcaldias.eachLayer(l => { const p=l.feature?.properties||{}; const n=bestProp(p,['NOMGEO','nomgeo','alcaldia','NOM_MUN','nombre']); if(norm(n)===norm(name)) found=l; });
  if(found) map.fitBounds(found.getBounds(), { padding:[40,40] });
}
function onSubFeature(feature, layer){
  const g = feature.properties?.gridcode;
  layer.bindTooltip(`Subsidencia: ${labelSubsidencia(g)}`);
}
function onFractureFeature(feature, layer){
  const p = feature.properties || {}; const dist = bestProp(p, ['distancia','Distancia','DISTANCIA','length','Length','Shape_Leng','Shape_Length','LONGITUD']);
  const txt = `Fracturamiento${dist ? `<br>Distancia: ${escapeHTML(dist)}` : ''}`;
  layer.bindTooltip(txt, { sticky:true });
  layer.on('click', () => {
    if(state.selectedFracture) state.selectedFracture.setStyle({ color:'#552583', weight:2.2 });
    state.selectedFracture = layer; layer.setStyle({ color:'#111827', weight:4 });
    try{ map.fitBounds(layer.getBounds(), { padding:[50,50], maxZoom:15 }); }catch(e){}
    layer.bindPopup(txt).openPopup();
  });
}
function bestProp(p, keys){ for(const k of keys){ if(p && p[k] !== undefined && p[k] !== null && String(p[k]).trim() !== '') return p[k]; } return ''; }
function norm(v){ return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function escapeHTML(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(v){ return escapeHTML(v); }

init().catch(err => { console.error(err); alert('No se pudo iniciar el visor. Revisa la consola del navegador.'); });
