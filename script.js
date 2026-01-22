
// Initialisation DOM


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
    lastTick: Date.now()
};

const QUEST_DATA = [
    { id: 1, title: "Click Rookie", type: "CLICK", goal: 100, reward: { coins: 100, xp: 50 }, description: "Click 100 times" },
    { id: 2, title: "Big Spender", type: "BUY", goal: 5, reward: { coins: 500, xp: 100 }, description: "Buy 5 upgrades" },
    { id: 3, title: "Capitalist", type: "COINS", goal: 1000, reward: { clickPower: 5 }, description: "Reach 1,000 coins" },
    { id: 4, title: "Buffed Up", type: "EFFECT", goal: 1, reward: { multiplier: 0.5 }, description: "Have an active buff" }
];

const ITEMS_DB = [
    { id: "x_attack", name: "X Attack", type: "CONSUMABLE", effect: { type: "BUFF", buffType: "clickPower", value: 2, duration: 10000 }, rarity: "common" },
    { id: "amulet_coin", name: "Amulet Coin", type: "CONSUMABLE", effect: { type: "BUFF", buffType: "multiplier", value: 2, duration: 15000 }, rarity: "uncommon" },
    { id: "rare_candy", name: "Rare Candy", type: "CONSUMABLE", effect: { type: "BUFF", buffType: "multiplier", value: 3, duration: 8000 }, rarity: "rare" },
    { id: "lucky_egg", name: "Lucky Egg", type: "PASSIVE", effect: { type: "STAT", stat: "multiplier", value: 0.15 }, rarity: "rare" }
];

const $ = s => document.querySelector(s);

function formatNumber(n) {
    return n.toLocaleString("fr-FR");
}

function logMessage(state, msg) {
    const time = new Date().toLocaleTimeString();
    state.log.unshift(`[${time}] ${msg}`);
    if (state.log.length > 10) state.log.pop();
}

// Système d'XP et Niveaux
function xpToNext(level) {
    return 100 * level;
}

function tryLevelUp(state) {
    let leveledUp = false;
    while (state.xp >= xpToNext(state.level)) {
        state.xp -= xpToNext(state.level);
        state.level++;
        // Bonus de niveau
        state.clickPower += 1;
        state.multiplier += 0.05;
        leveledUp = true;
    }
    if (leveledUp) {
        logMessage(state, `Level Up! Now level ${state.level}.`);
    }
}

// Système d'Effets (Buffs)
function addEffect(state, effect) {
    state.effects.push(effect);
    updateQuestProgress(state, { type: "EFFECT" });
    logMessage(state, `Effect started: ${effect.type} (${effect.value}x) for ${effect.duration / 1000}s`);
}

function getMultiplierFromEffects(state) {
    return state.effects.reduce((acc, effect) => acc * effect.value, 1);
}

function cleanupExpiredEffects(state) {
    const now = Date.now();
    state.effects = state.effects.filter(e => e.expiresAt > now);
}

// Événements Aléatoires
const EVENTS = [
    {
        id: "golden",
        name: "Golden Click",
        icon: "🪙",
        chance: 0.5,
        duration: 3000,
        action: (state) => {
            const bonus = state.clickPower * 50;
            state.coins += bonus;
            logMessage(state, `Event: Golden Click! +${bonus} coins.`);
        }
    },
    {
        id: "surge",
        name: "Power Surge",
        icon: "⚡",
        chance: 0.5,
        duration: 5000,
        action: (state) => {
            addEffect(state, {
                id: Date.now(),
                type: "DATA_BUFF",
                value: 2,
                duration: 5000,
                expiresAt: Date.now() + 5000
            });
            logMessage(state, "Event: Power Surge! x2 Multiplier for 5s.");
        }
    }
];

function rollChance(p) {
    return Math.random() < p;
}

function pickRandomEvent() {
    return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

function triggerEvent(state) {
    const event = pickRandomEvent();
    if (event) {
        event.action(state);

        // Add active event for UI icon
        state.activeEvents.push({
            uid: Date.now() + Math.random(),
            icon: event.icon,
            expiresAt: Date.now() + event.duration
        });
    }
}

function renderEventIcons(state) {
    const container = $("#event-icons");
    if (!container) return;

    // Filter out expired ones for rendering
    const now = Date.now();
    const active = state.activeEvents.filter(e => e.expiresAt > now);

    container.innerHTML = active.map(e => {
        const eventDef = EVENTS.find(ed => ed.icon === e.icon);
        const name = eventDef ? eventDef.name : "Event";
        return `
            <div class="event-icon-wrapper">
                <div class="event-icon">${e.icon}</div>
                <div class="event-label">${name}</div>
            </div>
        `;
    }).join("");
}

// Logique des Quêtes
function initQuests(state) {
    // Ajoute seulement les nouvelles quêtes
    QUEST_DATA.forEach(q => {
        if (!state.quests.find(sq => sq.id === q.id)) {
            state.quests.push({ ...q, progress: 0, isCompleted: false, claimed: false });
        }
    });
}

function updateQuestProgress(state, action) {
    state.quests.forEach(q => {
        if (q.isCompleted) return;

        if (q.type === action.type) {
            // Incrément simple pour clic/achat
            if (action.amount) q.progress += action.amount;
            else q.progress++;
        }

        // Vérification spéciale pour les quêtes basées sur les stats
        if (q.type === "COINS" && state.coins >= q.goal) q.progress = state.coins;

        checkQuestCompletion(state, q);
    });
}

function checkQuestCompletion(state, q) {
    if (q.progress >= q.goal && !q.isCompleted) {
        q.isCompleted = true;
        logMessage(state, `Quest Completed: ${q.title}!`);
    }
}

function claimReward(state, questId) {
    const q = state.quests.find(qu => qu.id === questId);
    if (!q || !q.isCompleted || q.claimed) return;

    q.claimed = true;
    if (q.reward.coins) state.coins += q.reward.coins;
    if (q.reward.xp) {
        state.xp += q.reward.xp;
        tryLevelUp(state);
    }
    if (q.reward.clickPower) state.clickPower += q.reward.clickPower;
    if (q.reward.multiplier) state.multiplier += q.reward.multiplier;

    logMessage(state, `Reward Claimed: ${q.title}`);
    render(state);
}

// Logique d'Inventaire
function tryDrop(state) {
    // 5% de chance par tick
    if (Math.random() < 0.05) {
        const itemTemplate = ITEMS_DB[Math.floor(Math.random() * ITEMS_DB.length)];
        addItem(state, itemTemplate);
    }
}

function addItem(state, itemTemplate) {
    // Vérifie si l'objet existe déjà et empile
    const existingItem = state.inventory.find(i => i.id === itemTemplate.id);
    if (existingItem) {
        if (!existingItem.count) existingItem.count = 1;
        existingItem.count++;
        logMessage(state, `Dropped: ${itemTemplate.name} (x${existingItem.count})`);
    } else {
        // Clone et ajoute compteur
        const newItem = { ...itemTemplate, uid: Date.now() + Math.random(), count: 1 };
        state.inventory.push(newItem);
        logMessage(state, `Dropped: ${newItem.name}`);
    }
}

function useItem(state, itemUid) {
    const idx = state.inventory.findIndex(i => i.uid == itemUid);
    if (idx === -1) return;
    const item = state.inventory[idx];

    if (item.type === "CONSUMABLE") {
        if (item.effect.type === "BUFF") {
            addEffect(state, {
                id: Date.now(),
                type: "ITEM_BUFF",
                value: item.effect.value,
                duration: item.effect.duration,
                expiresAt: Date.now() + item.effect.duration
            });
        }

        // Décrémente la quantité
        if (!item.count) item.count = 1;
        item.count--;

        if (item.count <= 0) {
            state.inventory.splice(idx, 1);
        }

        render(state);
    }
}

function renderQuests(state) {
    const container = $("#quests");
    if (!container) return;

    container.innerHTML = state.quests.map(q => `
    <div class="quest ${q.isCompleted ? 'completed' : ''} ${q.claimed ? 'claimed' : ''}">
      <div><strong>${q.title}</strong>: ${Math.min(q.progress, q.goal)} / ${q.goal}</div>
      ${q.isCompleted && !q.claimed ? `<button onclick="window.claimQuest(${q.id})">Claim</button>` : ''}
      ${q.claimed ? '<span>Done</span>' : ''}
    </div>
  `).join("");
}

function renderInventory(state) {
    const container = $("#inventory");
    if (!container) return;

    container.innerHTML = state.inventory.map(item => `
      <div class="inv-item" onclick="window.useItem(${item.uid})">
        ${item.name} ${item.count > 1 ? `x${item.count}` : ''}
      </div>
    `).join("");
}

// Fonctions globales pour le HTML
window.claimQuest = (id) => claimReward(state, id);
window.useItem = (uid) => useItem(state, uid);

function render(state) {
    $("#score").textContent = formatNumber(state.score);
    $("#coins").textContent = formatNumber(state.coins);
    $("#clickPower").textContent = formatNumber(state.clickPower);
    $("#multiplier").textContent = state.multiplier.toFixed(2);
    $("#autoIncome").textContent = formatNumber(state.autoIncome);
    const xpNeeded = xpToNext(state.level);
    const xpPercent = Math.floor((state.xp / xpNeeded) * 100);
    $("#levelXp").textContent = `${state.level} (${xpPercent}%)`;

    // Affichage des effets
    const effectsList = state.effects.map(e => `[${e.type} x${e.value} ${(e.expiresAt - Date.now()) / 1000 | 0}s]`).join(" ");
    $("#effects").textContent = effectsList;

    // Affichage des logs
    $("#log").innerHTML = state.log.map(l => `<div>${l}</div>`).join("");

    renderShop(state);
    renderQuests(state);
    renderInventory(state);
    renderEventIcons(state);
}

// Pipeline de Clic


function computeClickGain(state) {
    const effectMult = getMultiplierFromEffects(state);
    return state.clickPower * state.multiplier * effectMult;
}

function applyGain(state, amount) {
    state.score += amount;
    state.coins += amount;
    state.xp += amount;
}

function handleClick() {
    const gain = computeClickGain(state);
    applyGain(state, gain);
    updateQuestProgress(state, { type: "CLICK" });
    tryLevelUp(state);
    render(state);
}

document.addEventListener("DOMContentLoaded", () => {
    $("#clickBtn").addEventListener("click", handleClick);
});


// Boutique

const SHOP_ITEMS = [
    {
        id: "click",
        name: "Protein",
        baseCost: 20,
        costGrowth: 1.2,
        owned: 0,
        effect: s => s.clickPower += 1,
        desc: "+1 Click Power"
    },
    {
        id: "auto",
        name: "EXP Share",
        baseCost: 50,
        costGrowth: 1.25,
        owned: 0,
        effect: s => s.autoIncome += 1,
        desc: "+1 Auto ¥/s"
    },
    {
        id: "macho",
        name: "Macho Brace",
        baseCost: 150,
        costGrowth: 1.3,
        owned: 0,
        effect: s => s.multiplier += 0.1,
        desc: "+0.1 Effectiveness"
    },
    {
        id: "iron",
        name: "Iron",
        baseCost: 500,
        costGrowth: 1.4,
        owned: 0,
        effect: s => s.clickPower += 5,
        desc: "+5 Click Power"
    },
    {
        id: "focus_band",
        name: "Focus Band",
        baseCost: 1000,
        costGrowth: 1.5,
        owned: 0,
        effect: s => s.autoIncome += 10,
        desc: "+10 Auto ¥/s"
    }
];

function getItemById(id) {
    return SHOP_ITEMS.find(i => i.id === id);
}

function getItemCost(item) {
    return Math.ceil(item.baseCost * Math.pow(item.costGrowth, item.owned));
}

function canBuy(state, item) {
    return state.coins >= getItemCost(item);
}

function buyItem(state, itemId) {
    const item = getItemById(itemId);
    if (!canBuy(state, item)) return;
    state.coins -= getItemCost(item);
    item.owned++;
    item.effect(state);
    updateQuestProgress(state, { type: "BUY" });
}

function renderShop(state) {
    $("#shop").innerHTML = SHOP_ITEMS.map(item => `
    <div class="shop-item">
      <div><strong>${item.name}</strong></div>
      <div style="font-size: 0.8em; margin-bottom: 5px;">${item.desc}</div>
      <div>Owned: ${item.owned}</div>
      <div>Cost: ${getItemCost(item)}</div>
      <button data-id="${item.id}" ${canBuy(state, item) ? "" : "disabled"}>Buy</button>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    $("#shop").addEventListener("click", e => {
        const btn = e.target.closest("button");
        if (!btn) return;
        buyItem(state, btn.dataset.id);
        render(state);
    });
});


// Boucle de jeu (Tick)

let loop = null;

// Logique de calcul du tick (toutes les 1s)
let lastEventTime = Date.now();

function tickWrapper(state) {
    const now = Date.now();

    // Nettoyage effets
    cleanupExpiredEffects(state);

    // Nettoyage icones events
    const v_now = Date.now();
    state.activeEvents = state.activeEvents.filter(e => e.expiresAt > v_now);

    // Revenus autos
    if (state.autoIncome > 0) {
        applyGain(state, state.autoIncome);
        tryLevelUp(state);
    }

    // Événements (toutes les 10s)
    if (now - lastEventTime > 10000) {
        if (rollChance(0.3)) { // 30% de chance toutes les 10s
            triggerEvent(state);
        }
        lastEventTime = now;
    }

    updateQuestProgress(state, { type: "COINS" }); // Vérification passive
    tryDrop(state);

    render(state);
}

function startGameLoop() {
    if (loop) return;
    loop = setInterval(() => tickWrapper(state), 1000);
}

// Sauvegarde / Chargement
function serializeState(state) {
    return JSON.stringify({
        state: state,
        shop: SHOP_ITEMS.map(i => ({ id: i.id, owned: i.owned }))
    });
}

function hydrateState(raw) {
    try {
        const data = JSON.parse(raw);
        if (!data || !data.state) return;

        // Restauration de l'état
        Object.assign(state, data.state);

        // Vérification des nouveaux champs
        if (!state.quests) state.quests = [];
        if (!state.inventory) state.inventory = [];
        initQuests(state);

        // Restauration de la boutique
        if (data.shop) {
            data.shop.forEach(savedItem => {
                const item = SHOP_ITEMS.find(i => i.id === savedItem.id);
                if (item) item.owned = savedItem.owned;
            });
        }

        logMessage(state, "Game Loaded.");
    } catch (e) {
        console.error("Load failed", e);
        logMessage(state, "Load failed.");
    }
}

function save() {
    localStorage.setItem("clicker_save", serializeState(state));
    logMessage(state, "Game Saved.");
}

function load() {
    const raw = localStorage.getItem("clicker_save");
    if (raw) hydrateState(raw);
    render(state);
}

function reset() {
    localStorage.removeItem("clicker_save");
    location.reload();
}

document.addEventListener("DOMContentLoaded", () => {
    $("#saveBtn").addEventListener("click", save);
    $("#loadBtn").addEventListener("click", load);
    $("#resetBtn").addEventListener("click", reset);

    // Chargement auto
    if (localStorage.getItem("clicker_save")) {
        load();
    }

    render(state);
    startGameLoop();
});
