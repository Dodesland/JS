
/** 
 * PokeClicker - Evolution & HD UI Edition
 * - Gen 1 Pokemon XP & Evolution
 * - Advanced Views & Fixed Dashboard
 * - Pokemon Detail Modal
 */

const state = {
    score: 0,
    coins: 0,
    clickPower: 1,
    multiplier: 1,
    autoIncome: 0,
    level: 1,
    xp: 0,
    effects: [],
    quests: [],
    inventory: [],
    log: [],
    activeEvents: [],
    lastTick: Date.now(),
    pokemonCollection: [], // Stores instances with { id, uid, exp, level, baseId }
    team: [null, null, null, null, null, null],
    gachaPrice: 500,
    dbInitialized: false
};

let POKEMON_DB = []; // Complete DB from API
const BONUS_TYPES = ["CLICK_MULT", "COIN_MULT", "XP_MULT", "CLICK_POWER", "AUTO_INCOME", "GLOBAL_MULT"];

// --- DATA INITIALIZATION ---
async function initPokeData() {
    try {
        // Fetch base 151
        const response = await fetch("https://pokeapi.co/api/v2/pokemon?limit=151");
        const listData = await response.json();

        // Fetch species to check for base forms and evolution
        const speciesPromises = listData.results.map((_, i) => fetch(`https://pokeapi.co/api/v2/pokemon-species/${i + 1}/`).then(r => r.json()));
        const speciesData = await Promise.all(speciesPromises);

        POKEMON_DB = speciesData.map((species, index) => {
            const id = index + 1;
            const evolutionChain = species.evolution_chain.url;

            // Basic Rarity/Bonus logic
            let rarity = "C";
            if ([144, 145, 146, 150, 151].includes(id)) rarity = "L";
            else if ([3, 6, 9, 38, 59, 65, 68, 94, 130, 143, 149].includes(id)) rarity = "E";
            else if (id % 10 === 0) rarity = "R";
            else if (id % 5 === 0) rarity = "U";

            const bonusType = BONUS_TYPES[id % BONUS_TYPES.length];
            return {
                id,
                name: species.name.charAt(0).toUpperCase() + species.name.slice(1),
                sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
                rarity,
                isBase: species.evolves_from_species === null,
                bonusType,
                evolutionChainUrl: evolutionChain,
                description: species.flavor_text_entries.find(e => e.language.name === 'en')?.flavor_text.replace(/\f/g, ' ') || "A mysterious Pokemon."
            };
        });

        state.dbInitialized = true;
        logMessage(state, "Pokedex Online. Gen 1 Loaded.");
        render(state);
    } catch (e) {
        console.error("Initialization Failed", e);
        logMessage(state, "System Error: PokeAPI unavailable.");
    }
}

// --- UTILS ---
const $ = s => document.querySelector(s);
const formatNumber = n => Math.floor(n).toLocaleString("fr-FR");
function logMessage(s, msg) {
    const time = new Date().toLocaleTimeString();
    s.log.unshift(`[${time}] ${msg}`);
    if (s.log.length > 10) s.log.pop();
}

// --- CALCULATION ENGINE ---
function calculateTeamBonuses(s) {
    const b = { CLICK_MULT: 1, COIN_MULT: 1, XP_MULT: 1, CLICK_POWER: 0, AUTO_INCOME: 0, GLOBAL_MULT: 1 };
    s.team.forEach(p => {
        if (!p) return;
        const db = POKEMON_DB.find(d => d.id === p.id);
        const levelFactor = 1 + (p.level * 0.1); // 10% more bonus per level
        if (["CLICK_POWER", "AUTO_INCOME"].includes(db.bonusType)) b[db.bonusType] += (db.id / 2) * levelFactor;
        else b[db.bonusType] *= (1.1 + (db.id / 1000)) * levelFactor;
    });
    return b;
}

function calculatePower(s) {
    const t = calculateTeamBonuses(s);
    const eff = s.effects.reduce((acc, e) => acc * e.value, 1);
    const click = (s.clickPower + t.CLICK_POWER) * s.multiplier * eff * t.CLICK_MULT * t.GLOBAL_MULT;
    const income = (s.autoIncome + t.AUTO_INCOME) * s.multiplier * t.COIN_MULT * t.GLOBAL_MULT;
    return { click, income, team: t };
}

// --- PROGRESSION ---
function applyGain(s, amount) {
    const power = calculatePower(s);
    s.score += amount;
    s.coins += amount;
    s.xp += amount * power.team.XP_MULT * power.team.GLOBAL_MULT;

    // Distribute XP to Team
    s.team.forEach(p => { if (p) givePokemonXP(p, amount / 10); });

    tryLevelUp(s);
}

function givePokemonXP(p, amount) {
    p.exp += amount;
    const needed = p.level * 500;
    if (p.exp >= needed) {
        p.exp -= needed;
        p.level++;
        logMessage(state, `${POKEMON_DB.find(d => d.id === p.id).name} leveled up to ${p.level}!`);
        checkEvolution(p);
    }
}

async function checkEvolution(p) {
    const db = POKEMON_DB.find(d => d.id === p.id);
    try {
        const res = await fetch(db.evolutionChainUrl);
        const data = await res.json();

        // Find next stage in chain
        let current = data.chain;
        while (current && current.species.name !== db.name.toLowerCase()) {
            current = current.evolves_to[0]; // Simplified: Gen 1 mostly linear
        }

        if (current && current.evolves_to.length > 0) {
            const evo = current.evolves_to[0];
            const minLevel = evo.evolution_details[0]?.min_level || 16; // Fallback to 16

            if (p.level >= minLevel) {
                const nextDb = POKEMON_DB.find(d => d.name.toLowerCase() === evo.species.name);
                if (nextDb) {
                    logMessage(state, `WHAT? ${db.name} is evolving into ${nextDb.name}!`);
                    p.id = nextDb.id;
                    render(state);
                }
            }
        }
    } catch (e) { console.error("Evolution fetch failed", e); }
}

function tryLevelUp(s) {
    while (s.xp >= (100 * s.level)) {
        s.xp -= (100 * s.level);
        s.level++;
        s.clickPower++; s.multiplier += 0.05;
        logMessage(s, `Trainer Level Up! Now level ${s.level}.`);
    }
}

// --- INTERACTIVE ---
function switchView(viewId) {
    document.querySelectorAll(".pokedex-view").forEach(v => v.classList.add("hidden"));
    $(`#${viewId}`).classList.remove("hidden");
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.getAttribute("onclick").includes(viewId)));
}
window.switchView = switchView;

function openPokeDetails(uid) {
    const p = state.pokemonCollection.find(pc => pc.uid == uid);
    if (!p) return;
    const db = POKEMON_DB.find(d => d.id === p.id);

    $("#modal-content").innerHTML = `
        <div style="text-align:center;">
            <img src="${db.sprite}" style="width:150px; image-rendering:pixelated;">
            <h2 style="color:var(--poke-red)">${db.name} (LVL ${p.level})</h2>
            <p style="font-style:italic; border-bottom:2px solid #ccc; padding:10px;">"${db.description}"</p>
            <div style="text-align:left; padding:10px;">
                <strong>Bonus:</strong> ${db.bonusType} (+${Math.floor((p.level * 0.1) * 100)}%)<br>
                <strong>XP:</strong> ${Math.floor(p.exp)} / ${p.level * 500}<br>
                <strong>Rarity:</strong> ${db.rarity}
            </div>
        </div>
    `;
    $("#modal-overlay").classList.remove("hidden");
}
window.openPokeDetails = openPokeDetails;

function pullGacha(s) {
    if (!s.dbInitialized) return;
    if (s.coins < s.gachaPrice) return logMessage(s, "Need more coins!");

    // Only base forms and ones we DON'T have
    const pool = POKEMON_DB.filter(d => d.isBase && !s.pokemonCollection.some(pc => pc.id === d.id));
    if (pool.length === 0) return logMessage(s, "All base forms collected!");

    s.coins -= s.gachaPrice;
    s.gachaPrice = Math.ceil(s.gachaPrice * 1.5);

    const pulled = pool[Math.floor(Math.random() * pool.length)];
    s.pokemonCollection.push({ id: pulled.id, uid: Date.now(), exp: 0, level: 1 });
    logMessage(s, `New Discovery: ${pulled.name}!`);
    render(s);
}

// --- RENDERING ---
function render(s) {
    const pwr = calculatePower(s);
    $("#score").textContent = formatNumber(s.score);
    $("#coins").textContent = formatNumber(s.coins);
    $("#clickPower").textContent = formatNumber(pwr.click);
    $("#multiplier").textContent = pwr.team.COIN_MULT.toFixed(2);
    $("#autoIncome").textContent = formatNumber(pwr.income);
    $("#gachaPrice").textContent = s.gachaPrice;
    $("#levelXp").textContent = `${s.level} (${Math.floor((s.xp / (100 * s.level)) * 100)}%)`;
    $("#effects").textContent = s.effects.map(e => `[${e.type} x${e.value} ${(e.expiresAt - Date.now()) / 1000 | 0}s]`).join(" ");
    $("#log").innerHTML = s.log.map(l => `<div>${l}</div>`).join("");

    renderSlots(s);
    renderDeck(s);
    renderShop(s);
    renderQuests(s);
    renderInventory(s);
    renderEventIcons(s);
}

function renderSlots(s) {
    document.querySelectorAll(".team-slot").forEach((slot, i) => {
        const p = s.team[i];
        if (!p) {
            slot.innerHTML = `<div class="center-btn"></div><small style="z-index:2; font-size:6px; margin-top:40px;">Empty</small>`;
            slot.onclick = null;
            return;
        }
        const db = POKEMON_DB.find(d => d.id === p.id);
        const xpPerc = (p.exp / (p.level * 500)) * 100;
        slot.innerHTML = `
            <div class="center-btn"></div>
            <img src="${db.sprite}" class="poke-sprite">
            <div class="level-tag">LVL ${p.level}</div>
            <div class="xp-container"><div class="xp-bar" style="width:${xpPerc}%"></div></div>
        `;
        slot.onclick = (e) => { e.stopPropagation(); s.team[i] = null; render(s); };
    });
}

function renderDeck(s) {
    const container = $("#pokemon-collection");
    if (!container) return;
    container.innerHTML = s.pokemonCollection.map(p => {
        const db = POKEMON_DB.find(d => d.id === p.id);
        const inTeam = s.team.some(t => t && t.uid === p.uid);
        return `<div class="collection-item rarity-${db.rarity}" style="${inTeam ? 'opacity:0.4' : ''}" 
                 onclick="window.handleDeckClick(${p.uid})">
                 <img src="${db.sprite}" class="peek-sprite">
                 <div style="font-size:6px; margin-top:5px;">${db.name}</div>
                 <button class="btn-3d" onclick="event.stopPropagation(); window.openPokeDetails(${p.uid})" style="font-size:6px; padding:4px; margin-top:5px;">Info</button>
               </div>`;
    }).join("");
}

function renderShop(s) {
    const ITEMS = [{ id: "click", n: "Protein", c: 20 }, { id: "auto", n: "EXP Share", c: 50 }, { id: "macho", n: "Macho Brace", c: 150 }];
    $("#shop").innerHTML = ITEMS.map(i => {
        const cost = Math.ceil(i.c * 1.5);
        return `<div class="shop-item" style="padding:10px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:10px;">${i.n}</span>
            <button class="btn-3d" onclick="window.buyItem('${i.id}', ${cost})" ${s.coins < cost ? "disabled" : ""} style="padding:6px 12px;">${cost}¥</button>
        </div>`;
    }).join("");
}

function renderQuests(s) {
    $("#quests").innerHTML = s.quests.map(q => `<div class="quest"><span>${q.title}</span> <button class="btn-3d" onclick="window.claimQuest(${q.id})">Claim</button></div>`).join("");
}

function renderInventory(s) {
    $("#inventory").innerHTML = s.inventory.map(i => `<div class="inv-item" onclick="window.useItem(${i.uid})">${i.name} x${i.count}</div>`).join("");
}

function renderEventIcons(s) {
    $("#event-icons").innerHTML = s.activeEvents.map(e => `<div class="event-icon" style="font-size:20px;">${e.icon}</div>`).join("");
}

// --- GLOBALS ---
window.togglePower = () => {
    $("#pokedex-case").classList.toggle("pokedex-off");
    logMessage(state, "Pokedex status: " + ($("#pokedex-case").classList.contains("pokedex-off") ? "OFF" : "ON"));
};
window.handleDeckClick = (uid) => {
    const p = state.pokemonCollection.find(pc => pc.uid == uid);
    const empty = state.team.findIndex(t => t === null);
    if (empty !== -1 && !state.team.some(t => t && t.uid === uid)) {
        state.team[empty] = p;
        render(state);
    }
};
window.buyItem = (id, cost) => { if (state.coins >= cost) { state.coins -= cost; render(state); } };
window.useItem = (uid) => { /* Item usage logic */ };
window.claimQuest = (id) => { /* Quest logic */ };

// --- RED PATROL (Responsive Loop) ---
let redPos = { x: 0, y: 0, dir: 'down', frame: 0 };
let pathIndex = 0;

function initRed() {
    const el = $("#red-character");
    if (!el) return;

    // --- MASTERCLASS PATH (Nudged to 43%) ---
    const RED_PATH = [
        { px: 43, py: -10 },
        { px: 43, py: 45 },
        { px: 70, py: 45 },
        { px: 43, py: 45 },
        { px: 27, py: 45 },
        { px: 27, py: 80 },
        { px: 52, py: 80 },
        { px: 52, py: 90 },
        { px: 72, py: 90 },
        { px: 52, py: 90 },
        { px: 52, py: 80 },
        { px: 27, py: 80 },
        { px: 27, py: 45 },
        { px: 43, py: 45 }
    ];

    // Initial position
    const imgW = window.innerWidth - 320;
    redPos.x = imgW * (RED_PATH[0].px / 100);
    redPos.y = window.innerHeight * (RED_PATH[0].py / 100);

    setInterval(() => {
        const currentImgW = window.innerWidth - 320;
        const targetPct = RED_PATH[pathIndex];
        const tx = currentImgW * (targetPct.px / 100);
        const ty = window.innerHeight * (targetPct.py / 100);

        const dx = tx - redPos.x;
        const dy = ty - redPos.y;

        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
            pathIndex = (pathIndex + 1) % RED_PATH.length;
            return;
        }

        const speed = 4;

        // Orthogonal Movement
        if (Math.abs(dx) > 5) {
            redPos.x += Math.sign(dx) * speed;
            redPos.dir = dx > 0 ? 'right' : 'left';
        } else if (Math.abs(dy) > 5) {
            redPos.y += Math.sign(dy) * speed;
            redPos.dir = dy > 0 ? 'down' : 'up';
        }

        el.style.left = redPos.x + "px";
        el.style.top = redPos.y + "px";
    }, 40);
}

// --- ENGINE ---
function tick() {
    const now = Date.now();
    state.effects = state.effects.filter(e => e.expiresAt > now);
    state.activeEvents = state.activeEvents.filter(e => e.expiresAt > now);
    const pwr = calculatePower(state);
    if (pwr.income > 0) applyGain(state, pwr.income);
    updateQuestProgress(state, { type: "COINS" });
    render(state);
}

const save = () => localStorage.setItem("clicker_save", JSON.stringify(state));
const load = () => {
    const raw = localStorage.getItem("clicker_save");
    if (raw) Object.assign(state, JSON.parse(raw));
    initPokeData();
};

document.addEventListener("DOMContentLoaded", () => {
    load();
    initRed();
    $("#clickBtn").onclick = () => { applyGain(state, calculatePower(state).click); render(state); };
    $("#gachaBtn").onclick = () => pullGacha(state);
    $("#saveBtn").onclick = save;
    $("#close-modal").onclick = () => $("#modal-overlay").classList.add("hidden");
    $("#debugBtn").onclick = () => { state.coins += 100000; render(state); };
    setInterval(tick, 1000);
});

// Mock for Quest Progress
function updateQuestProgress(s, a) { }
