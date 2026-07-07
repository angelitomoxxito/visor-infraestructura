/* Visor RM08 - mantenimiento escolar
   Archivos esperados en /data:
   indicemantenimiento.json, basededatosrm08cc.csv, alcaldias.json, ageb.json,
   subsidencias.json y fracturamiento.json.
*/

const DATA_PATHS = {
  schoolsGeoJSON: "data/indicemantenimiento.json",
  schoolsCSV: "data/basededatosrm08cc.csv",
  alcaldias: "data/alcaldias.json",
  agebs: "data/ageb.json",
  subsidencias: "data/subsidencias.json",
  fracturamiento: "data/fracturamiento.json"
};

const FIELDS = {
  alcaldia: "alcaldia",
  nivel: "principal",
  nombre: "inmueble",
  ccts: ["cct1", "cct2", "cct3", "cct4"],
  x: "coord_x",
  y: "coord_y",
  indice: "Indice_Man"
};

const MAINTENANCE_FIELDS = [
  "impermeabi","interior","exterior1","loseta","ventanas","ventanas1","ventanas2",
  "puertas","escaleras","pluviales","techos","desazolve","deterioro","concreto",
  "tinacos","cisterna","agua","agua1","hidrosanit","sanitarios","luminarias",
  "electrica","transforma","lamina"
];

const MAINTENANCE_LABELS = {
  impermeabi:"Impermeabilización", interior:"Pintura interior", exterior1:"Pintura exterior",
  loseta:"Loseta", ventanas:"Vidrios / ventanas", ventanas1:"Cancelería de aluminio / ventanas",
  ventanas2:"Cancelería de herrería / ventanas", puertas:"Puertas", escaleras:"Barandales, pasillos o escaleras",
  pluviales:"Bajadas pluviales", techos:"Muros o techos", desazolve:"Desazolve",
  deterioro:"Deterioro de estructura o acabados", concreto:"Concreto", tinacos:"Tinacos",
  cisterna:"Cisterna", agua:"Agua potable", agua1:"Red o abastecimiento de agua",
  hidrosanit:"Instalación hidrosanitaria", sanitarios:"Sanitarios", luminarias:"Luminarias",
  electrica:"Instalación eléctrica", transforma:"Transformador", lamina:"Lámina"
};

let allSchools = [];
let filteredSchools = [];
let alcaldiasGeoJSON = null;
let agebsGeoJSON = null;
let subsidenciasGeoJSON = null;
let fracturamientoGeoJSON = null;
let selectedFractureLayer = null;

let schoolLayer = L.markerClusterGroup({
  showCoverageOnHover:false,
  maxClusterRadius:28,
  spiderfyOnMaxZoom:true,
  disableClusteringAtZoom:13
});
let alcaldiaSummaryLayer = L.layerGroup();
let agebSummaryLayer = L.layerGroup();
let alcaldiaBoundaryLayer = null;
let agebBoundaryLayer = null;
let subsidenciaLayer = null;
let fracturamientoLayer = null;

const map = L.map("map", {zoomControl:true, preferCanvas:true}).setView([19.35, -99.13], 10);

const baseLayers = {
  "Mapa claro": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {maxZoom:20, attribution:"© OpenStreetMap © CARTO"}),
  "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"© OpenStreetMap"}),
  "Satélite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom:19, attribution:"Tiles © Esri"}),
  "Mapa oscuro": L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {maxZoom:20, attribution:"© OpenStreetMap © CARTO"})
};
baseLayers["Mapa claro"].addTo(map);

const overlayLayers = {
  "Límite de alcaldías": L.layerGroup(),
  "AGEB": L.layerGroup()
};
L.control.layers(baseLayers, overlayLayers, {collapsed:true, position:"bottomright"}).addTo(map);
schoolLayer.addTo(map);

document.addEventListener("DOMContentLoaded", init);

async function init(){
  buildMaintenanceMenu();
  bindUI();

  const [schools, alcaldias, agebs, subsidencias, fracturamiento] = await Promise.all([
    loadSchools(), fetchJsonSafe(DATA_PATHS.alcaldias), fetchJsonSafe(DATA_PATHS.agebs),
    fetchJsonSafe(DATA_PATHS.subsidencias), fetchJsonSafe(DATA_PATHS.fracturamiento)
  ]);

  allSchools = schools;
  filteredSchools = [...allSchools];
  alcaldiasGeoJSON = alcaldias;
  agebsGeoJSON = agebs;
  subsidenciasGeoJSON = subsidencias;
  fracturamientoGeoJSON = fracturamiento;

  drawBoundaries();
  drawExtraLayers();
  populateFilters();
  updateMap();
}

async function loadSchools(){
  const geo = await fetchJsonSafe(DATA_PATHS.schoolsGeoJSON);
  if(geo && geo.features && geo.features.length){
    return geo.features.map((f, i) => normalizeFeature(f, i)).filter(Boolean);
  }
  return new Promise((resolve, reject) => {
    Papa.parse(DATA_PATHS.schoolsCSV, {
      download:true, header:true, dynamicTyping:true, skipEmptyLines:true,
      complete: results => resolve(results.data.map((row, i) => normalizeRow(row, i)).filter(Boolean)),
      error: err => reject(err)
    });
  });
}

async function fetchJsonSafe(url){
  try{
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) return null;
    const txt = await res.text();
    if(!txt || txt.trim().length < 5) return null;
    return JSON.parse(txt);
  }catch(e){
    return null;
  }
}

function normalizeFeature(feature, i){
  const p = feature.properties || {};
  let lon, lat;
  if(feature.geometry && feature.geometry.type === "Point"){
    lon = Number(feature.geometry.coordinates[0]); lat = Number(feature.geometry.coordinates[1]);
  }else{
    lon = Number(p[FIELDS.x]); lat = Number(p[FIELDS.y]);
  }
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return normalizeCommon(p, lat, lon, i);
}
function normalizeRow(row, i){
  const lon = Number(row[FIELDS.x]); const lat = Number(row[FIELDS.y]);
  if(!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return normalizeCommon(row, lat, lon, i);
}
function normalizeCommon(p, lat, lon, i){
  const indice = Number.isFinite(Number(p[FIELDS.indice])) ? Number(p[FIELDS.indice]) : MAINTENANCE_FIELDS.reduce((sum, field) => sum + toBinary(p[field]), 0);
  const ccts = FIELDS.ccts.map(f => cleanText(p[f])).filter(Boolean);
  return {id:cleanText(p.idinmueble)||`escuela-${i}`, lat, lon, props:p, nombre:cleanText(p[FIELDS.nombre])||"Sin nombre", alcaldia:normalizeText(p[FIELDS.alcaldia]), nivel:normalizeText(p[FIELDS.nivel]), ccts, indice, clasificacion:classifyIndex(indice), needs:MAINTENANCE_FIELDS.filter(f => toBinary(p[f]) === 1)};
}
function toBinary(value){ if(value === 1 || value === "1") return 1; const n = Number(value); return Number.isFinite(n) && n === 1 ? 1 : 0; }
function cleanText(value){ if(value === null || value === undefined) return ""; const s = String(value).trim(); if(!s || s.toLowerCase() === "nan") return ""; return s; }
function normalizeText(value){ return cleanText(value).replace(/\s+/g, " "); }
function classifyIndex(v){ if(v <= 6) return "Muy baja"; if(v <= 10) return "Baja"; if(v <= 14) return "Media"; if(v <= 18) return "Alta"; return "Muy alta"; }
function colorByIndex(v){ if(v <= 6) return "#2ca25f"; if(v <= 10) return "#a1d99b"; if(v <= 14) return "#ffd166"; if(v <= 18) return "#f97316"; return "#dc2626"; }
function classSlug(label){ return label.toLowerCase().replace(/\s+/g, "-"); }

function buildMaintenanceMenu(){
  const container = document.getElementById("maintenanceFilters");
  container.innerHTML = MAINTENANCE_FIELDS.map(field => `<label><input type="checkbox" value="${field}"><span>${MAINTENANCE_LABELS[field] || field}</span></label>`).join("");
}

function bindUI(){
  document.getElementById("btnAplicar").addEventListener("click", applyFilters);
  document.getElementById("btnLimpiar").addEventListener("click", clearFilters);
  document.getElementById("filtroAlcaldia").addEventListener("change", () => { applyFilters(); zoomToSelectedAlcaldia(); });
  document.getElementById("filtroNivel").addEventListener("change", applyFilters);
  document.getElementById("buscarCCT").addEventListener("input", applyFilters);
  document.getElementById("buscarNombre").addEventListener("input", applyFilters);
  document.getElementById("buscarCCT").addEventListener("change", () => zoomToMatchedSchool("cct"));
  document.getElementById("buscarNombre").addEventListener("change", () => zoomToMatchedSchool("nombre"));
  document.getElementById("maintenanceFilters").addEventListener("change", applyFilters);
  document.getElementById("closeDetail").addEventListener("click", () => document.getElementById("detailPanel").classList.remove("open"));
  document.getElementById("toggleLegend").addEventListener("click", () => toggleBox("legendBody", "toggleLegend"));
  document.getElementById("toggleSubLegend").addEventListener("click", () => toggleBox("subLegendBody", "toggleSubLegend"));
  document.getElementById("toggleSidebar").addEventListener("click", collapseSidebar);
  document.getElementById("showSidebar").addEventListener("click", expandSidebar);
  document.getElementById("toggleExtras").addEventListener("click", toggleExtrasMenu);
  document.getElementById("toggleSubsidencias").addEventListener("change", e => toggleSubsidencias(e.target.checked));
  document.getElementById("toggleFracturamiento").addEventListener("change", e => toggleFracturamiento(e.target.checked));
  map.on("zoomend", updateVisibilityByZoom);
}
function toggleBox(bodyId, buttonId){ const body = document.getElementById(bodyId); const btn = document.getElementById(buttonId); const hidden = body.style.display === "none"; body.style.display = hidden ? "block" : "none"; btn.textContent = hidden ? "−" : "+"; }
function collapseSidebar(){ document.getElementById("layout").classList.add("sidebar-collapsed"); document.getElementById("showSidebar").classList.remove("hidden"); setTimeout(() => map.invalidateSize(), 220); }
function expandSidebar(){ document.getElementById("layout").classList.remove("sidebar-collapsed"); document.getElementById("showSidebar").classList.add("hidden"); setTimeout(() => map.invalidateSize(), 220); }
function toggleExtrasMenu(){ const body = document.getElementById("extrasBody"); const arrow = document.getElementById("extrasArrow"); const open = body.classList.contains("hidden"); body.classList.toggle("hidden", !open); arrow.textContent = open ? "⌄" : "›"; document.getElementById("toggleExtras").setAttribute("aria-expanded", String(open)); }

function populateFilters(){
  fillSelect("filtroAlcaldia", unique(allSchools.map(s => s.alcaldia)));
  fillSelect("filtroNivel", unique(allSchools.map(s => s.nivel)));
  document.getElementById("listaCCT").innerHTML = unique(allSchools.flatMap(s => s.ccts)).map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
  document.getElementById("listaNombres").innerHTML = unique(allSchools.map(s => s.nombre)).map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
}
function fillSelect(id, values){ const select = document.getElementById(id); const first = select.querySelector("option").outerHTML; select.innerHTML = first + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(""); }
function unique(arr){ return [...new Set(arr.filter(Boolean))].sort((a,b) => a.localeCompare(b, "es")); }

function applyFilters(){
  const alcaldia = document.getElementById("filtroAlcaldia").value;
  const nivel = document.getElementById("filtroNivel").value;
  const cct = document.getElementById("buscarCCT").value.trim().toLowerCase();
  const nombre = document.getElementById("buscarNombre").value.trim().toLowerCase();
  const activeNeeds = [...document.querySelectorAll("#maintenanceFilters input:checked")].map(i => i.value);
  filteredSchools = allSchools.filter(s => {
    if(alcaldia && s.alcaldia !== alcaldia) return false;
    if(nivel && s.nivel !== nivel) return false;
    if(cct && !s.ccts.some(v => v.toLowerCase().includes(cct))) return false;
    if(nombre && !s.nombre.toLowerCase().includes(nombre)) return false;
    if(activeNeeds.length && !activeNeeds.every(f => s.needs.includes(f))) return false;
    return true;
  });
  updateMap();
}
function clearFilters(){
  document.getElementById("filtroAlcaldia").value = ""; document.getElementById("filtroNivel").value = ""; document.getElementById("buscarCCT").value = ""; document.getElementById("buscarNombre").value = "";
  document.querySelectorAll("#maintenanceFilters input").forEach(i => i.checked = false);
  filteredSchools = [...allSchools]; updateMap(); if(filteredSchools.length) fitToSchools(filteredSchools);
}

function updateMap(){ drawSchools(); drawSummaries(); updateKpis(); updateVisibilityByZoom(); }
function drawSchools(){
  schoolLayer.clearLayers();
  filteredSchools.forEach(s => {
    const marker = L.circleMarker([s.lat, s.lon], {radius:7, color:"#ffffff", weight:1.4, fillColor:colorByIndex(s.indice), fillOpacity:.9});
    marker.bindPopup(buildPopup(s), {maxWidth:280}); marker.on("click", () => openDetail(s)); marker.schoolData = s; schoolLayer.addLayer(marker);
  });
  if(filteredSchools.length && !map._initialFitDone){ fitToSchools(filteredSchools); map._initialFitDone = true; }
}
function buildPopup(s){
  const needs = s.needs.map(f => `<li>${escapeHtml(MAINTENANCE_LABELS[f] || f)}</li>`).join("");
  return `<div class="popup-title">${escapeHtml(s.nombre)}</div><div class="popup-meta">CCT: ${escapeHtml(s.ccts.join(", ") || "Sin dato")}<br>Alcaldía: ${escapeHtml(s.alcaldia || "Sin dato")}<br>Índice: <strong>${s.indice}</strong> (${s.clasificacion})</div><details class="popup-details"><summary>Necesidades detectadas</summary><ul>${needs || "<li>Sin necesidades registradas</li>"}</ul></details>`;
}
function openDetail(s){
  document.getElementById("detailPanel").classList.add("open");
  document.getElementById("detailTitle").textContent = s.nombre;
  const needs = s.needs.map(f => `<li>${escapeHtml(MAINTENANCE_LABELS[f] || f)}</li>`).join("");
  document.getElementById("detailContent").innerHTML = `<dl><dt>CCT</dt><dd>${escapeHtml(s.ccts.join(", ") || "Sin dato")}</dd><dt>Alcaldía</dt><dd>${escapeHtml(s.alcaldia || "Sin dato")}</dd><dt>Nivel</dt><dd>${escapeHtml(s.nivel || "Sin dato")}</dd><dt>Índice</dt><dd>${s.indice}</dd><dt>Clasificación</dt><dd><span class="badge ${classSlug(s.clasificacion)}">${s.clasificacion}</span></dd></dl><h3>Resumen de mantenimiento</h3><p>${maintenanceSummary(s)}</p><h3>Necesidades detectadas</h3><ul class="need-list">${needs || "<li>Sin necesidades registradas</li>"}</ul><details><summary>Mostrar todas las variables con Sí/No</summary><dl>${MAINTENANCE_FIELDS.map(f => `<dt>${escapeHtml(MAINTENANCE_LABELS[f] || f)}</dt><dd>${s.needs.includes(f) ? "Sí" : "No"}</dd>`).join("")}</dl></details>`;
}
function maintenanceSummary(s){ if(s.indice <= 6) return "El inmueble presenta un nivel bajo de necesidades registradas. Se sugiere seguimiento preventivo."; if(s.indice <= 10) return "El inmueble presenta necesidades puntuales de mantenimiento. Se recomienda revisión operativa."; if(s.indice <= 14) return "El inmueble presenta un nivel medio de necesidades. Conviene priorizar una visita técnica."; if(s.indice <= 18) return "El inmueble presenta alta concentración de necesidades. Se recomienda atención prioritaria."; return "El inmueble presenta muy alta concentración de necesidades. Se recomienda intervención prioritaria y revisión integral."; }

function drawBoundaries(){
  if(alcaldiasGeoJSON){ alcaldiaBoundaryLayer = L.geoJSON(alcaldiasGeoJSON, {style:{color:"#1f4e79", weight:1, fillOpacity:0, opacity:.55}}).addTo(map); }
  if(agebsGeoJSON){ agebBoundaryLayer = L.geoJSON(agebsGeoJSON, {style:{color:"#64748b", weight:.5, fillOpacity:0, opacity:.25}}); }
}
function drawSummaries(){ alcaldiaSummaryLayer.clearLayers(); agebSummaryLayer.clearLayers(); if(alcaldiasGeoJSON) drawPolygonSummary(alcaldiasGeoJSON, alcaldiaSummaryLayer, "alcaldía"); else drawAttributeSummary("alcaldia", alcaldiaSummaryLayer); if(agebsGeoJSON) drawPolygonSummary(agebsGeoJSON, agebSummaryLayer, "AGEB"); }
function drawAttributeSummary(attr, layer){ const groups = groupBy(filteredSchools, s => s[attr] || "Sin dato"); Object.entries(groups).forEach(([name, schools]) => addSummaryMarker(layer, [avg(schools.map(s => s.lat)), avg(schools.map(s => s.lon))], name, schools)); }
function drawPolygonSummary(geojson, layer, type){ geojson.features.forEach(feature => { const schools = filteredSchools.filter(s => pointInFeature([s.lon, s.lat], feature)); if(!schools.length) return; addSummaryMarker(layer, getFeatureCenter(feature), getAreaName(feature, type), schools); }); }
function addSummaryMarker(layer, latlng, name, schools){
  const count = schools.length; const mean = avg(schools.map(s => s.indice)); const size = Math.max(34, Math.min(64, 28 + Math.sqrt(count) * 4));
  const icon = L.divIcon({className:"", html:`<div class="summary-marker" style="width:${size}px;height:${size}px">${count}</div>`, iconSize:[size,size], iconAnchor:[size/2,size/2]});
  const marker = L.marker(latlng, {icon}); marker.bindPopup(`<div class="popup-title">${escapeHtml(name)}</div><div class="popup-meta">Escuelas: <strong>${count}</strong><br>Promedio del índice: <strong>${mean.toFixed(1)}</strong><br>Alta y muy alta: <strong>${schools.filter(s => s.indice >= 15).length}</strong></div>`); layer.addLayer(marker);
}
function updateVisibilityByZoom(){
  const z = map.getZoom(); map.removeLayer(alcaldiaSummaryLayer); map.removeLayer(agebSummaryLayer); map.removeLayer(schoolLayer);
  if(z < 11){ alcaldiaSummaryLayer.addTo(map); if(agebBoundaryLayer && map.hasLayer(agebBoundaryLayer)) map.removeLayer(agebBoundaryLayer); }
  else if(z < 13){ agebSummaryLayer.addTo(map); if(agebBoundaryLayer && !map.hasLayer(agebBoundaryLayer)) agebBoundaryLayer.addTo(map); }
  else{ schoolLayer.addTo(map); if(agebBoundaryLayer && !map.hasLayer(agebBoundaryLayer)) agebBoundaryLayer.addTo(map); }
}
function updateKpis(){ const total = filteredSchools.length; const mean = total ? avg(filteredSchools.map(s => s.indice)) : 0; const high = filteredSchools.filter(s => s.indice >= 15).length; document.getElementById("kpiTotal").textContent = total.toLocaleString("es-MX"); document.getElementById("kpiPromedio").textContent = mean.toFixed(1); document.getElementById("kpiAlta").textContent = high.toLocaleString("es-MX"); }
function fitToSchools(schools){ const bounds = L.latLngBounds(schools.map(s => [s.lat, s.lon])); map.fitBounds(bounds, {padding:[35,35], maxZoom:13}); }

function zoomToMatchedSchool(type){
  const value = (type === "cct" ? document.getElementById("buscarCCT").value : document.getElementById("buscarNombre").value).trim().toLowerCase();
  if(!value) return;
  const found = filteredSchools.find(s => type === "cct" ? s.ccts.some(c => c.toLowerCase() === value) : s.nombre.toLowerCase() === value) || filteredSchools[0];
  if(found){ map.setView([found.lat, found.lon], 16); openDetail(found); }
}
function zoomToSelectedAlcaldia(){
  const selected = document.getElementById("filtroAlcaldia").value; if(!selected) return;
  if(alcaldiaBoundaryLayer){ let found = null; alcaldiaBoundaryLayer.eachLayer(layer => { const name = getAreaName(layer.feature, "alcaldía").toUpperCase(); if(name === selected.toUpperCase()) found = layer; }); if(found){ map.fitBounds(found.getBounds(), {padding:[30,30]}); return; } }
  const schools = filteredSchools.filter(s => s.alcaldia === selected); if(schools.length) fitToSchools(schools);
}

function drawExtraLayers(){
  if(subsidenciasGeoJSON){
    subsidenciaLayer = L.geoJSON(subsidenciasGeoJSON, {style: styleSubsidencia, onEachFeature: (feature, layer) => { const v = getSubsidenciaValue(feature.properties || {}); const label = classifySubsidencia(v); layer.bindPopup(`<div class="popup-title">Subsidencia</div><div class="popup-meta">Rango: <strong>${escapeHtml(label)}</strong><br>Valor: <strong>${Number.isFinite(v) ? v + " cm" : "Sin dato"}</strong></div>`); }});
  }
  if(fracturamientoGeoJSON){
    fracturamientoLayer = L.geoJSON(fracturamientoGeoJSON, {style: fractureStyle(false), onEachFeature: onEachFracture});
  }
}
function toggleSubsidencias(checked){ if(!subsidenciaLayer) return; if(checked){ subsidenciaLayer.addTo(map); document.getElementById("subsidenciaLegend").classList.remove("hidden"); } else { map.removeLayer(subsidenciaLayer); document.getElementById("subsidenciaLegend").classList.add("hidden"); } }
function toggleFracturamiento(checked){ if(!fracturamientoLayer) return; if(checked) fracturamientoLayer.addTo(map); else { map.removeLayer(fracturamientoLayer); selectedFractureLayer = null; } }
function getSubsidenciaValue(p){
  const candidates = ["gridcode","GRIDCODE","value","Value","VALUE","rango","RANGO","subsidencia","SUBSIDENCIA","cm","CM"];
  for(const c of candidates){ const n = Number(p[c]); if(Number.isFinite(n)) return n; }
  for(const value of Object.values(p)){ const n = Number(value); if(Number.isFinite(n) && n >= 0 && n <= 40) return n; }
  return NaN;
}
function classifySubsidencia(v){ if(!Number.isFinite(v)) return "Sin dato"; if(v <= 7) return "Muy bajo"; if(v <= 15) return "Bajo"; if(v <= 23) return "Medio"; if(v <= 31) return "Alto"; return "Muy alto"; }
function colorSubsidencia(v){ if(!Number.isFinite(v)) return "#94a3b8"; if(v <= 7) return "#006837"; if(v <= 15) return "#78c679"; if(v <= 23) return "#ffd166"; if(v <= 31) return "#f97316"; return "#dc2626"; }
function styleSubsidencia(feature){ const v = getSubsidenciaValue(feature.properties || {}); return {color:"#ffffff", weight:.3, opacity:.7, fillColor:colorSubsidencia(v), fillOpacity:.48}; }
function fractureStyle(selected){ return {color:selected ? "#0f172a" : "#7c2d12", weight:selected ? 4 : 2.2, opacity:selected ? 1 : .8}; }
function onEachFracture(feature, layer){
  const info = fractureInfo(feature.properties || {});
  layer.bindTooltip(info.short, {sticky:true, className:"fracture-tooltip"});
  layer.on("mouseover", () => { if(layer !== selectedFractureLayer) layer.setStyle({weight:3.5, opacity:1}); });
  layer.on("mouseout", () => { if(layer !== selectedFractureLayer) layer.setStyle(fractureStyle(false)); });
  layer.on("click", () => {
    if(selectedFractureLayer && selectedFractureLayer !== layer) selectedFractureLayer.setStyle(fractureStyle(false));
    selectedFractureLayer = layer; layer.setStyle(fractureStyle(true));
    const bounds = layer.getBounds ? layer.getBounds() : null; if(bounds && bounds.isValid()) map.fitBounds(bounds, {padding:[40,40], maxZoom:16});
    layer.bindPopup(`<div class="popup-title">Fracturamiento</div><div class="popup-meta">${info.html}</div>`).openPopup();
  });
}
function fractureInfo(p){
  const keys = Object.keys(p || {});
  const distanceKey = keys.find(k => /dist|long|length|metros|mtrs|km/i.test(k));
  if(distanceKey) return {short:`${distanceKey}: ${p[distanceKey]}`, html:`${escapeHtml(distanceKey)}: <strong>${escapeHtml(p[distanceKey])}</strong>`};
  const rows = keys.slice(0, 6).map(k => `${escapeHtml(k)}: <strong>${escapeHtml(p[k])}</strong>`).join("<br>");
  return {short: rows ? rows.replace(/<[^>]*>/g, " ") : "Fracturamiento", html: rows || "Sin atributos disponibles"};
}

function getAreaName(feature, fallback){ const p = feature.properties || {}; const candidates = ["alcaldia","NOMGEO","nomgeo","NOM_ALC","NOMBRE","nombre","municipio","CVEGEO","cvegeo","AGEB","ageb","CVE_AGEB"]; for(const c of candidates){ if(cleanText(p[c])) return cleanText(p[c]); } return fallback; }
function getFeatureCenter(feature){ try{ const coords = []; collectCoords(feature.geometry.coordinates, coords); return [avg(coords.map(c => c[1])), avg(coords.map(c => c[0]))]; }catch(e){ return [19.35, -99.13]; } }
function collectCoords(obj, out){ if(typeof obj[0] === "number") out.push(obj); else obj.forEach(o => collectCoords(o, out)); }
function pointInFeature(point, feature){ const geom = feature.geometry; if(!geom) return false; if(geom.type === "Polygon") return pointInPolygon(point, geom.coordinates); if(geom.type === "MultiPolygon") return geom.coordinates.some(poly => pointInPolygon(point, poly)); return false; }
function pointInPolygon(point, polygon){ const insideOuter = pointInRing(point, polygon[0]); if(!insideOuter) return false; for(let i=1;i<polygon.length;i++){ if(pointInRing(point, polygon[i])) return false; } return true; }
function pointInRing(point, ring){ const x = point[0], y = point[1]; let inside = false; for(let i=0, j=ring.length-1; i<ring.length; j=i++){ const xi = ring[i][0], yi = ring[i][1]; const xj = ring[j][0], yj = ring[j][1]; const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi); if(intersect) inside = !inside; } return inside; }
function groupBy(arr, fn){ return arr.reduce((acc, item) => { const key = fn(item); acc[key] = acc[key] || []; acc[key].push(item); return acc; }, {}); }
function avg(arr){ if(!arr.length) return 0; return arr.reduce((a,b) => a + Number(b || 0), 0) / arr.length; }
function escapeHtml(str){ return String(str ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
