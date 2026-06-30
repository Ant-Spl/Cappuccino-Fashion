/* FashionDex/app.js - DishDex-style static GitHub Pages build v12 */
(() => {
'use strict';

function repoRootPath() {
  const path = window.location.pathname || '/';
  const marker = '/fashiondex';
  const index = path.toLowerCase().indexOf(marker);
  if (index >= 0) {
    const root = path.slice(0, index);
    return root.endsWith('/') ? root : `${root}/`;
  }
  return './';
}

const REPO_ROOT = repoRootPath();
const GITHUB_RAW_ROOT = 'https://raw.githubusercontent.com/Ant-Spl/Cappuccino-Fashion/main/';

function uniqPaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

function filePaths(file) {
  return uniqPaths([
    `../${file}`,
    `${REPO_ROOT}${file}`,
    `./${file}`,
    file,
    `/${file}`,
    `${GITHUB_RAW_ROOT}${file}`
  ]);
}

const PATHS = {
  items: filePaths('FashionItems.xml'),
  levels: filePaths('FashionLevelXp.xml'),
  lang: filePaths('langs/Fashion_en.xml')
};

const ICON_DIRS = uniqPaths([`../clothingicons`, `${REPO_ROOT}clothingicons`, './clothingicons', 'clothingicons']);
const STORAGE_KEY = 'fashionDexDishDexStyleV2';
const THEME_KEY = 'fashionDexTheme';
const LABEL_DAYS = { 1: 1, 2: 5, 3: 13 };
const LABEL_BONUS_PIECES = 1.05;
const LABEL_BONUS_XP = 1.05;

const FAMILY_BY_SUBTYPE = new Map([[0,'Accessories'],[1,'Accessories'],[2,'Accessories'],[3,'Accessories'],[10,'Shoes'],[11,'Shoes'],[20,'Clothes'],[21,'Clothes'],[22,'Clothes'],[23,'Clothes'],[24,'Clothes']]);
const CATEGORY_BY_SUBTYPE = new Map([[0,'Jewelry / Scarves'],[1,'Bags'],[2,'Hats'],[3,'Watches'],[10,'Shoes'],[11,'Boots'],[20,'Tops'],[21,'Bottoms'],[22,'Full body'],[23,'Jackets / Coats'],[24,'Sweaters / Pullovers']]);
const GENDER = { 0: 'Unisex', 1: 'Female', 2: 'Male' };

const SORT_OPTIONS = [
  ['levelAsc', 'Level: low to high'],
  ['levelDesc', 'Level: high to low'],
  ['nameAsc', 'Alphabetical A-Z'],
  ['nameDesc', 'Alphabetical Z-A'],
  ['durationAsc', 'Time: Short to Long'],
  ['durationDesc', 'Time: Long to Short'],
  ['profitDesc', 'Raw Profit: high to low'],
  ['profitAsc', 'Raw Profit: low to high'],
  ['xpDesc', 'Raw XP: high to low'],
  ['xpAsc', 'Raw XP: low to high'],
  ['profitPerMinDesc', 'Profit/min: high to low'],
  ['profitPerMinAsc', 'Profit/min: low to high'],
  ['xpPerMinDesc', 'XP/min: high to low'],
  ['xpPerMinAsc', 'XP/min: low to high'],
  ['unitsDesc', 'Units: high to low'],
  ['unitsAsc', 'Units: low to high'],
  ['unitsPerMinDesc', 'Units/min: high to low'],
  ['unitsPerMinAsc', 'Units/min: low to high']
];

let DATA = null;
let loadInfo = null;
let currentScreen = 'welcomeScreen';
let userData = loadUserData();

function defaultUserData() {
  return {
    profileName: '',
    level: 1,
    xpNeeded: 1000,
    workers: 3,
    workersOverride: '',
    patternMode: 'cash',
    useLabels: true,
    myTimeHours: 0,
    myTimeMinutes: 0,
    myTimeMarginPlusHours: 0,
    myTimeMarginPlusMinutes: 0,
    myTimeMarginMinusHours: 0,
    myTimeMarginMinusMinutes: 0,
    myTimeUseLabels: true,
    fullSearch: '',
    fullSort: 'levelAsc',
    fullUseLabels: true,
    fullFamily: 'all',
    fullGender: 'all',
    coopSearch: '',
    coopSort: 'level',
    coopWorkers: 5,
    selectedCoopId: '',
    labelSearch: '',
    labelFamily: 'all',
    labelSort: 'next',
    labelSlots: 4,
    labels: {}
  };
}

function loadUserData() {
  try {
    return { ...defaultUserData(), ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')) };
  } catch {
    return defaultUserData();
  }
}
function saveUserData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(userData)); }

function setupTheme() {
  const theme = localStorage.getItem(THEME_KEY) || 'dark';
  document.body.classList.toggle('dark-theme', theme !== 'light');
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = theme !== 'light';
  toggle?.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, next);
    document.body.classList.toggle('dark-theme', next === 'dark');
  });
}

function setupNavigation() {
  const routes = {
    openMyDex: 'myDexScreen',
    openFullFashionDex: 'fullDexScreen',
    openMyTime: 'myTimeScreen',
    openCoopPlanner: 'coopScreen',
    openProfile: 'profileScreen',
    openLabels: 'labelsScreen'
  };
  for (const [id, screen] of Object.entries(routes)) {
    document.getElementById(id)?.addEventListener('click', () => showScreen(screen));
  }
  document.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', () => showScreen('welcomeScreen')));
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id));
  currentScreen = id;
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setStatus(text, cls='') {
  const el = document.getElementById('loadStatus');
  if (!el) return;
  el.textContent = text;
  el.className = cls;
}

async function main() {
  setupTheme();
  setupNavigation();
  setupSortOptions();
  bindInputs();
  try {
    setStatus('Loading Fashion data...', 'ok');
    const items = await loadXml('items', PATHS.items, { required: true, validate: validateItemsXml });
    const lang = await loadXml('language', PATHS.lang, { required: false, validate: validateFashionLangXml });
    const levels = await loadXml('level limits', PATHS.levels, { required: false, validate: validateLevelXml });

    loadInfo = {
      items: items?.path || '',
      levels: levels?.path || '',
      lang: lang?.path || ''
    };

    DATA = buildData(items.doc, levels?.doc || null, lang?.doc || null);
    if (!userData.selectedCoopId && DATA.coops.length) userData.selectedCoopId = String(DATA.coops[0].id);
    syncInputs();
    renderAll();
    setStatus('Fashion data loaded!', 'ok');
  } catch (err) {
    setStatus('Could not load Fashion data.', 'bad');
    const summary = document.getElementById('dataSummary');
    if (summary) summary.textContent = err?.message || 'Could not load required XML.';
    console.error(err);
  }
}

async function loadXml(kind, paths, options = {}) {
  const failures = [];
  const required = options.required !== false;
  const validate = typeof options.validate === 'function' ? options.validate : null;

  for (const path of paths) {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const url = `${path}${sep}v=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim()) throw new Error('empty response');
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('XML parse error');
      if (validate) validate(doc);
      return { doc, path };
    } catch (err) {
      failures.push(`${path}: ${err.message}`);
    }
  }

  if (!required) {
    console.warn(`Optional ${kind} not loaded`, failures);
    return null;
  }

  throw new Error(`Could not load ${kind}. Tried: ${failures.join(' | ')}`);
}

function validateItemsXml(doc) {
  const count = [...doc.querySelectorAll('wod')].filter(el => attr(el, 'g') === 'Clothes' && attr(el, 'n') !== 'Custom').length;
  if (!count) throw new Error('loaded, but no usable non-custom Clothes entries were found');
}

function validateFashionLangXml(doc) {
  if (!doc.querySelector('fashion')) throw new Error('not a Fashion language XML');
}

function validateLevelXml(doc) {
  if (!doc.querySelector('levellimits')) throw new Error('not a FashionLevelXp XML');
}

function buildData(itemsDoc, levelsDoc, langDoc) {
  const lang = langDoc ? parseLang(langDoc) : { cloth: {}, coop: { titles: {}, descs: {} } };

  const clothes = [...itemsDoc.querySelectorAll('wod')]
    .filter(el => attr(el, 'g') === 'Clothes' && attr(el, 'n') !== 'Custom')
    .map(el => normalizeCloth(el, lang.cloth))
    .sort((a,b)=>a.level-b.level || a.id-b.id);
  const clothesById = new Map(clothes.map(c => [c.id, c]));

  const coops = [...itemsDoc.querySelectorAll('wod')]
    .filter(el => attr(el, 'g') === 'Coop')
    .map(el => normalizeCoop(el, lang.coop, clothesById))
    .sort((a,b)=>a.minLevel-b.minLevel || a.id-b.id);

  const maxContentLevel = Math.max(
    1,
    ...clothes.map(c => c.level || 0),
    ...coops.map(c => c.maxLevel || c.minLevel || 0)
  );
  const levels = parseLevelLimits(levelsDoc, maxContentLevel);

  return {
    clothes,
    clothesById,
    coops,
    levels,
    stats: { clothes: clothes.length, coops: coops.length, levels: levels.length, maxLevel: Math.max(...levels.map(x=>x.level), maxContentLevel), hasLevelFile: !!levelsDoc, hasLangFile: !!langDoc },
    lang
  };
}

function parseLevelLimits(levelsDoc, maxContentLevel) {
  if (!levelsDoc) return fallbackLevelLimits(maxContentLevel);
  const parsed = [...levelsDoc.querySelectorAll('limit')].map(el => ({
    level: num(el, 'l'),
    counters: num(el, 'co'),
    storeSize: num(el, 'i'),
    workers: num(el, 'f'),
    mannequins: num(el, 'm'),
    cashdesks: num(el, 'ca'),
    changingrooms: num(el, 'cr'),
    rewardCash: num(el, 'ch'),
    rewardGold: num(el, 'g')
  })).sort((a,b)=>a.level-b.level);
  return parsed.length ? parsed : fallbackLevelLimits(maxContentLevel);
}

function fallbackLevelLimits(maxContentLevel) {
  const maxLevel = Math.max(99, Number(maxContentLevel) || 1);
  const rows = [];
  for (let level = 0; level <= maxLevel; level += 1) {
    rows.push({
      level,
      counters: Math.min(20, 2 + Math.floor(level / 8)),
      storeSize: 12 + Math.floor(level / 4) * 4,
      workers: Math.min(12, 3 + Math.floor(level / 6)),
      mannequins: Math.min(10, 1 + Math.floor(level / 7)),
      cashdesks: Math.min(8, 1 + Math.floor(level / 15)),
      changingrooms: Math.min(10, 1 + Math.floor(level / 8)),
      rewardCash: 0,
      rewardGold: 0
    });
  }
  return rows;
}

function parseLang(doc) {
  const cloth = {};
  const coop = { titles: {}, descs: {} };
  doc.querySelectorAll('cloth > text').forEach(el => cloth[attr(el,'id')] = attr(el,'name'));
  doc.querySelectorAll('coopmission > text').forEach(el => {
    const id = attr(el,'id');
    const name = attr(el,'name');
    const title = id.match(/^coop_title_(.+)$/);
    const desc = id.match(/^coop_desc_(.+)$/);
    if (title) coop.titles[title[1]] = name;
    if (desc) coop.descs[desc[1]] = name;
  });
  return { cloth, coop };
}

function normalizeCloth(el, names) {
  const key = attr(el, 't');
  const langKey = `cloth_${key.toLowerCase()}`;
  const subtype = num(el, 'productSubType');
  const production = num(el, 'production');
  const duration = num(el, 'duration');
  const incomePerUnit = num(el, 'incomePerUnit');
  const productionCostCash = num(el, 'productionCostCash');
  const productionCostGold = num(el, 'productionCostGold');
  const revenue = incomePerUnit * production;
  const profit = revenue - productionCostCash;
  const xp = num(el, 'xp');
  const family = FAMILY_BY_SUBTYPE.get(subtype) || 'Clothes';
  const gender = num(el, 'gender');
  return {
    id: num(el, 'id'), n: attr(el,'n'), key, langKey,
    name: names[langKey] || prettify(key),
    level: num(el,'level'), xp,
    patternCash: num(el,'cash'), patternGold: num(el,'gold'), friends: num(el,'friends'), goldNoFriends: num(el,'goldNoFriends'),
    incomePerUnit, production, duration, productSubType: subtype,
    productionCostCash, productionCostGold, revenue, profit,
    profitPerMin: duration ? profit / duration : 0,
    xpPerMin: duration ? xp / duration : 0,
    unitsPerMin: duration ? production / duration : 0,
    family, category: CATEGORY_BY_SUBTYPE.get(subtype) || `Subtype ${subtype}`,
    gender, genderName: GENDER[gender] || `Gender ${gender}`,
    isPremiumProduction: productionCostGold > 0,
    isGoldPattern: num(el,'gold') > 0
  };
}

function normalizeCoop(el, coopLang, clothesById) {
  const key = attr(el, 't') || String(num(el,'id'));
  const reqs = parseRequirements(attr(el, 'clothes'));
  let factoryMinutes = 0;
  let cost = 0;
  let revenue = 0;
  const requirements = reqs.map(([clothId, amount]) => {
    const cloth = clothesById.get(clothId);
    if (!cloth) return { clothId, amount, missing: true, name: `Unknown #${clothId}`, batches: 0, minutes: 0, cost: 0, level: 0 };
    const batches = Math.ceil(amount / Math.max(1, cloth.production));
    const minutes = batches * cloth.duration;
    const reqCost = batches * cloth.productionCostCash;
    factoryMinutes += minutes;
    cost += reqCost;
    revenue += amount * cloth.incomePerUnit;
    return { clothId, amount, missing: false, name: cloth.name, key: cloth.key, level: cloth.level, production: cloth.production, batches, minutes, cost: reqCost, category: cloth.category, family: cloth.family };
  });
  return {
    id: num(el,'id'), key,
    title: coopLang.titles[key] || `Co-Op ${key}`,
    description: coopLang.descs[key] || '',
    minLevel: num(el,'minLevel'), maxLevel: num(el,'maxLevel'), maxMember: num(el,'maxMember'),
    chips: num(el,'chips'), xp: num(el,'xp'), gold: num(el,'gold'), duration: num(el,'duration'),
    requirements, factoryMinutes, factoryHours: factoryMinutes / 60, cost, revenue
  };
}

function parseRequirements(raw) {
  return String(raw || '').split('#').filter(Boolean).map(chunk => chunk.split('+').map(Number)).filter(([id, amount]) => Number.isFinite(id) && Number.isFinite(amount));
}

function attr(el, name) { return el.getAttribute(name) || ''; }
function num(el, name) { const value = Number(el.getAttribute(name)); return Number.isFinite(value) ? value : 0; }
function prettify(key) { return String(key || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/female$/i,' Female').replace(/male$/i,' Male').trim(); }

function setupSortOptions() {
  const fullSort = document.getElementById('fullSort');
  if (fullSort) fullSort.innerHTML = SORT_OPTIONS.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
}

function bindInputs() {
  const ids = ['playerLevel','xpNeeded','workerCount','patternMode','useLabelsToggle','fullSearch','fullSort','fullUseLabelsToggle','fullFamily','fullGender','timePlayerLevel','myTimeHours','myTimeMinutes','myTimeMarginPlusHours','myTimeMarginPlusMinutes','myTimeMarginMinusHours','myTimeMarginMinusMinutes','myTimeUseLabelsToggle','coopSearch','coopSort','coopWorkers','coopSelect','profileName','profileLevel','profileWorkers','labelSearch','labelFamily','labelSort','labelSlots'];
  ids.forEach(id => {
    document.getElementById(id)?.addEventListener('input', onInputChange);
    document.getElementById(id)?.addEventListener('change', onInputChange);
  });
  document.getElementById('saveProfile')?.addEventListener('click', () => { readInputs(); saveUserData(); renderAll(); alert('Profile saved locally.'); });
  document.getElementById('deleteData')?.addEventListener('click', () => { if (confirm('Delete saved FashionDex profile and Labels?')) { localStorage.removeItem(STORAGE_KEY); userData = loadUserData(); syncInputs(); renderAll(); } });
  document.getElementById('downloadData')?.addEventListener('click', downloadData);
  document.getElementById('loadData')?.addEventListener('click', () => document.getElementById('loadDataFile')?.click());
  document.getElementById('loadDataFile')?.addEventListener('change', loadDataFile);
  document.getElementById('clearMyTimeTarget')?.addEventListener('click', () => {
    ['myTimeHours','myTimeMinutes'].forEach(id => setValue(id, 0));
    readInputs(); saveUserData(); renderAll();
  });
  document.getElementById('clearMyTimeMargin')?.addEventListener('click', () => {
    ['myTimeMarginPlusHours','myTimeMarginPlusMinutes','myTimeMarginMinusHours','myTimeMarginMinusMinutes'].forEach(id => setValue(id, 0));
    readInputs(); saveUserData(); renderAll();
  });
  document.addEventListener('input', e => {
    if (e.target?.classList?.contains('label-points')) {
      userData.labels[e.target.dataset.id] = Math.max(0, Number(e.target.value || 0));
      saveUserData();
      renderLabels();
    }
  });
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('cloth-icon')) return;
    const candidates = JSON.parse(img.dataset.icons || '[]');
    const next = Number(img.dataset.index || 0) + 1;
    if (next < candidates.length) {
      img.dataset.index = String(next);
      img.src = candidates[next];
    } else {
      img.outerHTML = '<div class="missing-img">No icon</div>';
    }
  }, true);
}

function onInputChange(e) {
  const id = e?.target?.id;
  if (['playerLevel','timePlayerLevel','profileLevel'].includes(id)) {
    ['playerLevel','timePlayerLevel','profileLevel'].forEach(otherId => setValue(otherId, e.target.value));
  }
  readInputs();
  saveUserData();
  renderAll();
}

function syncInputs() {
  setValue('playerLevel', userData.level);
  setValue('xpNeeded', userData.xpNeeded);
  setValue('workerCount', userData.workers);
  setValue('patternMode', userData.patternMode);
  setChecked('useLabelsToggle', userData.useLabels);
  setValue('fullSearch', userData.fullSearch);
  setValue('fullSort', userData.fullSort);
  setChecked('fullUseLabelsToggle', userData.fullUseLabels !== false);
  setValue('fullFamily', userData.fullFamily);
  setValue('fullGender', userData.fullGender);
  setValue('timePlayerLevel', userData.level);
  setValue('myTimeHours', userData.myTimeHours);
  setValue('myTimeMinutes', userData.myTimeMinutes);
  setValue('myTimeMarginPlusHours', userData.myTimeMarginPlusHours);
  setValue('myTimeMarginPlusMinutes', userData.myTimeMarginPlusMinutes);
  setValue('myTimeMarginMinusHours', userData.myTimeMarginMinusHours);
  setValue('myTimeMarginMinusMinutes', userData.myTimeMarginMinusMinutes);
  setChecked('myTimeUseLabelsToggle', userData.myTimeUseLabels !== false);
  setValue('coopSearch', userData.coopSearch);
  setValue('coopSort', userData.coopSort);
  setValue('coopWorkers', userData.coopWorkers);
  setValue('profileName', userData.profileName);
  setValue('profileLevel', userData.level);
  setValue('profileWorkers', userData.workersOverride);
  setValue('labelSearch', userData.labelSearch);
  setValue('labelFamily', userData.labelFamily);
  setValue('labelSort', userData.labelSort);
  setValue('labelSlots', userData.labelSlots);
}
function readInputs() {
  userData.level = intValue('playerLevel', intValue('timePlayerLevel', intValue('profileLevel', userData.level)));
  userData.xpNeeded = intValue('xpNeeded', userData.xpNeeded);
  userData.workers = intValue('workerCount', userData.workers);
  userData.patternMode = getValue('patternMode', userData.patternMode);
  userData.useLabels = getChecked('useLabelsToggle', userData.useLabels);
  userData.fullSearch = getValue('fullSearch', userData.fullSearch);
  userData.fullSort = getValue('fullSort', userData.fullSort);
  userData.fullUseLabels = getChecked('fullUseLabelsToggle', userData.fullUseLabels !== false);
  userData.fullFamily = getValue('fullFamily', userData.fullFamily);
  userData.fullGender = getValue('fullGender', userData.fullGender);
  userData.myTimeHours = intValue('myTimeHours', userData.myTimeHours);
  userData.myTimeMinutes = Math.min(59, intValue('myTimeMinutes', userData.myTimeMinutes));
  userData.myTimeMarginPlusHours = intValue('myTimeMarginPlusHours', userData.myTimeMarginPlusHours);
  userData.myTimeMarginPlusMinutes = Math.min(59, intValue('myTimeMarginPlusMinutes', userData.myTimeMarginPlusMinutes));
  userData.myTimeMarginMinusHours = intValue('myTimeMarginMinusHours', userData.myTimeMarginMinusHours);
  userData.myTimeMarginMinusMinutes = Math.min(59, intValue('myTimeMarginMinusMinutes', userData.myTimeMarginMinusMinutes));
  userData.myTimeUseLabels = getChecked('myTimeUseLabelsToggle', userData.myTimeUseLabels !== false);
  userData.coopSearch = getValue('coopSearch', userData.coopSearch);
  userData.coopSort = getValue('coopSort', userData.coopSort);
  userData.coopWorkers = intValue('coopWorkers', userData.coopWorkers);
  userData.selectedCoopId = getValue('coopSelect', userData.selectedCoopId);
  userData.profileName = getValue('profileName', userData.profileName);
  userData.workersOverride = getValue('profileWorkers', userData.workersOverride);
  userData.labelSearch = getValue('labelSearch', userData.labelSearch);
  userData.labelFamily = getValue('labelFamily', userData.labelFamily);
  userData.labelSort = getValue('labelSort', userData.labelSort);
  userData.labelSlots = intValue('labelSlots', userData.labelSlots);
  syncLevelInputs();
}
function syncLevelInputs() { ['playerLevel','timePlayerLevel','profileLevel'].forEach(id => setValue(id, userData.level)); }
function setValue(id, value) { const el = document.getElementById(id); if (el && el.value !== String(value ?? '')) el.value = value ?? ''; }
function getValue(id, fallback='') { const el = document.getElementById(id); return el ? el.value : fallback; }
function intValue(id, fallback=0) { const value = Number(getValue(id, fallback)); return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback; }
function setChecked(id, value) { const el = document.getElementById(id); if (el) el.checked = !!value; }
function getChecked(id, fallback=false) { const el = document.getElementById(id); return el ? el.checked : fallback; }

function renderAll() {
  if (!DATA) return;
  renderHome();
  renderMyDex();
  renderFullDex();
  renderTime();
  renderCoops();
  renderProfile();
  renderLabels();
}

function renderHome() {
  const summary = document.getElementById('dataSummary');
  if (summary) summary.textContent = `${DATA.stats.clothes} outfits · ${DATA.stats.coops} Co-Ops · ${DATA.stats.levels} levels`;
}

function renderMyDex() {
  const items = availableItems(true);
  const bestSummaryItems = buildBestSummaryItems(items);
  const bestXp = buildBucketRecommendations(items, 'XP/min', i => i.adjXpPerMin, 'xp');
  const bestProfit = buildBucketRecommendations(items, 'profit/min', i => i.adjProfitPerMin, 'profit');
  const bestUnits = buildBucketRecommendations(items, 'units/min', i => i.adjUnitsPerMin, 'portions');

  document.getElementById('bestSummaryBody').innerHTML = bestSummaryItems.length
    ? bestSummaryItems.map(({ label, item, rowClass }) => itemSummaryRow(item, label, rowClass)).join('')
    : emptyRow(9, 'No outfit recommendations available for this level/settings.');
  document.getElementById('bestXpBody').innerHTML = renderBucketMetricRows(bestXp, 'xp');
  document.getElementById('bestProfitBody').innerHTML = renderBucketMetricRows(bestProfit, 'profit');
  document.getElementById('bestUnitsBody').innerHTML = renderBucketMetricRows(bestUnits, 'units');
  document.getElementById('recommendedLabelsBody').innerHTML = renderRecommendedLabels(bestSummaryItems);
  document.getElementById('xpPlansBody').innerHTML = renderXpPlans(items);
}

function buildBestSummaryItems(items) {
  return [
    { label: 'Best XP/min', item: bestItem(items, i => i.adjXpPerMin), rowClass: 'best-xp-1' },
    { label: 'Best raw XP', item: bestItem(items, i => i.adjXp), rowClass: 'best-xp-3' },
    { label: 'Best profit/min', item: bestItem(items, i => i.adjProfitPerMin), rowClass: 'best-profit-1' },
    { label: 'Best raw profit', item: bestItem(items, i => i.adjProfit), rowClass: 'best-profit-3' },
    { label: 'Best units/min', item: bestItem(items, i => i.adjUnitsPerMin), rowClass: 'best-portions-1' },
    { label: 'Best raw units', item: bestItem(items, i => i.adjUnits), rowClass: 'best-portions-3' }
  ].filter(x => x.item);
}

function renderBucketMetricRows(items, metric) {
  const rows = items.filter(x => x.item);
  if (!rows.length) {
    const message = metric === 'xp'
      ? 'No XP recommendations available.'
      : metric === 'profit'
        ? 'No profit recommendations available.'
        : 'No unit recommendations available.';
    return emptyRow(7, message);
  }
  return rows.map(({ label, item, rowClass }) => metricRow(item, label, metric, rowClass)).join('');
}

function renderRecommendedLabels(summaryItems) {
  const rows = summaryItems.filter(x => x.item).map(({ label, item, rowClass }) => {
    const base = DATA.clothesById.get(item.id) || item;
    const targetLevel = recommendedLabelLevelForSummary(label);
    const currentLevel = labelLevel(base);
    const reached = currentLevel >= targetLevel;
    const benefit = reached
      ? 'You already have the recommended Label for this! Nice!'
      : recommendedLabelBenefit(base, targetLevel, label);
    return `<tr class="${rowClass}"><td>${iconCell(item)}</td><td>${escapeHtml(label)}</td><td class="dish-name">${escapeHtml(item.name)}</td><td>${labelSquares(currentLevel)}</td><td>${labelBadge(targetLevel)}</td><td class="effects-cell">${benefit}</td><td>${labelRequirement(base, targetLevel)}</td></tr>`;
  });
  return rows.length ? rows.join('') : emptyRow(7, 'No Label recommendations available.');
}

function recommendedLabelLevelForSummary(label) {
  const text = String(label || '').toLowerCase();
  if (text.includes('xp')) return 2;
  if (text.includes('profit') || text.includes('unit')) return 1;
  return 1;
}

function recommendedLabelBenefit(item, targetLevel, label) {
  const text = String(label || '').toLowerCase();
  const bronzePieces = Math.ceil(Number(item.production || 0) * LABEL_BONUS_PIECES) - Number(item.production || 0);
  const silverXp = Math.ceil(Number(item.xp || 0) * LABEL_BONUS_XP) - Number(item.xp || 0);
  const profitGain = bronzePieces * Number(item.incomePerUnit || 0);

  if (targetLevel === 2 || text.includes('xp')) {
    return `${labelBadge(2)}: +${fmt(silverXp)} XP`;
  }

  if (text.includes('profit')) {
    return `${labelBadge(1)}: +${fmt(bronzePieces)} units / +${fmt(profitGain)} ${currencyIcon('fashiondollars.png', 'Fashiondollars')}`;
  }

  return `${labelBadge(1)}: +${fmt(bronzePieces)} units`;
}

function labelRequirement(item, targetLevel) {
  const target = labelThreshold(item, targetLevel);
  const points = Number(userData.labels[item.id] || 0);
  if (!target) return 'Complete';
  if (points > 0 && points < target) return `${fmt(target)} points required (${fmt(target - points)} more)`;
  return `${fmt(target)} points required`;
}

function labelSquares(level) {
  const labels = ['Bronze', 'Silver', 'Gold'];
  return `<span class="label-squares" title="${escapeHtml(labelName(level))}">${labels.map((name, idx) => {
    const value = idx + 1;
    const cls = name.toLowerCase();
    return `<span class="label-square ${cls} ${level >= value ? 'filled' : ''}" aria-label="${name}">■</span>`;
  }).join('')}</span>`;
}

function labelBadge(level) {
  const name = labelName(level);
  const cls = String(name || '').toLowerCase();
  return `<span class="label-badge ${cls}"><span class="label-badge-square">■</span> ${escapeHtml(name)}</span>`;
}

function renderXpPlans(items) {
  const needed = Math.max(0, Number(userData.xpNeeded || 0));
  if (!needed) return emptyRow(10, 'Set XP Needed above 0.');
  const workers = effectiveWorkers();
  const rows = getTimeBuckets().map(bucket => {
    const item = bestItem(items.filter(bucket.matches).filter(i => i.adjXp > 0), i => i.adjXpPerMin);
    if (!item) {
      return `<tr class="row-${bucket.key}"><td></td><td>${escapeHtml(bucket.planLabel)}</td><td class="dish-name">No available outfit</td><td></td><td></td><td></td><td></td><td></td><td>${workers}</td><td class="note-cell">No outfit matches this plan.</td></tr>`;
    }
    const productionsNeeded = Math.ceil(needed / item.adjXp);
    const batches = Math.ceil(productionsNeeded / workers);
    const totalProductionTime = batches * item.duration;
    return `<tr class="row-${bucket.key}"><td>${iconCell(item)}</td><td>${escapeHtml(bucket.planLabel)}</td><td class="dish-name">${escapeHtml(item.name)}</td><td>${xpValue(item.adjXp)}</td><td>${timeFmt(item.duration)}</td><td>${fmt(productionsNeeded)}</td><td>${fmt(batches)}</td><td>${timeFmt(totalProductionTime)}</td><td>${workers}</td><td class="note-cell">${escapeHtml(bucket.note)}</td></tr>`;
  });
  return rows.join('');
}

function getTimeBuckets() {
  return [
    { key: 'active', recommendationLabel: 'Best active', planLabel: 'Active-time', note: 'Best XP/min for 10 minutes or less.', matches: item => item.duration <= 10 },
    { key: 'fast', recommendationLabel: 'Best fast', planLabel: 'Fast-time', note: 'Best XP/min between 11 minutes and 1 hour.', matches: item => item.duration >= 11 && item.duration <= 60 },
    { key: 'short', recommendationLabel: 'Best short', planLabel: 'Short-time', note: 'Best XP/min between 1 h 1 min and 3 h.', matches: item => item.duration >= 61 && item.duration <= 180 },
    { key: 'medium', recommendationLabel: 'Best medium', planLabel: 'Medium-time', note: 'Best XP/min between 3 h 1 min and 6 h.', matches: item => item.duration >= 181 && item.duration <= 360 },
    { key: 'long', recommendationLabel: 'Best long', planLabel: 'Long-time', note: 'Best XP/min between 6 h 1 min and 12 h.', matches: item => item.duration >= 361 && item.duration <= 720 },
    { key: 'veryLong', recommendationLabel: 'Best very long', planLabel: 'Very long', note: 'Best XP/min between 12 h 1 min and 23 h.', matches: item => item.duration >= 721 && item.duration <= 1380 },
    { key: 'dayOff', recommendationLabel: 'Best day-off', planLabel: 'Day off', note: 'Best XP/min for 23 h 1 min or more.', matches: item => item.duration >= 1381 }
  ];
}

function buildBucketRecommendations(items, metricLabel, scoreFunction, sectionKey) {
  return getTimeBuckets().map((bucket, index) => ({
    label: `${bucket.recommendationLabel} ${metricLabel}`,
    item: bestItem(items.filter(bucket.matches), scoreFunction),
    rowClass: `best-${sectionKey}-${index + 1}`
  }));
}

function bestItem(items, scoreFunction) {
  return [...items]
    .filter(item => Number.isFinite(Number(scoreFunction(item))))
    .sort((a, b) => Number(scoreFunction(b)) - Number(scoreFunction(a)) || a.level - b.level || a.name.localeCompare(b.name))[0];
}

function renderFullDex() {
  const useLabels = userData.fullUseLabels !== false;
  let items = DATA.clothes.map(i => adjusted(i, useLabels));
  const q = userData.fullSearch.trim().toLowerCase();
  if (q) items = items.filter(i => filterText(i, q));
  if (userData.fullFamily !== 'all') items = items.filter(i => i.family === userData.fullFamily);
  if (userData.fullGender !== 'all') items = items.filter(i => String(i.gender) === userData.fullGender);
  items = sortItems(items, userData.fullSort);
  document.getElementById('fullDexBody').innerHTML = items.length ? items.map(i => `
    <tr class="category-${familyClass(i.family)}">
      <td>${iconCell(i)}</td>
      <td class="dish-name">${escapeHtml(i.name)}</td>
      <td>${i.level}</td>
      <td>${metricStack('xp.png', 'XP', i.adjXp, i.adjXpPerMin)}</td>
      <td>${metricStack('fashiondollars.png', 'Fashiondollars', i.adjProfit, i.adjProfitPerMin)}</td>
      <td>${unitMetricStack(i.adjUnits, i.adjUnitsPerMin)}</td>
      <td>${timeFmt(i.duration)}</td>
      <td>${escapeHtml(i.category)}</td>
      <td>${i.genderName}</td>
      <td>${price(i.patternCash, i.patternGold)}</td>
      <td>${costRevenueStack(i)}</td>
    </tr>
  `).join('') : emptyRow(11, 'No outfits match this search.');
}

function renderTime() {
  const target = Math.max(0, Number(userData.myTimeHours || 0) * 60 + Number(userData.myTimeMinutes || 0));
  const marginPlus = Math.max(0, Number(userData.myTimeMarginPlusHours || 0) * 60 + Number(userData.myTimeMarginPlusMinutes || 0));
  const marginMinus = Math.max(0, Number(userData.myTimeMarginMinusHours || 0) * 60 + Number(userData.myTimeMarginMinusMinutes || 0));
  const min = Math.max(0, target - marginMinus);
  const max = target + marginPlus;
  const useLabels = userData.myTimeUseLabels !== false;

  let matches = [];
  if (target > 0) {
    matches = timeAvailableItems(useLabels)
      .filter(i => i.duration >= min && i.duration <= max)
      .sort((a, b) => a.level - b.level || a.duration - b.duration || a.name.localeCompare(b.name));
  }

  const summary = document.getElementById('myTimeWindowSummary');
  if (summary) {
    summary.textContent = target > 0
      ? `Showing outfits from ${timeFmt(min)} to ${timeFmt(max)}.`
      : 'Set a target time above 0.';
  }

  const bestRows = target > 0 ? [
    { label: 'Best XP/min', item: bestItem(matches, i => i.adjXpPerMin), rowClass: 'best-xp-1' },
    { label: 'Best profit/min', item: bestItem(matches, i => i.adjProfitPerMin), rowClass: 'best-profit-1' },
    { label: 'Best units/min', item: bestItem(matches, i => i.adjUnitsPerMin), rowClass: 'best-portions-1' }
  ].filter(row => row.item) : [];

  const bestBody = document.getElementById('myTimeBestBody');
  if (bestBody) {
    bestBody.innerHTML = bestRows.length
      ? bestRows.map(({ label, item, rowClass }) => itemSummaryRow(item, label, rowClass)).join('')
      : emptyRow(9, target > 0 ? 'No outfits match this time window. Try increasing the margin.' : 'Set a target time above 0.');
  }

  const allBody = document.getElementById('myTimeAllBody');
  if (allBody) {
    allBody.innerHTML = matches.length
      ? matches.map(i => `<tr class="row-${timeBucket(i.duration)}"><td>${iconCell(i)}</td><td class="dish-name">${escapeHtml(i.name)}</td><td>${i.level}</td><td>${metricStack('xp.png', 'XP', i.adjXp, i.adjXpPerMin)}</td><td>${metricStack('fashiondollars.png', 'Fashiondollars', i.adjProfit, i.adjProfitPerMin)}</td><td>${unitMetricStack(i.adjUnits, i.adjUnitsPerMin)}</td><td>${timeFmt(i.duration)}</td><td>${escapeHtml(i.category)}</td></tr>`).join('')
      : emptyRow(8, target > 0 ? 'No outfits match this time window. Try increasing the margin.' : 'Set a target time above 0.');
  }
}

function timeAvailableItems(useLabels) {
  return DATA.clothes
    .filter(i => i.level <= Number(userData.level || 0))
    .filter(i => userData.patternMode === 'all' || i.patternGold <= 0)
    .filter(i => i.productionCostGold <= 0)
    .map(i => adjusted(i, useLabels));
}

function renderCoops() {
  let coops = [...DATA.coops];
  const q = userData.coopSearch.trim().toLowerCase();
  if (q) coops = coops.filter(c => `${c.title} ${c.description} ${c.id}`.toLowerCase().includes(q));
  coops.sort((a,b) => {
    if (userData.coopSort === 'time') return a.duration - b.duration;
    if (userData.coopSort === 'factory') return a.factoryMinutes - b.factoryMinutes;
    if (userData.coopSort === 'reward') return (b.chips + b.xp + b.gold * 1000) - (a.chips + a.xp + a.gold * 1000);
    return a.minLevel - b.minLevel || a.id - b.id;
  });
  const select = document.getElementById('coopSelect');
  if (select) {
    select.innerHTML = DATA.coops.map(c => `<option value="${c.id}" ${String(c.id) === String(userData.selectedCoopId) ? 'selected' : ''}>${escapeHtml(c.title)}</option>`).join('');
  }
  const selected = DATA.coops.find(c => String(c.id) === String(userData.selectedCoopId)) || DATA.coops[0];
  document.getElementById('selectedCoopPlan').innerHTML = selected ? coopPlanCard(selected) : '<div class="empty">No Co-Op selected.</div>';
  document.getElementById('coopListBody').innerHTML = coops.length ? coops.map(c => `<tr><td class="dish-name">${escapeHtml(c.title)}<div class="dish-type-tag">${escapeHtml(c.description)}</div></td><td>${c.minLevel}-${c.maxLevel || 999}</td><td>${c.maxMember}</td><td>${timeFmt(c.duration)}</td><td>${hours(c.factoryHours)}</td><td>${money(c.chips)} · ${xpValue(c.xp)} · ${goldValue(c.gold)}</td><td class="requirements-cell">${c.requirements.map(r => `${escapeHtml(r.name)} × ${fmt(r.amount)}`).join('<br>')}</td></tr>`).join('') : emptyRow(7, 'No Co-Ops available.');
}

function coopPlanCard(c) {
  const workers = Math.max(1, Number(userData.coopWorkers || effectiveWorkers()));
  const wall = c.factoryMinutes / workers;
  const reqRows = c.requirements.map(r => `<tr><td>${r.missing ? '' : iconCell(DATA.clothesById.get(r.clothId) || {})}</td><td class="dish-name">${escapeHtml(r.name)}</td><td>${fmt(r.amount)}</td><td>${r.batches}</td><td>${timeFmt(r.minutes)}</td><td>${r.level}</td></tr>`).join('');
  return `<div class="coop-selected-card"><h3>${escapeHtml(c.title)}</h3><p class="section-note">${escapeHtml(c.description || 'No description.')}</p><div class="mini-grid">${metric('Time limit', timeFmt(c.duration), 'Co-Op duration')}${metric('Factory-hours', hours(c.factoryHours), 'Total production work')}${metric('With team workers', timeFmt(wall), `${workers} workers`)}${metric('Rewards', `${money(c.chips)} · ${xpValue(c.xp)} · ${goldValue(c.gold)}`, 'Base reward')}</div><div class="table-wrap"><table><thead><tr><th>Image</th><th>Required outfit</th><th>Required units</th><th>Batches</th><th>Factory time</th><th>Level</th></tr></thead><tbody>${reqRows || emptyRow(6, 'No requirements listed.')}</tbody></table></div></div>`;
}

function renderProfile() {
  const l = levelLimit(userData.level);
  document.getElementById('profileLevelInfo').innerHTML = l ? `<div class="ok-box"><h3>Level ${l.level} limits/rewards</h3><div class="mini-grid">${metric('Workers / factories', l.workers, 'f')}${metric('Shelves / counters', l.counters, 'co')}${metric('Mannequins', l.mannequins, 'm')}${metric('Cash desks', l.cashdesks, 'ca')}${metric('Dressing rooms', l.changingrooms, 'cr')}${metric('Store size / i', l.storeSize, 'i')}${metric('Cash reward', money(l.rewardCash), 'ch')}${metric('Gold reward', goldValue(l.rewardGold), 'g')}</div></div>` : '<div class="empty">No level data found.</div>';
}

function renderLabels() {
  let items = DATA.clothes.map(i => ({ ...adjusted(i, true), nextInfo: nextLabelInfo(i) }));
  const q = userData.labelSearch.trim().toLowerCase();
  if (q) items = items.filter(i => filterText(i, q));
  if (userData.labelFamily !== 'all') items = items.filter(i => i.family === userData.labelFamily);
  if (userData.labelSort === 'level') items.sort((a,b)=>a.level-b.level || a.name.localeCompare(b.name));
  else if (userData.labelSort === 'name') items.sort((a,b)=>a.name.localeCompare(b.name));
  else if (userData.labelSort === 'label') items.sort((a,b)=>b.labelLevel-a.labelLevel || a.name.localeCompare(b.name));
  else items.sort((a,b)=>a.nextInfo.remaining-b.nextInfo.remaining || a.level-b.level);
  const totals = labelTotals();
  document.getElementById('labelStats').innerHTML = [stat('Bronze+ Labels', totals.bronze), stat('Silver+ Labels', totals.silver), stat('Gold Labels', totals.gold), stat('Tracked outfits', Object.values(userData.labels).filter(v => Number(v) > 0).length)].join('');
  document.getElementById('labelsBody').innerHTML = items.length ? items.map(i => {
    const points = Number(userData.labels[i.id] || 0);
    const info = nextLabelInfo(i);
    return `<tr><td>${iconCell(i)}</td><td class="dish-name">${escapeHtml(i.name)}<div class="dish-type-tag">${escapeHtml(i.category)}</div></td><td>${i.level}</td><td><input class="label-points" data-id="${i.id}" type="number" min="0" value="${points}"></td><td><span class="tag ${i.labelLevel >= 3 ? 'good' : i.labelLevel ? 'warn' : ''}">${labelName(i.labelLevel)}</span></td><td>${fmt(labelThreshold(i,1))}</td><td>${fmt(labelThreshold(i,2))}</td><td>${fmt(labelThreshold(i,3))}</td><td><strong>${info.next}</strong><div class="dish-type-tag">${fmt(info.remaining)} remaining</div><div class="progress"><span style="width:${info.pct}%"></span></div></td></tr>`;
  }).join('') : emptyRow(9, 'No outfits match this search.');
}

function availableItems(useLabels) {
  return DATA.clothes
    .filter(i => i.level <= Number(userData.level || 0))
    .filter(i => userData.patternMode === 'all' || i.patternGold <= 0)
    .filter(i => i.productionCostGold <= 0)
    .map(i => adjusted(i, useLabels && userData.useLabels));
}
function adjusted(item, useLabels) {
  let units = item.production;
  let xp = item.xp;
  const level = useLabels ? labelLevel(item) : 0;
  if (level >= 1) units = Math.ceil(units * LABEL_BONUS_PIECES);
  if (level >= 2) xp = Math.ceil(xp * LABEL_BONUS_XP);
  const revenue = units * item.incomePerUnit;
  const profit = revenue - item.productionCostCash;
  return { ...item, adjUnits: units, adjXp: xp, adjRevenue: revenue, adjProfit: profit, adjProfitPerMin: item.duration ? profit/item.duration : 0, adjXpPerMin: item.duration ? xp/item.duration : 0, adjUnitsPerMin: item.duration ? units/item.duration : 0, labelLevel: level };
}
function labelThreshold(item, level) {
  if (!item || !item.duration) return 0;
  const hours = item.duration / 60;
  const rate = Math.round(25 / (hours + 2));
  return Math.max(1, Math.round(rate * LABEL_DAYS[level] * Math.max(1, Number(userData.labelSlots || 4))));
}
function labelLevel(item) {
  const points = Number(userData.labels[item.id] || 0);
  if (points >= labelThreshold(item, 3)) return 3;
  if (points >= labelThreshold(item, 2)) return 2;
  if (points >= labelThreshold(item, 1)) return 1;
  return 0;
}
function labelName(level) { return ['None','Bronze','Silver','Gold'][level] || 'None'; }
function nextLabelInfo(item) {
  const current = labelLevel(item);
  const points = Number(userData.labels[item.id] || 0);
  if (current >= 3) return { current, targetLevel: 0, next: 'Complete', remaining: 0, pct: 100 };
  const targetLevel = current + 1;
  const target = labelThreshold(item, targetLevel);
  return { current, targetLevel, next: labelName(targetLevel), remaining: Math.max(0, target - points), pct: Math.min(100, target ? points / target * 100 : 0) };
}
function labelTotals() {
  return DATA.clothes.reduce((acc, i) => { const l = labelLevel(i); if (l >= 1) acc.bronze++; if (l >= 2) acc.silver++; if (l >= 3) acc.gold++; return acc; }, { bronze: 0, silver: 0, gold: 0 });
}

function top(items, key, count) { return [...items].filter(i => Number.isFinite(Number(i[key]))).sort((a,b)=>Number(b[key])-Number(a[key]) || a.level-b.level || a.name.localeCompare(b.name)).slice(0,count); }
function sortItems(items, sortKey) {
  const config = {
    levelAsc:['level',1], levelDesc:['level',-1], nameAsc:['name',1], nameDesc:['name',-1], durationAsc:['duration',1], durationDesc:['duration',-1],
    profitDesc:['effectiveProfit',-1], profitAsc:['effectiveProfit',1], xpDesc:['effectiveXp',-1], xpAsc:['effectiveXp',1],
    profitPerMinDesc:['effectiveProfitPerMin',-1], profitPerMinAsc:['effectiveProfitPerMin',1], xpPerMinDesc:['effectiveXpPerMin',-1], xpPerMinAsc:['effectiveXpPerMin',1],
    unitsDesc:['effectiveUnits',-1], unitsAsc:['effectiveUnits',1], unitsPerMinDesc:['effectiveUnitsPerMin',-1], unitsPerMinAsc:['effectiveUnitsPerMin',1]
  }[sortKey] || ['level',1];
  const [key, dir] = config;
  return [...items].sort((a,b) => {
    const av = sortValue(a, key), bv = sortValue(b, key);
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    if (Number(av) === Number(bv)) return a.name.localeCompare(b.name);
    return (Number(av) - Number(bv)) * dir;
  });
}
function sortValue(item, key) {
  if (key === 'effectiveProfit') return item.adjProfit ?? item.profit;
  if (key === 'effectiveXp') return item.adjXp ?? item.xp;
  if (key === 'effectiveUnits') return item.adjUnits ?? item.production;
  if (key === 'effectiveProfitPerMin') return item.adjProfitPerMin ?? item.profitPerMin;
  if (key === 'effectiveXpPerMin') return item.adjXpPerMin ?? item.xpPerMin;
  if (key === 'effectiveUnitsPerMin') return item.adjUnitsPerMin ?? item.unitsPerMin;
  return item[key];
}
function filterText(i, q) { return `${i.id} ${i.key} ${i.name} ${i.family} ${i.category} ${i.genderName}`.toLowerCase().includes(q); }
function uniqueBy(arr, fn) { const seen = new Set(); return arr.filter(x => { const k = fn(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
function levelLimit(level) { let row = DATA.levels[0] || fallbackLevelLimits(level || 1)[0]; for (const l of DATA.levels) if (l.level <= level) row = l; return row; }
function effectiveWorkers() { return Math.max(1, Number(userData.workersOverride || userData.workers || levelLimit(userData.level)?.workers || 1)); }

function itemSummaryRow(i, label, rowClass) {
  return `<tr class="${rowClass}"><td>${iconCell(i)}</td><td>${escapeHtml(label)}</td><td class="dish-name">${escapeHtml(i.name)}</td><td>${i.level}</td><td>${metricStack('xp.png', 'XP', i.adjXp, i.adjXpPerMin)}</td><td>${metricStack('fashiondollars.png', 'Fashiondollars', i.adjProfit, i.adjProfitPerMin)}</td><td>${unitMetricStack(i.adjUnits, i.adjUnitsPerMin)}</td><td>${timeFmt(i.duration)}</td><td>${escapeHtml(i.category)}</td></tr>`;
}
function metricRow(i, label, metric, rowClass) {
  if (metric === 'xp') return `<tr class="${rowClass}"><td>${iconCell(i)}</td><td>${escapeHtml(label)}</td><td class="dish-name">${escapeHtml(i.name)}</td><td>${i.level}</td><td>${metricStack('xp.png', 'XP', i.adjXp, i.adjXpPerMin)}</td><td>${timeFmt(i.duration)}</td><td>${escapeHtml(i.category)}</td></tr>`;
  if (metric === 'profit') return `<tr class="${rowClass}"><td>${iconCell(i)}</td><td>${escapeHtml(label)}</td><td class="dish-name">${escapeHtml(i.name)}</td><td>${i.level}</td><td>${metricStack('fashiondollars.png', 'Fashiondollars', i.adjProfit, i.adjProfitPerMin)}</td><td>${timeFmt(i.duration)}</td><td>${escapeHtml(i.category)}</td></tr>`;
  return `<tr class="${rowClass}"><td>${iconCell(i)}</td><td>${escapeHtml(label)}</td><td class="dish-name">${escapeHtml(i.name)}</td><td>${i.level}</td><td>${unitMetricStack(i.adjUnits, i.adjUnitsPerMin)}</td><td>${timeFmt(i.duration)}</td><td>${escapeHtml(i.category)}</td></tr>`;
}
function metricStack(file, alt, value, perMin) {
  return `<div class="metric-stack"><span>${currencyIcon(file, alt)}<strong>${fmt(value)}</strong></span><small>${decimal(perMin)}/min</small></div>`;
}
function unitMetricStack(value, perMin) {
  return `<div class="metric-stack"><span><strong>${fmt(value)}</strong></span><small>${decimal(perMin)}/min</small></div>`;
}
function decimal(n) { return Number(n || 0).toFixed(2); }
function iconCell(i) {
  if (!i || !i.key) return '<div class="missing-img">No icon</div>';
  const candidates = iconCandidates(i.key);
  return `<img class="dish-img cloth-icon" src="${candidates[0]}" data-icons='${JSON.stringify(candidates)}' data-index="0" alt="${escapeAttr(i.name)}">`;
}
function iconCandidates(key) {
  const names = [`Basic_Clothes_${key}`, key, key.toLowerCase(), `cloth_${key.toLowerCase()}`];
  const exts = ['png','webp','jpg','jpeg','gif'];
  const out = [];
  for (const dir of ICON_DIRS) for (const name of names) for (const ext of exts) out.push(`${dir}/${name}.${ext}`);
  return out;
}
function emptyRow(cols, text) { return `<tr><td colspan="${cols}" class="empty">${escapeHtml(text)}</td></tr>`; }
function stat(label, value) { return `<div class="stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`; }
function metric(label, value, note='') { return `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`; }
function price(cash, gold) { return `${cash ? money(cash) : ''}${cash && gold ? ' + ' : ''}${gold ? goldValue(gold) : cash ? '' : 'Free'}`; }
function productionCost(i) { return `${money(i.productionCostCash || 0)}${i.productionCostGold ? ` + ${goldValue(i.productionCostGold)}` : ''}`; }
function costRevenueStack(i) { return `<div class="metric-stack cost-revenue-stack"><span>${productionCost(i)}</span><small>${money(i.adjRevenue)}</small></div>`; }
function familyClass(family) { return family === 'Shoes' ? 'soup' : family === 'Accessories' ? 'salad' : 'main'; }
function timeBucket(minutes) { if (minutes <= 10) return 'active'; if (minutes <= 60) return 'fast'; if (minutes <= 180) return 'short'; if (minutes <= 360) return 'medium'; if (minutes <= 720) return 'long'; if (minutes <= 1380) return 'veryLong'; return 'dayOff'; }
function fmt(n) { return Math.round(Number(n || 0)).toLocaleString(); }
function currencyIcon(file, alt, cls='tiny-stat-icon') { return `<img src="${file}" alt="${alt}" class="${cls}" onerror="this.style.display='none'">`; }
function valueWithIcon(file, alt, value) { return `<span class="value-with-icon">${currencyIcon(file, alt)}<span>${escapeHtml(value)}</span></span>`; }
function money(n) { return valueWithIcon('fashiondollars.png', 'Fashiondollars', fmt(n)); }
function xpValue(n) { return valueWithIcon('xp.png', 'XP', fmt(n)); }
function goldValue(n) { return valueWithIcon('goldbuttons.png', 'Gold Buttons', fmt(n)); }
function hours(h) { return `${Number(h || 0).toFixed(1)}h`; }
function timeFmt(minutes) { minutes = Math.round(Number(minutes || 0)); if (minutes < 60) return `${minutes} min`; const h = Math.floor(minutes / 60); const m = minutes % 60; return m ? `${h} h ${m} min` : `${h} h`; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#039;'); }

function downloadData() {
  readInputs();
  const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fashiondex-profile.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function loadDataFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      userData = { ...defaultUserData(), ...JSON.parse(reader.result) };
      saveUserData(); syncInputs(); renderAll(); alert('Data loaded successfully.');
    } catch (err) { alert('Could not load this data file.'); }
  };
  reader.readAsText(file);
}

main();
})();
