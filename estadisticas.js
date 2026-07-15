const DATA_PATHS={schoolsGeoJSON:'data/indicemantenimiento.json',schoolsCSV:'data/basededatosrm08cc.csv',mantenimiento:'data/mantenimiento.json',reforzamiento:'data/reforzamiento.json',famPotenciado:'data/fam_potenciado_2025.json'};
const FIELDS={alcaldia:'alcaldia',nivel:'principal',nombre:'inmueble',ccts:['cct1','cct2','cct3','cct4'],indice:'Indice_Man'};
const MAINTENANCE_FIELDS=['impermeabi','interior','exterior1','loseta','ventanas','ventanas1','ventanas2','puertas','escaleras','pluviales','techos','desazolve','deterioro','concreto','tinacos','cisterna','agua','agua1','hidrosanit','sanitarios','luminarias','electrica','transforma','lamina'];
const MAINTENANCE_LABELS={impermeabi:'Impermeabilización',interior:'Pintura interior',exterior1:'Pintura exterior',loseta:'Loseta',ventanas:'Vidrios / ventanas',ventanas1:'Cancelería de aluminio / ventanas',ventanas2:'Cancelería de herrería / ventanas',puertas:'Puertas',escaleras:'Barandales, pasillos o escaleras',pluviales:'Bajadas pluviales',techos:'Muros o techos',desazolve:'Desazolve',deterioro:'Deterioro de estructura o acabados',concreto:'Concreto',tinacos:'Tinacos',cisterna:'Cisterna',agua:'Agua potable',agua1:'Red o abastecimiento de agua',hidrosanit:'Instalación hidrosanitaria',sanitarios:'Sanitarios',luminarias:'Luminarias',electrica:'Instalación eléctrica',transforma:'Transformador',lamina:'Lámina'};
let allSchools=[];
document.addEventListener('DOMContentLoaded',initStats);
async function initStats(){const [schools,mant,ref,famPot]=await Promise.all([loadSchools(),fetchJsonSafe(DATA_PATHS.mantenimiento),fetchJsonSafe(DATA_PATHS.reforzamiento),fetchJsonSafe(DATA_PATHS.famPotenciado)]);allSchools=schools;joinImprovements(allSchools,mant||[],ref||[],famPot||[]);populateFilters();restoreViewerState();bindUI();applyStats()}
async function loadSchools(){const geo=await fetchJsonSafe(DATA_PATHS.schoolsGeoJSON);if(geo?.features?.length)return geo.features.map((f,i)=>normalizeCommon(f.properties||{},i)).filter(Boolean);return new Promise((resolve,reject)=>Papa.parse(DATA_PATHS.schoolsCSV,{download:true,header:true,dynamicTyping:true,skipEmptyLines:true,complete:r=>resolve(r.data.map(normalizeCommon).filter(Boolean)),error:reject}))}
async function fetchJsonSafe(url){try{const r=await fetch(url,{cache:'no-store'});return r.ok?await r.json():null}catch{return null}}
function normalizeCommon(p,i){const indice=Number.isFinite(Number(p[FIELDS.indice]))?Number(p[FIELDS.indice]):MAINTENANCE_FIELDS.reduce((sum,f)=>sum+toBinary(p[f]),0);return{id:cleanText(p.idinmueble)||`escuela-${i}`,nombre:cleanText(p[FIELDS.nombre])||'Escuela sin nombre',alcaldia:normalizeAlcaldia(p[FIELDS.alcaldia]),nivel:normalizeText(p[FIELDS.nivel]),ccts:FIELDS.ccts.map(f=>normalizeCCT(p[f])).filter(Boolean),indice,clasificacion:classifyIndex(indice),needs:MAINTENANCE_FIELDS.filter(f=>toBinary(p[f])===1),subsidenciaNivel:Number(p.subsidencia_nivel)||null,subsidenciaClase:cleanText(p.subsidencia_clase),distFractura:Number.isFinite(Number(p.dist_fractura_m))?Number(p.dist_fractura_m):null,mantenimiento:null,reforzamiento:null,famPotenciado:null}}
function joinImprovements(schools,mant,ref,famPot){const mm=new Map(),rr=new Map(),ff=new Map();mant.forEach(x=>{const c=normalizeCCT(x.cct);if(c)mm.set(c,x)});ref.forEach(x=>{const c=normalizeCCT(x.cct);if(c)rr.set(c,x)});famPot.forEach(x=>{const c=normalizeCCT(x.cct);if(c)ff.set(c,x)});schools.forEach(s=>{s.mantenimiento=s.ccts.map(c=>mm.get(c)).find(Boolean)||null;s.reforzamiento=s.ccts.map(c=>rr.get(c)).find(Boolean)||null;s.famPotenciado=s.ccts.map(c=>ff.get(c)).find(Boolean)||null})}
function populateFilters(){
  allSchools.forEach(s=>{
    s.alcaldia=normalizeAlcaldia(s.alcaldia);
  });
  fillSelect('stAlcaldia',unique(allSchools.map(s=>s.alcaldia).filter(Boolean)));
  fillSelect('stNivel',unique(allSchools.map(s=>s.nivel)));
  fillSelect('stNecesidad',MAINTENANCE_FIELDS.map(f=>f));
}
function fillSelect(id,vals){const el=q(id),first=el.querySelector('option').outerHTML;el.innerHTML=first+vals.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
function groupBy(arr,fn){return arr.reduce((acc,item)=>{const k=fn(item);(acc[k]??=[]).push(item);return acc},{})}
function classifyIndex(v){return v<=6?'Muy baja':v<=10?'Baja':v<=14?'Media':v<=18?'Alta':'Muy alta'}function toBinary(v){return Number(v)===1?1:0}
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

function normalizeCCT(v){return cleanText(v).replace(/\s+/g,'').toUpperCase()}function normalizeText(v){return cleanText(v).replace(/\s+/g,' ')}function cleanText(v){if(v===null||v===undefined)return'';const s=String(v).trim();return!s||s.toLowerCase()==='nan'?'':s}function unique(a){return[...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y,'es'))}function pct(a,b){return b?(a/b*100).toFixed(1):'0.0'}function q(id){return document.getElementById(id)}function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function isILIFE(data){return normalizeSearchText(data?.responsable).includes('ilife')}
function isDGCOP(data){return normalizeSearchText(data?.responsable).includes('dgcop')}
function normalizeSearchText(v){return cleanText(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
