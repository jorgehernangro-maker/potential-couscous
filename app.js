/* Mis Finanzas — Jorge Hernán-Gómez Rodríguez
   App local: los datos se guardan solo en este dispositivo (IndexedDB). */
'use strict';
(() => {

/* ════════════════════════════════════════════════════════════
   CONSTANTES
   ════════════════════════════════════════════════════════════ */
const BLOCKS = [
  { id: 1, name: 'Seguridad',   hex: '#5E7A2E', desc: 'Tu liquidez y el colchón para imprevistos' },
  { id: 2, name: 'Jubilación',  hex: '#C9A030', desc: 'Lo que apartas para cuando dejes de trabajar' },
  { id: 3, name: 'Crecimiento', hex: '#3F78B5', desc: 'Inversión para que tu dinero crezca con el tiempo' },
  { id: 4, name: 'Rentas',      hex: '#B5603A', desc: 'Lo que te genera ingresos sin trabajar ese mes' }
];
const GROUPS = [
  { id: 'fijos',     name: 'Gastos fijos' },
  { id: 'variables', name: 'Gastos variables' },
  { id: 'disfrutar', name: 'Disfrutar' }
];
// Bloque 1: cuentas, clasificadas por su uso
const CUENTA_USES = [
  { id: 'liquidez',  name: 'Liquidez general',      desc: 'El dinero del día a día: nómina, recibos y gastos' },
  { id: 'colchon',   name: 'Colchón de emergencia', desc: 'Para imprevistos. No se toca para nada más' },
  { id: 'objetivos', name: 'Cuenta de objetivos',   desc: 'Dinero apartado para algo concreto: un viaje, el coche, la entrada del piso' }
];
// Bloques 2, 3 y 4: inversiones
const INV_TYPES = {
  2: ['Plan de pensiones', 'Fondo indexado o ETF', 'Seguro de ahorro', 'Otra inversión'],
  3: ['Fondo indexado o ETF', 'Acciones', 'Materias primas', 'Otra inversión'],
  4: ['Depósito', 'Bonos o letras', 'Deuda privada', 'Otra renta fija']
};
const FREQS = [
  { every: 1, name: 'Cada mes' }, { every: 3, name: 'Cada trimestre' }, { every: 6, name: 'Cada semestre' },
  { every: 12, name: 'Cada año' }, { every: 0, name: 'Al vencimiento' }
];
const useOf = (a) => CUENTA_USES.find((u) => u.id === a.use) || CUENTA_USES[0];
const WORK_DAYS = 20;            // días laborables al mes (sueldo / 20, como en el Excel)
const LOCK_AFTER_MS = 60 * 1000; // con PIN: bloquear al volver tras 1 minuto fuera
const BACKUP_EVERY_DAYS = 30;
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

/* ════════════════════════════════════════════════════════════
   UTILIDADES
   ════════════════════════════════════════════════════════════ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function ymOf(date) { return date.slice(0, 7); }
function currentYM() { return ymOf(today()); }
function addMonths(ym, n) { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad(m)}`; }
function monthStart(ym) { return `${ym}-01`; }
function monthEnd(ym) { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(y, m, 0).getDate())}`; }
function dayBefore(date) { const [y, m, d] = date.split('-').map(Number); const x = new Date(y, m - 1, d - 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
function minDate(a, b) { return a < b ? a : b; }
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
function dateLabel(date) {
  if (date === today()) return 'Hoy';
  if (date === dayBefore(today())) return 'Ayer';
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long' });
  return cap(`${wd} ${d} de ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`);
}
function shortDate(date) { const [y, m, d] = date.split('-').map(Number); return `${d} ${MONTHS_SHORT[m - 1]} ${y}`; }
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

/** Formato español con separador de miles siempre: 1.234,56 € */
function money(n, opts = {}) {
  const { decimals = 2, sign = false } = opts;
  const v = Number(n) || 0;
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(decimals);
  let [int, dec] = fixed.split('.');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = dec ? `${int},${dec}` : int;
  const s = neg ? '−' : (sign && v > 0 ? '+' : '');
  return `${s}${body} €`;
}
const money0 = (n, o = {}) => money(n, { ...o, decimals: Math.abs(n) >= 1000 ? 0 : 2 });
function pct(n, decimals = 1) { if (!isFinite(n)) return '—'; return `${(n * 100).toFixed(decimals).replace('.', ',')} %`; }
function numInput(n) { return n ? String(round2(n)).replace('.', ',') : ''; }

/** Interpreta lo que escribe el usuario: "1.234,5", "12,50", "12.5", "1234" */
function parseAmount(raw) {
  if (raw == null) return NaN;
  let s = String(raw).replace(/[€\s]/g, '').replace(/−/g, '-');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s);
  return isFinite(v) ? round2(v) : NaN;
}

/* ════════════════════════════════════════════════════════════
   ALMACENAMIENTO (IndexedDB, con respaldo en localStorage)
   ════════════════════════════════════════════════════════════ */
const DB_NAME = 'mis-finanzas', STORE = 'kv', KEY = 'state';
let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('sin indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function loadState() {
  try {
    const db = await openDB();
    const data = await new Promise((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    if (data) return data;
  } catch (e) { /* sigue con localStorage */ }
  try { const raw = localStorage.getItem('mis-finanzas-state'); if (raw) return JSON.parse(raw); } catch (e) {}
  return null;
}
async function writeState(data) {
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch (e) {
    try { localStorage.setItem('mis-finanzas-state', JSON.stringify(data)); return true; } catch (e2) { return false; }
  }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const ok = await writeState(S);
    if (!ok) toast('No se ha podido guardar. Revisa el espacio libre del móvil.');
  }, 150);
}

/* ════════════════════════════════════════════════════════════
   ESTADO
   ════════════════════════════════════════════════════════════ */
function defaultCategories() {
  const g = (name, group) => ({ id: uid(), kind: 'gasto', name, group, budget: 0, freq: 'mes' });
  const i = (name, yieldy) => ({ id: uid(), kind: 'ingreso', name, yield: !!yieldy });
  return [
    g('Alquiler o hipoteca', 'fijos'), g('Comunidad', 'fijos'), g('Coche', 'fijos'), g('Suscripciones', 'fijos'),
    g('IBI', 'fijos'), g('Seguro de hogar', 'fijos'), g('Seguro del coche', 'fijos'), g('Gimnasio', 'fijos'),
    g('Comida', 'variables'), g('Gasolina', 'variables'), g('Luz', 'variables'), g('Gas', 'variables'),
    g('Agua', 'variables'), g('Salud', 'variables'), g('Otros gastos', 'variables'),
    g('Ocio', 'disfrutar'), g('Viajes', 'disfrutar'),
    i('Nómina'), i('Intereses', true), i('Saveback', true), i('Dividendos', true), i('Rentas', true), i('Otros ingresos')
  ];
}
function freshState() {
  return {
    v: 2,
    created: today(),
    onboarded: false,
    settings: { name: '', cushionMonths: 6, pinHash: null, lastBackup: null, backupSnooze: null, installHintHidden: false, lastAccount: {} },
    plan: { income: 0, contrib: { 1: 0, 2: 0, 3: 0, 4: 0 } },
    accounts: [],
    valuations: [],
    categories: defaultCategories(),
    txns: []
  };
}
function normalize(s) {
  const base = freshState();
  const out = { ...base, ...s };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  out.settings.lastAccount = out.settings.lastAccount || {};
  out.plan = { ...base.plan, ...(s.plan || {}) };
  out.plan.contrib = { ...base.plan.contrib, ...((s.plan || {}).contrib || {}) };
  for (const k of ['accounts', 'valuations', 'categories', 'txns']) if (!Array.isArray(out[k])) out[k] = base[k];
  if (!out.categories.length) out.categories = defaultCategories();
  // v1 → v2: el bloque 1 solo tiene cuentas (con su uso) y los bloques 2-4 solo inversiones
  for (const a of out.accounts) {
    if (a.kind === 'cuenta') { a.block = 1; if (!a.use) a.use = 'liquidez'; a.type = useOf(a).name; }
    else if (a.kind === 'inversion' && ![2, 3, 4].includes(a.block)) a.block = 3;
  }
  if (!out.categories.some((x) => x.kind === 'ingreso' && x.name === 'Rentas')) out.categories.splice(out.categories.findIndex((x) => x.kind === 'ingreso' && /^otros/i.test(x.name)) >>> 0, 0, { id: uid(), kind: 'ingreso', name: 'Rentas', yield: true });
  out.v = 2;
  return out;
}

let S = freshState();
const UI = {
  tab: 'inicio',
  month: currentYM(),
  earnPeriod: 'año',
  movFilter: 'todos',
  openGroups: {},
  locked: false,
  hiddenAt: 0,
  welcomeStep: 0,
  installPrompt: null,
  updateReady: null
};

/* ════════════════════════════════════════════════════════════
   CÁLCULOS
   ════════════════════════════════════════════════════════════ */
const acc = (id) => S.accounts.find((a) => a.id === id);
const cat = (id) => S.categories.find((c) => c.id === id);
const activeAccounts = () => S.accounts.filter((a) => !a.archived);
const isInv = (a) => a && a.kind === 'inversion';

/** Efecto de un movimiento sobre una cuenta */
function flowOf(t, accId) {
  if (t.type === 'gasto') return t.accountId === accId ? -t.amount : 0;
  if (t.type === 'ingreso') return t.accountId === accId ? t.amount : 0;
  if (t.type === 'traspaso') return (t.toAccountId === accId ? t.amount : 0) - (t.accountId === accId ? t.amount : 0);
  return 0;
}
/** Suma de movimientos de la cuenta entre dos fechas (incluidas), sin contar los anteriores a su inicio */
function flows(a, from, to) {
  const lo = from && from > a.start ? from : a.start;
  let sum = 0;
  for (const t of S.txns) {
    if (t.date < lo || t.date > to) continue;
    if (t.accountId === a.id || t.toAccountId === a.id) sum += flowOf(t, a.id);
  }
  return round2(sum);
}
/** Cuentas: saldo. Inversiones: capital aportado (lo que has metido). */
function book(a, d) { if (d < a.start) return null; return round2(a.initial + flows(a, a.start, d)); }
/** Valor de mercado de una inversión: última valoración + movimientos posteriores */
function marketValue(a, d) {
  if (d < a.start) return null;
  if (isRenta(a)) return a.rentas.every === 0 ? round2(book(a, d) + accrued(a, d)) : book(a, d);
  let last = null;
  for (const v of S.valuations) if (v.accountId === a.id && v.date <= d && v.date >= a.start && (!last || v.date > last.date || (v.date === last.date && v.at > last.at))) last = v;
  if (!last) return book(a, d);
  // la valoración ya incluye los movimientos de ese día: solo suman los posteriores
  let s = last.value;
  for (const t of S.txns) {
    if (t.date <= last.date || t.date > d || t.date < a.start) continue;
    if (t.accountId === a.id || t.toAccountId === a.id) s += flowOf(t, a.id);
  }
  return round2(s);
}
function value(a, d) { return isInv(a) ? marketValue(a, d) : book(a, d); }
/** Revalorización acumulada hasta la fecha (valor − aportado) */
function gainTo(a, d) { if (d < a.start) return 0; return round2(marketValue(a, d) - book(a, d)); }

/* Rentas (bloque 4): interés y plazo definidos */
const isRenta = (a) => a && a.kind === 'inversion' && a.block === 4 && a.rentas;
function addMonthsToDate(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Math.min(d, last))}`;
}
function payDates(a) {
  const r = a.rentas, out = [];
  if (!r || !r.every || !r.end) return out;
  for (let k = 1; k < 1200; k++) { const d = addMonthsToDate(a.start, k * r.every); if (d > r.end) break; out.push(d); }
  return out;
}
/** Intereses devengados (al vencimiento): capital × interés × días / 365 */
function accrued(a, d) {
  const r = a.rentas; if (!r) return 0;
  const x = d < r.end ? d : r.end;
  if (x <= a.start) return 0;
  return round2(a.initial * r.rate * daysBetween(a.start, x) / 365);
}
function suggestedPay(capital, rate, every) { return round2((Number(capital) || 0) * (Number(rate) || 0) * every / 12); }
function rentasInfo(a, d = today()) {
  const r = a.rentas;
  const matured = d >= r.end;
  if (r.every === 0) {
    const total = round2(a.initial * r.rate * daysBetween(a.start, r.end) / 365);
    return { total, generated: accrued(a, d), next: matured ? null : r.end, nextAmount: total, matured, perPay: null };
  }
  const dates = payDates(a);
  const total = round2(dates.length * r.payAmount);
  const generated = round2(S.txns.filter((t) => t.srcId === a.id && t.date <= d).reduce((s, t) => s + t.amount, 0));
  const next = dates.find((x) => x > d) || null;
  return { total, generated, next, nextAmount: r.payAmount, matured, perPay: r.payAmount };
}
/** Apunta solos los cobros de intereses que ya han llegado */
function syncRentas() {
  let n = 0;
  const now = today();
  let catR = S.categories.find((x) => x.kind === 'ingreso' && x.name === 'Rentas') || S.categories.find((x) => x.kind === 'ingreso' && x.yield);
  for (const a of S.accounts) {
    if (!isRenta(a) || !a.rentas.every || !acc(a.rentas.payAccountId)) continue;
    const from = a.rentas.paidUntil || a.start;
    for (const d of payDates(a)) {
      if (d <= from || d > now) continue;
      S.txns.push({ id: uid(), type: 'ingreso', amount: a.rentas.payAmount, date: d, accountId: a.rentas.payAccountId, toAccountId: null,
        categoryId: catR ? catR.id : null, note: `Intereses de ${a.name}`, at: Date.now() + n, auto: true, srcId: a.id });
      a.rentas.paidUntil = d; n++;
    }
  }
  if (n) save();
  return n;
}

function netWorth(d) { let s = 0; for (const a of S.accounts) { const v = value(a, d); if (v != null) s += v; } return round2(s); }
function blockTotals(d) {
  const t = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const a of S.accounts) { const v = value(a, d); if (v != null) t[a.block] = round2(t[a.block] + v); }
  return t;
}
function earliestDate() {
  let d = today();
  for (const a of S.accounts) if (a.start < d) d = a.start;
  for (const t of S.txns) if (t.date < d) d = t.date;
  return d;
}

const budgetMonthly = (c) => round2(c.freq === 'año' ? (c.budget || 0) / 12 : (c.budget || 0));
function txIn(ym) { const a = monthStart(ym), b = monthEnd(ym); return S.txns.filter((t) => t.date >= a && t.date <= b); }
function monthSummary(ym) {
  const list = txIn(ym);
  let income = 0, spend = 0;
  const byCat = {};
  for (const t of list) {
    if (t.type === 'ingreso') income += t.amount;
    if (t.type === 'gasto') { spend += t.amount; byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount; }
  }
  return { income: round2(income), spend: round2(spend), saved: round2(income - spend), byCat };
}
function groupBudget(groupId) { return round2(S.categories.filter((c) => c.kind === 'gasto' && c.group === groupId).reduce((s, c) => s + budgetMonthly(c), 0)); }
function planTotals() {
  const g = {}; let spend = 0;
  for (const gr of GROUPS) { g[gr.id] = groupBudget(gr.id); spend += g[gr.id]; }
  const contrib = round2([1, 2, 3, 4].reduce((s, b) => s + (Number(S.plan.contrib[b]) || 0), 0));
  const income = Number(S.plan.income) || 0;
  return { groups: g, spend: round2(spend), contrib, income, margin: round2(income - spend - contrib) };
}
/** Aportado este mes a cada bloque: traspasos que llegan a una cuenta del bloque */
function contributedIn(ym) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of txIn(ym)) {
    if (t.type !== 'traspaso') continue;
    const to = acc(t.toAccountId);
    if (to && t.accountId !== t.toAccountId) out[to.block] = round2(out[to.block] + t.amount);
  }
  return out;
}
/** ¿Cuánto he ganado? — intereses, saveback y dividendos + revalorización, todo junto */
function earned(period) {
  const to = today();
  let from;
  if (period === 'mes') from = monthStart(currentYM());
  else if (period === 'año') from = `${to.slice(0, 4)}-01-01`;
  else from = earliestDate();
  let yields = 0;
  for (const t of S.txns) {
    if (t.type !== 'ingreso' || t.date < from || t.date > to) continue;
    const c = cat(t.categoryId);
    if (c && c.yield) yields += t.amount;
  }
  let reval = 0;
  const before = dayBefore(from);
  for (const a of S.accounts) if (isInv(a)) reval += gainTo(a, to) - gainTo(a, before);
  yields = round2(yields); reval = round2(reval);
  return { from, yields, reval, total: round2(yields + reval) };
}
function needsBackup() {
  if (!S.accounts.length && !S.txns.length) return false;
  const now = today();
  if (S.settings.backupSnooze && S.settings.backupSnooze > now) return false;
  const ref = S.settings.lastBackup ? S.settings.lastBackup.slice(0, 10) : S.created;
  return daysBetween(ref, now) >= BACKUP_EVERY_DAYS;
}
function catUsed(id) { return S.txns.some((t) => t.categoryId === id); }
function accountUsed(id) { return S.txns.some((t) => t.accountId === id || t.toAccountId === id) || S.valuations.some((v) => v.accountId === id); }

/* ════════════════════════════════════════════════════════════
   ICONOS
   ════════════════════════════════════════════════════════════ */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6l9-3 1 3"/>',
  plan: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
  chart: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  bars: '<rect x="4" y="11" width="3.5" height="9" rx="1"/><rect x="10.25" y="7" width="3.5" height="13" rx="1"/><rect x="16.5" y="3" width="3.5" height="17" rx="1"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* ════════════════════════════════════════════════════════════
   GRÁFICOS (SVG propio, sin librerías → funciona sin internet)
   ════════════════════════════════════════════════════════════ */
function niceTicks(min, max, count = 4) {
  if (max === min) { max = min + 1; }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round2(v));
  return ticks;
}
function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',')} M€`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.', ',').replace(',0', '')} k€`;
  return `${Math.round(n)} €`;
}
let lineSeries = [];
function lineChart(points) {
  lineSeries = points;
  const W = 340, H = 180, L = 46, R = 14, T = 16, B = 26;
  const vals = points.map((p) => p.v);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const X = (i) => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1));
  const Y = (v) => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
  const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#E5E0D3" stroke-width="1"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="10" fill="#75766A" class="num">${compact(t)}</text>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const area = `${path}L${X(points.length - 1).toFixed(1)},${Y(Math.max(y0, 0))}L${X(0).toFixed(1)},${Y(Math.max(y0, 0))}Z`;
  const step = Math.ceil(points.length / 6);
  const xl = points.map((p, i) => (i % step === 0 || i === points.length - 1) && !(i !== points.length - 1 && points.length - 1 - i < step / 2 && i % step === 0 && i !== 0)
    ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#75766A">${p.label}</text>` : '').join('');
  const last = points[points.length - 1];
  return `<div class="chart" data-chart="line"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del patrimonio">
    ${grid}
    <path d="${area}" fill="#3D4A1F" opacity="0.10"/>
    <path d="${path}" fill="none" stroke="#3D4A1F" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(points.length - 1)}" cy="${Y(last.v)}" r="4" fill="#3D4A1F" stroke="#FFFFFD" stroke-width="2"/>
    ${xl}
    <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#4A4C3E" stroke-width="1" opacity="0"/>
    <circle class="cross-dot" r="4" fill="#3D4A1F" stroke="#FFFFFD" stroke-width="2" opacity="0"/>
  </svg><div class="tip" hidden></div></div>`;
}
function bindLineChart() {
  const el = $('.chart[data-chart="line"]'); if (!el) return;
  const svg = $('svg', el), tip = $('.tip', el), cross = $('.cross', el), dot = $('.cross-dot', el);
  const W = 340, H = 180, L = 46, R = 14, T = 16, B = 26;
  const vals = lineSeries.map((p) => p.v);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const n = lineSeries.length;
  const X = (i) => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
  const Y = (v) => T + (H - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const x = (clientX - r.left) * (W / r.width);
    let i = n === 1 ? 0 : Math.round((x - L) / ((W - L - R) / (n - 1)));
    i = Math.max(0, Math.min(n - 1, i));
    const p = lineSeries[i];
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', '0.35');
    dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(p.v)); dot.setAttribute('opacity', '1');
    tip.hidden = false;
    tip.innerHTML = `${money0(p.v)}<small>${esc(p.long)}</small>`;
    const px = X(i) * (r.width / W);
    tip.style.left = `${Math.max(56, Math.min(r.width - 56, px))}px`;
    tip.style.top = `-8px`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); };
  el.addEventListener('pointerdown', (e) => show(e.clientX));
  el.addEventListener('pointermove', (e) => show(e.clientX));
  el.addEventListener('pointerleave', hide);
  el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') setTimeout(hide, 1600); });
}
function blockBar(totals, light = false) {
  const pos = BLOCKS.map((b) => Math.max(0, totals[b.id]));
  const sum = pos.reduce((s, v) => s + v, 0);
  if (sum <= 0) return `<div class="blockbar${light ? ' on-light' : ''}"></div>`;
  return `<div class="blockbar${light ? ' on-light' : ''}" role="img" aria-label="Reparto por bloques">${BLOCKS.map((b, i) => pos[i] > 0 ? `<span style="width:${(pos[i] / sum * 100).toFixed(2)}%;background:${b.hex}"></span>` : '').join('')}</div>`;
}
function blockLegend(totals) {
  const pos = BLOCKS.map((b) => Math.max(0, totals[b.id]));
  const sum = pos.reduce((s, v) => s + v, 0);
  return `<div class="legend">${BLOCKS.map((b, i) => `<div class="legend-item"><i style="background:${b.hex}"></i><div>${b.name}<b class="num">${money0(totals[b.id])}</b><small>${sum > 0 ? pct(pos[i] / sum, 0) : '0 %'}</small></div></div>`).join('')}</div>`;
}
function meter(spent, budget, label, small = false) {
  const has = budget > 0;
  const ratio = has ? spent / budget : (spent > 0 ? 1 : 0);
  const cls = !has ? '' : ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : '';
  const foot = !has
    ? (spent > 0 ? '<div class="meter-foot">Sin presupuesto</div>' : '')
    : ratio > 1
      ? `<div class="meter-foot over">↑ Te pasas en ${money(spent - budget)}</div>`
      : `<div class="meter-foot">Quedan ${money(budget - spent)}</div>`;
  return `<div class="meter-top"><b>${esc(label)}</b><span class="vals num">${money(spent)}${has ? ` <span class="muted">de ${money0(budget)}</span>` : ''}</span></div>
    <div class="meter ${cls}" role="img" aria-label="${esc(label)}: ${money(spent)} gastado${has ? ` de ${money(budget)}` : ''}"><span style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></span></div>
    ${small && has && ratio <= 1 ? '' : foot}`;
}

/* ════════════════════════════════════════════════════════════
   PANTALLAS
   ════════════════════════════════════════════════════════════ */
const app = $('#app');

function render() {
  if (!S.onboarded) { app.innerHTML = viewWelcome(); bindWelcome(); return; }
  if (UI.locked) { app.innerHTML = viewLock(); bindLock(); return; }
  const views = { inicio: viewHome, movs: viewMovs, cuentas: viewAccounts, plan: viewPlan, ajustes: viewSettings };
  const showFab = ['inicio', 'movs', 'cuentas'].includes(UI.tab);
  app.innerHTML = `<div class="app-shell">${views[UI.tab]()}</div>
    ${showFab ? `<button class="fab" data-act="new-tx" aria-label="Apuntar movimiento">${icon('plus')}</button>` : ''}
    <nav class="tabbar" aria-label="Secciones"><div class="tabbar-inner">
      ${[['inicio', 'Inicio', 'home'], ['movs', 'Movimientos', 'list'], ['cuentas', 'Cuentas', 'wallet'], ['plan', 'Plan', 'plan'], ['ajustes', 'Ajustes', 'gear']]
        .map(([id, label, ic]) => `<button class="tab" data-act="tab" data-tab="${id}" ${UI.tab === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`).join('')}
    </div></nav>`;
  if (UI.tab === 'inicio') bindLineChart();
  if (UI.tab === 'plan') bindPlan();
  if (UI.tab === 'ajustes') bindSettings();
}

function topbar(title, sub = '', right = '') {
  return `<header class="topbar"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right}</header>`;
}
function monthNav() {
  const cur = currentYM();
  return `<div class="month-nav"><button data-act="month" data-dir="-1" aria-label="Mes anterior">‹</button><span>${cap(monthLabel(UI.month))}</span><button data-act="month" data-dir="1" aria-label="Mes siguiente" ${UI.month >= cur ? 'disabled' : ''}>›</button></div>`;
}

/* ── Inicio ─────────────────────────────────────────────── */
function viewHome() {
  const name = S.settings.name ? `Hola, ${esc(S.settings.name)}` : 'Hola';
  if (!S.accounts.length) {
    return `${topbar(name, 'Tu dinero, ordenado')}<div class="content">
      ${installBanner()}
      <div class="card empty"><h3>Empieza por tus cuentas</h3>
      <p>Añade tus cuentas e inversiones, cada una en su bloque. Con eso ya ves tu patrimonio y puedes empezar a apuntar movimientos.</p>
      <button class="btn" data-act="new-account">Añadir mi primera cuenta</button></div></div>`;
  }
  const now = today();
  const nw = netWorth(now);
  const prevEnd = monthEnd(addMonths(currentYM(), -1));
  const nwPrev = netWorth(prevEnd);
  const delta = round2(nw - nwPrev);
  const totals = blockTotals(now);
  const ms = monthSummary(UI.month);
  const pt = planTotals();
  const e = earned(UI.earnPeriod);

  // gráfico patrimonio: hasta 12 cierres de mes
  const startYM = ymOf(earliestDate());
  const pts = [];
  for (let i = 11; i >= 0; i--) {
    const ym = addMonths(currentYM(), -i);
    if (ym < startYM) continue;
    const d = ym === currentYM() ? now : monthEnd(ym);
    const [y, m] = ym.split('-').map(Number);
    pts.push({ v: netWorth(d), label: MONTHS_SHORT[m - 1], long: ym === currentYM() ? 'Hoy' : `Fin de ${MONTHS[m - 1]} ${y}` });
  }

  // gasto por categoría
  const catRows = Object.entries(ms.byCat).map(([id, v]) => ({ c: cat(id), v })).filter((r) => r.c).sort((a, b) => b.v - a.v);
  const maxCat = catRows.length ? catRows[0].v : 0;

  // presupuesto por grupo
  const groupRows = GROUPS.map((g) => {
    const cats = S.categories.filter((c) => c.kind === 'gasto' && c.group === g.id);
    const spent = round2(cats.reduce((s, c) => s + (ms.byCat[c.id] || 0), 0));
    return { g, cats, spent, budget: pt.groups[g.id] };
  });
  const anyBudget = pt.spend > 0;

  const income = Number(S.plan.income) || 0;
  return `${topbar(name, 'Tu dinero, ordenado')}
  <div class="content">
    ${UI.updateReady ? `<div class="banner"><p><b>Hay una versión nueva</b>Actualiza para tener las últimas mejoras. Tus datos no se tocan.</p><button class="btn small" data-act="apply-update">Actualizar</button></div>` : ''}
    ${needsBackup() ? `<div class="banner"><p><b>Haz tu copia de seguridad del mes</b>Tus datos solo están en este móvil. Si lo pierdes sin copia, se pierden.</p><div style="display:flex;flex-direction:column;gap:6px"><button class="btn small" data-act="export">Hacer copia</button><button class="link-btn" data-act="snooze-backup">Más tarde</button></div></div>` : ''}
    ${installBanner()}

    <section class="hero" aria-label="Patrimonio">
      <div class="hero-label">Tu patrimonio hoy</div>
      <div class="hero-value">${money0(nw)}</div>
      <div class="hero-delta ${delta < 0 ? 'neg' : ''}">${delta === 0 ? 'Igual que a final del mes pasado' : `${money0(delta, { sign: true })} este mes`}</div>
      ${blockBar(totals)}
      ${blockLegend(totals)}
    </section>

    ${monthNav()}

    <section class="card" aria-label="Resumen del mes">
      <div class="tiles">
        <div class="tile"><div class="tile-label">Ingresos</div><div class="tile-value num">${money0(ms.income)}</div></div>
        <div class="tile"><div class="tile-label">Gastos</div><div class="tile-value num">${money0(ms.spend)}</div></div>
        <div class="tile"><div class="tile-label">Ahorro</div><div class="tile-value num ${ms.saved < 0 ? 'neg' : ''}">${money0(ms.saved)}</div></div>
      </div>
    </section>

    <section class="card" aria-label="Presupuesto frente a gastado">
      <div class="card-head"><h2 class="card-title">Presupuesto vs. gastado</h2><span class="card-note">${monthLabel(UI.month)}</span></div>
      ${!anyBudget ? `<p class="card-note" style="margin:-4px 0 12px">Aún no tienes presupuesto. Ponlo en <button class="link-btn" data-act="tab" data-tab="plan">Plan</button> para ver cuánto te queda.</p>` : ''}
      ${groupRows.map((r) => `<div class="meter-row">${meter(r.spent, r.budget, r.g.name)}
        ${r.cats.some((c) => ms.byCat[c.id] || c.budget) ? `<button class="link-btn" data-act="toggle-group" data-group="${r.g.id}" style="margin-top:6px">${UI.openGroups[r.g.id] ? 'Ocultar categorías' : 'Ver categorías'}</button>` : ''}
        ${UI.openGroups[r.g.id] ? `<div class="sub-meters">${r.cats.filter((c) => ms.byCat[c.id] || c.budget).map((c) => `<div class="meter-row">${meter(round2(ms.byCat[c.id] || 0), budgetMonthly(c), c.name, true)}</div>`).join('')}</div>` : ''}
      </div>`).join('')}
    </section>

    <section class="card" aria-label="Cuánto he ganado">
      <div class="card-head"><h2 class="card-title">¿Cuánto he ganado?</h2></div>
      <div class="seg" role="group" aria-label="Periodo">
        ${[['mes', 'Este mes'], ['año', 'Este año'], ['todo', 'Desde el inicio']].map(([k, l]) => `<button data-act="earn" data-p="${k}" aria-pressed="${UI.earnPeriod === k}">${l}</button>`).join('')}
      </div>
      <div class="earn-value num ${e.total < 0 ? 'neg' : ''}">${money(e.total, { sign: true })}</div>
      <div class="card-note">Intereses, saveback y dividendos, más lo que se han revalorizado tus inversiones</div>
      ${income > 0 ? `<div class="earn-facts">
        <div class="earn-fact"><b class="num">${pct(e.total / income)}</b><span>de tu sueldo de un mes</span></div>
        <div class="earn-fact"><b class="num">${(e.total / (income / WORK_DAYS)).toFixed(1).replace('.', ',')}</b><span>días de trabajo</span></div>
      </div>` : `<p class="card-note" style="margin-top:10px">Pon tus ingresos en <button class="link-btn" data-act="tab" data-tab="plan">Plan</button> para verlo en días de trabajo.</p>`}
      <div class="earn-break"><div><span>Intereses, saveback y dividendos</span><b class="num">${money(e.yields)}</b></div><div><span>Revalorización de inversiones</span><b class="num">${money(e.reval, { sign: true })}</b></div></div>
    </section>

    <section class="card" aria-label="Gasto por categoría">
      <div class="card-head"><h2 class="card-title">Gasto por categoría</h2><span class="card-note">${monthLabel(UI.month)}</span></div>
      ${catRows.length ? `<div class="hbars">${catRows.map((r) => `<div class="hbar"><span class="hbar-name">${esc(r.c.name)}</span><span class="hbar-val num">${money(r.v)} <small>${pct(r.v / ms.spend, 0)}</small></span><div class="hbar-track"><span style="width:${(r.v / maxCat * 100).toFixed(1)}%"></span></div></div>`).join('')}</div>`
        : `<p class="card-note">No hay gastos apuntados en ${monthLabel(UI.month)}.</p>`}
    </section>

    <section class="card" aria-label="Evolución del patrimonio">
      <div class="card-head"><h2 class="card-title">Evolución del patrimonio</h2><span class="card-note">${pts.length > 1 ? `Últimos ${pts.length} meses` : 'Este mes'}</span></div>
      ${pts.length > 1 ? lineChart(pts) : `<p class="card-note">Cuando lleves más de un mes, aquí verás cómo crece. Si quieres verlo ya, añade el saldo que tenías en meses anteriores al crear la cuenta.</p>`}
    </section>
  </div>`;
}

function installBanner() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || S.settings.installHintHidden) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (UI.installPrompt) return `<div class="banner"><p><b>Instala la app</b>Así la abres desde la pantalla de inicio y tus datos quedan mejor protegidos.</p><div style="display:flex;flex-direction:column;gap:6px"><button class="btn small" data-act="install">Instalar</button><button class="link-btn" data-act="hide-install">Ahora no</button></div></div>`;
  if (ios) return `<div class="banner"><p><b>Añádela a tu pantalla de inicio</b>Toca Compartir y luego «Añadir a pantalla de inicio». En iPhone, si solo la usas desde Safari, el sistema puede borrar los datos tras unos días sin abrirla.</p><button class="link-btn" data-act="hide-install">Entendido</button></div>`;
  return '';
}

/* ── Movimientos ────────────────────────────────────────── */
function viewMovs() {
  const list = txIn(UI.month)
    .filter((t) => UI.movFilter === 'todos' || t.type === UI.movFilter)
    .sort((a, b) => (b.date.localeCompare(a.date)) || ((b.at || 0) - (a.at || 0)));
  const byDay = {};
  for (const t of list) (byDay[t.date] = byDay[t.date] || []).push(t);
  const ms = monthSummary(UI.month);
  return `${topbar('Movimientos', `${money0(ms.income)} de ingresos · ${money0(ms.spend)} de gastos`)}
  <div class="content">
    ${monthNav()}
    <div class="chips" role="group" aria-label="Filtrar">
      ${[['todos', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['traspaso', 'Traspasos']].map(([k, l]) => `<button class="chip" data-act="mov-filter" data-f="${k}" aria-pressed="${UI.movFilter === k}">${l}</button>`).join('')}
    </div>
    ${!S.accounts.length ? `<div class="card empty"><h3>Primero, una cuenta</h3><p>Para apuntar movimientos necesitas al menos una cuenta.</p><button class="btn" data-act="new-account">Añadir cuenta</button></div>`
      : !list.length ? `<div class="card empty"><h3>Nada en ${monthLabel(UI.month)}</h3><p>Toca el botón + para apuntar un gasto, un ingreso o un traspaso.</p></div>`
      : Object.keys(byDay).map((d) => {
        const dayNet = round2(byDay[d].reduce((s, t) => s + (t.type === 'gasto' ? -t.amount : t.type === 'ingreso' ? t.amount : 0), 0));
        return `<div class="day-head"><span>${dateLabel(d)}</span><span class="num">${dayNet ? money(dayNet, { sign: true }) : ''}</span></div>
          <div class="list">${byDay[d].map(txRow).join('')}</div>`;
      }).join('')}
  </div>`;
}
function txRow(t) {
  const a = acc(t.accountId), to = acc(t.toAccountId), c = cat(t.categoryId);
  let ico, title, sub, amt;
  if (t.type === 'gasto') { ico = `<span class="ico out">${icon('down')}</span>`; title = c ? c.name : 'Gasto'; amt = `<span class="row-amount num neg">${money(-t.amount)}</span>`; sub = a ? a.name : ''; }
  else if (t.type === 'ingreso') { ico = `<span class="ico in">${icon('up')}</span>`; title = c ? c.name : 'Ingreso'; amt = `<span class="row-amount num pos">${money(t.amount, { sign: true })}</span>`; sub = a ? a.name : ''; }
  else { ico = `<span class="ico tr">${icon('swap')}</span>`; title = 'Traspaso'; amt = `<span class="row-amount num">${money(t.amount)}</span>`; sub = `${a ? a.name : '?'} → ${to ? to.name : '?'}`; }
  if (t.note) sub += ` · ${t.note}`;
  if (t.auto) sub += ' · automático';
  return `<button class="list-row" data-act="edit-tx" data-id="${t.id}">${ico}<span class="row-main"><span class="row-title" style="display:block">${esc(title)}</span><span class="row-sub" style="display:block">${esc(sub)}</span></span>${amt}</button>`;
}

/* ── Cuentas ────────────────────────────────────────────── */
function viewAccounts() {
  const now = today();
  const totals = blockTotals(now);
  const active = activeAccounts(), archived = S.accounts.filter((a) => a.archived);
  const head = (b) => `<div class="block-head"><span class="bh-name"><span class="dot" style="background:${b.hex}"></span>${b.id} · ${b.name}</span><span class="bh-total num">${money0(totals[b.id])}</span></div><p class="block-desc">${b.desc}</p>`;
  const addRow = (label, attrs) => `<div class="list"><button class="list-row" data-act="new-account" ${attrs}><span class="row-main"><span class="row-sub" style="display:block">${label} · <b style="color:var(--olive-2)">Añadir</b></span></span></button></div>`;
  let blocksHTML = '';
  if (S.accounts.length) {
    const b1 = BLOCKS[0];
    const cuentas = active.filter((a) => a.kind === 'cuenta');
    blocksHTML += head(b1);
    if (!cuentas.length) blocksHTML += addRow('Aún no tienes cuentas', 'data-kind="cuenta"');
    for (const u of CUENTA_USES) {
      const list = cuentas.filter((a) => (a.use || 'liquidez') === u.id);
      if (!list.length) continue;
      const sub = round2(list.reduce((s, a) => s + (value(a, now) ?? 0), 0));
      blocksHTML += `<div class="sub-head"><span>${u.name}</span><span class="num">${money0(sub)}</span></div><div class="list">${list.map(accountRow).join('')}</div>`;
    }
    for (const b of BLOCKS.slice(1)) {
      const list = active.filter((a) => a.kind === 'inversion' && a.block === b.id);
      blocksHTML += head(b) + (list.length ? `<div class="list">${list.map(accountRow).join('')}</div>` : addRow('Nada en este bloque todavía', `data-kind="inversion" data-block="${b.id}"`));
    }
  }
  return `${topbar('Cuentas', `${money0(netWorth(now))} en total`, `<button class="btn small" data-act="new-account">Añadir</button>`)}
  <div class="content">
    ${!S.accounts.length ? `<div class="card empty"><h3>Tus cuentas, por bloques</h3><p>En el bloque 1 van tus cuentas: la del día a día, tu colchón y las de objetivos. En los bloques 2, 3 y 4, tus inversiones.</p><button class="btn" data-act="new-account">Añadir cuenta o inversión</button></div>` : ''}
    ${S.accounts.length ? `<section class="card">${blockBar(totals, true)}${blockLegend(totals)}</section>` : ''}
    ${blocksHTML}
    ${archived.length ? `<div class="block-head"><span class="bh-name muted">Cerradas</span></div><div class="list">${archived.map(accountRow).join('')}</div>` : ''}
  </div>`;
}
function accountRow(a) {
  const now = today();
  const v = value(a, now) ?? a.initial;
  let right = `<span class="row-amount num">${money(v)}</span>`;
  let sub = a.kind === 'cuenta' ? useOf(a).name : a.type;
  if (isRenta(a)) {
    const info = rentasInfo(a, now);
    sub = `${a.type} · ${pct(a.rentas.rate, 2)} · ${info.matured ? 'vencida' : `vence ${shortDate(a.rentas.end)}`}`;
    right = `<span class="row-amount num">${money0(v)}<small class="pos">${money0(info.generated, { sign: true })} generado</small></span>`;
  } else if (isInv(a)) {
    const g = gainTo(a, now), inv = book(a, now) ?? a.initial;
    const valued = S.valuations.some((x) => x.accountId === a.id);
    right = `<span class="row-amount num">${money0(v)}<small class="${!valued ? 'muted' : g < 0 ? 'neg' : g > 0 ? 'pos' : 'muted'}">${valued ? `${money0(g, { sign: true })}${inv > 0 ? ` · ${pct(g / inv)}` : ''}` : 'Valor sin actualizar'}</small></span>`;
  }
  return `<button class="list-row" data-act="account" data-id="${a.id}"><span class="ico">${icon(isInv(a) ? 'chart' : 'wallet')}</span><span class="row-main"><span class="row-title" style="display:block">${esc(a.name)}</span><span class="row-sub" style="display:block">${esc(sub)}${a.archived ? ' · cerrada' : ''}</span></span>${right}</button>`;
}

/* ── Plan ───────────────────────────────────────────────── */
function viewPlan() {
  const cm = contributedIn(currentYM());
  return `${topbar('Plan', 'Tu presupuesto de cada mes')}
  <div class="content">
    <section class="card">
      <div class="field"><label for="plan-income">Ingresos netos al mes</label>
        <div class="plan-input"><input id="plan-income" class="input num" inputmode="decimal" data-plan="income" value="${numInput(S.plan.income)}" placeholder="0,00" style="text-align:left;font-size:18px;font-weight:700"></div>
        <p class="hint">Lo que te entra limpio en la cuenta. Si cobras pagas extra, suma todo el año y divídelo entre 12.</p></div>
    </section>

    ${GROUPS.map((g) => `<section class="card">
      <div class="card-head"><h2 class="card-title">${g.name}</h2><span class="card-note num" data-bind="group-${g.id}">${money(groupBudget(g.id))} al mes</span></div>
      ${S.categories.filter((c) => c.kind === 'gasto' && c.group === g.id).map((c) => `<div class="plan-row">
        <div class="name">${esc(c.name)}<button class="freq" data-act="freq" data-id="${c.id}" aria-label="Cambiar a ${c.freq === 'año' ? 'mensual' : 'anual'}">${c.freq === 'año' ? 'al año' : 'al mes'}</button>
          ${c.freq === 'año' ? `<small class="num" data-bind="mon-${c.id}">${money(budgetMonthly(c))} al mes</small>` : ''}</div>
        <div class="plan-input"><input class="num" inputmode="decimal" data-cat="${c.id}" value="${numInput(c.budget)}" placeholder="0" aria-label="Presupuesto de ${esc(c.name)}"></div>
      </div>`).join('')}
      <button class="link-btn" data-act="new-cat" data-group="${g.id}" style="margin-top:10px">+ Añadir categoría</button>
    </section>`).join('')}

    <section class="card">
      <div class="card-head"><h2 class="card-title">Aportaciones al mes</h2><span class="card-note">Lo que quieres apartar en cada bloque</span></div>
      ${BLOCKS.map((b) => `<div class="plan-row">
        <div class="name"><span class="dot" style="background:${b.hex};display:inline-block;margin-right:6px"></span>${b.name}<small class="num">Este mes llevas ${money(cm[b.id])}</small></div>
        <div class="plan-input"><input class="num" inputmode="decimal" data-contrib="${b.id}" value="${numInput(S.plan.contrib[b.id])}" placeholder="0" aria-label="Aportación a ${b.name}"></div>
      </div>`).join('')}
      <p class="card-note" style="margin:8px 0 0">Las aportaciones se apuntan como traspasos: de tu cuenta a la cuenta o inversión de cada bloque.</p>
    </section>

    <section class="card" id="plan-summary">${planSummaryHTML()}</section>
    <section class="card" id="cushion">${cushionHTML()}</section>
  </div>`;
}
function planSummaryHTML() {
  const pt = planTotals();
  return `<div class="card-head"><h2 class="card-title">Resumen del mes</h2></div>
    <div class="summary-rows num">
      <div><span>Ingresos</span><b>${money(pt.income)}</b></div>
      ${GROUPS.map((g) => `<div><span class="muted">${g.name}</span><span>−${money(pt.groups[g.id]).replace('−', '')}</span></div>`).join('')}
      <div><span class="muted">Aportaciones</span><span>−${money(pt.contrib).replace('−', '')}</span></div>
      <div class="total"><span>Margen sin asignar</span><b class="${pt.margin < 0 ? 'neg' : ''}">${money(pt.margin)}</b></div>
    </div>
    ${pt.income > 0 && pt.margin < 0 ? `<p class="form-error" style="margin-top:10px">Tu plan gasta y aporta más de lo que ingresas. Ajusta alguna partida.</p>` : ''}
    ${pt.income > 0 && pt.margin > 0 ? `<p class="card-note" style="margin-top:10px">Tienes ${money(pt.margin)} sin destino. Asígnalos a un bloque para que no se queden sin función.</p>` : ''}`;
}
function cushionHTML() {
  const pt = planTotals();
  const months = S.settings.cushionMonths || 6;
  const target = round2(pt.spend * months);
  const have = round2(S.accounts.filter((a) => a.kind === 'cuenta' && a.use === 'colchon').reduce((s, a) => s + (value(a, today()) || 0), 0));
  const covered = pt.spend > 0 ? have / pt.spend : 0;
  const ratio = target > 0 ? have / target : 0;
  return `<div class="card-head"><h2 class="card-title">Colchón de seguridad</h2>
      <select class="input" data-cushion style="width:auto;padding:6px 30px 6px 10px;font-size:13px;font-weight:700" aria-label="Meses de colchón">
        ${[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => `<option value="${m}" ${m === months ? 'selected' : ''}>${m} meses</option>`).join('')}
      </select></div>
    ${pt.spend > 0 && !S.accounts.some((a) => a.kind === 'cuenta' && a.use === 'colchon') ? `<p class="card-note">Necesitas ${money0(target)}. Marca como «Colchón de emergencia» la cuenta que uses para imprevistos y aquí verás cuánto llevas.</p>` : pt.spend > 0 ? `<div class="meter-top"><b>Tienes en tu colchón</b><span class="vals num">${money0(have)} <span class="muted">de ${money0(target)}</span></span></div>
      <div class="meter ${ratio >= 1 ? '' : ratio >= 0.5 ? 'warn' : 'over'}"><span style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></span></div>
      <p class="meter-foot ${ratio < 1 ? '' : ''}">${ratio >= 1 ? `Completo. Te cubre ${covered.toFixed(1).replace('.', ',')} meses de gastos.` : `Te cubre ${covered.toFixed(1).replace('.', ',')} meses de gastos. Te faltan ${money0(target - have)}.`}</p>`
      : `<p class="card-note">Pon tu presupuesto de gastos y aquí verás cuánto necesitas para estar tranquilo: tus gastos de un mes por ${months}.</p>`}`;
}

/* ── Ajustes ────────────────────────────────────────────── */
function viewSettings() {
  const last = S.settings.lastBackup;
  return `${topbar('Ajustes')}
  <div class="content">
    <section class="card form">
      <div class="field"><label for="set-name">Tu nombre</label><input id="set-name" class="input" data-setting="name" value="${esc(S.settings.name)}" placeholder="Cómo quieres que te salude" autocomplete="given-name"></div>
    </section>

    <div class="eyebrow">Categorías</div>
    ${GROUPS.map((g) => `<div class="list">${S.categories.filter((c) => c.kind === 'gasto' && c.group === g.id).map((c) => catRow(c, g.name)).join('')}</div>`).join('')}
    <div class="list">${S.categories.filter((c) => c.kind === 'ingreso').map((c) => catRow(c, c.yield ? 'Ingreso · cuenta como ganancia' : 'Ingreso')).join('')}</div>
    <div class="btn-row"><button class="btn ghost small" data-act="new-cat" data-group="variables">+ Categoría de gasto</button><button class="btn ghost small" data-act="new-cat" data-kind="ingreso">+ Categoría de ingreso</button></div>

    <div class="eyebrow">Seguridad</div>
    <section class="card">
      <div class="switch-row"><div><b style="font-size:14px">Bloquear con PIN</b><div class="card-note">Pide un PIN de 4 cifras al abrir la app</div></div>
        <label class="switch"><input type="checkbox" data-act="pin-toggle" ${S.settings.pinHash ? 'checked' : ''} aria-label="Bloquear con PIN"><span></span></label></div>
      ${S.settings.pinHash ? `<button class="link-btn" data-act="pin-change" style="margin-top:12px">Cambiar PIN</button>` : ''}
    </section>

    <div class="eyebrow">Copia de seguridad</div>
    <section class="card form">
      <p class="card-note" style="margin:0">Tus datos solo están en este dispositivo. Guarda una copia cada mes (en tus archivos, tu correo o la nube) y úsala para pasarlos a otro móvil u ordenador.</p>
      <p style="margin:0;font-size:13px;font-weight:600">${last ? `Última copia: ${shortDate(last.slice(0, 10))}` : 'Todavía no has hecho ninguna copia'}</p>
      <div class="btn-row"><button class="btn" data-act="export">Hacer copia</button><button class="btn ghost" data-act="import">Recuperar copia</button></div>
    </section>

    <div class="eyebrow">Datos</div>
    <section class="card form">
      <p class="card-note" style="margin:0">Borra todas tus cuentas, movimientos y ajustes de este dispositivo. No se puede deshacer.</p>
      <button class="btn danger" data-act="wipe">Borrar todos los datos</button>
    </section>

    <div class="about"><b>Mis Finanzas</b>Jorge Hernán-Gómez Rodríguez · Consultor Financiero Independiente<br>Versión 1.1</div>
  </div>
  <input type="file" id="import-file" accept=".json,application/json" hidden>`;
}
function catRow(c, sub) {
  return `<button class="list-row" data-act="edit-cat" data-id="${c.id}"><span class="row-main"><span class="row-title" style="display:block">${esc(c.name)}</span><span class="row-sub" style="display:block">${esc(sub)}</span></span><span class="muted" aria-hidden="true">›</span></button>`;
}

/* ── Bienvenida ─────────────────────────────────────────── */
function viewWelcome() {
  const mark = `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="15" width="4" height="7" rx="1.2" fill="#F5F3EE"/><rect x="7.3" y="11" width="4" height="11" rx="1.2" fill="#F5F3EE"/><rect x="12.6" y="7" width="4" height="15" rx="1.2" fill="#F5F3EE"/><rect x="18" y="2" width="4" height="20" rx="1.2" fill="#C9A84C"/></svg>`;
  const sig = `<div class="signature"><b>Jorge Hernán-Gómez Rodríguez</b>Consultor Financiero Independiente</div>`;
  if (UI.welcomeStep === 0) {
    return `<div class="full olive"><div class="inner">
      <div class="welcome-mark">${mark}</div>
      <h1 class="welcome-title">Tu dinero,<br><em>ordenado.</em></h1>
      <p class="welcome-text">Apunta lo que entra y lo que sale, mira cuánto tienes en cada bloque y comprueba si vas según tu plan.</p>
      <ul class="welcome-steps">
        <li><span>1</span>Añade tus cuentas e inversiones, cada una en su bloque.</li>
        <li><span>2</span>Apunta cada gasto e ingreso al momento. Tarda segundos.</li>
        <li><span>3</span>Pon tu presupuesto y mira cómo vas cada mes.</li>
      </ul>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:28px">
        <button class="btn gold block" data-act="welcome-next">Empezar</button>
        <button class="btn block" style="background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,0.3)" data-act="import">Tengo una copia de seguridad</button>
      </div>
      <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:14px 0 0">Tus datos se guardan solo en este dispositivo. Nadie más los ve.</p>
      ${sig}
    </div><input type="file" id="import-file" accept=".json,application/json" hidden></div>`;
  }
  return `<div class="full olive"><div class="inner">
    <div class="welcome-mark">${mark}</div>
    <h1 class="welcome-title" style="font-size:26px">Dos datos para empezar</h1>
    <form class="form" id="welcome-form" style="margin-top:8px">
      <div class="field"><label for="w-name">¿Cómo te llamas?</label><input id="w-name" class="input" autocomplete="given-name" placeholder="Tu nombre"></div>
      <div class="field"><label for="w-income">¿Cuánto ingresas al mes, neto?</label><input id="w-income" class="input" inputmode="decimal" placeholder="Por ejemplo, 1.800">
        <p class="hint">Sirve para tu presupuesto y para traducir lo que ganas a días de trabajo. Puedes dejarlo para luego.</p></div>
      <button class="btn gold block" type="submit" style="margin-top:8px">Continuar</button>
    </form>
    ${sig}
  </div></div>`;
}
function bindWelcome() {
  const f = $('#welcome-form');
  if (f) {
    setTimeout(() => { if (document.activeElement === document.body) $('#w-name')?.focus(); }, 50);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      S.settings.name = $('#w-name').value.trim();
      const inc = parseAmount($('#w-income').value);
      if (isFinite(inc) && inc > 0) S.plan.income = inc;
      S.onboarded = true; UI.tab = 'cuentas';
      save(); render();
      setTimeout(() => openAccountForm(null, { kind: 'cuenta' }), 250);
    });
  }
}

/* ── PIN ────────────────────────────────────────────────── */
async function hashPin(pin) {
  const text = `mis-finanzas:${pin}`;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(16);
}
let pinEntry = '';
function keypadHTML() {
  return `<div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="key" data-key="${n}">${n}</button>`).join('')}<span></span><button class="key" data-key="0">0</button><button class="key ghost" data-key="del" aria-label="Borrar">Borrar</button></div>`;
}
function dotsHTML(n) { return `<div class="pin-dots" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`; }
function viewLock() {
  return `<div class="full olive"><div class="inner" style="justify-content:center">
    <p class="pin-title">Introduce tu PIN</p><p class="pin-sub" id="pin-msg"></p>
    <div id="pin-dots">${dotsHTML(pinEntry.length)}</div>
    ${keypadHTML()}
    <div class="pin-forgot"><button data-act="pin-forgot">He olvidado el PIN</button></div>
  </div></div>`;
}
function bindLock() {
  pinEntry = '';
  const onKey = async (k) => {
    if (k === 'del') pinEntry = pinEntry.slice(0, -1);
    else if (pinEntry.length < 4) pinEntry += k;
    $('#pin-dots').innerHTML = dotsHTML(pinEntry.length);
    if (pinEntry.length === 4) {
      const ok = (await hashPin(pinEntry)) === S.settings.pinHash;
      if (ok) { UI.locked = false; pinEntry = ''; render(); }
      else { $('.pin-dots').classList.add('shake'); $('#pin-msg').textContent = 'PIN incorrecto. Prueba otra vez.'; setTimeout(() => { pinEntry = ''; const d = $('#pin-dots'); if (d) d.innerHTML = dotsHTML(0); }, 400); }
    }
  };
  $$('.key').forEach((b) => b.addEventListener('click', () => onKey(b.dataset.key)));
}
document.addEventListener('keydown', (e) => {
  if (!UI.locked || !S.onboarded) return;
  if (/^\d$/.test(e.key)) $(`.key[data-key="${e.key}"]`)?.click();
  if (e.key === 'Backspace') $('.key[data-key="del"]')?.click();
});
function openPinSetup(change = false) {
  let first = '', entry = '';
  openSheet(`<div class="sheet-head"><h2>${change ? 'Nuevo PIN' : 'Crea tu PIN'}</h2>${closeBtn()}</div>
    <div class="full olive" style="min-height:auto;border-radius:18px;padding:24px 10px 26px">
      <p class="pin-title" id="ps-title">Elige 4 cifras</p><p class="pin-sub" id="ps-msg">Si lo olvidas, podrás quitarlo sin perder tus datos.</p>
      <div id="ps-dots">${dotsHTML(0)}</div>${keypadHTML()}</div>`, (root) => {
    $$('.key', root).forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.key;
      if (k === 'del') entry = entry.slice(0, -1); else if (entry.length < 4) entry += k;
      $('#ps-dots', root).innerHTML = dotsHTML(entry.length);
      if (entry.length < 4) return;
      if (!first) { first = entry; entry = ''; setTimeout(() => { $('#ps-dots', root).innerHTML = dotsHTML(0); $('#ps-title', root).textContent = 'Repítelo'; $('#ps-msg', root).textContent = ''; }, 180); return; }
      if (entry === first) {
        S.settings.pinHash = await hashPin(entry); save(); closeSheet(); render(); toast('PIN activado');
      } else {
        first = ''; entry = '';
        $('#ps-title', root).textContent = 'No coinciden. Elige 4 cifras';
        setTimeout(() => { $('#ps-dots', root).innerHTML = dotsHTML(0); }, 200);
      }
    }));
  });
}

/* ════════════════════════════════════════════════════════════
   HOJAS (formularios)
   ════════════════════════════════════════════════════════════ */
const sheetRoot = $('#sheet-root');
let sheetCleanup = null;
function closeBtn() { return `<button class="icon-btn" data-act="close-sheet" aria-label="Cerrar">${icon('close')}</button>`; }
function openSheet(html, onMount) {
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div></div>`;
  document.body.style.overflow = 'hidden';
  const root = $('.sheet', sheetRoot);
  if (onMount) sheetCleanup = onMount(root) || null;
}
function closeSheet() {
  if (typeof sheetCleanup === 'function') sheetCleanup();
  sheetCleanup = null;
  sheetRoot.innerHTML = '';
  document.body.style.overflow = '';
}
function confirmSheet({ title, text, ok = 'Aceptar', danger = false }) {
  return new Promise((resolve) => {
    openSheet(`<div class="sheet-head"><h2>${esc(title)}</h2>${closeBtn()}</div>
      <p style="margin:0 0 18px;font-size:14px;color:var(--ink-2)">${text}</p>
      <div class="btn-row"><button class="btn ghost" data-r="0">Cancelar</button><button class="btn ${danger ? 'danger' : ''}" data-r="1">${esc(ok)}</button></div>`, (root) => {
      $$('[data-r]', root).forEach((b) => b.addEventListener('click', () => { obs.disconnect(); closeSheet(); resolve(b.dataset.r === '1'); }));
      const obs = new MutationObserver(() => { if (!sheetRoot.innerHTML || !sheetRoot.contains(root)) { obs.disconnect(); resolve(false); } });
      obs.observe(sheetRoot, { childList: true });
    });
  });
}

/* ── Movimiento ─────────────────────────────────────────── */
function openTxForm(existing = null, preset = {}) {
  if (!activeAccounts().length) { toast('Primero añade una cuenta'); UI.tab = 'cuentas'; render(); setTimeout(() => openAccountForm(), 200); return; }
  const t = existing ? { ...existing } : {
    id: null, type: preset.type || 'gasto', amount: preset.amount ? round2(preset.amount) : '', date: today(), categoryId: null, note: '',
    accountId: preset.accountId || null, toAccountId: preset.toAccountId || null
  };
  const draw = (root) => {
    const cuentas = activeAccounts().filter((a) => !isInv(a));
    const all = activeAccounts();
    const sel = (list, val, name) => `<select class="input" data-f="${name}">${list.map((a) => `<option value="${a.id}" ${a.id === val ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`;
    if (t.type === 'gasto' && !cuentas.some((a) => a.id === t.accountId)) t.accountId = S.settings.lastAccount.gasto && cuentas.some((a) => a.id === S.settings.lastAccount.gasto) ? S.settings.lastAccount.gasto : (cuentas[0] || {}).id;
    if (t.type !== 'gasto' && !all.some((a) => a.id === t.accountId)) t.accountId = S.settings.lastAccount[t.type] && all.some((a) => a.id === S.settings.lastAccount[t.type]) ? S.settings.lastAccount[t.type] : (all[0] || {}).id;
    if (t.type === 'traspaso' && (!t.toAccountId || t.toAccountId === t.accountId)) t.toAccountId = (all.find((a) => a.id !== t.accountId) || {}).id;
    const a = acc(t.accountId);
    const early = a && t.date < a.start;
    let catHTML = '';
    if (t.type === 'gasto') {
      catHTML = GROUPS.map((g) => `<div class="cat-group-label">${g.name}</div><div class="cat-grid">${S.categories.filter((c) => c.kind === 'gasto' && c.group === g.id).map((c) => `<button type="button" class="cat-btn" data-cat-pick="${c.id}" aria-pressed="${t.categoryId === c.id}">${esc(c.name)}</button>`).join('')}</div>`).join('');
    } else if (t.type === 'ingreso') {
      catHTML = `<div class="cat-grid">${S.categories.filter((c) => c.kind === 'ingreso').map((c) => `<button type="button" class="cat-btn" data-cat-pick="${c.id}" aria-pressed="${t.categoryId === c.id}">${esc(c.name)}</button>`).join('')}</div>`;
    }
    root.innerHTML = `<div class="sheet-grip"></div><div class="sheet-head"><h2>${t.id ? 'Editar movimiento' : 'Apuntar'}</h2>${closeBtn()}</div>
      <form class="form" id="tx-form" novalidate>
        <div class="seg" role="group" aria-label="Tipo" style="align-self:center">
          ${[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['traspaso', 'Traspaso']].map(([k, l]) => `<button type="button" data-type="${k}" aria-pressed="${t.type === k}">${l}</button>`).join('')}
        </div>
        <div class="amount-wrap"><input class="input amount num" id="tx-amount" inputmode="decimal" placeholder="0,00 €" value="${t.amount === '' ? '' : numInput(t.amount)}" aria-label="Importe" autocomplete="off"></div>
        ${t.type === 'traspaso' ? `<p class="hint" style="margin:-6px 0 0;text-align:center;font-size:12px;color:var(--ink-3)">Para aportar a una inversión o pasar dinero al ahorro. No cuenta como gasto.</p>` : ''}
        ${catHTML ? `<div class="field"><span class="field-label">Categoría</span>${catHTML}</div>` : ''}
        ${t.type === 'traspaso'
          ? `<div class="two"><div class="field"><label>Desde</label>${sel(all, t.accountId, 'accountId')}</div><div class="field"><label>Hacia</label>${sel(all.filter((x) => x.id !== t.accountId), t.toAccountId, 'toAccountId')}</div></div>`
          : `<div class="field"><label>Cuenta</label>${sel(t.type === 'gasto' ? cuentas : all, t.accountId, 'accountId')}</div>`}
        <div class="two">
          <div class="field"><label for="tx-date">Fecha</label><input type="date" class="input" id="tx-date" value="${t.date}"></div>
          <div class="field"><label for="tx-note">Nota</label><input class="input" id="tx-note" value="${esc(t.note)}" placeholder="Opcional" maxlength="80"></div>
        </div>
        ${early ? `<p class="hint" style="margin:0;font-size:12px;color:var(--gold-dark)">«${esc(a.name)}» empieza a contar el ${shortDate(a.start)}. Este movimiento sale en tus gastos e ingresos, pero no cambia su saldo.</p>` : ''}
        <p class="form-error" id="tx-err" hidden></p>
        ${t.id ? `<button class="btn danger block" type="button" data-del>Eliminar movimiento</button>` : ''}
        <div class="sticky-save"><button class="btn block" type="submit">${t.id ? 'Guardar cambios' : 'Guardar'}</button></div>
      </form>`;
    const amountEl = $('#tx-amount', root);
    const keep = () => { t.amount = amountEl.value === '' ? '' : (isFinite(parseAmount(amountEl.value)) ? parseAmount(amountEl.value) : t.amount); t.date = $('#tx-date', root).value || today(); t.note = $('#tx-note', root).value; };
    $$('[data-type]', root).forEach((b) => b.addEventListener('click', () => { keep(); if (t.type !== b.dataset.type) { t.type = b.dataset.type; t.categoryId = null; } draw(root); }));
    $$('[data-cat-pick]', root).forEach((b) => b.addEventListener('click', () => { t.categoryId = b.dataset.catPick; $$('[data-cat-pick]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
    $$('select[data-f]', root).forEach((s) => s.addEventListener('change', () => { keep(); t[s.dataset.f] = s.value; draw(root); }));
    $('#tx-date', root).addEventListener('change', () => { keep(); draw(root); });
    $('#tx-form', root).addEventListener('submit', (e) => {
      e.preventDefault(); keep();
      const err = $('#tx-err', root);
      const amount = parseAmount(amountEl.value);
      const fail = (m) => { err.textContent = m; err.hidden = false; };
      if (!isFinite(amount) || amount <= 0) return fail('Escribe un importe mayor que cero.');
      if (t.type !== 'traspaso' && !t.categoryId) return fail('Elige una categoría.');
      if (!t.accountId) return fail('Elige una cuenta.');
      if (t.type === 'traspaso' && (!t.toAccountId || t.toAccountId === t.accountId)) return fail('Elige dos cuentas distintas.');
      const rec = { id: t.id || uid(), type: t.type, amount, date: t.date, accountId: t.accountId, toAccountId: t.type === 'traspaso' ? t.toAccountId : null,
        categoryId: t.type === 'traspaso' ? null : t.categoryId, note: t.note.trim(), at: existing ? existing.at : Date.now() };
      if (existing) S.txns = S.txns.map((x) => x.id === rec.id ? rec : x); else S.txns.push(rec);
      S.settings.lastAccount[t.type] = t.accountId;
      save(); closeSheet();
      UI.month = ymOf(rec.date) <= currentYM() ? ymOf(rec.date) : UI.month;
      render(); toast(existing ? 'Cambios guardados' : 'Apuntado');
    });
    const del = $('[data-del]', root);
    if (del) del.addEventListener('click', async () => {
      if (await confirmSheet({ title: 'Eliminar movimiento', text: 'Se quitará de tus cuentas y de tus gastos. No se puede deshacer.', ok: 'Eliminar', danger: true })) {
        S.txns = S.txns.filter((x) => x.id !== existing.id); save(); render(); toast('Movimiento eliminado');
      }
    });
    return amountEl;
  };
  openSheet('', (root) => { const el = draw(root); if (!existing) setTimeout(() => el.focus(), 220); });
}

/* ── Cuenta / inversión ─────────────────────────────────── */
function openAccountForm(existing = null, preset = {}) {
  const kind0 = preset.kind || (preset.block && preset.block > 1 ? 'inversion' : 'cuenta');
  const blk0 = kind0 === 'inversion' ? (preset.block && preset.block > 1 ? preset.block : 3) : 1;
  const a = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: null, kind: kind0, name: '', use: 'liquidez', block: blk0, type: kind0 === 'inversion' ? INV_TYPES[blk0][0] : '',
    initial: '', start: today(), currentValue: '', rentas: null
  };
  if (a.kind === 'inversion' && a.block === 4 && !a.rentas) a.rentas = { rate: '', end: '', every: 3, payAmount: '', payAccountId: null, paidUntil: null };
  let payTouched = !!(existing && existing.rentas);
  const used = !!(existing && accountUsed(existing.id));
  const cuentas = () => activeAccounts().filter((x) => x.kind === 'cuenta');

  const draw = (root) => {
    const isR = a.kind === 'inversion' && a.block === 4;
    const r = a.rentas || {};
    if (isR && r.every && !payTouched) r.payAmount = suggestedPay(a.initial, r.rate, r.every) || '';
    if (isR && r.every && !r.payAccountId) r.payAccountId = (cuentas().find((x) => x.use === 'liquidez') || cuentas()[0] || {}).id || null;
    const preview = () => {
      if (!isR || !(a.initial > 0) || !(r.rate > 0) || !r.end || r.end <= a.start) return '';
      const tmp = { ...a, initial: Number(a.initial), rentas: { ...r, payAmount: Number(r.payAmount) || 0 } };
      const total = r.every === 0 ? round2(tmp.initial * r.rate * daysBetween(a.start, r.end) / 365) : round2(payDates(tmp).length * (Number(r.payAmount) || 0));
      const n = r.every ? payDates(tmp).length : 1;
      return `<div class="earn-fact" style="margin:0"><b class="num">${money(total)}</b><span>de intereses en total${r.every ? `, en ${n} cobro${n === 1 ? '' : 's'}` : ', al vencer'} hasta el ${shortDate(r.end)}</span></div>`;
    };
    root.innerHTML = `<div class="sheet-grip"></div><div class="sheet-head"><h2>${a.id ? 'Editar' : 'Nueva cuenta o inversión'}</h2>${closeBtn()}</div>
      <form class="form" id="acc-form" novalidate>
        ${a.id ? '' : `<div class="seg" role="group" aria-label="Qué es" style="align-self:center">
          <button type="button" data-kind="cuenta" aria-pressed="${a.kind === 'cuenta'}">Cuenta</button>
          <button type="button" data-kind="inversion" aria-pressed="${a.kind === 'inversion'}">Inversión</button></div>`}
        <div class="field"><label for="a-name">Nombre</label><input id="a-name" class="input" value="${esc(a.name)}" placeholder="${a.kind === 'cuenta' ? 'Por ejemplo, Cuenta nómina' : isR ? 'Por ejemplo, Depósito Banco X' : 'Por ejemplo, Fondo MSCI World'}" maxlength="40"></div>
        ${a.kind === 'cuenta'
          ? `<div class="field"><label for="a-use">¿Para qué la usas?</label><select id="a-use" class="input">${CUENTA_USES.map((u) => `<option value="${u.id}" ${u.id === a.use ? 'selected' : ''}>${u.name}</option>`).join('')}</select>
              <p class="hint">${useOf(a).desc}. Va en el bloque 1 · Seguridad.</p></div>`
          : `<div class="two">
              <div class="field"><label for="a-block">Bloque</label><select id="a-block" class="input">${BLOCKS.slice(1).map((b) => `<option value="${b.id}" ${b.id === a.block ? 'selected' : ''}>${b.id} · ${b.name}</option>`).join('')}</select></div>
              <div class="field"><label for="a-type">Tipo</label><select id="a-type" class="input">${INV_TYPES[a.block].map((t) => `<option ${t === a.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
            </div><p class="hint" style="margin:-8px 0 0;font-size:12px;color:var(--ink-3)">${BLOCKS.find((b) => b.id === a.block).desc}.</p>`}
        ${used ? `<p class="hint" style="font-size:12px;color:var(--ink-3)">${isR ? 'Capital' : 'Saldo inicial'}: ${money(a.initial)} desde el ${shortDate(a.start)}. Para corregir el saldo, apunta un movimiento.</p>` : `
        <div class="two">
          <div class="field"><label for="a-initial">${a.kind === 'cuenta' ? 'Saldo' : isR ? 'Capital invertido' : 'Lo que has aportado'}</label><input id="a-initial" class="input num" inputmode="decimal" value="${a.initial === '' ? '' : numInput(a.initial)}" placeholder="0,00"></div>
          <div class="field"><label for="a-start">${isR ? 'Fecha de inicio' : 'A fecha de'}</label><input id="a-start" type="date" class="input" value="${a.start}"></div>
        </div>
        ${a.kind === 'inversion' && !isR && !a.id ? `<div class="field"><label for="a-value">Lo que vale ese día</label><input id="a-value" class="input num" inputmode="decimal" value="${a.currentValue === '' ? '' : numInput(a.currentValue)}" placeholder="Si no lo sabes, déjalo vacío"><p class="hint">Si vale más o menos de lo que has metido, ponlo aquí y verás tu rentabilidad.</p></div>` : ''}`}
        ${isR ? `
        <div class="two">
          <div class="field"><label for="r-rate">Interés anual</label><input id="r-rate" class="input num" inputmode="decimal" value="${r.rate === '' ? '' : String(round2(r.rate * 10000) / 100).replace('.', ',')}" placeholder="Por ejemplo, 3,5"><p class="hint">En %, el que te da el producto.</p></div>
          <div class="field"><label for="r-end">Vence el</label><input id="r-end" type="date" class="input" value="${r.end || ''}"></div>
        </div>
        <div class="field"><label for="r-every">¿Cuándo cobras los intereses?</label><select id="r-every" class="input">${FREQS.map((f) => `<option value="${f.every}" ${f.every === r.every ? 'selected' : ''}>${f.name}</option>`).join('')}</select></div>
        ${r.every ? `<div class="two">
          <div class="field"><label for="r-pay">Cobras cada vez</label><input id="r-pay" class="input num" inputmode="decimal" value="${r.payAmount === '' ? '' : numInput(r.payAmount)}" placeholder="0,00"><p class="hint">Calculado con el interés. Cámbialo si tu producto paga otra cantidad.</p></div>
          <div class="field"><label for="r-acc">Te lo ingresan en</label>${cuentas().length ? `<select id="r-acc" class="input">${cuentas().map((x) => `<option value="${x.id}" ${x.id === r.payAccountId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : `<p class="hint" style="color:var(--bad)">Primero añade una cuenta del bloque 1.</p>`}</div>
        </div>
        <p class="hint" style="margin:-6px 0 0;font-size:12px;color:var(--ink-3)">La app apuntará sola cada cobro como ingreso en esa cuenta.</p>`
        : `<p class="hint" style="margin:-6px 0 0;font-size:12px;color:var(--ink-3)">Los intereses se van sumando al valor día a día y los cobras todos al vencer.</p>`}
        <div id="r-preview">${preview()}</div>` : ''}
        ${!used ? `<p class="hint" style="font-size:12px;color:var(--ink-3);margin:-4px 0 0">${isR ? 'Si empezó antes de hoy, pon la fecha real: la app apuntará los cobros que ya has recibido.' : '¿Quieres meter meses anteriores? Pon una fecha pasada y el saldo que tenías entonces.'}</p>` : ''}
        <p class="form-error" id="a-err" hidden></p>
        <button class="btn block" type="submit">${a.id ? 'Guardar cambios' : 'Añadir'}</button>
        ${a.id ? (used
          ? `<button class="btn ghost block" type="button" data-archive>${a.archived ? 'Reabrir' : 'Cerrar'}</button>`
          : `<button class="btn danger block" type="button" data-del>Eliminar</button>`) : ''}
      </form>`;
    const keep = () => {
      a.name = $('#a-name', root).value;
      if ($('#a-use', root)) { a.use = $('#a-use', root).value; a.type = useOf(a).name; }
      if ($('#a-block', root)) a.block = Number($('#a-block', root).value);
      if ($('#a-type', root)) a.type = $('#a-type', root).value;
      if ($('#a-initial', root)) { a.initial = $('#a-initial', root).value === '' ? '' : parseAmount($('#a-initial', root).value); a.start = $('#a-start', root).value || today(); }
      if ($('#a-value', root)) a.currentValue = $('#a-value', root).value === '' ? '' : parseAmount($('#a-value', root).value);
      if (a.rentas && $('#r-rate', root)) {
        const pr = parseAmount($('#r-rate', root).value); a.rentas.rate = isFinite(pr) ? round2(pr / 100 * 10000) / 10000 : '';
        a.rentas.end = $('#r-end', root).value;
        a.rentas.every = Number($('#r-every', root).value);
        if ($('#r-pay', root)) { const v = parseAmount($('#r-pay', root).value); a.rentas.payAmount = isFinite(v) ? v : ''; }
        if ($('#r-acc', root)) a.rentas.payAccountId = $('#r-acc', root).value;
      }
    };
    $$('[data-kind]', root).forEach((b) => b.addEventListener('click', () => {
      keep(); a.kind = b.dataset.kind;
      if (a.kind === 'cuenta') { a.block = 1; a.rentas = null; a.type = useOf(a).name; }
      else { a.block = 3; a.type = INV_TYPES[3][0]; }
      draw(root);
    }));
    $('#a-use', root)?.addEventListener('change', () => { keep(); draw(root); });
    $('#a-block', root)?.addEventListener('change', () => {
      keep(); a.type = INV_TYPES[a.block][0];
      a.rentas = a.block === 4 ? (a.rentas || { rate: '', end: '', every: 3, payAmount: '', payAccountId: null, paidUntil: null }) : null;
      draw(root);
    });
    const refreshPreview = () => { keep(); if (a.rentas && a.rentas.every && !payTouched && $('#r-pay', root)) { a.rentas.payAmount = suggestedPay(a.initial, a.rentas.rate, a.rentas.every) || ''; $('#r-pay', root).value = a.rentas.payAmount === '' ? '' : numInput(a.rentas.payAmount); } const pv = $('#r-preview', root); if (pv) pv.innerHTML = preview(); };
    ['#a-initial', '#r-rate', '#r-end', '#a-start'].forEach((s) => $(s, root)?.addEventListener('input', refreshPreview));
    $('#r-pay', root)?.addEventListener('input', () => { payTouched = true; keep(); const pv = $('#r-preview', root); if (pv) pv.innerHTML = preview(); });
    $('#r-every', root)?.addEventListener('change', () => { keep(); payTouched = false; draw(root); });
    $('#acc-form', root).addEventListener('submit', (e) => {
      e.preventDefault(); keep();
      const err = $('#a-err', root); const fail = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center' }); };
      if (!a.name.trim()) return fail('Ponle un nombre.');
      if (a.initial !== '' && !isFinite(a.initial)) return fail('Revisa el importe.');
      if (a.currentValue !== '' && a.currentValue !== undefined && !isFinite(a.currentValue)) return fail('Revisa el valor.');
      const isR = a.kind === 'inversion' && a.block === 4;
      if (isR) {
        const r = a.rentas;
        if (!(Number(a.initial) > 0)) return fail('Escribe el capital invertido.');
        if (!(r.rate > 0 && r.rate < 1)) return fail('Escribe el interés anual, por ejemplo 3,5.');
        if (!r.end || r.end <= a.start) return fail('La fecha de vencimiento tiene que ser posterior a la de inicio.');
        if (r.every) {
          if (!(r.payAmount > 0)) return fail('Escribe cuánto cobras cada vez.');
          if (!r.payAccountId || !acc(r.payAccountId)) return fail('Elige en qué cuenta te ingresan los intereses.');
          if (!payDates({ ...a, rentas: r }).length) return fail('Con esas fechas no hay ningún cobro. Revisa el vencimiento o la frecuencia.');
        }
      }
      const rentas = isR ? { rate: a.rentas.rate, end: a.rentas.end, every: a.rentas.every, payAmount: a.rentas.every ? round2(a.rentas.payAmount) : 0, payAccountId: a.rentas.every ? a.rentas.payAccountId : null, paidUntil: existing && existing.rentas ? existing.rentas.paidUntil : null } : null;
      if (existing) {
        S.accounts = S.accounts.map((x) => x.id === a.id ? { ...x, name: a.name.trim(), use: a.kind === 'cuenta' ? a.use : undefined, type: a.type, block: a.block,
          initial: used ? x.initial : round2(a.initial || 0), start: used ? x.start : a.start, rentas } : x);
        const n = syncRentas(); save(); closeSheet(); render(); toast(n ? `Guardado. Se han apuntado ${n} cobros de intereses` : 'Cambios guardados');
      } else {
        const rec = { id: uid(), kind: a.kind, name: a.name.trim(), type: a.type, block: a.block, initial: round2(a.initial || 0), start: a.start, archived: false, created: Date.now() };
        if (a.kind === 'cuenta') rec.use = a.use;
        if (rentas) rec.rentas = rentas;
        S.accounts.push(rec);
        if (a.kind === 'inversion' && !rentas && a.currentValue !== '' && isFinite(a.currentValue) && a.currentValue !== rec.initial) S.valuations.push({ id: uid(), accountId: rec.id, date: rec.start, value: round2(a.currentValue), at: Date.now() });
        const n = syncRentas(); save(); closeSheet(); if (UI.tab !== 'cuentas') UI.tab = 'cuentas'; render();
        toast(n ? `${rec.name} añadida. Se han apuntado ${n} cobros que ya recibiste` : `${rec.name} añadida`);
      }
    });
    $('[data-del]', root)?.addEventListener('click', async () => {
      const autos = S.txns.filter((t) => t.srcId === a.id).length;
      if (await confirmSheet({ title: 'Eliminar', text: `Se eliminará «${esc(a.name)}»${autos ? ` y los ${autos} cobros de intereses que la app apuntó` : ''}.`, ok: 'Eliminar', danger: true })) {
        S.accounts = S.accounts.filter((x) => x.id !== a.id); S.txns = S.txns.filter((t) => t.srcId !== a.id); save(); render(); toast('Eliminada');
      }
    });
    $('[data-archive]', root)?.addEventListener('click', async () => {
      const now = today(); const v = value(existing, now);
      if (!existing.archived && Math.abs(v) > 0.009) {
        const ok = await confirmSheet({ title: 'Cerrar', text: `Todavía tiene ${money(v)}. Si la cierras seguirá contando en tu patrimonio. Lo normal es traspasar antes ese dinero a otra cuenta. ¿La cierras igualmente?`, ok: 'Cerrar' });
        if (!ok) return;
      }
      S.accounts = S.accounts.map((x) => x.id === a.id ? { ...x, archived: !x.archived } : x); save(); closeSheet(); render(); toast(existing.archived ? 'Reabierta' : 'Cerrada');
    });
  };
  openSheet('', (root) => draw(root));
}

function openAccountDetail(id) {
  const a = acc(id); if (!a) return;
  const now = today();
  const v = value(a, now);
  const txs = S.txns.filter((t) => t.accountId === id || t.toAccountId === id || t.srcId === id).sort((x, y) => y.date.localeCompare(x.date) || (y.at || 0) - (x.at || 0));
  const vals = S.valuations.filter((x) => x.accountId === id).sort((x, y) => y.date.localeCompare(x.date));
  const b = BLOCKS.find((x) => x.id === a.block);
  let invHTML = '';
  if (isRenta(a)) {
    const info = rentasInfo(a, now), r = a.rentas;
    const freq = FREQS.find((f) => f.every === r.every);
    invHTML = `<div class="tiles" style="grid-template-columns:1fr 1fr;margin-top:12px">
      <div class="tile"><div class="tile-label">Capital</div><div class="tile-value num">${money0(a.initial)}</div></div>
      <div class="tile"><div class="tile-label">Interés anual</div><div class="tile-value num">${pct(r.rate, 2)}</div></div>
      <div class="tile"><div class="tile-label">Generado hasta hoy</div><div class="tile-value num pos">${money0(info.generated)}</div></div>
      <div class="tile"><div class="tile-label">Generará en total</div><div class="tile-value num">${money0(info.total)}</div></div></div>
      <div class="summary-rows num" style="margin-top:12px;font-size:13px">
        <div><span class="muted">Cobro de intereses</span><span>${freq ? freq.name : ''}${r.every ? ` · ${money(r.payAmount)}` : ''}</span></div>
        ${r.every ? `<div><span class="muted">Te lo ingresan en</span><span>${esc((acc(r.payAccountId) || {}).name || '—')}</span></div>` : ''}
        <div><span class="muted">${info.matured ? 'Venció el' : 'Vence el'}</span><span>${shortDate(r.end)}</span></div>
        ${info.next ? `<div><span class="muted">Próximo cobro</span><span>${shortDate(info.next)} · ${money(info.nextAmount)}</span></div>` : ''}
      </div>
      ${info.matured && Math.abs(v) > 0.009 ? `<div class="banner" style="margin-top:12px"><p><b>Ya ha vencido</b>Cuando te devuelvan el dinero, pásalo a una de tus cuentas para que tu patrimonio cuadre.</p></div><button class="btn gold block" data-matured style="margin-top:10px">Pasar ${money0(v)} a una cuenta</button>` : ''}`;
  } else if (isInv(a)) {
    const inv = book(a, now) ?? a.initial, g = gainTo(a, now);
    invHTML = `<div class="tiles" style="grid-template-columns:1fr 1fr;margin-top:12px">
      <div class="tile"><div class="tile-label">Aportado</div><div class="tile-value num">${money0(inv)}</div></div>
      <div class="tile"><div class="tile-label">Rentabilidad</div><div class="tile-value num ${g < 0 ? 'neg' : ''}">${money0(g, { sign: true })}${inv > 0 ? ` <small style="font-size:12px">${pct(g / inv)}</small>` : ''}</div></div></div>
      <p class="card-note" style="margin:10px 0 0">${vals.length ? `Valor actualizado el ${shortDate(vals[0].date)}.` : 'Aún no has actualizado su valor: se muestra lo aportado.'}</p>
      <button class="btn gold block" data-valuation style="margin-top:12px">Actualizar valor</button>`;
  }
  openSheet(`<div class="sheet-head"><div><h2>${esc(a.name)}</h2><div class="card-note">${esc(a.type)} · <span class="dot" style="background:${b.hex};display:inline-block;vertical-align:middle"></span> ${b.name}${a.archived ? ' · cerrada' : ''}</div></div>${closeBtn()}</div>
    <section class="card"><div class="tile-label">${isInv(a) ? 'Valor actual' : 'Saldo'}</div><div class="hero-value num" style="font-size:32px;color:var(--ink)">${money(v ?? a.initial)}</div>${invHTML}</section>
    <div class="btn-row" style="margin:12px 0"><button class="btn ghost small" data-edit>Editar</button>${isRenta(a) ? '' : `<button class="btn ghost small" data-quick="${isInv(a) ? 'aportar' : 'mov'}">${isInv(a) ? 'Aportar' : 'Apuntar aquí'}</button>`}</div>
    ${vals.length ? `<div class="eyebrow" style="margin:6px 2px 6px">Valoraciones</div><div class="list" style="margin-bottom:12px">${vals.map((x) => `<div class="list-row"><span class="row-main"><span class="row-title" style="display:block">${shortDate(x.date)}</span></span><span class="row-amount num">${money(x.value)}</span><button class="icon-btn" data-del-val="${x.id}" aria-label="Borrar valoración" style="width:30px;height:30px">${icon('close')}</button></div>`).join('')}</div>` : ''}
    <div class="eyebrow" style="margin:6px 2px 6px">Movimientos</div>
    ${txs.length ? `<div class="list">${txs.slice(0, 40).map(txRow).join('')}</div>${txs.length > 40 ? `<p class="card-note" style="text-align:center">Se muestran los 40 últimos.</p>` : ''}` : `<p class="card-note">Sin movimientos. Saldo inicial de ${money(a.initial)} el ${shortDate(a.start)}.</p>`}`,
  (root) => {
    $('[data-edit]', root).addEventListener('click', () => { closeSheet(); openAccountForm(a); });
    $('[data-matured]', root)?.addEventListener('click', () => {
      closeSheet();
      const to = activeAccounts().find((x) => x.kind === 'cuenta' && x.use === 'liquidez') || activeAccounts().find((x) => x.kind === 'cuenta');
      openTxForm(null, { type: 'traspaso', accountId: a.id, toAccountId: to ? to.id : null, amount: value(a, today()) });
    });
    $('[data-quick]', root)?.addEventListener('click', (e) => {
      closeSheet();
      if (e.currentTarget.dataset.quick === 'aportar') {
        const from = activeAccounts().find((x) => !isInv(x) && x.id !== a.id);
        openTxForm(null, { type: 'traspaso', accountId: from ? from.id : null, toAccountId: a.id });
      } else openTxForm(null, { type: 'gasto', accountId: a.id });
    });
    $('[data-valuation]', root)?.addEventListener('click', () => { closeSheet(); openValuationForm(a); });
    $$('[data-del-val]', root).forEach((btn) => btn.addEventListener('click', async () => {
      if (await confirmSheet({ title: 'Borrar valoración', text: 'Se recalculará la rentabilidad sin ese valor.', ok: 'Borrar', danger: true })) {
        S.valuations = S.valuations.filter((x) => x.id !== btn.dataset.delVal); save(); render(); openAccountDetail(id);
      }
    }));
    $$('[data-act="edit-tx"]', root).forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); const t = S.txns.find((x) => x.id === btn.dataset.id); closeSheet(); openTxForm(t); }));
  });
}

function openValuationForm(a) {
  const now = today();
  openSheet(`<div class="sheet-head"><h2>Valor de ${esc(a.name)}</h2>${closeBtn()}</div>
    <form class="form" id="val-form" novalidate>
      <p class="card-note" style="margin:0">Mira en tu banco o plataforma cuánto vale hoy y escríbelo. Aportado hasta ahora: <b>${money(book(a, now) ?? a.initial)}</b>.</p>
      <div class="amount-wrap"><input class="input amount num" id="v-amount" inputmode="decimal" placeholder="0,00 €" aria-label="Valor"></div>
      <div class="field"><label for="v-date">A fecha de</label><input id="v-date" type="date" class="input" value="${now}"></div>
      <p class="form-error" id="v-err" hidden></p>
      <button class="btn block" type="submit">Guardar valor</button>
    </form>`, (root) => {
    setTimeout(() => $('#v-amount', root).focus(), 220);
    $('#val-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const v = parseAmount($('#v-amount', root).value), d = $('#v-date', root).value || now;
      const err = $('#v-err', root);
      if (!isFinite(v) || v < 0) { err.textContent = 'Escribe el valor actual.'; err.hidden = false; return; }
      if (d < a.start) { err.textContent = `La fecha no puede ser anterior al ${shortDate(a.start)}.`; err.hidden = false; return; }
      S.valuations = S.valuations.filter((x) => !(x.accountId === a.id && x.date === d));
      S.valuations.push({ id: uid(), accountId: a.id, date: d, value: v, at: Date.now() });
      save(); closeSheet(); render(); toast('Valor actualizado');
    });
  });
}

/* ── Categoría ──────────────────────────────────────────── */
function openCatForm(existing = null, preset = {}) {
  const c = existing ? { ...existing } : { id: null, kind: preset.kind || 'gasto', name: '', group: preset.group || 'variables', budget: 0, freq: 'mes', yield: false };
  const used = existing && catUsed(existing.id);
  openSheet(`<div class="sheet-head"><h2>${c.id ? 'Editar categoría' : 'Nueva categoría'}</h2>${closeBtn()}</div>
    <form class="form" id="cat-form" novalidate>
      <div class="field"><label for="c-name">Nombre</label><input id="c-name" class="input" value="${esc(c.name)}" maxlength="30" placeholder="Por ejemplo, Mascotas"></div>
      ${c.kind === 'gasto' ? `<div class="field"><label for="c-group">Grupo</label><select id="c-group" class="input">${GROUPS.map((g) => `<option value="${g.id}" ${g.id === c.group ? 'selected' : ''}>${g.name}</option>`).join('')}</select></div>`
        : `<div class="switch-row"><div><b style="font-size:14px">Cuenta como ganancia</b><div class="card-note">Intereses, saveback, dividendos… Suma en «¿Cuánto he ganado?»</div></div><label class="switch"><input type="checkbox" id="c-yield" ${c.yield ? 'checked' : ''}><span></span></label></div>`}
      <p class="form-error" id="c-err" hidden></p>
      <button class="btn block" type="submit">${c.id ? 'Guardar' : 'Añadir'}</button>
      ${c.id ? `<button class="btn danger block" type="button" data-del>Eliminar categoría</button>` : ''}
    </form>`, (root) => {
    if (!existing) setTimeout(() => $('#c-name', root).focus(), 220);
    $('#cat-form', root).addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#c-name', root).value.trim();
      if (!name) { const er = $('#c-err', root); er.textContent = 'Ponle un nombre.'; er.hidden = false; return; }
      c.name = name;
      if (c.kind === 'gasto') c.group = $('#c-group', root).value; else c.yield = $('#c-yield', root).checked;
      if (existing) S.categories = S.categories.map((x) => x.id === c.id ? c : x); else { c.id = uid(); S.categories.push(c); }
      save(); closeSheet(); render(); toast(existing ? 'Categoría guardada' : 'Categoría añadida');
    });
    $('[data-del]', root)?.addEventListener('click', async () => {
      const others = S.categories.filter((x) => x.kind === c.kind && x.id !== c.id);
      if (!others.length) { toast('Necesitas al menos una categoría'); return; }
      const fallback = others.find((x) => /^otros/i.test(x.name)) || others[0];
      const ok = await confirmSheet({ title: 'Eliminar categoría', text: used ? `Tiene movimientos apuntados. Pasarán a «${esc(fallback.name)}».` : `Se eliminará «${esc(c.name)}».`, ok: 'Eliminar', danger: true });
      if (!ok) return;
      if (used) S.txns = S.txns.map((t) => t.categoryId === c.id ? { ...t, categoryId: fallback.id } : t);
      S.categories = S.categories.filter((x) => x.id !== c.id); save(); render(); toast('Categoría eliminada');
    });
  });
}

/* ════════════════════════════════════════════════════════════
   PLAN: edición en vivo sin perder el foco
   ════════════════════════════════════════════════════════════ */
function bindPlan() {
  const refresh = () => {
    for (const g of GROUPS) { const el = $(`[data-bind="group-${g.id}"]`); if (el) el.textContent = `${money(groupBudget(g.id))} al mes`; }
    for (const c of S.categories) { const el = $(`[data-bind="mon-${c.id}"]`); if (el) el.textContent = `${money(budgetMonthly(c))} al mes`; }
    $('#plan-summary').innerHTML = planSummaryHTML();
    $('#cushion').innerHTML = cushionHTML();
    bindCushion();
  };
  const val = (el) => { const v = parseAmount(el.value); return isFinite(v) && v >= 0 ? v : 0; };
  $$('[data-plan="income"]').forEach((el) => el.addEventListener('input', () => { S.plan.income = val(el); save(); refresh(); }));
  $$('[data-cat]').forEach((el) => el.addEventListener('input', () => { const c = cat(el.dataset.cat); if (c) { c.budget = val(el); save(); refresh(); } }));
  $$('[data-contrib]').forEach((el) => el.addEventListener('input', () => { S.plan.contrib[el.dataset.contrib] = val(el); save(); refresh(); }));
  bindCushion();
}
function bindCushion() {
  $('[data-cushion]')?.addEventListener('change', (e) => { S.settings.cushionMonths = Number(e.target.value); save(); $('#cushion').innerHTML = cushionHTML(); bindCushion(); });
}
function bindSettings() {
  $('[data-setting="name"]')?.addEventListener('input', (e) => { S.settings.name = e.target.value.slice(0, 40); save(); });
}

/* ════════════════════════════════════════════════════════════
   COPIA DE SEGURIDAD
   ════════════════════════════════════════════════════════════ */
async function exportBackup() {
  const stamp = new Date().toISOString();
  const data = { app: 'mis-finanzas', exported: stamp, state: { ...S, settings: { ...S.settings, lastBackup: stamp } } };
  const json = JSON.stringify(data, null, 1);
  const name = `mis-finanzas-copia-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  let done = false;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iphone|ipad|android/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: 'Copia de Mis Finanzas' });
      done = true;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (!done) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  S.settings.lastBackup = stamp; S.settings.backupSnooze = null; save(); render();
  toast('Copia hecha. Guárdala en un sitio seguro.');
}
function pickImport() {
  const input = $('#import-file'); if (!input) return;
  input.value = '';
  input.onchange = async () => {
    const f = input.files && input.files[0]; if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { toast('Ese archivo no es una copia de Mis Finanzas'); return; }
    const st = data && data.app === 'mis-finanzas' ? data.state : null;
    if (!st || !Array.isArray(st.accounts) || !Array.isArray(st.txns)) { toast('Ese archivo no es una copia de Mis Finanzas'); return; }
    const hasData = S.accounts.length || S.txns.length;
    if (hasData) {
      const ok = await confirmSheet({ title: 'Recuperar copia', text: `La copia es del ${shortDate((data.exported || today()).slice(0, 10))}. Sustituirá todo lo que hay ahora en la app.`, ok: 'Sustituir', danger: true });
      if (!ok) return;
    }
    S = normalize(st); S.onboarded = true;
    UI.locked = false; UI.tab = 'inicio'; UI.month = currentYM();
    await writeState(S); render(); toast('Copia recuperada');
  };
  input.click();
}

/* ════════════════════════════════════════════════════════════
   EVENTOS
   ════════════════════════════════════════════════════════════ */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'backdrop') { if (e.target === el) closeSheet(); return; }
  switch (act) {
    case 'close-sheet': closeSheet(); break;
    case 'tab': UI.tab = el.dataset.tab; closeSheet(); render(); window.scrollTo(0, 0); break;
    case 'month': { const n = addMonths(UI.month, Number(el.dataset.dir)); if (n <= currentYM()) { UI.month = n; render(); } break; }
    case 'new-tx': openTxForm(); break;
    case 'edit-tx': { const t = S.txns.find((x) => x.id === el.dataset.id); if (t) openTxForm(t); break; }
    case 'new-account': openAccountForm(null, { kind: el.dataset.kind, block: el.dataset.block ? Number(el.dataset.block) : undefined }); break;
    case 'account': openAccountDetail(el.dataset.id); break;
    case 'mov-filter': UI.movFilter = el.dataset.f; render(); break;
    case 'earn': UI.earnPeriod = el.dataset.p; render(); break;
    case 'toggle-group': UI.openGroups[el.dataset.group] = !UI.openGroups[el.dataset.group]; render(); break;
    case 'freq': { const c = cat(el.dataset.id); if (c) { c.freq = c.freq === 'año' ? 'mes' : 'año'; save(); const y = window.scrollY; render(); window.scrollTo(0, y); } break; }
    case 'new-cat': openCatForm(null, { kind: el.dataset.kind || 'gasto', group: el.dataset.group }); break;
    case 'edit-cat': { const c = cat(el.dataset.id); if (c) openCatForm(c); break; }
    case 'export': exportBackup(); break;
    case 'import': pickImport(); break;
    case 'snooze-backup': { const d = new Date(); d.setDate(d.getDate() + 7); S.settings.backupSnooze = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; save(); render(); break; }
    case 'hide-install': S.settings.installHintHidden = true; save(); render(); break;
    case 'install': if (UI.installPrompt) { UI.installPrompt.prompt(); await UI.installPrompt.userChoice.catch(() => {}); UI.installPrompt = null; render(); } break;
    case 'apply-update': if (UI.updateReady) UI.updateReady.postMessage('skip-waiting'); break;
    case 'welcome-next': UI.welcomeStep = 1; render(); break;
    case 'pin-toggle': {
      e.preventDefault();
      if (S.settings.pinHash) {
        if (await confirmSheet({ title: 'Quitar PIN', text: 'La app se abrirá sin pedir PIN.', ok: 'Quitar PIN' })) { S.settings.pinHash = null; save(); render(); toast('PIN quitado'); }
      } else openPinSetup();
      break;
    }
    case 'pin-change': openPinSetup(true); break;
    case 'pin-forgot': {
      if (await confirmSheet({ title: 'Quitar el PIN', text: 'Se quitará el PIN y entrarás a la app. Tus datos no se borran. Luego puedes crear otro en Ajustes.', ok: 'Quitar PIN' })) {
        S.settings.pinHash = null; UI.locked = false; save(); render(); toast('PIN quitado');
      }
      break;
    }
    case 'wipe': {
      if (await confirmSheet({ title: 'Borrar todos los datos', text: 'Se borrarán todas tus cuentas, movimientos, presupuesto y ajustes de este dispositivo. Si no tienes una copia de seguridad, no podrás recuperarlos.', ok: 'Borrar todo', danger: true })) {
        S = freshState(); UI.tab = 'inicio'; UI.welcomeStep = 0; await writeState(S); render();
      }
      break;
    }
  }
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetRoot.innerHTML) closeSheet(); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { UI.hiddenAt = Date.now(); }
  else if (S.onboarded && syncRentas() && !UI.locked && !sheetRoot.innerHTML) render();
  else if (S.settings.pinHash && UI.hiddenAt && Date.now() - UI.hiddenAt > LOCK_AFTER_MS) { UI.locked = true; closeSheet(); render(); }
});

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); UI.installPrompt = e; if (S.onboarded && UI.tab === 'inicio') render(); });

/* ════════════════════════════════════════════════════════════
   ARRANQUE
   ════════════════════════════════════════════════════════════ */
async function boot() {
  const stored = await loadState();
  S = stored ? normalize(stored) : freshState();
  if (S.settings.pinHash) UI.locked = true;
  const due = syncRentas();
  render();
  if (due && !UI.locked) toast(`Se han apuntado ${due} cobros de intereses`);
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const hadController = !!navigator.serviceWorker.controller;
      const markReady = (w) => { if (hadController) { UI.updateReady = w; if (UI.tab === 'inicio' && !UI.locked) render(); } };
      if (reg.waiting) markReady(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed') markReady(w); });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
    } catch (e) { /* sin modo offline, la app sigue funcionando */ }
  }
}
// Exponer para pruebas automáticas
window.__MF = { get state() { return S; }, calc: { netWorth, blockTotals, monthSummary, earned, planTotals, marketValue, book, gainTo, contributedIn, parseAmount, money } };
boot();
})();
