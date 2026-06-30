// FashionDex for GitHub Pages.
// This app intentionally uses only public repo files:
//   /FashionItems.xml
//   /FashionLevelXp.xml
//   /langs/Fashion_en.xml
//   /clothingicons/... image files

const DATA_PATHS = {
  items: ["FashionItems.xml", "./FashionItems.xml", "data/FashionItems.xml"],
  levels: ["FashionLevelXp.xml", "./FashionLevelXp.xml", "data/FashionLevelXp.xml"],
  lang: ["langs/Fashion_en.xml", "./langs/Fashion_en.xml", "Fashion_en.xml", "data/Fashion_en.xml"]
};

const ICON_DIR = "clothingicons";
const STORAGE_KEY = "fashiondex.githubpages.state.v1";
const LABEL_DAYS = { bronze: 1, silver: 5, gold: 13 };
const LABEL_BONUS_PIECES = 1.05;
const LABEL_BONUS_XP = 1.05;

const FAMILY_BY_SUBTYPE = new Map([
  [0, "Accessories"], [1, "Accessories"], [2, "Accessories"], [3, "Accessories"],
  [10, "Shoes"], [11, "Shoes"],
  [20, "Clothes"], [21, "Clothes"], [22, "Clothes"], [23, "Clothes"], [24, "Clothes"]
]);
const CATEGORY_BY_SUBTYPE = new Map([
  [0, "Jewelry / Scarves"], [1, "Bags"], [2, "Hats"], [3, "Watches"],
  [10, "Shoes"], [11, "Boots"], [20, "Tops"], [21, "Bottoms"],
  [22, "Full body"], [23, "Jackets / Coats"], [24, "Sweaters / Pullovers"]
]);
const GENDER = {0:"Unisex",1:"Female",2:"Male"};

let DATA = null;
let loadInfo = null;
let state = readState();

function readState(){
  const defaults = {
    route: "home",
    theme: localStorage.getItem("fashiondex.theme") || "light",
    fullSearch: "", fullFamily: "all", fullGender: "all", fullSort: "levelAsc", fullLevel: "",
    mySearch: "", myFamily: "all", myGender: "all", mySort: "profitPerMinDesc",
    labelSearch: "", labelFamily: "all", labelSort: "nextAsc",
    coopSearch: "", coopSort: "levelAsc", selectedCoopId: "",
    timeObjective: "profit", timeHours: 8,
    profile: {
      level: 1,
      workersOverride: "",
      includeGoldPatterns: false,
      includePremiumProduction: false,
      labelSlotAssumption: 4
    },
    labels: {},
    ownedPatterns: {}
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return mergeDeep(defaults, saved);
  } catch {
    return defaults;
  }
}
function mergeDeep(base, incoming){
  const out = Array.isArray(base) ? [...base] : {...base};
  for (const [k,v] of Object.entries(incoming || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) out[k] = mergeDeep(base[k], v);
    else out[k] = v;
  }
  return out;
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setTheme(theme){
  state.theme = theme;
  localStorage.setItem("fashiondex.theme", theme);
  document.body.classList.toggle("dark", theme === "dark");
  const b = document.getElementById("themeToggle");
  if (b) b.textContent = theme === "dark" ? "Light" : "Dark";
}

async function boot(){
  setTheme(state.theme);
  try {
    const [items, levels, lang] = await Promise.all([
      loadXml("items", DATA_PATHS.items),
      loadXml("levels", DATA_PATHS.levels),
      loadXml("lang", DATA_PATHS.lang)
    ]);
    loadInfo = { items: items.path, levels: levels.path, lang: lang.path };
    DATA = buildData(items.doc, levels.doc, lang.doc);
    if (!state.selectedCoopId && DATA.coops.length) state.selectedCoopId = String(DATA.coops[0].id);
    render();
  } catch (err) {
    renderLoadError(err);
  }
}

async function loadXml(kind, paths){
  const failures = [];
  for (const path of paths) {
    try {
      const res = await fetch(cacheBust(path), {cache:"no-store"});
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, "application/xml");
      const parserError = doc.querySelector("parsererror");
      if (parserError) throw new Error(`XML parse error in ${path}`);
      return {doc, path};
    } catch (err) {
      failures.push(`${path}: ${err.message}`);
    }
  }
  throw new Error(`Could not load ${kind}. Tried: ${failures.join(" | ")}`);
}
function cacheBust(path){
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}v=${Date.now()}`;
}

function buildData(itemsDoc, levelsDoc, langDoc){
  const lang = parseLang(langDoc);
  const levels = parseLevels(levelsDoc);
  const clothes = [...itemsDoc.querySelectorAll("wod")]
    .filter(el => attr(el,"g") === "Clothes")
    .map(el => normalizeCloth(el, lang.cloth))
    .sort((a,b)=> a.level - b.level || a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
  const clothesById = new Map(clothes.map(c => [c.id, c]));
  const coops = [...itemsDoc.querySelectorAll("wod")]
    .filter(el => attr(el,"g") === "Coop")
    .map(el => normalizeCoop(el, lang.coop, clothesById))
    .sort((a,b)=> a.minLevel - b.minLevel || a.id - b.id);
  return {
    stats: {
      clothesCount: clothes.length,
      coopCount: coops.length,
      levelCount: levels.length,
      maxLevel: levels.length ? Math.max(...levels.map(l=>l.level)) : 0
    },
    clothes, clothesById, coops, levels, lang
  };
}
function parseLang(doc){
  const cloth = {};
  const coop = {titles:{}, descs:{}};
  for (const el of doc.querySelectorAll("cloth > text")) {
    cloth[attr(el,"id")] = attr(el,"name");
  }
  for (const el of doc.querySelectorAll("coopmission > text")) {
    const id = attr(el,"id");
    const name = attr(el,"name");
    const title = id.match(/^coop_title_(.+)$/);
    const desc = id.match(/^coop_desc_(.+)$/);
    if (title) coop.titles[title[1]] = name;
    if (desc) coop.descs[desc[1]] = name;
  }
  return {cloth, coop};
}
function parseLevels(doc){
  return [...doc.querySelectorAll("limit")].map(el => ({
    level: num(el,"l"), counters: num(el,"co"), storeSize: num(el,"i"), workers: num(el,"f"), mannequins: num(el,"m"), cashdesks: num(el,"ca"), changingrooms: num(el,"cr"), rewardCash: num(el,"ch"), rewardGold: num(el,"g")
  })).sort((a,b)=>a.level-b.level);
}
function normalizeCloth(el, names){
  const key = attr(el,"t");
  const langKey = `cloth_${key.toLowerCase()}`;
  const level = num(el,"level");
  const production = num(el,"production");
  const duration = num(el,"duration");
  const incomePerUnit = num(el,"incomePerUnit");
  const productionCostCash = num(el,"productionCostCash");
  const productionCostGold = num(el,"productionCostGold");
  const subtype = num(el,"productSubType");
  const revenue = incomePerUnit * production;
  const profit = revenue - productionCostCash;
  const gender = num(el,"gender");
  const family = FAMILY_BY_SUBTYPE.get(subtype) || "Clothes";
  return {
    id: num(el,"id"),
    n: attr(el,"n"),
    key,
    langKey,
    name: names[langKey] || prettifyKey(key),
    level,
    xp: num(el,"xp"),
    patternCash: num(el,"cash"),
    patternGold: num(el,"gold"),
    friends: num(el,"friends"),
    goldNoFriends: num(el,"goldNoFriends"),
    incomePerUnit,
    production,
    duration,
    durationHours: duration / 60,
    productSubType: subtype,
    category: CATEGORY_BY_SUBTYPE.get(subtype) || `Subtype ${subtype}`,
    family,
    productionCostCash,
    productionCostGold,
    gender,
    genderName: GENDER[gender] || `Gender ${gender}`,
    revenue,
    profit,
    profitPerMin: duration ? profit / duration : 0,
    xpPerMin: duration ? num(el,"xp") / duration : 0,
    unitsPerMin: duration ? production / duration : 0,
    isPremiumProduction: productionCostGold > 0,
    isGoldPattern: num(el,"gold") > 0
  };
}
function normalizeCoop(el, coopLang, clothesById){
  const t = attr(el,"t") || String(num(el,"id"));
  const reqs = parseRequirements(attr(el,"clothes"));
  let factoryMinutes = 0;
  let revenue = 0;
  let productionCashCost = 0;
  let missing = 0;
  const requirements = reqs.map(([clothId, amount]) => {
    const cloth = clothesById.get(clothId);
    if (!cloth) {
      missing += 1;
      return {clothId, amount, missing:true, name:`Unknown #${clothId}`, batches:0, minutes:0, cashCost:0, revenue:0};
    }
    const batches = Math.ceil(amount / Math.max(1, cloth.production));
    const minutes = batches * cloth.duration;
    const cashCost = batches * cloth.productionCostCash;
    const reqRevenue = amount * cloth.incomePerUnit;
    factoryMinutes += minutes;
    productionCashCost += cashCost;
    revenue += reqRevenue;
    return {clothId, amount, missing:false, name:cloth.name, key:cloth.key, family:cloth.family, category:cloth.category, level:cloth.level, batches, minutes, cashCost, revenue:reqRevenue};
  });
  return {
    id: num(el,"id"),
    n: attr(el,"n"),
    key: t,
    title: coopLang.titles[t] || `Co-Op ${t}`,
    description: coopLang.descs[t] || "",
    minLevel: num(el,"minLevel"),
    maxLevel: num(el,"maxLevel"),
    maxMember: num(el,"maxMember"),
    chips: num(el,"chips"),
    xp: num(el,"xp"),
    gold: num(el,"gold"),
    duration: num(el,"duration"),
    durationHours: num(el,"duration") / 60,
    requirements,
    factoryMinutes,
    factoryHours: factoryMinutes / 60,
    revenue,
    productionCashCost,
    missing
  };
}
function parseRequirements(raw){
  return String(raw || "").split("#").filter(Boolean).map(chunk => {
    const [id, amount] = chunk.split("+");
    return [Number(id), Number(amount)];
  }).filter(([id, amount]) => Number.isFinite(id) && Number.isFinite(amount));
}
function attr(el, name, fallback=""){ return el.getAttribute(name) ?? fallback; }
function num(el, name, fallback=0){ const v = Number(el.getAttribute(name)); return Number.isFinite(v) ? v : fallback; }
function prettifyKey(key){ return String(key || "").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/female$/i," Female").replace(/male$/i," Male").trim(); }

function profileLevel(){ return Math.max(0, Number(state.profile.level || 0)); }
function currentLevelLimit(){
  const level = profileLevel();
  let current = DATA.levels[0] || null;
  for (const row of DATA.levels) if (row.level <= level) current = row;
  return current;
}
function workerCount(){
  const override = Number(state.profile.workersOverride || 0);
  if (override > 0) return override;
  const limit = currentLevelLimit();
  return limit ? Math.max(1, Number(limit.workers || 1)) : 1;
}
function availableItems(useLabels=true){
  return DATA.clothes
    .filter(i => i.level <= profileLevel())
    .filter(i => state.profile.includeGoldPatterns || i.patternGold <= 0)
    .filter(i => state.profile.includePremiumProduction || i.productionCostGold <= 0)
    .map(i => adjusted(i, useLabels));
}
function labelThreshold(item, level){
  if (!item || item.duration <= 0) return 0;
  const hours = item.duration / 60;
  const rate = Math.round(25 / (hours + 2));
  const days = level === 1 ? LABEL_DAYS.bronze : level === 2 ? LABEL_DAYS.silver : LABEL_DAYS.gold;
  return Math.max(1, Math.round(rate * days * Number(state.profile.labelSlotAssumption || 4)));
}
function labelLevel(item){
  const points = Number(state.labels[item.id] || 0);
  if (points >= labelThreshold(item, 3)) return 3;
  if (points >= labelThreshold(item, 2)) return 2;
  if (points >= labelThreshold(item, 1)) return 1;
  return 0;
}
function labelName(level){ return ["None","Bronze","Silver","Gold"][level] || "None"; }
function adjusted(item, useLabels=true){
  let units = item.production;
  let xp = item.xp;
  const level = useLabels ? labelLevel(item) : 0;
  if (level >= 1) units = Math.ceil(units * LABEL_BONUS_PIECES);
  if (level >= 2) xp = Math.ceil(xp * LABEL_BONUS_XP);
  const revenue = units * item.incomePerUnit;
  const profit = revenue - item.productionCostCash;
  return {...item, adjUnits: units, adjXp: xp, adjRevenue: revenue, adjProfit: profit, adjProfitPerMin: item.duration ? profit/item.duration : 0, adjXpPerMin: item.duration ? xp/item.duration : 0, adjUnitsPerMin: item.duration ? units/item.duration : 0, labelLevel: level};
}
function nextLabelInfo(item){
  const points = Number(state.labels[item.id] || 0);
  const level = labelLevel(item);
  if (level >= 3) return {level, next:"Complete", target:labelThreshold(item,3), remaining:0, pct:100};
  const targetLevel = level + 1;
  const target = labelThreshold(item, targetLevel);
  return {level, next:labelName(targetLevel), target, remaining:Math.max(0, target-points), pct:Math.min(100, target ? points/target*100 : 0)};
}

function sortItems(items, sortKey){
  const spec = {
    levelAsc:["level",1], levelDesc:["level",-1], nameAsc:["name",1], nameDesc:["name",-1], durationAsc:["duration",1], durationDesc:["duration",-1],
    profitDesc:["adjProfit",-1], profitAsc:["adjProfit",1], xpDesc:["adjXp",-1], xpAsc:["adjXp",1], unitsDesc:["adjUnits",-1], unitsAsc:["adjUnits",1],
    profitPerMinDesc:["adjProfitPerMin",-1], profitPerMinAsc:["adjProfitPerMin",1], xpPerMinDesc:["adjXpPerMin",-1], xpPerMinAsc:["adjXpPerMin",1], unitsPerMinDesc:["adjUnitsPerMin",-1], unitsPerMinAsc:["adjUnitsPerMin",1],
    nextAsc:["labelRemaining",1], labelDesc:["labelLevel",-1]
  }[sortKey] || ["level",1];
  const [key, dir] = spec;
  return [...items].sort((a,b)=>{
    const av = a[key], bv = b[key];
    if (typeof av === "string") return av.localeCompare(bv) * dir;
    if (av === bv) return a.name.localeCompare(b.name);
    return (Number(av) - Number(bv)) * dir;
  });
}
function filterItemText(item, q){ return `${item.id} ${item.key} ${item.name} ${item.family} ${item.category} ${item.genderName}`.toLowerCase().includes(q); }

function setRoute(route){ state.route = route; saveState(); render(); window.scrollTo({top:0,behavior:"smooth"}); }
function render(){
  if (!DATA) return;
  document.querySelectorAll("[data-route]").forEach(btn => btn.classList.toggle("active", btn.dataset.route === state.route));
  const app = document.getElementById("app");
  const view = {
    home: renderHome,
    mydex: renderMyDex,
    full: renderFullDex,
    time: renderMyTime,
    coop: renderCoops,
    profile: renderProfile,
    labels: renderLabels
  }[state.route] || renderHome;
  app.innerHTML = view();
}
function renderLoadError(err){
  const app = document.getElementById("app");
  app.innerHTML = `<section class="card error-box"><h1>FashionDex could not load the repo data.</h1><p>${escapeHtml(err.message)}</p><p>For GitHub Pages, make sure these files exist at the expected paths:</p><ul><li><code>/FashionItems.xml</code></li><li><code>/FashionLevelXp.xml</code></li><li><code>/langs/Fashion_en.xml</code></li><li><code>/clothingicons/...</code> for images</li></ul><p class="small muted">Opening this by double-clicking <code>index.html</code> can fail because browsers block <code>fetch()</code> from local files. Use GitHub Pages or a local server.</p></section>`;
}
function sectionHeader(title, desc=""){
  return `<div class="row between" style="margin-bottom:18px"><div><button class="secondary" data-route="home">← Home</button><h2 style="margin-top:14px">${title}</h2>${desc?`<p>${desc}</p>`:""}</div></div>`;
}
function renderHome(){
  const s = DATA.stats;
  const limit = currentLevelLimit();
  return `<section class="hero">
    <div class="hero-card">
      <div class="eyebrow">Goodgame Fashion helper</div>
      <h1>FashionDex</h1>
      <p>Plan patterns, production time, Co-Ops, profile limits, and Labels using the XML files from this GitHub Pages repository.</p>
      <p class="small muted">Loaded from <code>${escapeHtml(loadInfo.items)}</code>, <code>${escapeHtml(loadInfo.levels)}</code>, and <code>${escapeHtml(loadInfo.lang)}</code>. No private Python scripts are required.</p>
      <div class="mode-grid">
        ${routeCard("mydex","🧵","MyDex","Your unlocked patterns and best options.")}
        ${routeCard("full","📚","Full FashionDex","All clothing products from FashionItems.xml.")}
        ${routeCard("time","⏱️","My Time","What to make with your available workers/time.")}
        ${routeCard("coop","🤝","Co-Op Planner","Clothing requirements, runs, and team time.")}
        ${routeCard("profile","👤","My Profile","Level, worker count, and local settings.")}
        ${routeCard("labels","🏷️","My Labels","Track label progress per outfit.")}
      </div>
    </div>
    <aside class="card">
      <div class="eyebrow">Loaded data</div>
      <h2>Your Fashion repo</h2>
      <div class="stat-grid">
        <div class="stat"><strong>${s.clothesCount}</strong><span>clothing products</span></div>
        <div class="stat"><strong>${s.coopCount}</strong><span>Co-Ops</span></div>
        <div class="stat"><strong>${s.levelCount}</strong><span>level rows</span></div>
        <div class="stat"><strong>${s.maxLevel}</strong><span>max level</span></div>
      </div>
      <div class="ok-box" style="margin-top:16px"><strong>Current profile</strong><p>Level ${profileLevel()} · ${workerCount()} workers/factories${limit ? ` · ${limit.counters} shelves/counters · ${limit.mannequins} mannequins` : ""}</p></div>
    </aside>
  </section>`;
}
function routeCard(route, icon, title, desc){ return `<button class="mode-card" data-route="${route}"><span class="icon">${icon}</span><h3>${title}</h3><p>${desc}</p></button>`; }

function renderFullDex(){
  let items = DATA.clothes.map(i => adjusted(i, false));
  const q = state.fullSearch.trim().toLowerCase();
  if (q) items = items.filter(i => filterItemText(i, q));
  if (state.fullFamily !== "all") items = items.filter(i => i.family === state.fullFamily);
  if (state.fullGender !== "all") items = items.filter(i => String(i.gender) === state.fullGender);
  if (state.fullLevel !== "") items = items.filter(i => i.level <= Number(state.fullLevel));
  items = sortItems(items, state.fullSort);
  return `${sectionHeader("Full FashionDex", "Every clothing product from FashionItems.xml, including locked, gold, and premium-production items.")}
    <section class="card">${itemControls("full")}${itemTable(items, false)}</section>`;
}
function renderMyDex(){
  let items = availableItems(true);
  const q = state.mySearch.trim().toLowerCase();
  if (q) items = items.filter(i => filterItemText(i, q));
  if (state.myFamily !== "all") items = items.filter(i => i.family === state.myFamily);
  if (state.myGender !== "all") items = items.filter(i => String(i.gender) === state.myGender);
  items = sortItems(items, state.mySort);
  const best = bestCards(items);
  return `${sectionHeader("MyDex", "Your currently available Fashion products, adjusted by your Label progress.")}
    <section class="card">${best}<div style="height:14px"></div>${itemControls("my")}${itemTable(items, true)}</section>`;
}
function itemControls(prefix){
  const search = state[`${prefix}Search`] ?? "";
  const family = state[`${prefix}Family`] ?? "all";
  const gender = state[`${prefix}Gender`] ?? "all";
  const sort = state[`${prefix}Sort`] ?? "levelAsc";
  const level = state[`${prefix}Level`] ?? "";
  return `<div class="controls">
    <label class="control">Search<input id="${prefix}Search" value="${escapeAttr(search)}" placeholder="Dress, sweater, 1261..."></label>
    <label class="control">Family<select id="${prefix}Family"><option value="all">All</option>${["Clothes","Shoes","Accessories"].map(v=>`<option value="${v}" ${family===v?"selected":""}>${v}</option>`).join("")}</select></label>
    <label class="control">Gender<select id="${prefix}Gender"><option value="all">All</option><option value="1" ${gender==="1"?"selected":""}>Female</option><option value="2" ${gender==="2"?"selected":""}>Male</option><option value="0" ${gender==="0"?"selected":""}>Unisex</option></select></label>
    <label class="control">Sort${sortSelect(`${prefix}Sort`, sort)}</label>
    ${prefix === "full" ? `<label class="control">Max level<input id="fullLevel" type="number" min="0" max="${DATA.stats.maxLevel}" value="${escapeAttr(level)}" placeholder="${DATA.stats.maxLevel}"></label>` : `<label class="control">Profile level<input value="${profileLevel()}" disabled></label>`}
  </div>`;
}
function sortSelect(id, selected){
  const opts = [
    ["levelAsc","Level: low to high"],["levelDesc","Level: high to low"],["nameAsc","Name A-Z"],["nameDesc","Name Z-A"],["durationAsc","Time: short to long"],["durationDesc","Time: long to short"],
    ["profitPerMinDesc","Profit/min high"],["xpPerMinDesc","XP/min high"],["unitsPerMinDesc","Units/min high"],["profitDesc","Profit/batch high"],["xpDesc","XP/batch high"],["unitsDesc","Units/batch high"]
  ];
  return `<select id="${id}">${opts.map(([v,l])=>`<option value="${v}" ${selected===v?"selected":""}>${l}</option>`).join("")}</select>`;
}
function bestCards(items){
  const pick = key => sortItems(items, `${key}Desc`)[0];
  const profit = pick("profitPerMin"), xp = pick("xpPerMin"), rawProfit = pick("profit"), rawXp = pick("xp");
  return `<div class="mini-grid">
    ${metric("Best profit/min", profit ? profit.name : "—", profit ? `${money(profit.adjProfitPerMin)}/min` : "")}
    ${metric("Best XP/min", xp ? xp.name : "—", xp ? `${xp.adjXpPerMin.toFixed(2)}/min` : "")}
    ${metric("Best profit/batch", rawProfit ? rawProfit.name : "—", rawProfit ? money(rawProfit.adjProfit) : "")}
    ${metric("Best XP/batch", rawXp ? rawXp.name : "—", rawXp ? fmt(rawXp.adjXp) : "")}
  </div>`;
}
function metric(label, value, sub){ return `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong><span>${escapeHtml(sub || "")}</span></div>`; }

function itemTable(items, showLabels){
  if (!items.length) return `<div class="empty">No clothing products match these filters.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Level</th><th>Item</th><th>Type</th><th>Time</th><th>XP</th><th>Units</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Pattern</th>${showLabels?"<th>Label</th>":""}</tr></thead><tbody>
    ${items.map(i => `<tr>
      <td>${i.level}</td>
      <td>${itemCell(i)}</td>
      <td>${badges(i)}</td>
      <td class="nowrap">${timeFmt(i.duration)}</td>
      <td>${fmt(i.adjXp ?? i.xp)}<div class="small muted">${((i.adjXpPerMin ?? i.xpPerMin)||0).toFixed(2)}/min</div></td>
      <td>${fmt(i.adjUnits ?? i.production)}<div class="small muted">${((i.adjUnitsPerMin ?? i.unitsPerMin)||0).toFixed(2)}/min</div></td>
      <td>${money(i.adjRevenue ?? i.revenue)}</td>
      <td>${money(i.productionCostCash)}${i.productionCostGold?`<div class="small muted">+ ${i.productionCostGold} Gold</div>`:""}</td>
      <td>${money(i.adjProfit ?? i.profit)}<div class="small muted">${money(i.adjProfitPerMin ?? i.profitPerMin)}/min</div></td>
      <td>${money(i.patternCash)}${i.patternGold?`<div class="small muted">+ ${i.patternGold} Gold</div>`:""}${i.friends?`<div class="small muted">${i.friends} friends · skip ${i.goldNoFriends} Gold</div>`:""}</td>
      ${showLabels?`<td>${labelBadge(i)}</td>`:""}
    </tr>`).join("")}
  </tbody></table></div>`;
}
function itemCell(i){
  const candidates = iconCandidates(i);
  return `<div class="cloth-cell"><img class="cloth-icon" alt="" src="${escapeAttr(candidates[0])}" data-icons="${escapeAttr(JSON.stringify(candidates))}" data-icon-index="0"><div><div class="item-title">${escapeHtml(i.name)}</div><div class="small muted">#${i.id} · ${escapeHtml(i.key)}</div></div></div>`;
}
function iconCandidates(i){
  const key = encodeURIComponent(i.key);
  const lower = encodeURIComponent(i.key.toLowerCase());
  return [
    `${ICON_DIR}/Basic_Clothes_${key}.png`,
    `${ICON_DIR}/Basic_Clothes_${key}.webp`,
    `${ICON_DIR}/${key}.png`,
    `${ICON_DIR}/${key}.webp`,
    `${ICON_DIR}/${lower}.png`,
    `${ICON_DIR}/${lower}.webp`
  ];
}
function badges(i){
  return `<span class="tag">${escapeHtml(i.family)}</span><span class="tag">${escapeHtml(i.category)}</span><span class="tag">${escapeHtml(i.genderName)}</span>${i.patternGold?`<span class="tag warn">Gold pattern</span>`:""}${i.productionCostGold?`<span class="tag warn">Gold production</span>`:""}`;
}
function labelBadge(i){
  const info = nextLabelInfo(i);
  const points = Number(state.labels[i.id] || 0);
  return `<span class="tag ${info.level>=3?"good":info.level?"warn":""}">${labelName(info.level)}</span><div class="small muted">${fmt(points)} / ${fmt(info.target)} to ${escapeHtml(info.next)}</div><div class="progress" title="${info.pct.toFixed(1)}%"><span style="width:${info.pct}%"></span></div>`;
}

function renderMyTime(){
  const workers = workerCount();
  const hours = Math.max(0, Number(state.timeHours || 0));
  const minutes = hours * 60;
  let items = availableItems(true).filter(i => i.duration > 0);
  const objective = state.timeObjective;
  items = items.map(i => {
    const batchesPerWorker = Math.floor(minutes / i.duration);
    const batches = batchesPerWorker * workers;
    return {...i, planBatches:batches, planMinutes:batchesPerWorker * i.duration, planUnits:batches * i.adjUnits, planXp:batches * i.adjXp, planProfit:batches * i.adjProfit, planRevenue:batches * i.adjRevenue, planCost:batches * i.productionCostCash};
  }).filter(i => i.planBatches > 0);
  const sortKey = objective === "xp" ? "planXp" : objective === "units" ? "planUnits" : objective === "revenue" ? "planRevenue" : "planProfit";
  items.sort((a,b)=> b[sortKey]-a[sortKey] || b.adjProfitPerMin-a.adjProfitPerMin || a.name.localeCompare(b.name));
  return `${sectionHeader("My Time", "Compare what your current workers can produce inside a time window.")}
    <section class="card"><div class="controls">
      <label class="control">Available hours<input id="timeHours" type="number" min="0" step="0.5" value="${escapeAttr(state.timeHours)}"></label>
      <label class="control">Workers/factories<input value="${workers}" disabled></label>
      <label class="control">Goal<select id="timeObjective"><option value="profit" ${objective==="profit"?"selected":""}>Profit</option><option value="xp" ${objective==="xp"?"selected":""}>XP</option><option value="units" ${objective==="units"?"selected":""}>Units</option><option value="revenue" ${objective==="revenue"?"selected":""}>Revenue</option></select></label>
      <label class="control">Profile level<input value="${profileLevel()}" disabled></label>
      <label class="control">Gold filters<input value="${state.profile.includeGoldPatterns || state.profile.includePremiumProduction ? "Included by profile" : "Cash-only by profile"}" disabled></label>
    </div>${timeTable(items.slice(0, 50), workers, hours)}</section>`;
}
function timeTable(items, workers, hours){
  if (!items.length) return `<div class="empty">No available products fit inside ${hours} hours with ${workers} workers.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Time/batch</th><th>Batches</th><th>Units</th><th>XP</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr></thead><tbody>${items.map(i=>`<tr>
    <td>${itemCell(i)}</td><td>${timeFmt(i.duration)}</td><td>${fmt(i.planBatches)}<div class="small muted">${Math.floor(i.planBatches / workers)} per worker</div></td><td>${fmt(i.planUnits)}</td><td>${fmt(i.planXp)}</td><td>${money(i.planRevenue)}</td><td>${money(i.planCost)}</td><td>${money(i.planProfit)}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function renderCoops(){
  let coops = DATA.coops;
  const q = state.coopSearch.trim().toLowerCase();
  if (q) coops = coops.filter(c => `${c.id} ${c.title} ${c.description} ${c.key}`.toLowerCase().includes(q));
  coops = [...coops].sort((a,b)=>{
    const sort = state.coopSort;
    if (sort === "timeDesc") return b.factoryMinutes - a.factoryMinutes || a.id-b.id;
    if (sort === "timeAsc") return a.factoryMinutes - b.factoryMinutes || a.id-b.id;
    if (sort === "rewardDesc") return (b.chips+b.xp+b.gold*1000) - (a.chips+a.xp+a.gold*1000);
    return a.minLevel - b.minLevel || a.id - b.id;
  });
  const selected = DATA.coops.find(c => String(c.id) === String(state.selectedCoopId)) || coops[0] || DATA.coops[0];
  return `${sectionHeader("Co-Op Planner", "Plan Fashion Co-Ops from the public clothing requirements in FashionItems.xml.")}
    <section class="split"><div class="card"><div class="controls">
      <label class="control">Search<input id="coopSearch" value="${escapeAttr(state.coopSearch)}" placeholder="Prom Night, 2101..."></label>
      <label class="control">Sort<select id="coopSort"><option value="levelAsc" ${state.coopSort==="levelAsc"?"selected":""}>Min level</option><option value="timeAsc" ${state.coopSort==="timeAsc"?"selected":""}>Shortest factory time</option><option value="timeDesc" ${state.coopSort==="timeDesc"?"selected":""}>Longest factory time</option><option value="rewardDesc" ${state.coopSort==="rewardDesc"?"selected":""}>Highest reward</option></select></label>
      <label class="control">Workers<input value="${workerCount()}" disabled></label>
      <label class="control">Co-Ops loaded<input value="${DATA.coops.length}" disabled></label>
    </div>${coopList(coops)}</div><aside class="card">${selected ? coopDetail(selected) : `<div class="empty">No Co-Ops found.</div>`}</aside></section>`;
}
function coopList(coops){
  if (!coops.length) return `<div class="empty">No Co-Ops match your search.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Co-Op</th><th>Level</th><th>Participants</th><th>Deadline</th><th>Factory time</th><th>Reward</th></tr></thead><tbody>${coops.map(c=>`<tr class="coop-row" data-coop-id="${c.id}">
    <td><button class="secondary select-coop" data-coop-id="${c.id}">${escapeHtml(c.title)}</button><div class="small muted">#${c.id} · ${escapeHtml(c.description)}</div></td><td>${c.minLevel}–${c.maxLevel || "∞"}</td><td>${c.maxMember || "?"}</td><td>${timeFmt(c.duration)}</td><td>${timeFmt(c.factoryMinutes)}<div class="small muted">Solo est. ${timeFmt(Math.ceil(c.factoryMinutes/workerCount()))}</div></td><td>${money(c.chips)} · ${fmt(c.xp)} XP${c.gold?` · ${c.gold} Gold`:""}</td>
  </tr>`).join("")}</tbody></table></div>`;
}
function coopDetail(c){
  const workers = workerCount();
  const solo = Math.ceil(c.factoryMinutes / workers);
  const goldDeadline = Math.floor(c.duration * .5);
  const silverDeadline = Math.floor(c.duration * .75);
  return `<div class="eyebrow">Selected Co-Op</div><h2>${escapeHtml(c.title)}</h2><p>${escapeHtml(c.description)}</p>
    <div class="mini-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      ${metric("Deadline", timeFmt(c.duration), "Bronze")}
      ${metric("Your solo estimate", timeFmt(solo), `${workers} workers`)}
      ${metric("Gold target", timeFmt(goldDeadline), "planning estimate")}
      ${metric("Silver target", timeFmt(silverDeadline), "planning estimate")}
    </div>
    <h3 style="margin-top:18px">Requirements</h3>
    <div class="table-wrap"><table style="min-width:620px"><thead><tr><th>Clothing</th><th>Need</th><th>Batches</th><th>Factory time</th><th>Cash cost</th></tr></thead><tbody>${c.requirements.map(r=>`<tr><td>${r.missing?escapeHtml(r.name):itemCell(DATA.clothesById.get(r.clothId))}</td><td>${fmt(r.amount)}</td><td>${fmt(r.batches)}</td><td>${timeFmt(r.minutes)}</td><td>${money(r.cashCost)}</td></tr>`).join("")}</tbody></table></div>
    <p class="footer-note">Reward shown from XML: ${money(c.chips)}, ${fmt(c.xp)} XP, ${c.gold} Gold. Gold/Silver deadline labels are planner estimates; actual finish logic should come from the game/server.</p>`;
}

function renderProfile(){
  const limit = currentLevelLimit();
  const exportText = escapeHtml(JSON.stringify({profile:state.profile, labels:state.labels}, null, 2));
  return `${sectionHeader("My Profile", "Your local FashionDex settings. Stored only in this browser.")}
  <section class="split"><div class="card"><h3>Profile settings</h3><div class="controls">
    <label class="control">Level<input id="profileLevel" type="number" min="0" max="${DATA.stats.maxLevel}" value="${escapeAttr(state.profile.level)}"></label>
    <label class="control">Workers override<input id="workersOverride" type="number" min="" placeholder="auto from level" value="${escapeAttr(state.profile.workersOverride)}"></label>
    <label class="control">Label slot assumption<input id="labelSlotAssumption" type="number" min="1" value="${escapeAttr(state.profile.labelSlotAssumption)}"></label>
    <label class="control">Gold patterns<select id="includeGoldPatterns"><option value="false" ${!state.profile.includeGoldPatterns?"selected":""}>Hide</option><option value="true" ${state.profile.includeGoldPatterns?"selected":""}>Include</option></select></label>
    <label class="control">Gold production<select id="includePremiumProduction"><option value="false" ${!state.profile.includePremiumProduction?"selected":""}>Hide</option><option value="true" ${state.profile.includePremiumProduction?"selected":""}>Include</option></select></label>
  </div>
  <div class="section-actions"><button class="primary" id="saveProfile">Save profile</button><button class="secondary" id="resetLocal">Reset local data</button></div>
  ${limit ? levelLimitCard(limit) : `<div class="empty">No level-limit row found.</div>`}
  </div><aside class="card"><h3>Export / import</h3><p>Copy this JSON to move your FashionDex profile and Label points between browsers.</p><label class="control">Profile JSON<textarea id="profileJson">${exportText}</textarea></label><div class="section-actions"><button class="secondary" id="copyProfileJson">Copy</button><button class="primary" id="importProfileJson">Import from box</button></div><p class="footer-note">This does not touch your game account. It is only FashionDex planner data.</p></aside></section>`;
}
function levelLimitCard(l){
  return `<div class="ok-box" style="margin-top:18px"><h3>Level ${l.level} limits/rewards</h3><div class="mini-grid">
    ${metric("Workers / factories", String(l.workers), "f")}
    ${metric("Shelves / counters", String(l.counters), "co")}
    ${metric("Mannequins", String(l.mannequins), "m")}
    ${metric("Cash desks", String(l.cashdesks), "ca")}
    ${metric("Dressing rooms", String(l.changingrooms), "cr")}
    ${metric("Store size / i", String(l.storeSize), "i")}
    ${metric("Cash reward", money(l.rewardCash), "ch")}
    ${metric("Gold reward", `${l.rewardGold} Gold`, "g")}
  </div></div>`;
}

function renderLabels(){
  let items = DATA.clothes.map(i => ({...adjusted(i, true), labelRemaining: nextLabelInfo(i).remaining}));
  const q = state.labelSearch.trim().toLowerCase();
  if (q) items = items.filter(i => filterItemText(i, q));
  if (state.labelFamily !== "all") items = items.filter(i => i.family === state.labelFamily);
  if (state.labelSort === "nextAsc") items = sortItems(items, "nextAsc");
  else if (state.labelSort === "labelDesc") items = sortItems(items, "labelDesc");
  else items = sortItems(items, state.labelSort);
  const totals = labelTotals();
  return `${sectionHeader("My Labels", "Track Fashion Label progress by clothing product. Label math is built into this static planner, not loaded from private scripts.")}
    <section class="card"><div class="mini-grid">
      ${metric("Bronze+ Labels", String(totals.bronze), "+5% pieces")}
      ${metric("Silver+ Labels", String(totals.silver), "+5% XP")}
      ${metric("Gold Labels", String(totals.gold), "completed")}
      ${metric("Tracked products", String(Object.keys(state.labels).filter(k=>Number(state.labels[k])>0).length), "with points")}
    </div><div style="height:16px"></div><div class="controls">
      <label class="control">Search<input id="labelSearch" value="${escapeAttr(state.labelSearch)}" placeholder="Dress, shoes, 1261..."></label>
      <label class="control">Family<select id="labelFamily"><option value="all">All</option>${["Clothes","Shoes","Accessories"].map(v=>`<option value="${v}" ${state.labelFamily===v?"selected":""}>${v}</option>`).join("")}</select></label>
      <label class="control">Sort<select id="labelSort"><option value="nextAsc" ${state.labelSort==="nextAsc"?"selected":""}>Closest next label</option><option value="labelDesc" ${state.labelSort==="labelDesc"?"selected":""}>Highest label</option><option value="levelAsc" ${state.labelSort==="levelAsc"?"selected":""}>Level</option><option value="nameAsc" ${state.labelSort==="nameAsc"?"selected":""}>Name</option></select></label>
      <label class="control">Assumed slots<input value="${state.profile.labelSlotAssumption}" disabled></label>
      <label class="control">Save<input value="Auto-saves" disabled></label>
    </div>${labelsTable(items)}</section>`;
}
function labelsTable(items){
  if (!items.length) return `<div class="empty">No clothing products match your Label filters.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Current points</th><th>Label</th><th>Bronze</th><th>Silver</th><th>Gold</th><th>Next</th></tr></thead><tbody>${items.map(i=>{
    const info = nextLabelInfo(i);
    const points = Number(state.labels[i.id] || 0);
    return `<tr><td>${itemCell(i)}</td><td><input class="number-input label-points" data-cloth-id="${i.id}" type="number" min="0" value="${points}"></td><td><span class="tag ${info.level>=3?"good":info.level?"warn":""}">${labelName(info.level)}</span></td><td>${fmt(labelThreshold(i,1))}</td><td>${fmt(labelThreshold(i,2))}</td><td>${fmt(labelThreshold(i,3))}</td><td><strong>${escapeHtml(info.next)}</strong><div class="small muted">${fmt(info.remaining)} remaining</div><div class="progress"><span style="width:${info.pct}%"></span></div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}
function labelTotals(){
  let bronze = 0, silver = 0, gold = 0;
  for (const item of DATA.clothes) {
    const level = labelLevel(item);
    if (level >= 1) bronze++;
    if (level >= 2) silver++;
    if (level >= 3) gold++;
  }
  return {bronze, silver, gold};
}

function updateFromInput(id, value){
  if (["fullSearch","fullFamily","fullGender","fullSort","fullLevel","mySearch","myFamily","myGender","mySort","labelSearch","labelFamily","labelSort","coopSearch","coopSort","timeObjective","timeHours"].includes(id)) {
    state[id] = value;
  }
  if (id === "profileLevel") state.profile.level = Number(value || 0);
  if (id === "workersOverride") state.profile.workersOverride = value;
  if (id === "labelSlotAssumption") state.profile.labelSlotAssumption = Math.max(1, Number(value || 4));
  if (id === "includeGoldPatterns") state.profile.includeGoldPatterns = value === "true";
  if (id === "includePremiumProduction") state.profile.includePremiumProduction = value === "true";
  saveState();
}

function fmt(n){ return Number(n || 0).toLocaleString(); }
function money(n){ return `${fmt(Math.round(Number(n || 0)))} FD`; }
function timeFmt(minutes){
  minutes = Math.round(Number(minutes || 0));
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function escapeHtml(s){ return String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,"&#039;"); }

// Global event handling.
document.addEventListener("click", async (e) => {
  const routeBtn = e.target.closest("[data-route]");
  if (routeBtn) { setRoute(routeBtn.dataset.route); return; }
  if (e.target.closest("#themeToggle")) { setTheme(state.theme === "dark" ? "light" : "dark"); saveState(); return; }
  if (e.target.closest("#refreshData")) { location.reload(); return; }
  const coopBtn = e.target.closest(".select-coop");
  if (coopBtn) { state.selectedCoopId = coopBtn.dataset.coopId; saveState(); render(); return; }
  if (e.target.closest("#saveProfile")) { saveState(); render(); return; }
  if (e.target.closest("#resetLocal")) {
    if (confirm("Reset local FashionDex profile and Label data?")) { localStorage.removeItem(STORAGE_KEY); state = readState(); render(); }
    return;
  }
  if (e.target.closest("#copyProfileJson")) {
    const box = document.getElementById("profileJson");
    await navigator.clipboard.writeText(box.value);
    e.target.textContent = "Copied";
    setTimeout(()=>{ if (e.target) e.target.textContent = "Copy"; }, 900);
    return;
  }
  if (e.target.closest("#importProfileJson")) {
    try {
      const parsed = JSON.parse(document.getElementById("profileJson").value);
      if (parsed.profile) state.profile = mergeDeep(state.profile, parsed.profile);
      if (parsed.labels) state.labels = parsed.labels;
      saveState(); render();
    } catch (err) { alert(`Could not import JSON: ${err.message}`); }
  }
});
document.addEventListener("input", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  if (target.classList.contains("label-points")) {
    const id = target.dataset.clothId;
    state.labels[id] = Math.max(0, Number(target.value || 0));
    saveState();
    return;
  }
  if (target.id && target.id !== "profileJson") {
    updateFromInput(target.id, target.value);
    if (["fullSearch","mySearch","labelSearch","coopSearch"].includes(target.id)) render();
  }
});
document.addEventListener("change", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  if (target.classList.contains("label-points")) { render(); return; }
  if (target.id && target.id !== "profileJson") { updateFromInput(target.id, target.value); render(); }
});
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("cloth-icon")) return;
  try {
    const candidates = JSON.parse(img.dataset.icons || "[]");
    const idx = Number(img.dataset.iconIndex || 0) + 1;
    if (idx < candidates.length) {
      img.dataset.iconIndex = String(idx);
      img.src = candidates[idx];
    } else {
      img.classList.add("missing");
    }
  } catch { img.classList.add("missing"); }
}, true);

boot();
