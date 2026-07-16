const DATA_PATHS={schoolsGeoJSON:'data/indicemantenimiento.json',schoolsCSV:'data/basededatosrm08cc.csv',alcaldias:'data/alcaldias.json',agebs:'data/ageb.json',subsidencias:'data/subsidencias.json',fracturamiento:'data/fracturamiento.json',mantenimiento:'data/mantenimiento.json',reforzamiento:'data/reforzamiento.json',famPotenciado:'data/fam_potenciado_2025.json'};
const FIELDS={alcaldia:'alcaldia',nivel:'principal',nombre:'inmueble',ccts:['cct1','cct2','cct3','cct4'],x:'coord_x',y:'coord_y',indice:'Indice_Man'};
const MAINTENANCE_FIELDS=['impermeabi','interior','exterior1','loseta','ventanas','ventanas1','ventanas2','puertas','escaleras','pluviales','techos','desazolve','deterioro','concreto','tinacos','cisterna','agua','agua1','hidrosanit','sanitarios','luminarias','electrica','transforma','lamina'];
const MAINTENANCE_LABELS={impermeabi:'Impermeabilización',interior:'Pintura interior',exterior1:'Pintura exterior',loseta:'Loseta',ventanas:'Vidrios / ventanas',ventanas1:'Cancelería de aluminio / ventanas',ventanas2:'Cancelería de herrería / ventanas',puertas:'Puertas',escaleras:'Barandales, pasillos o escaleras',pluviales:'Bajadas pluviales',techos:'Muros o techos',desazolve:'Desazolve',deterioro:'Deterioro de estructura o acabados',concreto:'Concreto',tinacos:'Tinacos',cisterna:'Cisterna',agua:'Agua potable',agua1:'Red o abastecimiento de agua',hidrosanit:'Instalación hidrosanitaria',sanitarios:'Sanitarios',luminarias:'Luminarias',electrica:'Instalación eléctrica',transforma:'Transformador',lamina:'Lámina'};
const SUPPORT_KEYWORDS={impermeabi:['impermeabil'],interior:['pintura en edificios','pintura de aulas','pintura interior','pintura en aulas'],exterior1:['pintura en fachada','pintura de fachada','pintura exterior','fachada'],loseta:['loseta','piso','pisos'],ventanas:['vidrio','vidrios','ventana','ventanas'],ventanas1:['canceleria de aluminio','aluminio'],ventanas2:['canceleria','herreria'],puertas:['puerta','puertas'],escaleras:['escalera','escaleras','barandal','barandales','pasillo','pasillos'],pluviales:['pluvial','pluviales','bajada de agua'],techos:['techo','techos','azotea','azoteas'],desazolve:['desazolve'],deterioro:['estructura','estructural','acabados','grieta','grietas'],concreto:['concreto'],tinacos:['tinaco','tinacos'],cisterna:['cisterna','cisternas'],agua:['agua potable'],agua1:['red de agua','abastecimiento de agua'],hidrosanit:['hidrosanitaria','hidrosanitarias'],sanitarios:['sanitario','sanitarios','nucleo sanitario','nucleos sanitarios'],luminarias:['luminaria','luminarias','alumbrado'],electrica:['electrica','electricas','electrico','electricos'],transforma:['transformador','transformadores'],lamina:['lamina','laminas','cubierta','cubiertas']};
const STRUCTURAL_RELATED_FIELDS=new Set(['deterioro','concreto','techos','escaleras']);
const COLORS={'Muy baja':'#2ca25f','Baja':'#a1d99b','Media':'#ffd166','Alta':'#f97316','Muy alta':'#dc2626'};
const OBS_COLORS={fractura:'#c2410c',subsidencia:'#ca8a04',combinada:'#b91c1c',reforzada:'#7c3aed',neutral:'#64748b'};
let allSchools=[],filteredSchools=[],alcaldiasGeoJSON=null,agebsGeoJSON=null,subsidenciasGeoJSON=null,fracturamientoGeoJSON=null,activeMode='mantenimiento',schoolsVisible=true,selectedFractureLayer=null;
let schoolLayer=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:28,spiderfyOnMaxZoom:true,disableClusteringAtZoom:13}),alcaldiaSummaryLayer=L.layerGroup(),agebSummaryLayer=L.layerGroup(),alcaldiaBoundaryLayer=null,agebBoundaryLayer=null,subsidenciaLayer=null,fracturamientoLayer=null;
const map=L.map('map',{zoomControl:true,preferCanvas:true}).setView([19.35,-99.13],10);
const baseLayers={'Mapa claro':L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:20,attribution:'© OpenStreetMap © CARTO'}),'OpenStreetMap':L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}),'Satélite':L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}),'Mapa oscuro':L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:20,attribution:'© OpenStreetMap © CARTO'})};
baseLayers['Mapa claro'].addTo(map);L.control.layers(baseLayers,{}, {collapsed:true,position:'bottomright'}).addTo(map);schoolLayer.addTo(map);
document.addEventListener('DOMContentLoaded',init);
async function init(){buildMaintenanceMenu();bindUI();const [schools,alcaldias,agebs,subs,fracs,mant,ref,famPot]=await Promise.all([loadSchools(),fetchJsonSafe(DATA_PATHS.alcaldias),fetchJsonSafe(DATA_PATHS.agebs),loadSubsidencias(),fetchJsonSafe(DATA_PATHS.fracturamiento),fetchJsonSafe(DATA_PATHS.mantenimiento),fetchJsonSafe(DATA_PATHS.reforzamiento),fetchJsonSafe(DATA_PATHS.famPotenciado)]);allSchools=schools;joinImprovements(allSchools,mant||[],ref||[],famPot||[]);filteredSchools=[...allSchools];alcaldiasGeoJSON=alcaldias;agebsGeoJSON=agebs;subsidenciasGeoJSON=subs;fracturamientoGeoJSON=fracs;drawBoundaries();drawExtraLayers();populateFilters();restoreState();updateMap();}
async function loadSchools(){const geo=await fetchJsonSafe(DATA_PATHS.schoolsGeoJSON);if(geo?.features?.length)return geo.features.map(normalizeFeature).filter(Boolean);return new Promise((resolve,reject)=>Papa.parse(DATA_PATHS.schoolsCSV,{download:true,header:true,dynamicTyping:true,skipEmptyLines:true,complete:r=>resolve(r.data.map(normalizeRow).filter(Boolean)),error:reject}));}

async function loadSubsidencias(){
  let geo=await fetchJsonSafe(DATA_PATHS.subsidencias);
  if(!geo){
    geo=await fetchJsonSafe('data/subsidencias(1).json');
  }
  if(!geo)return null;
  return normalizeSubsidenciasGeoJSON(geo);
}

function normalizeSubsidenciasGeoJSON(geo){
  if(!geo||!Array.isArray(geo.features))return geo;

  const sample=findFirstCoordinate(geo);
  const isProjected=sample&&Math.abs(sample[0])>180;

  if(!isProjected)return geo;

  const converted=JSON.parse(JSON.stringify(geo));
  converted.features.forEach(feature=>{
    if(feature.geometry&&feature.geometry.coordinates){
      feature.geometry.coordinates=convertCoordinateTree(feature.geometry.coordinates);
    }
  });

  if(converted.crs)delete converted.crs;
  return converted;
}

function findFirstCoordinate(geo){
  for(const feature of geo.features||[]){
    const found=findCoordinateInTree(feature.geometry?.coordinates);
    if(found)return found;
  }
  return null;
}

function findCoordinateInTree(value){
  if(!Array.isArray(value))return null;
  if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){
    return value;
  }
  for(const item of value){
    const found=findCoordinateInTree(item);
    if(found)return found;
  }
  return null;
}

function convertCoordinateTree(value){
  if(!Array.isArray(value))return value;
  if(value.length>=2&&typeof value[0]==='number'&&typeof value[1]==='number'){
    const converted=utm14NToLonLat(value[0],value[1]);
    return value.length>2?[converted[0],converted[1],...value.slice(2)]:converted;
  }
  return value.map(convertCoordinateTree);
}

function utm14NToLonLat(easting,northing){
  const a=6378137;
  const eccSquared=0.00669438;
  const k0=0.9996;
  const zoneNumber=14;

  const x=easting-500000;
  const y=northing;
  const longOrigin=(zoneNumber-1)*6-180+3;

  const eccPrimeSquared=eccSquared/(1-eccSquared);
  const M=y/k0;
  const mu=M/(a*(1-eccSquared/4-3*eccSquared*eccSquared/64-5*eccSquared*eccSquared*eccSquared/256));

  const e1=(1-Math.sqrt(1-eccSquared))/(1+Math.sqrt(1-eccSquared));

  const J1=3*e1/2-27*Math.pow(e1,3)/32;
  const J2=21*e1*e1/16-55*Math.pow(e1,4)/32;
  const J3=151*Math.pow(e1,3)/96;
  const J4=1097*Math.pow(e1,4)/512;

  const fp=mu+J1*Math.sin(2*mu)+J2*Math.sin(4*mu)+J3*Math.sin(6*mu)+J4*Math.sin(8*mu);

  const sinfp=Math.sin(fp);
  const cosfp=Math.cos(fp);
  const tanfp=Math.tan(fp);

  const C1=eccPrimeSquared*cosfp*cosfp;
  const T1=tanfp*tanfp;
  const N1=a/Math.sqrt(1-eccSquared*sinfp*sinfp);
  const R1=a*(1-eccSquared)/Math.pow(1-eccSquared*sinfp*sinfp,1.5);
  const D=x/(N1*k0);

  const lat=fp-(N1*tanfp/R1)*(
    D*D/2-
    (5+3*T1+10*C1-4*C1*C1-9*eccPrimeSquared)*Math.pow(D,4)/24+
    (61+90*T1+298*C1+45*T1*T1-252*eccPrimeSquared-3*C1*C1)*Math.pow(D,6)/720
  );

  const lon=(
    D-
    (1+2*T1+C1)*Math.pow(D,3)/6+
    (5-2*C1+28*T1-3*C1*C1+8*eccPrimeSquared+24*T1*T1)*Math.pow(D,5)/120
  )/cosfp;

  return [
    longOrigin+lon*180/Math.PI,
    lat*180/Math.PI
  ];
}

async function fetchJsonSafe(url){try{const r=await fetch(url,{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
function normalizeFeature(f,i){const p=f.properties||{},c=f.geometry?.coordinates||[];const lon=Number(c[0]??p[FIELDS.x]),lat=Number(c[1]??p[FIELDS.y]);return Number.isFinite(lat)&&Number.isFinite(lon)?normalizeCommon(p,lat,lon,i):null}
function normalizeRow(p,i){const lon=Number(p[FIELDS.x]),lat=Number(p[FIELDS.y]);return Number.isFinite(lat)&&Number.isFinite(lon)?normalizeCommon(p,lat,lon,i):null}
function normalizeCommon(p,lat,lon,i){const indice=Number.isFinite(Number(p[FIELDS.indice]))?Number(p[FIELDS.indice]):MAINTENANCE_FIELDS.reduce((a,f)=>a+toBinary(p[f]),0);return{id:cleanText(p.idinmueble)||`escuela-${i}`,lat,lon,props:p,nombre:cleanText(p[FIELDS.nombre])||'Escuela sin nombre',alcaldia:normalizeAlcaldia(p[FIELDS.alcaldia]),nivel:normalizeText(p[FIELDS.nivel]),ccts:FIELDS.ccts.map(f=>normalizeCCT(p[f])).filter(Boolean),indice,clasificacion:classifyIndex(indice),needs:MAINTENANCE_FIELDS.filter(f=>toBinary(p[f])===1),subsidenciaNivel:Number(p.subsidencia_nivel)||null,subsidenciaClase:cleanText(p.subsidencia_clase),distFractura:Number.isFinite(Number(p.dist_fractura_m))?Number(p.dist_fractura_m):null,mantenimiento:null,reforzamiento:null,famPotenciado:null,marker:null};}
function joinImprovements(schools,mant,ref,famPot){const mm=new Map(),rr=new Map(),ff=new Map();mant.forEach(x=>{const c=normalizeCCT(x.cct);if(c)mm.set(c,x)});ref.forEach(x=>{const c=normalizeCCT(x.cct);if(c)rr.set(c,x)});famPot.forEach(x=>{const c=normalizeCCT(x.cct);if(c)ff.set(c,x)});schools.forEach(s=>{s.mantenimiento=s.ccts.map(c=>mm.get(c)).find(Boolean)||null;s.reforzamiento=s.ccts.map(c=>rr.get(c)).find(Boolean)||null;s.famPotenciado=s.ccts.map(c=>ff.get(c)).find(Boolean)||null;});}
function buildMaintenanceMenu(){q('maintenanceFilters').innerHTML=MAINTENANCE_FIELDS.map(f=>`<label><input type="checkbox" value="${f}"><span>${MAINTENANCE_LABELS[f]}</span></label>`).join('')}
function bindUI(){q('btnAplicar').onclick=applyFilters;q('btnLimpiar').onclick=clearFilters;q('filtroAlcaldia').onchange=()=>{applyFilters();zoomToSelectedAlcaldia()};q('filtroNivel').onchange=applyFilters;const runSearch=(type,e)=>{if(e.key==='Enter'){e.preventDefault();applyFilters();zoomToMatchedSchool(type)}};q('buscarCCT').addEventListener('keydown',e=>runSearch('cct',e));q('buscarNombre').addEventListener('keydown',e=>runSearch('nombre',e));q('buscarCCT').onchange=()=>zoomToMatchedSchool('cct');q('buscarNombre').onchange=()=>zoomToMatchedSchool('nombre');q('maintenanceFilters').onchange=()=>{setMode('mantenimiento');applyFilters()};q('toggleSchools').onchange=e=>{schoolsVisible=e.target.checked;saveState();updateVisibilityByZoom()};q('modeMaintenance').onclick=()=>setMode('mantenimiento');document.querySelectorAll('input[name="themeMode"]').forEach(r=>r.onchange=e=>setMode(e.target.value));q('toggleMejoras').onclick=()=>toggleMenu('mejorasBody','mejorasArrow','toggleMejoras');q('toggleRiesgos').onclick=()=>toggleMenu('riesgosBody','riesgosArrow','toggleRiesgos');q('toggleDownloads').onclick=()=>toggleMenu('downloadsBody','downloadsArrow','toggleDownloads');const clearMejoras=q('clearMejoras');if(clearMejoras)clearMejoras.onclick=clearThemeSelection;const clearRiesgos=q('clearRiesgos');if(clearRiesgos)clearRiesgos.onclick=clearThemeSelection;q('toggleSubsidencias').onchange=e=>{toggleSubsidencias(e.target.checked);saveState()};q('toggleFracturamiento').onchange=e=>{toggleFracturamiento(e.target.checked);saveState()};q('closeDetail').onclick=()=>q('detailPanel').classList.remove('open');q('toggleLegend').onclick=()=>toggleBox('legendBody','toggleLegend');q('toggleSubLegend').onclick=()=>toggleBox('subLegendBody','toggleSubLegend');q('toggleSidebar').onclick=collapseSidebar;q('showSidebar').onclick=expandSidebar;q('statsLink').onclick=saveState;map.on('zoomend',updateVisibilityByZoom)}
function setMode(mode){activeMode=mode;q('modeMaintenance').classList.toggle('active',mode==='mantenimiento');document.querySelectorAll('input[name="themeMode"]').forEach(r=>r.checked=r.value===mode);applyFilters();renderLegend()}
function clearThemeSelection(){
  activeMode='mantenimiento';
  document.querySelectorAll('input[name="themeMode"]').forEach(r=>r.checked=false);
  q('modeMaintenance').classList.add('active');
  applyFilters();
  renderLegend();
}
function applyFilters(){const a=q('filtroAlcaldia').value,n=q('filtroNivel').value,c=q('buscarCCT').value.trim().toLowerCase(),name=q('buscarNombre').value.trim().toLowerCase(),needs=selectedNeeds();filteredSchools=allSchools.filter(s=>{if(a&&s.alcaldia!==a)return false;if(n&&s.nivel!==n)return false;if(c&&!s.ccts.some(v=>v.toLowerCase().includes(c)))return false;if(name&&!s.nombre.toLowerCase().includes(name))return false;if(needs.length&&!needs.every(f=>s.needs.includes(f)))return false;if(activeMode==='fam_regular'&&!(s.mantenimiento&&isILIFE(s.mantenimiento)))return false;if(activeMode==='programa_123'&&!(s.mantenimiento&&isDGCOP(s.mantenimiento)))return false;if(activeMode==='fam_potenciado'&&!s.famPotenciado)return false;if(activeMode==='fam_reforzamiento'&&!s.reforzamiento)return false;if(activeMode==='ambas'&&!(s.mantenimiento&&s.reforzamiento))return false;if(activeMode==='obs_fractura'&&!hasFractureObservation(s))return false;if(activeMode==='obs_subsidencia'&&!hasSubsidenceObservation(s))return false;if(activeMode==='obs_combinada'&&!(hasFractureObservation(s)&&hasSubsidenceObservation(s)))return false;return true});saveState();updateMap()}
function clearFilters(){
  q('filtroAlcaldia').value='';
  q('filtroNivel').value='';
  q('buscarCCT').value='';
  q('buscarNombre').value='';

  document.querySelectorAll('#maintenanceFilters input').forEach(i=>i.checked=false);
  document.querySelectorAll('input[name="themeMode"]').forEach(r=>r.checked=false);

  activeMode='mantenimiento';
  q('modeMaintenance').classList.add('active');

  schoolsVisible=true;
  q('toggleSchools').checked=true;

  q('toggleSubsidencias').checked=false;
  q('toggleFracturamiento').checked=false;
  toggleSubsidencias(false);
  toggleFracturamiento(false);

  q('detailPanel').classList.remove('open');

  filteredSchools=[...allSchools];

  localStorage.removeItem('rm08ViewerState');

  updateMap();
  renderLegend();

  if(filteredSchools.length){
    fitToSchools(filteredSchools,12);
  }
}
function selectedNeeds(){return[...document.querySelectorAll('#maintenanceFilters input:checked')].map(i=>i.value)}
function saveState(){const state={mode:activeMode,alcaldia:q('filtroAlcaldia')?.value||'',nivel:q('filtroNivel')?.value||'',cct:q('buscarCCT')?.value||'',nombre:q('buscarNombre')?.value||'',needs:selectedNeeds(),schoolsVisible,subsidencias:q('toggleSubsidencias')?.checked||false,fracturamiento:q('toggleFracturamiento')?.checked||false};localStorage.setItem('rm08ViewerState',JSON.stringify(state))}
function restoreState(){try{const st=JSON.parse(localStorage.getItem('rm08ViewerState')||'null');if(!st)return;q('filtroAlcaldia').value=st.alcaldia||'';q('filtroNivel').value=st.nivel||'';q('buscarCCT').value=st.cct||'';q('buscarNombre').value=st.nombre||'';document.querySelectorAll('#maintenanceFilters input').forEach(i=>i.checked=(st.needs||[]).includes(i.value));schoolsVisible=st.schoolsVisible!==false;q('toggleSchools').checked=schoolsVisible;q('toggleSubsidencias').checked=!!st.subsidencias;q('toggleFracturamiento').checked=!!st.fracturamiento;activeMode=st.mode||'mantenimiento';q('modeMaintenance').classList.toggle('active',activeMode==='mantenimiento');document.querySelectorAll('input[name="themeMode"]').forEach(r=>r.checked=r.value===activeMode);toggleSubsidencias(!!st.subsidencias);toggleFracturamiento(!!st.fracturamiento);applyFilters()}catch{}}
function pointInFeature(p,f){const g=f.geometry;if(!g)return false;if(g.type==='Polygon')return pointInPolygon(p,g.coordinates);if(g.type==='MultiPolygon')return g.coordinates.some(x=>pointInPolygon(p,x));return false}
function pointInPolygon(p,poly){if(!pointInRing(p,poly[0]))return false;for(let i=1;i<poly.length;i++)if(pointInRing(p,poly[i]))return false;return true}
function pointInRing([x,y],r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi))inside=!inside}return inside}
function getFeatureCenter(f){const c=[];collectCoords(f.geometry.coordinates,c);return[avg(c.map(x=>x[1])),avg(c.map(x=>x[0]))]}
function collectCoords(o,out){if(typeof o[0]==='number')out.push(o);else o.forEach(x=>collectCoords(x,out))}
function getAreaName(f,fb){const p=f.properties||{};for(const k of ['alcaldia','NOMGEO','NOM_ALC','NOMBRE','nombre','CVEGEO','CVE_AGEB'])if(cleanText(p[k]))return cleanText(p[k]);return fb}
function classifyIndex(v){return v<=6?'Muy baja':v<=10?'Baja':v<=14?'Media':v<=18?'Alta':'Muy alta'}
function classSlug(s){return cleanText(s).toLowerCase().replace(/\s+/g,'-')}
function toBinary(v){return Number(v)===1?1:0}

function normalizeAlcaldia(value){
  const original=cleanText(value);
  if(!original)return '';
  const key=original
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .toUpperCase();

  const names={
    'ALVARO OBREGON':'ÁLVARO OBREGÓN',
    'BENITO JUAREZ':'BENITO JUÁREZ',
    'COYOACAN':'COYOACÁN',
    'CUAUHTEMOC':'CUAUHTÉMOC'
  };

  return names[key]||key;
}

function normalizeCCT(v){return cleanText(v).replace(/\s+/g,'').toUpperCase()}
function cleanText(v){if(v===null||v===undefined)return'';const s=String(v).trim();return!s||s.toLowerCase()==='nan'?'':s}
function normalizeText(v){return cleanText(v).replace(/\s+/g,' ')}
function formatMultiline(v){const s=cleanText(v);return escapeHtml(s).replace(/\n/g,'<br>')}
function avg(a){return a.length?a.reduce((x,y)=>x+Number(y||0),0)/a.length:0}
function unique(a){return[...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y,'es'))}
function pct(a,b){return b?(a/b*100).toFixed(1):'0.0'}
function q(id){return document.getElementById(id)}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
