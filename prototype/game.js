// Parking Tycoon — Nivel 1: Papeleta
// Prototype v0.8
//   - Day-of-week tracking (Lun-Dom)
//   - Shifts with specific working days (40h/week = 5 days × 8h)
//   - Weekly schedule view in management panel
//   - Employee CARDS at lot bottom when booth is owned
//   - Employee sprites on sidewalk when no booth

// ─── SAVE / LOAD ───────────────────────────────────────────
// Persists S state to localStorage between page reloads.
// Saved at end of day (after the player clicks "DÍA SIGUIENTE").
const SAVE_KEY = 'parking-tycoon-save-v1';

function saveGame() {
    try {
        const data = {
            version: 1,
            timestamp: Date.now(),
            money: S.money,
            day: S.day,
            dayOfWeek: S.dayOfWeek,
            reputation: S.reputation,
            upgrades: S.upgrades,   // includes booth/pos/barriers/entryTotem/exitTotem/etc
            employeeRoster: S.employeeRoster,
            subscriptions: S.subscriptions,
            lifetimeServed: S.lifetimeServed,
            lifetimeRevenue: S.lifetimeRevenue,
            lifetimeSalaries: S.lifetimeSalaries,
            lifetimeAngry: S.lifetimeAngry,
            lifetimeEscaped: S.lifetimeEscaped,
            consecutiveNegDays: S.consecutiveNegDays,
            cinematicShown: S.cinematicShown,
            branchLots: S.branchLots,
            rivalActive: S.rivalActive,
            rivalUntilDay: S.rivalUntilDay,
            dailyStatsHistory: S.dailyStatsHistory,
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return true;
    } catch (e) {
        console.warn('[save] failed:', e);
        return false;
    }
}

function peekSave() {
    // Returns metadata without applying — used by splash to decide which buttons to show.
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.version !== 1) return null;
        return { day: data.day, money: data.money, timestamp: data.timestamp };
    } catch (e) {
        return null;
    }
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (data.version !== 1) return false;
        S.money = data.money;
        S.day = data.day;
        S.dayOfWeek = data.dayOfWeek;
        S.reputation = data.reputation;
        // Merge upgrades carefully — newer schema fields default false/0 if missing
        S.upgrades = Object.assign({
            booth: false, pos: false, barriers: false, entryTotem: false, exitTotem: false,
            parkingApp: false, valetAI: false, multiLevel: false, drone: false, spaceport: false,
            adScreens: 0, signs: 0, expansions: 0, convenios: [],
            cameras: false, carwash: false, evCharger: false,
            pavement: false, lines: false, lights: false, guard: false, greenery: false,
        }, data.upgrades || {});
        S.employeeRoster = data.employeeRoster || [];
        S.subscriptions = data.subscriptions || [];
        S.lifetimeServed = data.lifetimeServed || 0;
        S.lifetimeRevenue = data.lifetimeRevenue || 0;
        S.lifetimeSalaries = data.lifetimeSalaries || 0;
        S.lifetimeAngry = data.lifetimeAngry || 0;
        S.lifetimeEscaped = data.lifetimeEscaped || 0;
        S.consecutiveNegDays = data.consecutiveNegDays || 0;
        S.cinematicShown = !!data.cinematicShown;
        S.branchLots = data.branchLots || [];
        S.rivalActive = !!data.rivalActive;
        S.rivalUntilDay = data.rivalUntilDay || 0;
        S.dailyStatsHistory = data.dailyStatsHistory || [];
        return true;
    } catch (e) {
        console.warn('[load] failed:', e);
        return false;
    }
}

function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

// ─── DIFFICULTY (hard mode) ────────────────────────────────
const DIFFICULTY_KEY = 'parking-tycoon-difficulty';
function getDifficulty() {
    try { return localStorage.getItem(DIFFICULTY_KEY) || 'normal'; } catch (e) { return 'normal'; }
}
function setDifficulty(d) {
    try { localStorage.setItem(DIFFICULTY_KEY, d); } catch (e) {}
}
function isHardMode() { return getDifficulty() === 'hard'; }

// ─── LEADERBOARD ──────────────────────────────────────────
const LEADERBOARD_KEY = 'parking-tycoon-leaderboard-v1';
function getLeaderboard() {
    try {
        const raw = localStorage.getItem(LEADERBOARD_KEY);
        if (!raw) return { bestDay: 0, bestUtility: 0, longestStreak: 0, lifetimeServed: 0, lifetimeRevenue: 0, runs: 0 };
        return JSON.parse(raw);
    } catch (e) { return {}; }
}
function updateLeaderboard(stats) {
    try {
        const lb = getLeaderboard();
        if (stats.utility > (lb.bestUtility || 0)) {
            lb.bestUtility = stats.utility;
            lb.bestDay = stats.day;
        }
        if (S.lifetimeServed > (lb.lifetimeServed || 0)) lb.lifetimeServed = S.lifetimeServed;
        if (S.lifetimeRevenue > (lb.lifetimeRevenue || 0)) lb.lifetimeRevenue = S.lifetimeRevenue;
        // Track positive-day streak
        if (stats.utility >= 0) {
            S.currentStreak = (S.currentStreak || 0) + 1;
            if (S.currentStreak > (lb.longestStreak || 0)) lb.longestStreak = S.currentStreak;
        } else {
            S.currentStreak = 0;
        }
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(lb));
    } catch (e) {}
}

// ─── EMPLOYEE LEVELING ─────────────────────────────────────
// XP is awarded on each cobro. Level is derived from XP. Bonuses
// boost XP immediately so the player can spend $5k to push someone
// up a tier.
function levelFromXp(xp) {
    let lv = 1;
    for (let i = 4; i >= 0; i--) {
        if (xp >= CONFIG.levelThresholds[i]) { lv = i + 1; break; }
    }
    return lv;
}

function awardXp(empOrEntry, amount) {
    // Accepts either a live employee (with .rosterEntry) or a roster entry directly.
    const entry = empOrEntry.rosterEntry || empOrEntry;
    if (!entry) return;
    const before = levelFromXp(entry.xp || 0);
    entry.xp = (entry.xp || 0) + amount;
    const after = levelFromXp(entry.xp);
    if (after > before) {
        entry.level = after;
        flashEvent(`🎉 ${entry.name} subió a Nivel ${after}! +${(CONFIG.levelSpeedBonus[after-1] * 100).toFixed(0)}% velocidad`);
        if (SFX.beep) {
            SFX.beep(880, 0.1, 'square', 0.08);
            setTimeout(() => SFX.beep(1175, 0.15, 'square', 0.1), 100);
        }
        updateEmployeeCardsHTML();
    }
}

function giveBonus(rosterId) {
    const entry = S.employeeRoster.find(e => e.id === rosterId);
    if (!entry) return false;
    if (S.money < CONFIG.bonusCost) {
        flashEvent('💸 Sin plata para pagar bono.');
        return false;
    }
    S.money -= CONFIG.bonusCost;
    flashEvent(`💰 Bono de $${CONFIG.bonusCost.toLocaleString('es-CL')} a ${entry.name}! +${CONFIG.bonusXp} XP`);
    awardXp(entry, CONFIG.bonusXp);
    updateEmployeeCardsHTML();
    updateHUD();
    return true;
}

// ─── MOBILE DEVICE DETECTION ──────────────────────────────
// Lower-end phones can't handle the same particle/shadow load as desktop.
// We detect coarse-pointer + small-viewport + UA hints to scale FX down.
// Result is cached so we don't re-run regex on every spawn.
let _isMobileCached = null;
function isMobileDevice() {
    if (_isMobileCached !== null) return _isMobileCached;
    try {
        const ua = navigator.userAgent || '';
        const uaHit = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const smallScreen = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 820;
        _isMobileCached = uaHit || (coarse && smallScreen);
    } catch (e) {
        _isMobileCached = false;
    }
    return _isMobileCached;
}
// Multiplier we apply to ephemeral FX counts (confetti, sparkles, etc).
// 1.0 desktop, 0.4 mobile — keeps things readable but ~60% lighter on GPU.
function fxScale() { return isMobileDevice() ? 0.4 : 1.0; }
function fxEnabled() { return !isMobileDevice(); }   // for purely decorative effects we can skip on mobile

// Haptic feedback — no-op on web, real on Capacitor native wrap.
// styles: 'LIGHT' (cobro), 'MEDIUM' (upgrade), 'HEAVY' (milestone / game won)
function hapticBuzz(style) {
    try { if (typeof window !== 'undefined' && window.gameVibrate) window.gameVibrate(style); } catch (e) {}
}

const CONFIG = {
    width: 960, height: 540,
    startHour: 8, endHour: 22, timeSpeed: 14,
    startMoney: 80000,                    // higher start to absorb more expensive upgrades
    pricePerMinute: 30,                   // realistic Chilean tariff (~CLP$30/min)
    cobroDuration: 1500,
    boothCobroDuration: 1000,
    boothCost: 60000,                // serious investment — saves walk time + boosts speed

    // Hard mode settings
    hardModeStartMoney: 30000,       // vs 80000 normal
    hardModeSpawnFactor: 1.4,        // 40% more spawns
    hardModePenaltyMultiplier: 1.5,  // angry/escape penalties 1.5x worse

    // Ad screens (passive income + patience bonus)
    adScreenCost: 40000,
    adScreenIncomePerGameMin: 10,    // toned down from 25 — was too dominant
    adScreenPatienceBonusPct: 10,
    adScreenMax: 3,

    // Signs (more cars spawn)
    signCost: 25000,
    signSpawnBoostPct: 25,
    signMax: 2,

    // Capacity expansion
    expansionCost: 80000,            // major capex
    expansionExtraSpaces: 8,
    expansionMax: 1,

    // Monthly subscriptions
    subscriptionPricePerDay: 7500,
    subscriptionDayRange: 14,
    subscriptionMax: 6,

    // POS upgrade (Nivel 2 transition)
    posCost: 200000,                 // Nivel 2 — premium upgrade
    posCobroDuration: 300,

    // Barriers upgrade (Nivel 3) — physical gates that the operator opens via POS
    barriersCost: 350000,            // Nivel 3 — major capex (physical gate hardware)
    barrierScanMs: 400,              // gate open + close animation duration
    barrierEscapeReductionPct: 90,   // % of would-be escapes prevented by physical gate

    // Entry ticket totem (end of Nivel 3) — self-service entry, frees up cobrador
    entryTotemCost: 120000,          // moderate capex
    entryTotemTickMs: 1100,          // how often the totem dispenses a ticket (per car)
    entryTotemDispenseMs: 600,       // ticket dispensing animation time

    // Exit autopay totem (Nivel 4) — self-service exit, no cobrador needed
    exitTotemCost: 280000,           // major capex
    exitTotemTickMs: 1300,           // how often it processes the next exit
    exitTotemScanMs: 700,            // QR/LPR scan + charge animation time

    // ParkingApp integration (Nivel 5) — app subscribers, premium tariff, loyalty
    parkingAppCost: 400000,          // top-tier upgrade
    parkingAppUserChance: 30,        // % of spawns that are app users
    parkingAppTariffMultiplier: 1.5, // app users pay 1.5x rate
    parkingAppPatienceBonusPct: 50,  // app users have +50% patience (loyalty)
    parkingAppSubscriptionIncomePerGameMin: 50,  // passive subscription revenue

    // Valet AI autónomo (Nivel 6) — cars self-park
    valetAICost: 600000,             // ultra-tier
    valetAIDriveSpeed: 2.0,          // 2x faster lot maneuvers (frictionless)
    valetAITariffMultiplier: 1.8,    // luxury tarifa premium (encima del app)
    valetAIRepBonus: 8,              // +8 reputación al comprar (luxury hub)

    // Multi-level parking (Nivel 7) — vertical expansion
    multiLevelCost: 1000000,
    multiLevelCapacityMultiplier: 3, // 3x effective capacity (visible spaces unchanged)
    multiLevelPassiveIncomePerMin: 200, // hidden floors generate passive revenue

    // Drone delivery (Nivel 8) — drones pick up/drop off cars
    droneCost: 2000000,
    droneTariffMultiplier: 1.3,      // bonus on top of valet AI
    droneRepBonus: 12,
    droneAmbientRevenuePerMin: 350,

    // Spaceport (Nivel 9) — el juego termina
    spaceportCost: 5000000,
    spaceportTariffMultiplier: 1.5,
    spaceportRepBonus: 20,
    spaceportPassiveIncomePerMin: 800,

    // NEW — Cameras prevent robberies
    cameraCost: 35000,

    // NEW — Car wash service: random cars pay extra
    washCost: 50000,
    washPctChance: 18,               // % of attended cars who want wash
    washPrice: 5000,                 // extra revenue per wash

    // NEW — EV chargers: rare premium customers
    evChargerCost: 70000,
    evCustomerChance: 8,             // % of spawns that are EVs (when charger installed)
    evMultiplier: 2.5,               // EVs pay 2.5x tariff

    // NEW — Robbery / vandalism penalties
    robberyPenalty: 8000,            // money lost per robbery (if no cameras)
    robberyRepLoss: 8,
    vandalismCleanupCost: 4000,
    vandalismRepLoss: 4,

    // Reputation / aesthetic upgrades
    pavementCost: 30000, pavementRepBonus: 5,
    linesCost: 15000,    linesRepBonus: 3,
    lightsCost: 25000,   lightsRepBonus: 5, lightsPatienceBonusPct: 10,
    guardCost: 45000,    guardRepBonus: 4,
    greeneryCost: 20000, greeneryRepBonus: 3,

    // Passing-by cars (street ambience)
    passingCarMinMs: 4000, passingCarMaxMs: 9000,

    spawnMinMs: 3500, spawnMaxMs: 6500,  // slower spawn to prevent overlap
    patienceMs: 22000, repenaltyAngry: 3,        // softer (was 5) — first days were brutal
    exitPatienceMs: 16000, repenaltyEscape: 7,   // softer (was 10) — easier to recover rep
    stayMinMin: 30, stayMaxMin: 180,
    employeeSalary: 8000,
    employeeHoursPerShift: 8,
    severanceMultiplier: 5,

    // Employee leveling — XP gained per action, level thresholds, perks
    xpPerEntry: 1,
    xpPerExit: 2,
    levelThresholds: [0, 30, 90, 200, 400],         // XP needed for L1..L5
    levelSpeedBonus: [0, 0.10, 0.18, 0.28, 0.40],   // cobro time reduction
    // Autonomy: probability per game minute the employee attends a queue car
    // without any click. Scales with level — Lv1/2 do nothing autonomously.
    levelAutonomyPerMin: [0, 0, 0.04, 0.08, 0.15],
    bonusCost: 5000,                                // pay $5k to give a bonus
    bonusXp: 25,                                    // XP awarded by a bonus
};

// ─── ACHIEVEMENTS ──────────────────────────────────────────
// Logros desbloqueables: definidos como {id, icon, name, desc, check(S)}.
// Check function returns true when the condition is met. Persisted in
// localStorage so they survive page reloads + new partidas.
const ACHIEVEMENTS_KEY = 'parking-tycoon-achievements-v1';
const ACHIEVEMENTS = [
    // Hitos básicos
    { id: 'first_cobro', icon: '🎯', name: 'Primer cobro', desc: 'Atendé tu primer auto',
        check: () => S.lifetimeServed >= 1 },
    { id: 'served_10', icon: '🚗', name: '10 autos', desc: 'Atendé 10 autos en total',
        check: () => S.lifetimeServed >= 10 },
    { id: 'served_100', icon: '🚙', name: '100 autos', desc: 'Atendé 100 autos en total',
        check: () => S.lifetimeServed >= 100 },
    { id: 'served_1000', icon: '🚖', name: '1.000 autos', desc: 'Atendé 1.000 autos',
        check: () => S.lifetimeServed >= 1000 },
    // Revenue milestones
    { id: 'rev_100k', icon: '💵', name: '$100K', desc: 'Llegá a $100.000 de revenue total',
        check: () => S.lifetimeRevenue >= 100000 },
    { id: 'rev_1m', icon: '💰', name: '$1M', desc: 'Llegá a $1.000.000 de revenue',
        check: () => S.lifetimeRevenue >= 1000000 },
    { id: 'rev_10m', icon: '🏦', name: '$10M', desc: 'Llegá a $10M de revenue',
        check: () => S.lifetimeRevenue >= 10000000 },
    { id: 'rev_100m', icon: '🪙', name: '$100M', desc: 'Llegá a $100M de revenue (élite)',
        check: () => S.lifetimeRevenue >= 100000000 },
    // Días sobrevividos
    { id: 'day_7', icon: '📅', name: 'Una semana', desc: 'Llegá al Día 7',
        check: () => S.day >= 7 },
    { id: 'day_30', icon: '📆', name: 'Un mes', desc: 'Llegá al Día 30',
        check: () => S.day >= 30 },
    // Niveles
    { id: 'lvl_booth', icon: '🛂', name: 'Caseta operativa', desc: 'Comprá la caseta',
        check: () => S.upgrades.booth },
    { id: 'lvl_2', icon: '💳', name: 'Nivel 2 — POS', desc: 'Conocé a ParkingApp',
        check: () => S.upgrades.pos },
    { id: 'lvl_3', icon: '🚧', name: 'Nivel 3 — Barreras', desc: 'Instalá gate físico',
        check: () => S.upgrades.barriers },
    { id: 'lvl_3f', icon: '🎫', name: 'Tótem auto-ticket', desc: 'Self-service entrada',
        check: () => S.upgrades.entryTotem },
    { id: 'lvl_4', icon: '💳', name: 'Nivel 4 — Autopago', desc: 'Self-service salida',
        check: () => S.upgrades.exitTotem },
    { id: 'lvl_5', icon: '📱', name: 'Nivel 5 — ParkingApp', desc: 'Integración completa',
        check: () => S.upgrades.parkingApp },
    { id: 'lvl_6', icon: '🤖', name: 'Nivel 6 — Valet AI', desc: 'Autos se estacionan solos',
        check: () => S.upgrades.valetAI },
    { id: 'lvl_7', icon: '🏢', name: 'Nivel 7 — Vertical', desc: 'Parking de varios pisos',
        check: () => S.upgrades.multiLevel },
    { id: 'lvl_8', icon: '🚁', name: 'Nivel 8 — Drones', desc: 'Delivery aéreo',
        check: () => S.upgrades.drone },
    { id: 'lvl_9', icon: '🚀', name: 'Nivel 9 — SPACEPORT', desc: '¡GANASTE el juego!',
        check: () => S.upgrades.spaceport },
    // Empleados
    { id: 'emp_lvl5', icon: '⭐', name: 'Empleado top', desc: 'Llevá a un empleado a Lv 5',
        check: () => S.employeeRoster.some(e => (e.level || 1) >= 5) },
    { id: 'emp_3', icon: '👥', name: 'Equipo de 3', desc: 'Tené 3+ empleados a la vez',
        check: () => S.employeeRoster.length >= 3 },
    // Reputación
    { id: 'rep_perfect', icon: '🌟', name: 'Estrella', desc: 'Mantené 100% reputación',
        check: () => S.reputation >= 100 && S.day >= 3 },
    // Sucursales
    { id: 'branch_1', icon: '📍', name: 'Primera sucursal', desc: 'Comprá tu primer lote secundario',
        check: () => (S.branchLots || []).length >= 1 },
    { id: 'branch_all', icon: '🌐', name: 'Imperio total', desc: 'Comprá los 6 lotes secundarios',
        check: () => (S.branchLots || []).length >= 6 },
    // Hard mode
    { id: 'hard_d7', icon: '🔥', name: 'Hard week', desc: 'Sobreviví Día 7 en hard mode',
        check: () => isHardMode() && S.day >= 7 },
];

function getUnlockedAchievements() {
    try {
        const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}
function setUnlockedAchievements(map) {
    try { localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(map)); } catch (e) {}
}

function checkAchievements() {
    const unlocked = getUnlockedAchievements();
    let changed = false;
    ACHIEVEMENTS.forEach(a => {
        if (unlocked[a.id]) return;
        try {
            if (a.check()) {
                unlocked[a.id] = Date.now();
                changed = true;
                showAchievementToast(a);
            }
        } catch (e) {}
    });
    if (changed) setUnlockedAchievements(unlocked);
}

function showDayIntroBanner() {
    if (!S.scene) return;
    const scene = S.scene;
    const x = CONFIG.width / 2;
    const y = CONFIG.height / 2 - 40;
    const dayLabel = `DÍA ${S.day} — ${DAY_LONG[S.dayOfWeek].toUpperCase()}`;
    const text = scene.add.text(x, y, dayLabel, {
        font: 'bold 36px monospace', color: '#fde047',
        stroke: '#000', strokeThickness: 5
    }).setOrigin(0.5).setAlpha(0).setScale(0.7).setDepth(1500);
    scene.tweens.add({
        targets: text, alpha: { from: 0, to: 1 }, scale: { from: 0.7, to: 1.05 },
        duration: 400, ease: 'Back.easeOut'
    });
    scene.tweens.add({
        targets: text, alpha: 0, scale: 1.15, y: y - 30,
        duration: 800, delay: 1400, ease: 'Power2',
        onComplete: () => text.destroy()
    });
    // Subtle ding
    if (SFX.beep) SFX.beep(880, 0.06, 'triangle', 0.06);
}

function showAchievementToast(achievement) {
    if (!S.scene) return;
    const scene = S.scene;
    const x = CONFIG.width / 2;
    const y = 100;
    // Backdrop
    const bg = scene.add.rectangle(x, y, 360, 56, 0x064e3b, 0.95)
        .setStrokeStyle(2, 0xfde047).setDepth(2000).setAlpha(0);
    const icon = scene.add.text(x - 150, y, achievement.icon, {
        font: '28px sans-serif'
    }).setOrigin(0.5).setDepth(2001).setAlpha(0);
    const header = scene.add.text(x - 120, y - 12, '🏆 LOGRO DESBLOQUEADO', {
        font: 'bold 10px monospace', color: '#fde047'
    }).setOrigin(0, 0.5).setDepth(2001).setAlpha(0);
    const name = scene.add.text(x - 120, y + 2, achievement.name, {
        font: 'bold 14px monospace', color: '#fff'
    }).setOrigin(0, 0.5).setDepth(2001).setAlpha(0);
    const desc = scene.add.text(x - 120, y + 16, achievement.desc, {
        font: 'italic 10px monospace', color: '#a7f3d0'
    }).setOrigin(0, 0.5).setDepth(2001).setAlpha(0);

    // Fanfare sound — short ascending arpeggio
    if (typeof SFX !== 'undefined' && SFX.beep) {
        SFX.beep(523, 0.08); setTimeout(() => SFX.beep(659, 0.08), 80);
        setTimeout(() => SFX.beep(784, 0.10), 160);
        setTimeout(() => SFX.beep(1047, 0.14), 240);
    }

    const els = [bg, icon, header, name, desc];
    scene.tweens.add({ targets: els, alpha: 1, duration: 350, ease: 'Power2' });
    scene.tweens.add({ targets: els, y: '+= 6', duration: 350, yoyo: true, repeat: 1, delay: 400 });
    scene.time.delayedCall(3000, () => {
        scene.tweens.add({
            targets: els, alpha: 0, duration: 400,
            onComplete: () => els.forEach(e => e.destroy())
        });
    });
}

// ─── BRANCH LOTS — multi-location empire ──────────────────
// Después de cierto progreso podés comprar lotes adicionales en otros
// puntos de la ciudad. Cada uno genera income pasivo, modulado por día
// de semana (algunos pegan fin de semana, otros L-V).
//
// dailyIncome = revenue base por DÍA. Aplicamos modifiers según
// weekdayFactor / weekendFactor para dar personalidad.
const LOT_TYPES = [
    {
        id: 'beach', icon: '🏖️', name: 'Playa Reñaca',
        cost: 1500000, dailyIncome: 80000,
        unlockRequires: 'parkingApp',
        flavor: 'Verano explota · invierno tranqui',
        weekdayFactor: 0.5, weekendFactor: 2.0,
        color: 0x06b6d4,
    },
    {
        id: 'hospital', icon: '🏥', name: 'Hospital Central',
        cost: 2500000, dailyIncome: 120000,
        unlockRequires: 'parkingApp',
        flavor: 'Demanda 24/7 · estable como roca',
        weekdayFactor: 1.0, weekendFactor: 1.0,
        color: 0xef4444,
    },
    {
        id: 'mall', icon: '🛍️', name: 'Mall Costanera',
        cost: 3500000, dailyIncome: 180000,
        unlockRequires: 'parkingApp',
        flavor: 'Sábados explotan · lunes muerto',
        weekdayFactor: 0.7, weekendFactor: 1.6,
        color: 0xa855f7,
    },
    {
        id: 'finance', icon: '🏢', name: 'Distrito Financiero',
        cost: 5000000, dailyIncome: 250000,
        unlockRequires: 'valetAI',
        flavor: 'Lun-Vie ejecutivos · fin de semana cero',
        weekdayFactor: 1.5, weekendFactor: 0.1,
        color: 0x3b82f6,
    },
    {
        id: 'airport', icon: '✈️', name: 'Aeropuerto AMB',
        cost: 8000000, dailyIncome: 400000,
        unlockRequires: 'multiLevel',
        flavor: 'Estadías largas · tarifa premium · 24/7',
        weekdayFactor: 1.1, weekendFactor: 1.2,
        color: 0xfbbf24,
    },
    {
        id: 'stadium', icon: '🏟️', name: 'Estadio Monumental',
        cost: 12000000, dailyIncome: 600000,
        unlockRequires: 'drone',
        flavor: 'Pico explosivo días de partido (sábados)',
        weekdayFactor: 0.4, weekendFactor: 2.5,
        color: 0x16a34a,
    },
];

// ─── DAYS OF WEEK ──────────────────────────────────────────
const DAY_LONG  = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const DAY_SHORT = ['L','M','X','J','V','S','D'];

// ─── DEMAND CURVE (cars per hour multiplier) ───────────────
// Models a real urban parking flow: morning rush, lunch peak,
// afternoon valley, evening peak, late-night drop.
// Weekend has its own curve (later starts, longer peaks).
const DEMAND_WEEKDAY = {
    8: 0.6, 9: 1.2, 10: 1.0, 11: 0.8,
    12: 1.7, 13: 1.8, 14: 1.2,
    15: 0.9, 16: 0.8, 17: 1.1,
    18: 1.6, 19: 1.7, 20: 1.4,
    21: 0.8, 22: 0.4,
};
const DEMAND_WEEKEND = {
    8: 0.3, 9: 0.5, 10: 0.9, 11: 1.2,
    12: 1.5, 13: 1.6, 14: 1.5,
    15: 1.3, 16: 1.2, 17: 1.3,
    18: 1.5, 19: 1.6, 20: 1.4,
    21: 1.0, 22: 0.6,
};

function getDemandMultiplier(hour) {
    const h = Math.floor(hour);
    const isWeekend = S.dayOfWeek >= 5;
    const table = isWeekend ? DEMAND_WEEKEND : DEMAND_WEEKDAY;
    let mult = table[h] ?? 0.5;
    // Rush event doubles demand temporarily
    if (S.rushUntilMin && S.timeMinutes < S.rushUntilMin) mult *= 2;
    return mult;
}

// ─── PARTNER DEALS (convenios) ─────────────────────────────
const CONVENIOS = {
    restaurant: { id: 'restaurant', name: '🍽️ Restaurante "El Buen Sabor"', spawnBoost: 20, revenueCut: 15, cost: 8000 },
    mall:       { id: 'mall',       name: '🛍️ Mall Plaza',                  spawnBoost: 35, revenueCut: 25, cost: 14000 },
    cinema:     { id: 'cinema',     name: '🎬 Cine Hoyts',                   spawnBoost: 25, revenueCut: 20, cost: 10000 },
};

function getConvenioSpawnBoost() {
    let boost = 0;
    for (const id of S.upgrades.convenios) {
        boost += CONVENIOS[id].spawnBoost;
    }
    return 1 + boost / 100;
}

function getConvenioRevenueCut() {
    let cut = 0;
    for (const id of S.upgrades.convenios) {
        cut += CONVENIOS[id].revenueCut;
    }
    return 1 - Math.min(cut, 50) / 100;
}

function purchaseConvenio(id) {
    if (S.upgrades.convenios.includes(id)) return;
    const c = CONVENIOS[id];
    if (!c) return;
    if (S.money < c.cost) return;
    S.money -= c.cost;
    S.upgrades.convenios.push(id);
    flashEvent(`🤝 Convenio firmado con ${c.name}! +${c.spawnBoost}% flujo, -${c.revenueCut}% tarifa`);
}

// ─── RANDOM EVENTS ─────────────────────────────────────────
const EVENTS = [
    {
        id: 'vip', weight: 10, name: 'Cliente VIP',
        apply: () => {
            S.nextCarMultiplier = 2;
            flashEvent('💎 ¡Cliente VIP llegando! Próximo cobro paga doble.');
        }
    },
    {
        id: 'rush', weight: 12, name: 'Spike de demanda',
        apply: () => {
            S.rushUntilMin = S.timeMinutes + 60;
            flashEvent('🎪 ¡Evento masivo cercano! Demanda x2 por 1 hora.');
        }
    },
    {
        id: 'inspector', weight: 7, name: 'Inspector municipal',
        apply: () => {
            const fine = 8000 + S.angryToday * 500 + S.escapedToday * 1200;
            S.money -= fine;
            flashEvent(`👮 Inspector municipal. Multa: -$${fine.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'review', weight: 8, name: 'Review en redes',
        apply: () => {
            const positive = S.reputation >= 70 && Math.random() > 0.3;
            if (positive) {
                S.reputation = Math.min(100, S.reputation + 4);
                flashEvent('⭐ Review positiva en redes! +4 reputación');
            } else {
                S.reputation = Math.max(0, S.reputation - 3);
                flashEvent('💢 Review negativa en redes... -3 reputación');
            }
        }
    },
    {
        id: 'lostkey', weight: 5, name: 'Cliente perdió papeleta',
        apply: () => {
            S.money -= 1500;
            flashEvent('🗝️ Cliente perdió papeleta. Cobro mínimo: -$1.500');
        }
    },
    {
        id: 'tip', weight: 4, name: 'Propina',
        apply: () => {
            const tip = 2000 + Math.floor(Math.random() * 4000);
            S.money += tip;
            flashEvent(`🎁 Propina de cliente: +$${tip.toLocaleString('es-CL')}`);
        }
    },
    // NEW EVENTS — appear later in the game
    {
        id: 'robbery', weight: 8, name: 'Ladrón',
        apply: () => {
            // If cameras exist, blocked silently
            if (S.upgrades.cameras) {
                flashEvent('📹 Cámaras detectaron intento de robo. Bloqueado!');
                return;
            }
            // Spawn an interactive thief — player can click to scare them away
            spawnThief();
        }
    },
    {
        id: 'vandalism', weight: 6, name: 'Vandalismo',
        apply: () => {
            if (S.upgrades.cameras) {
                flashEvent('📹 Cámaras grabaron al vándalo. La policía lo agarró.');
                return;
            }
            S.money -= CONFIG.vandalismCleanupCost;
            S.reputation = Math.max(0, S.reputation - CONFIG.vandalismRepLoss);
            flashEvent(`🎨 Graffiti / vandalismo. Limpieza: -$${CONFIG.vandalismCleanupCost.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'rain', weight: 7, name: 'Lluvia repentina',
        apply: () => {
            S.rushUntilMin = S.timeMinutes + 90;  // people seek covered parking
            flashEvent('🌧️ Lluvia repentina — la gente busca estacionamiento. Demanda x2 por 90min.');
        }
    },
    {
        id: 'tow', weight: 4, name: 'Grúa municipal',
        apply: () => {
            // A parked car gets towed (very rare, but visible)
            if (S.parkedCars.length > 0) {
                const car = Phaser.Math.RND.pick(S.parkedCars);
                S.money -= 5000;
                flashEvent('🚚 Grúa municipal se llevó un auto mal aparcado. Reclamo: -$5.000');
                requestExit(car); // car leaves (gets removed from lot)
            }
        }
    },
    // ── NEW EVENTS (v0.45) ──
    {
        id: 'blackout', weight: 5, name: 'Corte de luz',
        apply: () => {
            // If we have lights upgrade, less impact (backup power)
            if (S.upgrades.lights) {
                flashEvent('⚡ Corte de luz en el barrio — backup eléctrico de luminarias salvó el día.');
                return;
            }
            // Without lights: spawn freeze + customer impatience
            S.rushUntilMin = S.timeMinutes - 1;   // cancel any rush
            S.reputation = Math.max(0, S.reputation - 4);
            flashEvent('🔌 ¡Corte de luz! Lote a oscuras. -4 reputación. Comprá Luminarias para evitarlo.');
        }
    },
    {
        id: 'festival', weight: 6, name: 'Festival barrial',
        apply: () => {
            S.rushUntilMin = S.timeMinutes + 120;  // 2-hour boost
            S.nextCarMultiplier = 1.5;
            flashEvent('🎉 ¡Festival en la cuadra! Demanda x2 por 2 horas + próximo cobro +50%.');
        }
    },
    {
        id: 'dog', weight: 4, name: 'Perro suelto',
        apply: () => {
            // Random parked car gets agitated — minor rep hit
            if (S.parkedCars.length > 0) {
                S.reputation = Math.max(0, S.reputation - 2);
                flashEvent('🐕 Perro suelto entre los autos. Algún cliente se asustó. -2 rep.');
            } else {
                flashEvent('🐕 Un perrito callejero pasa por el lote. Tomás le da agua.');
                S.reputation = Math.min(100, S.reputation + 1);  // wholesome bonus
            }
        }
    },
    {
        id: 'accident', weight: 3, name: 'Accidente menor',
        apply: () => {
            // 2 cars colliding inside the lot — claim cost
            const cost = 12000;
            S.money -= cost;
            S.reputation = Math.max(0, S.reputation - 5);
            flashEvent(`💥 Accidente menor en el lote. Seguro paga ${cost.toLocaleString('es-CL')} -5 rep.`);
        }
    },
    {
        id: 'foodtruck', weight: 5, name: 'Food truck',
        apply: () => {
            // Random good event: food truck parks near, attracts customers
            S.rushUntilMin = S.timeMinutes + 45;
            const tip = 3500;
            S.money += tip;
            flashEvent(`🌮 Food truck se instala cerca. +Demanda 45min · +$${tip.toLocaleString('es-CL')} alquiler espacio.`);
        }
    },
    {
        id: 'celebrity', weight: 2, name: 'Famoso de visita',
        apply: () => {
            // Rare event: a celebrity parks at the lot, huge rep boost
            S.reputation = Math.min(100, S.reputation + 10);
            S.nextCarMultiplier = 3;
            flashEvent('🌟 ¡Famoso estaciona en tu lote! +10 rep · próximo cobro x3.');
        }
    },
    {
        id: 'protest', weight: 3, name: 'Protesta cercana',
        apply: () => {
            // Streets blocked — spawn rate drops, but if you have ParkingApp, less impact
            if (S.upgrades.parkingApp) {
                flashEvent('📱 Protesta en la zona — la app redirige clientes alternativos. Impacto mínimo.');
                return;
            }
            S.rushUntilMin = 0;
            S.spawnTimer = -3000;   // delay next spawn 3s real time
            flashEvent('🚧 Protesta corta las calles. Menos autos llegando. ¡La app ParkingApp ayudaría!');
        }
    },
    // ── RIVAL EVENTS — competition heats up after day 5 ──
    {
        id: 'rival_open', weight: 6, name: 'Competencia abre',
        apply: () => {
            if (S.day < 5) return;   // only after day 5
            const rivals = ['🅿️ ParkClub', '🅿️ EasyPark', '🅿️ FastLot', '🅿️ MegaPark'];
            const name = Phaser.Math.RND.pick(rivals);
            S.rivalActive = true;
            S.rivalUntilDay = S.day + 3;   // 3-day debuff
            S.reputation = Math.max(0, S.reputation - 3);
            flashEvent(`⚔️ ${name} abrió a 2 cuadras. Spawn -25% por 3 días. -3 rep.`);
        }
    },
    {
        id: 'rival_close', weight: 3, name: 'Competencia cierra',
        apply: () => {
            if (!S.rivalActive) return;
            S.rivalActive = false;
            S.rivalUntilDay = 0;
            S.reputation = Math.min(100, S.reputation + 5);
            flashEvent('🏆 Tu rival cerró (no aguantó). +5 reputación!');
        }
    },
    // ── BRANCH-LOT-SPECIFIC EVENTS — only fire if you OWN the lot ──
    {
        id: 'beach_marea', weight: 5, name: 'Marea alta (Playa)',
        requireLot: 'beach',
        apply: () => {
            const loss = 8000;
            S.money -= loss;
            flashEvent(`🌊 Marea alta en Reñaca — acceso bloqueado 2h. -$${loss.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'beach_summer', weight: 6, name: 'Día de calor récord (Playa)',
        requireLot: 'beach',
        apply: () => {
            const bonus = 22000;
            S.money += bonus;
            flashEvent(`🌞 Calor récord — Reñaca explota de turistas. +$${bonus.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'hospital_emerg', weight: 4, name: 'Emergencia (Hospital)',
        requireLot: 'hospital',
        apply: () => {
            const loss = 6000;
            S.money -= loss;
            flashEvent(`🚑 Hospital: emergencia masiva, ambulancias bloquean espacios. -$${loss.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'hospital_visit', weight: 5, name: 'Día de visita (Hospital)',
        requireLot: 'hospital',
        apply: () => {
            const bonus = 15000;
            S.money += bonus;
            flashEvent(`💐 Hospital: día de visita familiar. +$${bonus.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'mall_sale', weight: 6, name: 'Black Friday (Mall)',
        requireLot: 'mall',
        apply: () => {
            const bonus = 40000;
            S.money += bonus;
            flashEvent(`🛒 Mall en Black Friday — lote a tope. +$${bonus.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'finance_crash', weight: 3, name: 'Crisis bursátil (Distrito)',
        requireLot: 'finance',
        apply: () => {
            const loss = 18000;
            S.money -= loss;
            flashEvent(`📉 Crisis bursátil — ejecutivos a casa. -$${loss.toLocaleString('es-CL')} en distrito.`);
        }
    },
    {
        id: 'finance_ipo', weight: 4, name: 'IPO grande (Distrito)',
        requireLot: 'finance',
        apply: () => {
            const bonus = 55000;
            S.money += bonus;
            flashEvent(`💼 IPO mega-corp en el distrito — banqueros parqueando todo el día. +$${bonus.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'airport_delay', weight: 4, name: 'Vuelos demorados (Aeropuerto)',
        requireLot: 'airport',
        apply: () => {
            const bonus = 70000;
            S.money += bonus;
            flashEvent(`✈️ Vuelos demorados — pasajeros parqueando horas extra. +$${bonus.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'stadium_classic', weight: 5, name: 'Partido clásico (Estadio)',
        requireLot: 'stadium',
        apply: () => {
            const bonus = 120000;
            S.money += bonus;
            flashEvent(`⚽ ¡CLÁSICO en el Monumental! Demanda histórica. +$${bonus.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'stadium_rain', weight: 3, name: 'Partido suspendido (Estadio)',
        requireLot: 'stadium',
        apply: () => {
            const loss = 30000;
            S.money -= loss;
            flashEvent(`🌧️ Partido suspendido por lluvia — nadie estaciona. -$${loss.toLocaleString('es-CL')}`);
        }
    },
];

function triggerRandomEvent() {
    // Filter: only include events whose requireLot matches an owned branch lot
    // (or which have no requireLot at all — generic events always available).
    const eligible = EVENTS.filter(e => {
        if (!e.requireLot) return true;
        return S.branchLots && S.branchLots.includes(e.requireLot);
    });
    const totalWeight = eligible.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const ev of eligible) {
        roll -= ev.weight;
        if (roll <= 0) { ev.apply(); return ev.id; }
    }
    return null;
}

function getDemandLabel(mult) {
    const x = mult.toFixed(1) + 'x';
    if (mult >= 1.5) return `🔥🔥🔥 ${x} PICO`;
    if (mult >= 1.1) return `🔥🔥 ${x} ALTA`;
    if (mult >= 0.8) return `🔥 ${x} MEDIA`;
    if (mult >= 0.5) return `·· ${x} BAJA`;
    return `·· ${x} MUY BAJA`;
}

const SHIFTS = {
    wd_morning:   { id:'wd_m',  start:8,  end:16, days:[0,1,2,3,4],     label:'Mañana L-V' },
    wd_afternoon: { id:'wd_a',  start:14, end:22, days:[0,1,2,3,4],     label:'Tarde L-V' },
    we_morning:   { id:'we_m',  start:8,  end:16, days:[5,6],           label:'Mañana S-D' },
    we_afternoon: { id:'we_a',  start:14, end:22, days:[5,6],           label:'Tarde S-D' },
    all_morning:  { id:'all_m', start:8,  end:16, days:[0,1,2,3,4,5,6], label:'Mañana 7d' },
    all_aftern:   { id:'all_a', start:14, end:22, days:[0,1,2,3,4,5,6], label:'Tarde 7d' },
};
const SHIFT_LIST = [
    SHIFTS.wd_morning, SHIFTS.wd_afternoon,
    SHIFTS.we_morning, SHIFTS.we_afternoon,
    SHIFTS.all_morning, SHIFTS.all_aftern
];

// ─── LAYOUT ────────────────────────────────────────────────
const L = {
    hudH: 64,

    roadTop: 55, roadBottom: 155,
    // v0.10a swap: ENTRADA on the BOTTOM (closer to lot), SALIDA on TOP
    entryLaneY: 130,            // BOTTOM lane, closer to lot fence
    bypassLaneY: 85,            // TOP lane, further from lot

    sidewalkTop: 158, sidewalkBottom: 198,
    sidewalkY: 178,

    lotFenceY: 200, lotBottom: 510,
    lotLeft: 20, lotRight: 940,

    // v0.10b swap: entry opening on LEFT (west), exit opening on RIGHT (east) — drive-thru
    entryOpeningX: 420, exitOpeningX: 540, openingW: 50,
    entryVlaneX: 420, exitVlaneX: 540,

    // Compact layout that fits 3 rows + 2 lanes within lot bounds 200-510
    centerLaneY: 300, laneH: 35,
    expansionLaneY: 420, expansionLaneH: 30,    // shown only when expansion purchased
    row1Y: 240, row2Y: 360, row3Y: 475,         // row3 used only with expansion
    spaceW: 50, spaceH: 55,
    cols: [70, 155, 240, 325, 590, 675, 760, 845],

    // v0.10c — Queue: HEAD inside lot at entry vlane; rest on street going WEST
    queueHeadInsideX: 420,          // == entryVlaneX
    queueHeadInsideY: 235,          // head car position just south of fence opening
    queueStreetY: 130,              // == entryLaneY (cars on the street)
    // v0.75: sprite scale went 1.6→1.9 in v0.73 but spacing stayed at 55 —
    // cars visibly overlapped when 3+ piled up. Bump to 68 (entry) and 52
    // (exit) so there's a real gap between bumpers.
    queueStreetSpacing: 68,         // horizontal spacing on the street

    // Exit waiting (after swap, exit vlane is on the right)
    exitWaitX: 540,                 // == exitVlaneX
    exitWaitY: 245, exitQueueSpacing: 52,

    placeholderCx: 480, placeholderCy: 255, placeholderW: 70, placeholderH: 70,

    // No-booth: employees as sprites on sidewalk
    employeeNoBoothStartX: 200, employeeNoBoothSpacing: 90, employeeNoBoothY: 178,

    // With booth: cards at bottom of lot
    cardW: 145, cardH: 60, cardStartX: 90, cardSpacing: 160, cardStripY: 478,

    spawnX: -50, exitOffscreenX: 1020,
};

// ─── COLORS ────────────────────────────────────────────────
const COLORS = {
    bgOutside: 0x1f2937,
    road: 0x4b5563, roadLine: 0xfde047, laneDivider: 0xfbbf24,
    sidewalk: 0x52525b, sidewalkLine: 0x3f3f46,
    lotFloorDirt: 0x6b5a3a,   // brown dirt — starting state
    lotFloorPaved: 0x374151,  // gray asphalt — after pavement upgrade
    lotBorder: 0x60a5fa, fenceBar: 0x9ca3af,
    spaceEmpty: 0x4b5563, spaceOccupied: 0xdc2626, spaceBorder: 0x9ca3af,
    spaceSubscription: 0x9333ea,
    employeeOnShift: 0x60a5fa, employeeOffShift: 0x4b5563, employeeBusy: 0xea580c,
    exitGate: 0xef4444, placeholderStroke: 0x6b7280,
    boothBody: 0x78350f, boothRoof: 0xfbbf24,
    boothWindow: 0xfde68a, boothWindowBusy: 0xea580c,
    cardBg: 0x1e293b, cardBorder: 0x475569,
    cardBorderOnShift: 0x10b981,
    cardBorderBusy: 0xea580c,
};

const CAR_COLORS = [
    0xef4444, 0x3b82f6, 0xfbbf24, 0xa78bfa,
    0x10b981, 0xf97316, 0xec4899, 0x06b6d4
];

// ─── STATE ─────────────────────────────────────────────────
// `?money=N` URL override (DEV) lets us boot with custom starting cash.
// Honored only when not loading a save.
const __urlMoneyOverride = (() => {
    try {
        const m = new URLSearchParams(location.search).get('money');
        const n = m ? parseInt(m, 10) : NaN;
        return isFinite(n) && n > 0 ? n : null;
    } catch (e) { return null; }
})();
const __initialMoney = __urlMoneyOverride
    ?? ((typeof localStorage !== 'undefined' &&
        localStorage.getItem('parking-tycoon-difficulty') === 'hard')
        ? 30000 : CONFIG.startMoney);
const S = {
    money: __initialMoney, day: 1, dayOfWeek: 0, reputation: 100,
    timeMinutes: CONFIG.startHour * 60,

    upgrades: {
        booth: false,
        pos: false,
        barriers: false,                    // Nivel 3 — automatic gate scanner
        entryTotem: false,                  // Nivel 3 end — self-service ticket totem
        exitTotem: false,                   // Nivel 4 — self-service autopay totem at exit
        parkingApp: false,                  // Nivel 5 — ParkingApp integration
        valetAI: false,                     // Nivel 6 — autonomous self-parking
        multiLevel: false,                  // Nivel 7 — vertical parking (3x capacity)
        drone: false,                       // Nivel 8 — drone delivery
        spaceport: false,                   // Nivel 9 — naves espaciales (finale)
        adScreens: 0,
        signs: 0,
        expansions: 0,
        convenios: [],
        cameras: false,
        carwash: false,
        evCharger: false,
        // Aesthetic / reputation upgrades
        pavement: false,
        lines: false,
        lights: false,
        guard: false,
        greenery: false,
    },
    cinematicShown: false,             // ParkingApp intro
    branchLots: [],                    // owned secondary lots (array of lot IDs)
    dailyStatsHistory: [],             // last 30 days for trends
    subscriptionRevenueToday: 0,
    idleHintTimer: 0,
    lastActivityAt: 0,                 // last cobro/spawn time, for idle hints
    employeeRoster: [],
    subscriptions: [], // { id, startDay, endDay, dailyPrice }
    lifetimeServed: 0, lifetimeRevenue: 0, lifetimeSalaries: 0, lifetimeAngry: 0, lifetimeEscaped: 0,
    consecutiveNegDays: 0,
    gameOver: false,
    // Event-driven modifiers (per-run, reset each day)
    nextCarMultiplier: 1,            // applied to next exit-cobro
    rushUntilMin: 0,                 // demand x2 until this game-time
    eventTimer: 0,                   // ms toward next event
    nextEventIn: 60000,              // initial wait

    cars: [], queue: [], parkedCars: [], exitQueue: [],
    spaces: [], employees: [],

    spawnTimer: 0, nextSpawnIn: 3000,
    dayEnded: false, paused: false,
    hud: {}, scene: null,
    carsServedToday: 0, angryToday: 0, escapedToday: 0,
    revenueToday: 0, drivePastToday: 0, salariesPaidToday: 0,

    managementOpen: false, managementUI: [], managementTab: 'employees',
    boothSprites: [], boothWindowSprite: null,
    endDayUI: [],
};

const phaserConfig = {
    type: Phaser.AUTO, width: CONFIG.width, height: CONFIG.height,
    parent: 'game', backgroundColor: COLORS.bgOutside,
    // On mobile we drop antialias + cap the renderer DPR. Cheap GPU win.
    pixelArt: false, antialias: !isMobileDevice(), roundPixels: true,
    scale: {
        mode: Phaser.Scale.FIT,            // canvas scales to fit viewport
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    },
    // Cap pixel ratio so we don't ask phones to draw at 3x native.
    resolution: isMobileDevice() ? 1 : (window.devicePixelRatio || 1),
    fps: { target: isMobileDevice() ? 45 : 60, forceSetTimeOut: false },
    scene: { preload, create, update }
};
let game = new Phaser.Game(phaserConfig);
window.game = game;   // expose so index.html save/load wiring can restart the scene

const CAR_COLOR_NAMES = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'cyan', 'purple'];

function preload() {
    // Car sprites: 8 colors × 3 designs = 24 variants, all east-facing
    CAR_COLOR_NAMES.forEach(color => {
        for (let i = 1; i <= 3; i++) {
            this.load.image(`car_${color}_${i}`, `assets/car_${color}_${i}_east.png`);
        }
    });

    // Cobrador (Tomás) — 4 directions
    this.load.image('tomas_south', 'assets/tomas_south.png');
    this.load.image('tomas_east',  'assets/tomas_east.png');
    this.load.image('tomas_north', 'assets/tomas_north.png');
    this.load.image('tomas_west',  'assets/tomas_west.png');

    // Ana (ParkingApp) — for cinematic
    this.load.image('ana_south', 'assets/ana_south.png');
    this.load.image('ana_east',  'assets/ana_east.png');
    this.load.image('ana_north', 'assets/ana_north.png');
    this.load.image('ana_west',  'assets/ana_west.png');

    // Ladrón (thief) — random event sprite
    this.load.image('ladron_south', 'assets/ladron_south.png');
    this.load.image('ladron_east',  'assets/ladron_east.png');
    this.load.image('ladron_north', 'assets/ladron_north.png');
    this.load.image('ladron_west',  'assets/ladron_west.png');
}

// Build the texture pool: 24 (color, design) combos
const CAR_TEXTURES = [];
CAR_COLOR_NAMES.forEach(color => {
    for (let i = 1; i <= 3; i++) CAR_TEXTURES.push(`car_${color}_${i}`);
});

// Chilean first names pool for randomly-hired employees
const EMPLOYEE_NAMES = [
    // Chilean names — expanded pool
    'Camila', 'Javier', 'Sofía', 'Matías', 'Valentina', 'Diego', 'Antonia', 'Felipe',
    'Constanza', 'Benjamín', 'Florencia', 'Vicente', 'Isidora', 'Joaquín', 'Martina', 'Cristóbal',
    'Catalina', 'Sebastián', 'Emilia', 'Maximiliano', 'Fernanda', 'Agustín', 'Trinidad', 'Lucas',
    'Renata', 'Nicolás', 'Amanda', 'Ignacio', 'Pascale', 'Magdalena', 'Rodrigo', 'Paloma',
    'Andrés', 'Bárbara', 'Pablo', 'Macarena', 'Carlos', 'Daniela', 'Gonzalo', 'Antonella',
    'Diego', 'Esperanza', 'Bastián', 'Romina', 'Cristian', 'Valeria', 'Damián', 'Marcela',
    'Manuel', 'Loreto', 'Esteban', 'Carolina', 'Hernán', 'Jimena', 'Tomás', 'Verónica',
    'Pedro', 'Solange', 'Mauricio', 'Karen', 'Felipe', 'Karla', 'Roberto', 'Vanessa',
];

function pickRandomEmployeeName() {
    // Avoid repeating names already in the roster
    const used = new Set(S.employeeRoster.map(e => e.name));
    const available = EMPLOYEE_NAMES.filter(n => !used.has(n));
    if (available.length === 0) {
        // Pool exhausted → append a numeric suffix
        return 'Empl. ' + (S.employeeRoster.length + 1);
    }
    return Phaser.Math.RND.pick(available);
}

// ─── SIMPLE SYNTH SOUNDS (Web Audio) ───────────────────────
let audioCtx = null;
function getAudioCtx() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return audioCtx;
}
function beep(freq = 440, duration = 0.1, type = 'sine', volume = 0.06) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = volume;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.stop(ctx.currentTime + duration);
    } catch (e) {}
}
const SFX = {
    cobro: () => { beep(660, 0.05); setTimeout(() => beep(880, 0.06), 60); },
    cashRegister: () => { beep(900, 0.04, 'square'); setTimeout(() => beep(1200, 0.05, 'square'), 50); },
    // Premium kaching — for app users / valet / spaceport cobros. More
    // sparkle than regular cashRegister to reward the player for premium revenue.
    cashPremium: () => {
        beep(1047, 0.05, 'triangle', 0.08);                  // C6
        setTimeout(() => beep(1319, 0.05, 'triangle', 0.08), 60);  // E6
        setTimeout(() => beep(1568, 0.06, 'triangle', 0.09), 120); // G6
        setTimeout(() => beep(2093, 0.10, 'triangle', 0.10), 200); // C7 — sparkle
    },
    // Bored: descending "uhhh" sound — customer losing patience
    bored: () => {
        beep(330, 0.12, 'triangle', 0.05);
        setTimeout(() => beep(260, 0.18, 'triangle', 0.05), 90);
    },
    // Escape: car peeling out — loud descending whoosh
    escape: () => {
        beep(220, 0.1, 'sawtooth', 0.07);
        setTimeout(() => beep(140, 0.15, 'sawtooth', 0.07), 80);
        setTimeout(() => beep(80, 0.2, 'sawtooth', 0.06), 180);
    },
    // Angry: short alarm-style chirp
    angry: () => {
        beep(440, 0.06, 'square', 0.06);
        setTimeout(() => beep(523, 0.06, 'square', 0.06), 70);
        setTimeout(() => beep(440, 0.06, 'square', 0.06), 140);
    },
    purchase: () => { beep(523, 0.08); setTimeout(() => beep(659, 0.08), 80); setTimeout(() => beep(784, 0.12), 160); },
    dayEnd: () => { beep(440, 0.1); setTimeout(() => beep(550, 0.1), 110); setTimeout(() => beep(660, 0.15), 220); },
    gameOver: () => { beep(440, 0.2, 'sawtooth'); setTimeout(() => beep(330, 0.25, 'sawtooth'), 220); setTimeout(() => beep(220, 0.4, 'sawtooth'), 480); },
};

// ─── AMBIENT MUSIC ─────────────────────────────────────────
// Drone pad + arpeggiated chord pattern that loops. Audible but not
// overpowering — sits below SFX. Toggleable via window.__musicMuted.
let __ambientState = { started: false, oscs: [], gain: null, timer: null };
function startAmbientMusic() {
    if (__ambientState.started) return;
    const ctx = getAudioCtx();
    if (!ctx) {
        console.warn('[music] no AudioContext available');
        return;
    }
    // Resume context if suspended (browsers often suspend before user gesture)
    if (ctx.state === 'suspended') {
        ctx.resume().catch(e => console.warn('[music] resume failed', e));
    }
    __ambientState.started = true;
    console.log('[music] starting ambient (state=' + ctx.state + ')');

    // Master gain — start at 0, fade in
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    __ambientState.gain = master;

    // Drone: two slightly-detuned sine oscillators in A2 + A3 octave
    const a = ctx.createOscillator();
    a.type = 'sine'; a.frequency.value = 110;
    a.connect(master);
    const b = ctx.createOscillator();
    b.type = 'sine'; b.frequency.value = 110.4;
    b.connect(master);
    // Add a third oscillator one octave up for body
    const c = ctx.createOscillator();
    c.type = 'sine'; c.frequency.value = 220;
    const cGain = ctx.createGain();
    cGain.gain.value = 0.45;
    c.connect(cGain); cGain.connect(master);
    a.start(); b.start(); c.start();
    __ambientState.oscs.push(a, b, c);

    // Slow chord arpeggio overlay — Am, F, C, G (4s per chord)
    const chords = [
        [220, 261.63, 329.63], // A C E
        [174.61, 220, 261.63], // F A C
        [261.63, 329.63, 392.0], // C E G
        [196.0, 246.94, 293.66], // G B D
    ];
    let chordIdx = 0;
    const playArp = () => {
        if (window.__musicMuted) return;
        if (typeof S !== 'undefined' && S.dayEnded) return;
        const chord = chords[chordIdx % chords.length];
        chordIdx++;
        chord.forEach((freq, i) => {
            setTimeout(() => {
                if (window.__musicMuted) return;
                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = freq * 2;
                const g = ctx.createGain();
                g.gain.value = 0;
                g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 0.15);
                g.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 1.4);
                osc.connect(g); g.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 1.5);
            }, i * 350);
        });
    };
    __ambientState.timer = setInterval(playArp, 4000);
    // First chord plays immediately so the player hears something right away
    setTimeout(playArp, 800);

    // Fade in master gain over 2s — louder than before so it's audible
    master.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2);
}

function stopAmbientMusic() {
    if (!__ambientState.started) return;
    try {
        __ambientState.oscs.forEach(o => o.stop());
    } catch(e) {}
    if (__ambientState.timer) clearInterval(__ambientState.timer);
    __ambientState.started = false;
    __ambientState.oscs = [];
    __ambientState.timer = null;
}

function resetTransientState() {
    S.cars = []; S.queue = []; S.parkedCars = []; S.exitQueue = [];
    S.spaces = []; S.employees = [];
    S.spawnTimer = 0; S.nextSpawnIn = 3000;
    S.passingTimer = 0; S.nextPassingIn = 3000;
    S.dayEnded = false; S.paused = false;
    S.hud = {};
    S.timeMinutes = CONFIG.startHour * 60;
    S.carsServedToday = 0; S.angryToday = 0; S.escapedToday = 0;
    S.revenueToday = 0; S.drivePastToday = 0; S.salariesPaidToday = 0; S.adRevenueToday = 0; S.appRevenueToday = 0; S.branchRevenueToday = 0;
    S.nextCarMultiplier = 1; S.rushUntilMin = 0;
    S.eventTimer = 0; S.nextEventIn = Phaser.Math.Between(45000, 120000);
    S.subscriptionRevenueToday = 0;
    S.corruptEmployeeToday = null;
    S.managementOpen = false; S.managementUI = [];
    S.boothSprites = []; S.boothWindowSprite = null; S.boothCobradorSprite = null;
    S.closedSignGroup = null; S.streetClosedSign = null;
    S.endDayUI = [];
    S.laneBusy = { entryV: false, exitV: false };
    S.laneQueue = { entryV: [], exitV: [] };
}

function ensureInitialRoster() {
    if (S.employeeRoster.length === 0) {
        S.employeeRoster.push({
            id: 'emp-' + Math.random().toString(36).slice(2),
            name: 'Tomás', shift: SHIFTS.wd_morning,
            salary: CONFIG.employeeSalary, hiredOnDay: 1,
            xp: 0, level: 1,
        });
    }
    // Migrate older roster entries (loaded from save) that don't have xp/level
    S.employeeRoster.forEach(e => {
        if (typeof e.xp !== 'number') e.xp = 0;
        if (typeof e.level !== 'number') e.level = 1;
    });
}

function create() {
    resetTransientState();
    ensureInitialRoster();
    S.scene = this;

    drawBackground(this);
    drawSidewalk(this);
    createParkingSpaces(this);
    applySubscriptionsToSpaces();
    drawExitGateMarker(this);
    drawAdScreens(this);
    drawSigns(this);
    drawSafetyAndServices(this);
    drawAesthetics(this);
    if (S.upgrades.barriers) drawBarriers(this);
    if (S.upgrades.entryTotem) drawEntryTotem(this);
    if (S.upgrades.exitTotem) drawExitTotem(this);
    if (S.upgrades.multiLevel) drawMultiLevel(this);
    if (S.upgrades.drone) drawDrones(this);
    if (S.upgrades.spaceport) drawSpaceport(this);
    // Deferred win celebration: when purchaseSpaceport() triggers a
    // scene.restart so drawSpaceport runs, we set this flag so the new
    // scene can show the win overlay AFTER the UFOs are drawn.
    if (S.shouldShowWinCelebration) {
        S.shouldShowWinCelebration = false;
        this.time.delayedCall(400, () => { try { showGameWonCelebration(); } catch (e) { console.error(e); } });
    }
    // drawPaymentDecal removed — was redundant with booth sticker / SERVICIOS card,
    // and the previous position interfered with road traffic / ad screens.

    if (S.upgrades.booth) drawBooth(this);
    else drawPlaceholder(this);

    // Create employees: sprites in canvas when NO booth (papeleta-walks visible),
    // or "remote" entities (no canvas visual) when booth is owned.
    // HTML cards below the canvas are managed separately and always visible.
    S.employeeRoster.forEach((entry, idx) => {
        if (S.upgrades.booth) createEmployeeRemote(this, entry, idx);
        else createEmployeeSprite(this, entry, idx);
    });
    updateEmployeeCardsHTML();

    createHUD(this);
    createHireButton(this);
    createManagementButton(this);

    this.input.keyboard.on('keydown-SPACE', () => attemptCobroAnyone());
    this.input.keyboard.on('keydown-P', () => togglePause());
    this.input.keyboard.on('keydown-T', () => cycleSpeed());   // T = Time speed
    this.input.keyboard.on('keydown-H', () => hireEmployee());
    this.input.keyboard.on('keydown-G', () => toggleManagementPanel());
    this.input.keyboard.on('keydown-ESC', () => { if (S.managementOpen) closeManagementPanel(); });

    logEvent(`Día ${S.day} (${DAY_LONG[S.dayOfWeek]}) — ${S.upgrades.booth ? 'caseta operativa' : 'a pie nomás'}`);

    // Day intro banner — brief overlay welcoming the new day. Skip on restart
    // (when scene reloads due to upgrade purchase — flagged by shouldReopenManagement).
    if (!S.shouldReopenManagement && S.day > 1) {
        showDayIntroBanner();
    }

    // If a purchase triggered a scene restart, re-open the management panel
    // on the same tab so the player can keep buying. (Better UX than having
    // to press G again after every upgrade.)
    if (S.shouldReopenManagement) {
        S.shouldReopenManagement = false;
        if (S.shouldOpenTab) S.managementTab = S.shouldOpenTab;
        S.scene.time.delayedCall(50, () => openManagementPanel());
    }
}

// ─── BACKGROUND ────────────────────────────────────────────
function drawBackground(scene) {
    scene.add.rectangle(CONFIG.width / 2, (L.roadTop + L.roadBottom) / 2,
                        CONFIG.width, L.roadBottom - L.roadTop, COLORS.road);

    for (let x = 10; x < CONFIG.width; x += 36) {
        scene.add.rectangle(x, (L.entryLaneY + L.bypassLaneY) / 2, 18, 3, COLORS.laneDivider);
    }

    // (labels removed per user feedback — gameplay is self-explanatory)

    const lotCX = (L.lotLeft + L.lotRight) / 2;
    const lotCY = (L.lotFenceY + L.lotBottom) / 2;
    const lotW = L.lotRight - L.lotLeft;
    const lotH = L.lotBottom - L.lotFenceY;
    const lotColor = S.upgrades.pavement ? COLORS.lotFloorPaved : COLORS.lotFloorDirt;
    scene.add.rectangle(lotCX, lotCY, lotW, lotH, lotColor)
        .setStrokeStyle(3, COLORS.lotBorder);
    // Dirt texture: random tiny darker dots when not paved
    if (!S.upgrades.pavement) {
        for (let i = 0; i < 90; i++) {
            const dx = L.lotLeft + 10 + Math.random() * (lotW - 20);
            const dy = L.lotFenceY + 10 + Math.random() * (lotH - 20);
            scene.add.circle(dx, dy, 1, 0x4a3e28);
        }
    }

    drawTopFence(scene);

    scene.add.rectangle(L.entryVlaneX, (L.lotFenceY + L.centerLaneY) / 2,
                        50, L.centerLaneY - L.lotFenceY, COLORS.road);
    for (let y = L.lotFenceY + 18; y < L.centerLaneY; y += 28) {
        scene.add.rectangle(L.entryVlaneX, y, 3, 12, COLORS.roadLine);
    }
    scene.add.text(L.entryVlaneX, L.lotFenceY + 14, '↓', {
        font: 'bold 18px monospace', color: '#86efac'
    }).setOrigin(0.5);

    scene.add.rectangle(L.exitVlaneX, (L.lotFenceY + L.centerLaneY) / 2,
                        50, L.centerLaneY - L.lotFenceY, COLORS.road);
    for (let y = L.lotFenceY + 18; y < L.centerLaneY; y += 28) {
        scene.add.rectangle(L.exitVlaneX, y, 3, 12, COLORS.roadLine);
    }
    scene.add.text(L.exitVlaneX, L.lotFenceY + 14, '↑', {
        font: 'bold 18px monospace', color: '#fca5a5'
    }).setOrigin(0.5);

    scene.add.rectangle(lotCX, L.centerLaneY, lotW - 6, L.laneH, COLORS.road);
    for (let x = L.lotLeft + 15; x < L.lotRight; x += 36) {
        scene.add.rectangle(x, L.centerLaneY, 18, 3, COLORS.roadLine);
    }

    // Second horizontal lane (only when expansion is purchased)
    if (S.upgrades.expansions > 0) {
        scene.add.rectangle(lotCX, L.expansionLaneY, lotW - 6, L.expansionLaneH, COLORS.road);
        for (let x = L.lotLeft + 15; x < L.lotRight; x += 36) {
            scene.add.rectangle(x, L.expansionLaneY, 18, 3, COLORS.roadLine);
        }
        // Extend the entry & exit vlanes south to connect the new lane
        scene.add.rectangle(L.entryVlaneX, (L.centerLaneY + L.expansionLaneY) / 2,
                            50, L.expansionLaneY - L.centerLaneY, COLORS.road);
        scene.add.rectangle(L.exitVlaneX, (L.centerLaneY + L.expansionLaneY) / 2,
                            50, L.expansionLaneY - L.centerLaneY, COLORS.road);
        for (let y = L.centerLaneY + 14; y < L.expansionLaneY; y += 28) {
            scene.add.rectangle(L.entryVlaneX, y, 3, 12, COLORS.roadLine);
            scene.add.rectangle(L.exitVlaneX, y, 3, 12, COLORS.roadLine);
        }
    }
}

function drawPlaceholder(scene) {
    // No chalk circle, no placeholder text — just leave the spot blank.
    // The cobrador walks the lot and the CERRADO sign at the entrance signals
    // the missing booth when there's no one on shift.
    const sign = scene.add.text(L.entryOpeningX, L.lotFenceY - 20,
        '🚫 CERRADO', {
        font: 'bold 14px monospace', color: '#fff',
        backgroundColor: '#b91c1c', padding: { x: 8, y: 4 }
    }).setOrigin(0.5);
    S.streetClosedSign = sign;
}

function drawBooth(scene) {
    const cx = L.placeholderCx, cy = L.placeholderCy;
    const w = L.placeholderW, h = L.placeholderH;
    const sprites = [];

    // Shadow under booth
    sprites.push(scene.add.rectangle(cx + 2, cy + 4, w + 4, h - 10, 0x000000, 0.35));

    // Wood body — vertical planks (3 stripes for plank effect)
    const body = scene.add.rectangle(cx, cy + 2, w, h - 10, 0x8b5a2b).setStrokeStyle(2, 0x4a2c0e);
    sprites.push(body);
    // Plank lines
    for (let i = 1; i < 4; i++) {
        const px = cx - w/2 + (w / 4) * i;
        sprites.push(scene.add.rectangle(px, cy + 2, 1, h - 14, 0x4a2c0e, 0.5));
    }

    // Roof — bright yellow tiles with sloped overhang
    sprites.push(scene.add.rectangle(cx, cy - h/2 + 4, w + 16, 14, 0xeab308).setStrokeStyle(1, 0x713f12));
    sprites.push(scene.add.rectangle(cx, cy - h/2 + 1, w + 18, 5, 0xfbbf24));   // highlight strip on top
    // Tile divisions on roof
    for (let i = 1; i < 5; i++) {
        const tx = cx - w/2 - 6 + ((w + 16) / 5) * i;
        sprites.push(scene.add.rectangle(tx, cy - h/2 + 4, 1, 10, 0x713f12, 0.6));
    }

    // Window frame (darker brown)
    sprites.push(scene.add.rectangle(cx, cy - h/2 + 26, w - 18, 26, 0x4a2c0e));
    // Window glass (pale yellow-ish, cobrador visible behind)
    const windowGlass = scene.add.rectangle(cx, cy - h/2 + 26, w - 24, 22, 0xfde68a)
        .setStrokeStyle(1, 0x78350f);
    sprites.push(windowGlass);
    // Window cross dividers
    sprites.push(scene.add.rectangle(cx, cy - h/2 + 26, 1, 22, 0x78350f, 0.6));

    // Cobrador inside window
    const cobrador = scene.add.image(cx, cy - h/2 + 28, 'tomas_south').setScale(0.75); // was 0.55, v0.73
    sprites.push(cobrador);
    scene.tweens.add({
        targets: cobrador, y: { from: cobrador.y, to: cobrador.y - 2 },
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // Glass reflection (diagonal shine)
    sprites.push(scene.add.rectangle(cx - 12, cy - h/2 + 18, 3, 12, 0xffffff, 0.4));

    // Counter / cobro slot at bottom of window
    sprites.push(scene.add.rectangle(cx, cy - h/2 + 40, w - 20, 4, 0x1f1408));

    // Sign at bottom: "CASETA" — narrower booth fits with shorter sign
    sprites.push(scene.add.rectangle(cx, cy + h/2 - 8, w - 10, 14, 0xfbbf24).setStrokeStyle(1, 0x713f12));
    sprites.push(scene.add.text(cx, cy + h/2 - 8, 'CASETA', {
        font: 'bold 9px monospace', color: '#1f1408'
    }).setOrigin(0.5));

    // CERRADO sign overlay (shown when no operators)
    const closedBg = scene.add.rectangle(cx, cy - h/2 + 26, w - 24, 22, 0xb91c1c).setStrokeStyle(2, 0xfca5a5);
    const closedTxt = scene.add.text(cx, cy - h/2 + 26, 'CERRADO', {
        font: 'bold 11px monospace', color: '#fff'
    }).setOrigin(0.5);
    S.closedSignGroup = [closedBg, closedTxt];

    // POS terminal visible on the counter when purchased
    if (S.upgrades.pos) {
        const posCx = cx + 22, posCy = cy + h/2 - 22;
        // Terminal body
        sprites.push(scene.add.rectangle(posCx, posCy, 18, 14, 0x1f2937).setStrokeStyle(1, 0x10b981));
        // Green screen
        sprites.push(scene.add.rectangle(posCx, posCy - 2, 14, 5, 0x10b981));
        // Card slot
        sprites.push(scene.add.rectangle(posCx, posCy + 4, 10, 1, 0x6b7280));
        // Blinking LED
        const posLed = scene.add.circle(posCx + 7, posCy - 5, 1.5, 0xef4444);
        scene.tweens.add({ targets: posLed, alpha: { from: 1, to: 0.2 }, duration: 500, yoyo: true, repeat: -1 });
        sprites.push(posLed);
        // "POS" label
        sprites.push(scene.add.text(posCx + 12, posCy, 'POS', {
            font: 'bold 8px monospace', color: '#10b981'
        }).setOrigin(0, 0.5));
        // Tiny Redcomercio sticker (right of POS) — payment network branding
        drawRedcomercioBadge(scene, posCx + 22, posCy + 4, 0.55).forEach(s => sprites.push(s));
    }

    // ParkingApp sticker on the side of the booth (only after ParkingApp cinematic)
    if (S.cinematicShown) {
        // Side panel — visible plaque on the booth wall
        sprites.push(scene.add.rectangle(cx - w/2 + 9, cy + 8, 14, 18, 0xffffff)
            .setStrokeStyle(1, 0x1e40af));
        drawParkingAppBadge(scene, cx - w/2 + 9, cy + 3, 0.7).forEach(s => sprites.push(s));
        sprites.push(scene.add.text(cx - w/2 + 9, cy + 13, 'app', {
            font: 'bold 5px monospace', color: '#1e40af'
        }).setOrigin(0.5));
    }

    S.boothSprites = sprites;
    S.boothWindowSprite = windowGlass;
    S.boothCobradorSprite = cobrador;
    // Booth depth: cars (default depth 0) render under the booth.
    // Setting depth on every booth sprite so the entire structure stays on top.
    sprites.forEach(s => { try { s.setDepth(15); } catch(e) {} });
    if (windowGlass) windowGlass.setDepth(15);
    if (cobrador) cobrador.setDepth(16);
    updateBoothCobrador();
}

function drawSidewalk(scene) {
    const cx = CONFIG.width / 2;
    const cy = (L.sidewalkTop + L.sidewalkBottom) / 2;
    const h = L.sidewalkBottom - L.sidewalkTop;
    scene.add.rectangle(cx, cy, CONFIG.width, h, COLORS.sidewalk);
    for (let x = 20; x < CONFIG.width; x += 60) {
        scene.add.rectangle(x, cy, 1, h - 6, COLORS.sidewalkLine);
    }
}

function drawTopFence(scene) {
    const y = L.lotFenceY;
    for (let x = L.lotLeft; x < L.lotRight; x += 14) {
        const inEntry = Math.abs(x - L.entryOpeningX) < L.openingW / 2;
        const inExit = Math.abs(x - L.exitOpeningX) < L.openingW / 2;
        if (inEntry || inExit) continue;
        scene.add.rectangle(x, y, 8, 6, COLORS.fenceBar);
    }
}

function drawExitGateMarker(scene) {
    scene.add.rectangle(L.exitOffscreenX - 80, L.bypassLaneY, 50, 22, COLORS.exitGate, 0.6);
}

// ─── SPACES ────────────────────────────────────────────────
function createParkingSpaces(scene) {
    L.cols.forEach((x, c) => {
        // First 2 cols of row 1 become EV-only when EV charger is purchased
        const isEVSpace = S.upgrades.evCharger && c < 2;
        addSpace(scene, x, L.row1Y, 'up', c, isEVSpace);
        addSpace(scene, x, L.row2Y, 'down', c);
    });
    if (S.upgrades.expansions > 0) {
        for (let c = 0; c < CONFIG.expansionExtraSpaces && c < L.cols.length; c++) {
            addSpace(scene, L.cols[c], L.row3Y, 'down', c + 10);
        }
    }
}

function addSpace(scene, x, y, facing, col, isEV) {
    // EV spaces: dark green
    // Paved + lines: gray with bright white borders
    // Paved no lines: gray with muted borders
    // Dirt (no pavement): brown-ish fill that blends with the lot
    let fillColor, borderColor, labelColor;
    if (isEV) {
        fillColor = 0x14532d; borderColor = 0x22c55e; labelColor = '#86efac';
    } else if (S.upgrades.pavement) {
        fillColor = COLORS.spaceEmpty;
        borderColor = S.upgrades.lines ? 0xfafafa : COLORS.spaceBorder;
        labelColor = S.upgrades.lines ? '#fafafa' : '#9ca3af';
    } else {
        // Dirt era — spaces are just dashed outlines (no fill)
        fillColor = 0x7d6b4a;  // lighter dirt patch
        borderColor = 0x5c4f36; // brown stroke
        labelColor = '#a8966b';
    }
    const rect = scene.add.rectangle(x, y, L.spaceW, L.spaceH, fillColor)
        .setStrokeStyle(2, borderColor);
    const labelText = isEV ? '🔌' : 'P';
    const label = scene.add.text(x, y, labelText, {
        font: 'bold 16px monospace',
        color: labelColor
    }).setOrigin(0.5);
    S.spaces.push({ x, y, sprite: rect, label, occupied: null, facing, col, isEV: !!isEV });
}

function applySubscriptionsToSpaces() {
    S.subscriptions.forEach(sub => {
        const space = S.spaces[sub.spaceIndex];
        if (space && !space.occupied) {
            space.occupied = 'subscription';
            space.sprite.setFillStyle(COLORS.spaceSubscription);
            if (space.label) { space.label.setText('M'); space.label.setColor('#fbcfe8'); }
            // Subtle pulse so mensualista spots clearly stand out
            S.scene.tweens.add({
                targets: space.sprite, alpha: { from: 1, to: 0.7 },
                duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
            // Floating badge above the spot
            const badge = S.scene.add.text(space.x, space.y - 18, '📋', {
                font: '11px sans-serif'
            }).setOrigin(0.5).setDepth(3);
            S.scene.tweens.add({
                targets: badge, y: space.y - 22,
                duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        }
    });
}

// ─── EMPLOYEES ─────────────────────────────────────────────
function createEmployeeSprite(scene, rosterEntry, idx) {
    const homeX = L.employeeNoBoothStartX + idx * L.employeeNoBoothSpacing;
    const homeY = L.employeeNoBoothY;

    // Cobrador image (Tomás sprite) — v0.73 bumped 0.85 → 1.15 so the
    // character is more visible on mobile. Hit-area scales with the sprite.
    const sprite = scene.add.image(homeX, homeY, 'tomas_south').setScale(1.15);

    // Legacy circle/emoji kept as invisible aliases for tween targets
    const circle = scene.add.rectangle(homeX, homeY, 1, 1, 0).setAlpha(0);
    const emoji = scene.add.rectangle(homeX, homeY, 1, 1, 0).setAlpha(0);

    const tag = scene.add.text(homeX, homeY + 26, `${rosterEntry.name}\n${rosterEntry.shift.label}`, {
        font: 'bold 11px monospace', color: '#e2e8f0', align: 'center', lineSpacing: 2,
        stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5, 0);

    // Subtle idle bob
    scene.tweens.add({
        targets: sprite, y: { from: homeY, to: homeY - 2 },
        duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    const emp = {
        id: rosterEntry.id, rosterEntry, type: 'sprite',
        name: rosterEntry.name, shift: rosterEntry.shift,
        sprite, circle, emoji, tag, homeX, homeY,
        busy: false, salary: rosterEntry.salary,
    };

    const hitZone = scene.add.zone(homeX, homeY, 50, 60).setInteractive({ useHandCursor: true });
    hitZone.on('pointerdown', () => attemptCobroBy(emp));
    emp.hitZone = hitZone;

    S.employees.push(emp);
    updateEmployeeAppearance(emp);
    return emp;
}

function createEmployeeRemote(scene, rosterEntry, idx) {
    // No canvas visual — interaction happens via the HTML card below.
    const emp = {
        id: rosterEntry.id, rosterEntry, type: 'remote',
        name: rosterEntry.name, shift: rosterEntry.shift,
        busy: false, salary: rosterEntry.salary,
    };
    S.employees.push(emp);
    return emp;
}

function updateEmployeeAppearance(emp) {
    const onShift = isOnShift(emp, S.timeMinutes / 60);
    if (emp.type === 'sprite' && emp.sprite) {
        if (emp.busy) {
            emp.sprite.setTint(0xff9966);
            emp.sprite.setVisible(true); emp.tag.setVisible(true);
        } else if (onShift) {
            emp.sprite.clearTint();
            emp.sprite.setVisible(true); emp.tag.setVisible(true);
        } else {
            // Off-shift: empleado se fue a la casa — invisible
            emp.sprite.setVisible(false);
            emp.tag.setVisible(false);
            if (emp.hitZone) emp.hitZone.setVisible(false);
        }
    }
    // When booth is owned, update the shared in-booth sprite
    updateBoothCobrador();
}

function updateBoothCobrador() {
    if (!S.upgrades.booth || !S.boothCobradorSprite) return;
    const anyBusy = S.employees.some(e => e.busy);
    const anyOnShift = S.employees.some(e => isOnShift(e, S.timeMinutes / 60));
    if (anyBusy) {
        S.boothCobradorSprite.setTint(0xff9966);
        S.boothCobradorSprite.setVisible(true);
    } else if (anyOnShift) {
        S.boothCobradorSprite.clearTint();
        S.boothCobradorSprite.setVisible(true);
    } else {
        S.boothCobradorSprite.setVisible(false);
    }
    updateClosedSign();
}

function updateClosedSign() {
    const closed = !isOpen();
    if (S.upgrades.booth && S.closedSignGroup) {
        // CERRADO sign over the booth window
        S.closedSignGroup.forEach(o => o.setVisible(closed));
    }
    if (S.streetClosedSign) {
        S.streetClosedSign.setVisible(closed);
    }
}

// ─── HTML CARDS (below canvas) ─────────────────────────────
function updateEmployeeCardsHTML() {
    const strip = document.getElementById('employee-strip');
    if (!strip) return;
    const pill = document.getElementById('emp-count-pill');
    if (pill) {
        const onDuty = S.employees.filter(e => isOnShift(e, S.timeMinutes / 60)).length;
        pill.textContent = `${onDuty} en turno / ${S.employees.length} total`;
    }

    strip.innerHTML = '';
    S.employeeRoster.forEach(entry => {
        const live = S.employees.find(e => e.id === entry.id);
        const onShift = live ? isOnShift(live, S.timeMinutes / 60) : false;
        const busy = live ? live.busy : false;

        const stateClass = busy ? 'busy' : (onShift ? 'on-shift' : 'off-shift');
        const statusLabel = busy ? '🛂 ATENDIENDO' : (onShift ? '🟢 EN TURNO' : '💤 OFF');

        const daysHTML = DAY_SHORT.map((d, i) => {
            const works = entry.shift.days.includes(i);
            const today = i === S.dayOfWeek;
            const cls = ['day-pill'];
            if (works) cls.push('works');
            if (today) cls.push('today');
            return `<span class="${cls.join(' ')}">${d}</span>`;
        }).join('');

        const daysWorked = S.day - entry.hiredOnDay + 1;
        const totalPaid = entry.salary * daysWorked;

        // ── Level + XP progress ──
        const xp = entry.xp || 0;
        const lv = entry.level || 1;
        const isMaxLevel = lv >= 5;
        const xpForCurrent = CONFIG.levelThresholds[lv - 1];
        const xpForNext = isMaxLevel ? xpForCurrent : CONFIG.levelThresholds[lv];
        const xpInLevel = xp - xpForCurrent;
        const xpToNext = xpForNext - xpForCurrent;
        const xpPct = isMaxLevel ? 100 : Math.min(100, Math.round((xpInLevel / xpToNext) * 100));
        const speedPct = Math.round(CONFIG.levelSpeedBonus[lv - 1] * 100);
        const autoLabel = CONFIG.levelAutonomyPerMin[lv - 1] > 0 ? '· 🤖 autónomo' : '';

        const card = document.createElement('div');
        card.className = `emp-card ${stateClass}`;
        card.dataset.empId = entry.id;
        card.innerHTML = `
            <div class="emp-header">
                <span class="emp-name">👤 ${entry.name}</span>
                <span class="emp-status">${statusLabel}</span>
            </div>
            <div class="emp-shift">${entry.shift.label} · <strong>${entry.shift.start}-${entry.shift.end}</strong></div>
            <div class="emp-days">${daysHTML}</div>
            <div class="emp-level" style="margin-top:6px; font-size:11px; color:#fde047;">
                ⭐ Lv ${lv}  <span style="color:#94a3b8;">·</span>
                <span style="color:#86efac;">+${speedPct}% vel</span> ${autoLabel}
            </div>
            <div class="emp-xp" style="margin:3px 0 6px 0; height:6px; background:#1e293b; border-radius:3px; overflow:hidden; position:relative;">
                <div style="height:100%; width:${xpPct}%; background:linear-gradient(90deg,#fbbf24,#fde047);"></div>
                <span style="position:absolute; right:4px; top:-1px; font-size:9px; color:#cbd5e1;">${isMaxLevel ? 'MAX' : xp + '/' + xpForNext}</span>
            </div>
            <div class="emp-stat-line"><span class="label">Sueldo:</span> <span class="val">$${entry.salary.toLocaleString('es-CL')}/día</span></div>
            <div class="emp-meta">
                <span class="meta-item">Desde D${entry.hiredOnDay}</span>
                <span class="meta-item">${daysWorked}d</span>
                <span class="meta-item">$${totalPaid.toLocaleString('es-CL')} pago</span>
            </div>
            ${isMaxLevel ? '' : `
            <button class="bonus-btn" data-emp="${entry.id}" style="margin-top:6px; width:100%; padding:4px; background:#16a34a; color:#fff; border:none; border-radius:4px; font-family:monospace; font-size:10px; font-weight:bold; cursor:pointer;">
                💰 Bono $${CONFIG.bonusCost.toLocaleString('es-CL')} (+${CONFIG.bonusXp} XP)
            </button>`}
        `;
        // Card click = attend; bonus button click = bono (stopPropagation)
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('bonus-btn')) return;
            const target = S.employees.find(e2 => e2.id === entry.id);
            if (target) attemptCobroBy(target);
        });
        const bonusBtn = card.querySelector('.bonus-btn');
        if (bonusBtn) {
            bonusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                giveBonus(entry.id);
            });
        }
        strip.appendChild(card);
    });

    // Empty-state hint card to encourage hiring
    if (S.employeeRoster.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'emp-card-empty';
        empty.textContent = '➕ Sin empleados. Contrata con H o desde Gestión.';
        strip.appendChild(empty);
    }
}

function isOnShift(emp, hour) {
    return emp.shift.days.includes(S.dayOfWeek)
        && hour >= emp.shift.start
        && hour < emp.shift.end;
}

function isOpen() {
    const h = S.timeMinutes / 60;
    return S.employees.some(e => isOnShift(e, h));
}

function findAvailableEmployee() {
    const h = S.timeMinutes / 60;
    return S.employees.find(e => !e.busy && isOnShift(e, h));
}

// ─── HIRE & FIRE ───────────────────────────────────────────
function pickNextShift() {
    // Round-robin across the 4 preset shifts
    const counts = SHIFT_LIST.map(s => S.employeeRoster.filter(e => e.shift.id === s.id).length);
    let minIdx = 0;
    counts.forEach((c, i) => { if (c < counts[minIdx]) minIdx = i; });
    return SHIFT_LIST[minIdx];
}

function hireEmployee(shift = null) {
    if (!shift) shift = pickNextShift();
    const name = pickRandomEmployeeName();
    const entry = {
        id: 'emp-' + Math.random().toString(36).slice(2),
        name, shift, salary: CONFIG.employeeSalary, hiredOnDay: S.day,
        xp: 0, level: 1,
    };
    S.employeeRoster.push(entry);
    if (S.upgrades.booth) createEmployeeRemote(S.scene, entry, S.employees.length);
    else createEmployeeSprite(S.scene, entry, S.employees.length);
    flashEvent(`✅ Contrataste a ${name} (${shift.label} ${shift.start}-${shift.end})`);
    updateEmployeeCardsHTML();
    updateHUD();
}

function cycleEmployeeShift(rosterId) {
    const entry = S.employeeRoster.find(e => e.id === rosterId);
    if (!entry) return;
    const currentIdx = SHIFT_LIST.findIndex(s => s.id === entry.shift.id);
    const nextShift = SHIFT_LIST[(currentIdx + 1) % SHIFT_LIST.length];
    entry.shift = nextShift;
    // Update live employee
    const live = S.employees.find(e => e.id === rosterId);
    if (live) {
        live.shift = nextShift;
        if (live.tag) live.tag.setText(`${entry.name}\n${nextShift.label}`);
    }
    flashEvent(`🔄 ${entry.name} ahora en turno ${nextShift.label} (${nextShift.start}-${nextShift.end})`);
    updateEmployeeCardsHTML();
}

function fireEmployee(rosterId) {
    const rIdx = S.employeeRoster.findIndex(e => e.id === rosterId);
    if (rIdx < 0) return;
    if (S.employeeRoster.length <= 1) { flashEvent('❌ No puedes despedir al último cobrador.'); return; }
    const entry = S.employeeRoster[rIdx];
    const severance = entry.salary * CONFIG.severanceMultiplier;
    if (S.money < severance) { flashEvent('❌ No alcanza para indemnización.'); return; }
    const live = S.employees.find(e => e.id === rosterId);
    if (live && live.busy) { flashEvent('🛂 No puedes despedir a alguien atendiendo.'); return; }

    S.money -= severance;
    S.employeeRoster.splice(rIdx, 1);

    if (live) {
        if (live.type === 'sprite') {
            if (live.sprite) live.sprite.destroy();
            live.circle.destroy(); live.emoji.destroy(); live.tag.destroy(); live.hitZone.destroy();
        }
        S.employees = S.employees.filter(e => e.id !== rosterId);
    }
    flashEvent(`💔 Despediste a ${entry.name}. Indemnización: -$${severance.toLocaleString('es-CL')}`);
    updateEmployeeCardsHTML();
}

function createHireButton(scene) {
    // v0.74: on mobile the HTML #touch-hire button in the bottom bar does the
    // same thing — skip drawing the canvas version to avoid duplicate UI.
    // User feedback v0.73: "el botón de gestión y contratar está dos veces".
    if (isMobileDevice()) return;
    const btn = scene.add.text(CONFIG.width - 20, CONFIG.height - 56, '+ Cobrador (H)', {
        font: 'bold 14px monospace', color: '#fff',
        backgroundColor: '#16a34a', padding: { x: 12, y: 8 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => hireEmployee());
}

function createManagementButton(scene) {
    // v0.74: same rationale as createHireButton — HTML touch-gestion handles
    // this on mobile, don't render the canvas duplicate.
    if (isMobileDevice()) return;
    const btn = scene.add.text(CONFIG.width - 170, CONFIG.height - 56, '🏗️ GESTIÓN (G)', {
        font: 'bold 14px monospace', color: '#fff',
        backgroundColor: '#7c3aed', padding: { x: 12, y: 8 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', toggleManagementPanel);
}

// ─── MANAGEMENT PANEL ──────────────────────────────────────
function toggleManagementPanel() {
    if (S.managementOpen) closeManagementPanel();
    else openManagementPanel();
}

function openManagementPanel() {
    S.managementOpen = true;
    if (!S.paused && !S.dayEnded) {
        S.paused = true;
        S.scene.tweens.pauseAll();
    }
    renderManagementPanel();
}

function closeManagementPanel() {
    S.managementUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.managementUI = [];
    S.managementOpen = false;
    if (!S.dayEnded) {
        S.paused = false;
        S.scene.tweens.resumeAll();
    }
}

// Called from purchase functions: schedule a re-open of the panel after
// scene.restart so the player can keep shopping without re-pressing G.
function flagReopenManagement() {
    S.shouldReopenManagement = true;
    S.shouldOpenTab = S.managementTab || 'upgrades';
    closeManagementPanel();
    // Achievements often trigger on purchase — check here too
    checkAchievements();
}

function renderManagementPanel() {
    S.managementUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.managementUI = [];

    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;

    if (S.managementTab === undefined) S.managementTab = 'employees';

    S.managementUI.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.92));

    const panelW = Math.min(880, W - 20);
    const panelH = H - 30;
    S.managementUI.push(
        scene.add.rectangle(W/2, H/2, panelW, panelH, 0x1e293b).setStrokeStyle(3, 0x7c3aed)
    );

    // ── HEADER ─────────────────────────────────────────────
    S.managementUI.push(scene.add.text(W/2 - panelW/2 + 24, 24, '🏗️ GESTIÓN', {
        font: 'bold 20px monospace', color: '#fbbf24'
    }).setOrigin(0, 0));
    S.managementUI.push(scene.add.text(W/2 - panelW/2 + 24, 50,
        `💰 $${Math.floor(S.money).toLocaleString('es-CL')}   ⭐ ${S.reputation}%   📅 D${S.day} ${DAY_LONG[S.dayOfWeek]}`,
        { font: 'bold 13px monospace', color: '#10b981' }
    ).setOrigin(0, 0));

    // ── CLOSE BUTTON (always visible, fixed position) ──────
    const closeBtn = scene.add.text(W - 26, 24, '✕', {
        font: 'bold 22px monospace', color: '#fff',
        backgroundColor: '#ef4444', padding: { x: 14, y: 6 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', closeManagementPanel);
    S.managementUI.push(closeBtn);

    // ── TABS ───────────────────────────────────────────────
    const tabs = [
        { id: 'employees', label: '👥 Equipo' },
        { id: 'upgrades',  label: '🛠️ Upgrades' },
        { id: 'lots',      label: '📍 Lotes' },
        { id: 'stats',     label: '📊 Stats' },
    ];
    const tabY = 84;
    const tabStartX = W/2 - panelW/2 + 24;
    tabs.forEach((t, i) => {
        const active = S.managementTab === t.id;
        const btn = scene.add.text(tabStartX + i * 130, tabY, ` ${t.label} `, {
            font: 'bold 13px monospace',
            color: active ? '#fff' : '#94a3b8',
            backgroundColor: active ? '#7c3aed' : '#334155',
            padding: { x: 10, y: 8 }
        }).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => { S.managementTab = t.id; renderManagementPanel(); });
        S.managementUI.push(btn);
    });

    // Tab content starts at y=130
    const contentY = 130;
    if (S.managementTab === 'employees') renderEmployeesTab(scene, contentY, panelW);
    else if (S.managementTab === 'upgrades') renderUpgradesTab(scene, contentY, panelW);
    else if (S.managementTab === 'lots') renderLotsTab(scene, contentY, panelW);
    else if (S.managementTab === 'stats') renderStatsTab(scene, contentY, panelW);

    S.managementUI.push(scene.add.text(W/2, H - 14, 'ESC o ✕ para cerrar  ·  G abre/cierra', {
        font: 'italic 11px monospace', color: '#94a3b8'
    }).setOrigin(0.5));

    // All management UI sits ABOVE booth (depth 15), guard accessories (~depth 0),
    // barriers and other lot decoration. Set high depth so the panel always wins.
    S.managementUI.forEach(o => { try { o.setDepth(200); } catch(e) {} });
}

function renderEmployeesTab(scene, contentY, panelW) {
    const W = CONFIG.width;
    const tableX = W/2 - panelW/2 + 24;
    const colNameW = 130, colDayW = 60, colSalW = 85, colActionW = 110;

    const tableY = contentY;

    // Header row
    S.managementUI.push(scene.add.text(tableX, tableY, 'COBRADOR', {
        font: 'bold 12px monospace', color: '#cbd5e1'
    }));
    DAY_SHORT.forEach((d, i) => {
        const cx = tableX + colNameW + i * colDayW + colDayW/2;
        const isToday = i === S.dayOfWeek;
        const headerBg = isToday
            ? scene.add.rectangle(cx, tableY + 8, colDayW - 4, 22, 0xfbbf24, 0.25)
            : null;
        if (headerBg) S.managementUI.push(headerBg);
        S.managementUI.push(scene.add.text(cx, tableY + 7,
            isToday ? `${d} HOY` : d,
            {
                font: 'bold 12px monospace',
                color: isToday ? '#fbbf24' : '#a5f3fc'
            }
        ).setOrigin(0.5));
    });
    S.managementUI.push(scene.add.text(tableX + colNameW + 7 * colDayW + 10, tableY, 'SUELDO', {
        font: 'bold 12px monospace', color: '#cbd5e1'
    }));

    // Separator line
    S.managementUI.push(scene.add.rectangle(
        tableX + (colNameW + 7*colDayW + colSalW + colActionW)/2,
        tableY + 28,
        colNameW + 7*colDayW + colSalW + colActionW, 1, 0x475569
    ));

    // Rows
    let rowY = tableY + 40;
    const rowH = 38;
    S.employeeRoster.forEach((entry, ri) => {
        // Row background (alternating)
        if (ri % 2 === 0) {
            S.managementUI.push(scene.add.rectangle(
                tableX + (colNameW + 7*colDayW + colSalW + colActionW)/2,
                rowY + rowH/2 - 4,
                colNameW + 7*colDayW + colSalW + colActionW - 4,
                rowH, 0x334155, 0.6
            ));
        }

        // Name + shift
        S.managementUI.push(scene.add.text(tableX + 6, rowY,
            `👤 ${entry.name}`,
            { font: 'bold 13px monospace', color: '#fff' }
        ));
        S.managementUI.push(scene.add.text(tableX + 6, rowY + 17,
            `${entry.shift.label}`,
            { font: '11px monospace', color: '#94a3b8' }
        ));

        // Days
        for (let d = 0; d < 7; d++) {
            const works = entry.shift.days.includes(d);
            const isToday = d === S.dayOfWeek;
            const cx = tableX + colNameW + d * colDayW + colDayW/2;
            const cy = rowY + 12;
            if (works) {
                const bg = scene.add.rectangle(cx, cy + 2, colDayW - 8, 28,
                    isToday ? 0x10b981 : 0x3b82f6, isToday ? 0.6 : 0.35
                );
                S.managementUI.push(bg);
                S.managementUI.push(scene.add.text(cx, cy,
                    `${entry.shift.start}-${entry.shift.end}`,
                    { font: 'bold 12px monospace', color: '#fff' }
                ).setOrigin(0.5));
            } else {
                S.managementUI.push(scene.add.text(cx, cy, '—', {
                    font: 'bold 13px monospace', color: '#475569'
                }).setOrigin(0.5));
            }
        }

        // Salary
        S.managementUI.push(scene.add.text(tableX + colNameW + 7*colDayW + 12, rowY + 8,
            `$${entry.salary.toLocaleString('es-CL')}`,
            { font: 'bold 13px monospace', color: '#fbbf24' }
        ));

        // Fire button
        const sev = entry.salary * CONFIG.severanceMultiplier;
        const canFire = S.money >= sev && S.employeeRoster.length > 1;
        const fireBtn = scene.add.text(tableX + colNameW + 7*colDayW + colSalW + 10, rowY + 4,
            `  Despedir -$${(sev/1000).toFixed(0)}k  `,
            {
                font: 'bold 11px monospace',
                color: canFire ? '#fff' : '#9ca3af',
                backgroundColor: canFire ? '#dc2626' : '#475569',
                padding: { x: 8, y: 4 }
            }
        );
        if (canFire) {
            fireBtn.setInteractive({ useHandCursor: true });
            fireBtn.on('pointerdown', () => { fireEmployee(entry.id); renderManagementPanel(); });
        }
        S.managementUI.push(fireBtn);

        rowY += rowH + 6;
    });

    // Hire dropdown / buttons
    const hireY = rowY + 14;
    S.managementUI.push(scene.add.text(tableX, hireY, '➕  CONTRATAR:', {
        font: 'bold 13px monospace', color: '#cbd5e1'
    }));
    SHIFT_LIST.forEach((shift, si) => {
        const bx = tableX + 160 + (si % 2) * 200;
        const by = hireY + Math.floor(si / 2) * 36;
        const btn = scene.add.text(bx, by - 4,
            ` ${shift.label} ${shift.start}-${shift.end} `,
            {
                font: 'bold 11px monospace', color: '#fff',
                backgroundColor: '#16a34a', padding: { x: 8, y: 6 }
            }
        ).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => { hireEmployee(shift); renderManagementPanel(); });
        S.managementUI.push(btn);
    });
}

function renderUpgradesTab(scene, contentY, panelW) {
    const W = CONFIG.width;
    const colLX = W/2 - panelW/2 + 24;
    const colRX = colLX + 410;
    // Each row: button ~22px (font 12 + padding 5*2) + desc ~12px + gap = ~36-40px
    const rowH = 36;

    // Helper to render a single upgrade row (compact, fits column width ~390)
    const renderRow = (x, y, cfg) => {
        if (cfg.done) {
            S.managementUI.push(scene.add.text(x, y, `  ✅  ${cfg.doneLabel}`, {
                font: 'bold 12px monospace', color: '#10b981'
            }));
            return;
        }
        const canAfford = S.money >= cfg.cost;
        const btn = scene.add.text(x, y, ` ${cfg.label} `, {
            font: 'bold 12px monospace', color: canAfford ? '#fff' : '#9ca3af',
            backgroundColor: canAfford ? cfg.color : '#374151',
            padding: { x: 9, y: 5 }
        });
        if (canAfford && cfg.onClick) {
            btn.setInteractive({ useHandCursor: true });
            btn.on('pointerdown', cfg.onClick);
        }
        S.managementUI.push(btn);
        if (cfg.desc) {
            // y + 24 = below the button bottom (button height ~22 with padding)
            S.managementUI.push(scene.add.text(x, y + 24, '  ' + cfg.desc,
                { font: '10px monospace', color: '#94a3b8' }));
        }
    };

    // ── LEFT COLUMN: INFRASTRUCTURE ─────────────────────────
    let yL = contentY;
    S.managementUI.push(scene.add.text(colLX, yL, '🏗️ INFRAESTRUCTURA', {
        font: 'bold 13px monospace', color: '#fbbf24'
    }));
    yL += 22;

    // Caseta
    renderRow(colLX, yL, {
        done: S.upgrades.booth,
        doneLabel: 'Caseta de cobro',
        cost: CONFIG.boothCost,
        label: `🛂 CASETA  $${CONFIG.boothCost.toLocaleString('es-CL')}`,
        color: '#3b82f6',
        desc: 'sin caminata · cobro 33% más rápido',
        onClick: purchaseBooth,
    });
    yL += rowH + 6;

    // Ad screens
    const adRemaining = CONFIG.adScreenMax - S.upgrades.adScreens;
    renderRow(colLX, yL, {
        done: adRemaining <= 0,
        doneLabel: `Pantallas (${CONFIG.adScreenMax}/${CONFIG.adScreenMax})`,
        cost: CONFIG.adScreenCost,
        label: `📺 PANTALLA  $${CONFIG.adScreenCost.toLocaleString('es-CL')}  (${S.upgrades.adScreens}/${CONFIG.adScreenMax})`,
        color: '#0891b2',
        desc: `+$${CONFIG.adScreenIncomePerGameMin}/min · +${CONFIG.adScreenPatienceBonusPct}% paciencia`,
        onClick: () => { purchaseAdScreen(); renderManagementPanel(); },
    });
    yL += rowH + 6;

    // Signs
    const signRemaining = CONFIG.signMax - S.upgrades.signs;
    renderRow(colLX, yL, {
        done: signRemaining <= 0,
        doneLabel: `Carteles (${CONFIG.signMax}/${CONFIG.signMax})`,
        cost: CONFIG.signCost,
        label: `📣 CARTEL  $${CONFIG.signCost.toLocaleString('es-CL')}  (${S.upgrades.signs}/${CONFIG.signMax})`,
        color: '#ca8a04',
        desc: `+${CONFIG.signSpawnBoostPct}% spawn de autos`,
        onClick: () => { purchaseSign(); renderManagementPanel(); },
    });
    yL += rowH + 6;

    // Expansion
    const expRemaining = CONFIG.expansionMax - S.upgrades.expansions;
    renderRow(colLX, yL, {
        done: expRemaining <= 0,
        doneLabel: `Lote al máximo (${CONFIG.expansionMax}/${CONFIG.expansionMax})`,
        cost: CONFIG.expansionCost,
        label: `🏗️ AMPLIAR  $${CONFIG.expansionCost.toLocaleString('es-CL')}  (${S.upgrades.expansions}/${CONFIG.expansionMax})`,
        color: '#16a34a',
        desc: `+${CONFIG.expansionExtraSpaces} espacios de estacionamiento`,
        onClick: () => { purchaseExpansion(); },
    });
    yL += rowH + 6;

    // Subscriptions (Mensualistas)
    const subActive = S.subscriptions.length;
    const subRemaining = CONFIG.subscriptionMax - subActive;
    renderRow(colLX, yL, {
        done: subRemaining <= 0,
        doneLabel: `Mensualistas (${CONFIG.subscriptionMax}/${CONFIG.subscriptionMax})`,
        cost: CONFIG.subscriptionPricePerDay * CONFIG.subscriptionDayRange,
        label: `📋 MENSUALISTA  $${CONFIG.subscriptionPricePerDay.toLocaleString('es-CL')}/día x${CONFIG.subscriptionDayRange}d  (${subActive}/${CONFIG.subscriptionMax})`,
        color: '#a855f7',
        desc: 'revenue fijo · ocupa 1 espacio',
        onClick: () => { purchaseSubscription(); renderManagementPanel(); },
    });
    yL += rowH + 6;

    // POS upgrade (Nivel 2)
    if (S.upgrades.booth && !S.upgrades.pos && S.cinematicShown) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.posCost,
            label: `💳 POS DIGITAL  $${CONFIG.posCost.toLocaleString('es-CL')}`,
            color: '#dc2626',
            desc: 'Nivel 2 · cobro 0.3s · 5x productividad',
            onClick: () => { purchasePOS(); renderManagementPanel(); },
        });
    } else if (S.upgrades.pos) {
        renderRow(colLX, yL, { done: true, doneLabel: 'POS Digital (Nivel 2)' });
    } else {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  💳  POS DIGITAL  — bloqueado (necesita caseta + cinemática)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // Barreras (Nivel 3) — requires POS first
    if (S.upgrades.pos && !S.upgrades.barriers) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.barriersCost,
            label: `🚧 BARRERAS  $${CONFIG.barriersCost.toLocaleString('es-CL')}`,
            color: '#ea580c',
            desc: 'Nivel 3 · gate físico · -90% escapes',
            onClick: () => { purchaseBarriers(); renderManagementPanel(); },
        });
    } else if (S.upgrades.barriers) {
        renderRow(colLX, yL, { done: true, doneLabel: 'Barreras (Nivel 3)' });
    } else {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  🚧  BARRERAS  — bloqueado (necesita POS)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // Tótem de tickets de entrada (final Nivel 3) — requires barriers
    if (S.upgrades.barriers && !S.upgrades.entryTotem) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.entryTotemCost,
            label: `🎫 TÓTEM ENTRADA  $${CONFIG.entryTotemCost.toLocaleString('es-CL')}`,
            color: '#0891b2',
            desc: 'self-service · cobrador solo en salidas',
            onClick: () => { purchaseEntryTotem(); renderManagementPanel(); },
        });
    } else if (S.upgrades.entryTotem) {
        renderRow(colLX, yL, { done: true, doneLabel: 'Tótem de entrada' });
    } else {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  🎫  TÓTEM ENTRADA  — bloqueado (necesita Barreras)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // Tótem AUTOPAGO de salida (Nivel 4) — requires entryTotem
    if (S.upgrades.entryTotem && !S.upgrades.exitTotem) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.exitTotemCost,
            label: `💳 AUTOPAGO  $${CONFIG.exitTotemCost.toLocaleString('es-CL')}`,
            color: '#16a34a',
            desc: 'Nivel 4 · salida self-service · 0 cobrador',
            onClick: () => { purchaseExitTotem(); renderManagementPanel(); },
        });
    } else if (S.upgrades.exitTotem) {
        renderRow(colLX, yL, { done: true, doneLabel: 'Autopago (Nivel 4)' });
    } else {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  💳  AUTOPAGO  — bloqueado (necesita Tótem entrada)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // ParkingApp Integration (Nivel 5) — requires exitTotem
    if (S.upgrades.exitTotem && !S.upgrades.parkingApp) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.parkingAppCost,
            label: `📱 PARKING APP  $${CONFIG.parkingAppCost.toLocaleString('es-CL')}`,
            color: '#3b82f6',
            desc: 'Nivel 5 · 30% premium · +$50/min suscripciones',
            onClick: () => { purchaseParkingApp(); renderManagementPanel(); },
        });
    } else if (S.upgrades.parkingApp) {
        renderRow(colLX, yL, { done: true, doneLabel: 'ParkingApp (Nivel 5)' });
    } else {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  📱  PARKING APP  — bloqueado (necesita Autopago)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // Valet AI (Nivel 6) — requires parkingApp
    if (S.upgrades.parkingApp && !S.upgrades.valetAI) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.valetAICost,
            label: `🤖 VALET AI  $${CONFIG.valetAICost.toLocaleString('es-CL')}`,
            color: '#a855f7',
            desc: 'Nivel 6 · 1.8x tarifa luxury · self-park',
            onClick: () => { purchaseValetAI(); renderManagementPanel(); },
        });
    } else if (S.upgrades.valetAI) {
        renderRow(colLX, yL, { done: true, doneLabel: 'Valet AI (Nivel 6)' });
    } else {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  🤖  VALET AI  — bloqueado (necesita ParkingApp)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // Multi-level parking (Nivel 7)
    if (S.upgrades.valetAI && !S.upgrades.multiLevel) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.multiLevelCost,
            label: `🏢 PARKING VERTICAL  $${(CONFIG.multiLevelCost/1000).toFixed(0)}k`,
            color: '#0284c7',
            desc: 'Nivel 7 · +$200/min pasivo de pisos ocultos',
            onClick: () => { purchaseMultiLevel(); renderManagementPanel(); },
        });
    } else if (S.upgrades.multiLevel) {
        renderRow(colLX, yL, { done: true, doneLabel: 'Parking Vertical (Nivel 7)' });
    } else if (S.upgrades.parkingApp) {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  🏢  PARKING VERTICAL  — bloqueado (necesita Valet AI)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // Drone delivery (Nivel 8)
    if (S.upgrades.multiLevel && !S.upgrades.drone) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.droneCost,
            label: `🚁 DRONES  $${(CONFIG.droneCost/1000).toFixed(0)}k`,
            color: '#7c3aed',
            desc: 'Nivel 8 · 1.3x tarifa · $350/min revenue ambient',
            onClick: () => { purchaseDrone(); renderManagementPanel(); },
        });
    } else if (S.upgrades.drone) {
        renderRow(colLX, yL, { done: true, doneLabel: 'Drones (Nivel 8)' });
    } else if (S.upgrades.valetAI) {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  🚁  DRONES  — bloqueado (necesita Parking Vertical)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // Spaceport (Nivel 9) — winning condition
    if (S.upgrades.drone && !S.upgrades.spaceport) {
        renderRow(colLX, yL, {
            done: false,
            cost: CONFIG.spaceportCost,
            label: `🚀 SPACEPORT  $${(CONFIG.spaceportCost/1000000).toFixed(0)}M`,
            color: '#dc2626',
            desc: 'Nivel 9 · ¡GANAR EL JUEGO! · naves espaciales',
            onClick: () => { purchaseSpaceport(); renderManagementPanel(); },
        });
    } else if (S.upgrades.spaceport) {
        renderRow(colLX, yL, { done: true, doneLabel: '🚀 ¡SPACEPORT GANADO!' });
    } else if (S.upgrades.multiLevel) {
        S.managementUI.push(scene.add.text(colLX, yL,
            '  🚀  SPACEPORT  — bloqueado (necesita Drones)',
            { font: 'italic 11px monospace', color: '#64748b' }));
    }
    yL += rowH + 6;

    // ── RIGHT COLUMN: SERVICIOS & ESTÉTICA ──────────────────
    let yR = contentY;
    S.managementUI.push(scene.add.text(colRX, yR, '🛡️ SERVICIOS', {
        font: 'bold 13px monospace', color: '#fbbf24'
    }));
    yR += 22;

    // Cameras
    renderRow(colRX, yR, {
        done: S.upgrades.cameras,
        doneLabel: 'Cámaras de seguridad',
        cost: CONFIG.cameraCost,
        label: `📹 CÁMARAS  $${CONFIG.cameraCost.toLocaleString('es-CL')}`,
        color: '#1e40af',
        desc: 'bloquea robos · bloquea vandalismo',
        onClick: () => { purchaseCameras(); renderManagementPanel(); },
    });
    yR += rowH + 6;

    // Car wash
    renderRow(colRX, yR, {
        done: S.upgrades.carwash,
        doneLabel: 'Lavado de autos',
        cost: CONFIG.washCost,
        label: `🚿 LAVADO  $${CONFIG.washCost.toLocaleString('es-CL')}`,
        color: '#0d9488',
        desc: `${CONFIG.washPctChance}% pagan $${CONFIG.washPrice.toLocaleString('es-CL')} extra`,
        onClick: () => { purchaseCarwash(); renderManagementPanel(); },
    });
    yR += rowH + 6;

    // EV charger
    renderRow(colRX, yR, {
        done: S.upgrades.evCharger,
        doneLabel: 'Cargador EV',
        cost: CONFIG.evChargerCost,
        label: `🔌 CARGADOR EV  $${CONFIG.evChargerCost.toLocaleString('es-CL')}`,
        color: '#16a34a',
        desc: `${CONFIG.evCustomerChance}% spawns EV · pagan ${CONFIG.evMultiplier}x`,
        onClick: () => { purchaseEVCharger(); renderManagementPanel(); },
    });
    yR += rowH + 12;

    // ── AESTHETIC / REPUTATION UPGRADES (right col) ─────────
    S.managementUI.push(scene.add.text(colRX, yR, '✨ ESTÉTICA & REPUTACIÓN', {
        font: 'bold 13px monospace', color: '#a5f3fc'
    }));
    yR += 22;
    const aestheticUpgrades = [
        { key: 'pavement', cost: CONFIG.pavementCost, bonus: CONFIG.pavementRepBonus, name: '🪨 Pavimentar',      fn: purchasePavement },
        { key: 'lines',    cost: CONFIG.linesCost,    bonus: CONFIG.linesRepBonus,    name: '🎨 Líneas pintadas',   fn: purchaseLines },
        { key: 'lights',   cost: CONFIG.lightsCost,   bonus: CONFIG.lightsRepBonus,   name: '💡 Luminarias',        fn: purchaseLights },
        { key: 'guard',    cost: CONFIG.guardCost,    bonus: CONFIG.guardRepBonus,    name: '👮 Guardia patrulla',  fn: purchaseGuard },
        { key: 'greenery', cost: CONFIG.greeneryCost, bonus: CONFIG.greeneryRepBonus, name: '🌳 Áreas verdes',      fn: purchaseGreenery },
    ];
    aestheticUpgrades.forEach(a => {
        const active = S.upgrades[a.key];
        const canAfford = S.money >= a.cost;
        if (active) {
            S.managementUI.push(scene.add.text(colRX, yR, `  ✅  ${a.name}`, {
                font: 'bold 11px monospace', color: '#10b981'
            }));
        } else {
            const btn = scene.add.text(colRX, yR, ` ${a.name}  $${a.cost.toLocaleString('es-CL')}  +${a.bonus} rep `, {
                font: 'bold 11px monospace', color: canAfford ? '#fff' : '#9ca3af',
                backgroundColor: canAfford ? '#7c2d12' : '#374151',
                padding: { x: 8, y: 4 }
            });
            if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => { a.fn(); renderManagementPanel(); }); }
            S.managementUI.push(btn);
        }
        yR += 22;
    });

    // ── CONVENIOS (spans full width at bottom) ─────────────
    const yBottom = Math.max(yL, yR) + 14;
    S.managementUI.push(scene.add.text(colLX, yBottom, '🤝 CONVENIOS', {
        font: 'bold 13px monospace', color: '#fbbf24'
    }));
    let xConv = colLX;
    let yConv = yBottom + 22;
    let convIdx = 0;
    // Abbreviate names so 3 buttons fit in the bottom row
    const conveniosShort = {
        restaurant: '🍽️ Restaurante',
        mall:       '🛍️ Mall Plaza',
        cinema:     '🎬 Cine Hoyts',
    };
    Object.values(CONVENIOS).forEach(c => {
        const active = S.upgrades.convenios.includes(c.id);
        const canAfford = S.money >= c.cost;
        const xPos = colLX + (convIdx % 3) * 270;
        const yPos = yBottom + 22 + Math.floor(convIdx / 3) * 24;
        const shortName = conveniosShort[c.id] || c.name;
        if (active) {
            S.managementUI.push(scene.add.text(xPos, yPos, `  ✅  ${shortName}`, {
                font: 'bold 11px monospace', color: '#10b981'
            }));
        } else {
            const btn = scene.add.text(xPos, yPos, ` ${shortName} $${c.cost.toLocaleString('es-CL')} +${c.spawnBoost}%/-${c.revenueCut}% `, {
                font: 'bold 11px monospace', color: canAfford ? '#fff' : '#9ca3af',
                backgroundColor: canAfford ? '#0d9488' : '#374151',
                padding: { x: 7, y: 4 }
            });
            if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => { purchaseConvenio(c.id); renderManagementPanel(); }); }
            S.managementUI.push(btn);
        }
        convIdx++;
    });
}

// Stylized map positions for each lot type. Coords relative to map area.
const LOT_MAP_POSITIONS = {
    beach:    { x: 0.18, y: 0.72 },
    hospital: { x: 0.42, y: 0.30 },
    mall:     { x: 0.55, y: 0.68 },
    finance:  { x: 0.72, y: 0.20 },
    airport:  { x: 0.88, y: 0.55 },
    stadium:  { x: 0.32, y: 0.85 },
};

function renderLotsTab(scene, contentY, panelW) {
    const W = CONFIG.width;
    const tableX = W/2 - panelW/2 + 24;
    let ypos = contentY;

    // Header + total daily income from branch lots
    const totalDaily = (S.branchLots || []).reduce((sum, id) => {
        const lot = LOT_TYPES.find(l => l.id === id);
        if (!lot) return sum;
        const dow = S.dayOfWeek;
        const factor = (dow === 5 || dow === 6) ? lot.weekendFactor : lot.weekdayFactor;
        return sum + lot.dailyIncome * factor;
    }, 0);

    S.managementUI.push(scene.add.text(tableX, ypos, '📍 SUCURSALES', {
        font: 'bold 16px monospace', color: '#fde047'
    }));
    S.managementUI.push(scene.add.text(tableX + 200, ypos + 2,
        `${(S.branchLots || []).length} lotes · hoy +$${Math.floor(totalDaily).toLocaleString('es-CL')}/día`,
        { font: '12px monospace', color: '#86efac' }
    ));
    ypos += 22;

    // ─── CITY MAP ─────────────────────────────────────────
    const mapW = 340, mapH = 130;
    const mapX = tableX, mapY = ypos;
    // Map background — dark with subtle grid feel
    S.managementUI.push(scene.add.rectangle(mapX + mapW/2, mapY + mapH/2, mapW, mapH, 0x0c1726)
        .setStrokeStyle(2, 0x334155));
    // Subtle grid lines (street feel)
    for (let gx = 1; gx < 5; gx++) {
        S.managementUI.push(scene.add.rectangle(mapX + gx * mapW / 5, mapY + mapH/2, 1, mapH - 4, 0x1e293b));
    }
    for (let gy = 1; gy < 3; gy++) {
        S.managementUI.push(scene.add.rectangle(mapX + mapW/2, mapY + gy * mapH / 3, mapW - 4, 1, 0x1e293b));
    }
    // "CIUDAD" label
    S.managementUI.push(scene.add.text(mapX + 6, mapY + 4, 'CIUDAD', {
        font: 'bold 8px monospace', color: '#475569'
    }));
    // Plot each lot as a marker
    LOT_TYPES.forEach(lot => {
        const pos = LOT_MAP_POSITIONS[lot.id];
        if (!pos) return;
        const px = mapX + pos.x * mapW;
        const py = mapY + pos.y * mapH;
        const owned = (S.branchLots || []).includes(lot.id);
        const locked = lot.unlockRequires && !S.upgrades[lot.unlockRequires];
        // Marker base (background circle)
        const baseColor = owned ? 0x10b981 : (locked ? 0x475569 : 0xfbbf24);
        const marker = scene.add.circle(px, py, 11, baseColor, owned ? 1 : 0.6)
            .setStrokeStyle(2, owned ? 0x86efac : (locked ? 0x64748b : 0xfde047));
        S.managementUI.push(marker);
        // Pulse animation for owned lots
        if (owned) {
            const pulse = scene.add.circle(px, py, 11, baseColor, 0.4);
            scene.tweens.add({ targets: pulse, radius: 20, alpha: 0, duration: 1600, repeat: -1 });
            S.managementUI.push(pulse);
        }
        // Icon emoji on top of marker
        S.managementUI.push(scene.add.text(px, py, lot.icon, {
            font: '12px sans-serif'
        }).setOrigin(0.5));
    });

    // ── Main lot indicator (the parking you're playing in) ──
    const mainX = mapX + 0.50 * mapW;
    const mainY = mapY + 0.55 * mapH;
    const mainMarker = scene.add.circle(mainX, mainY, 9, 0xa855f7, 1).setStrokeStyle(2, 0xfde047);
    S.managementUI.push(mainMarker);
    S.managementUI.push(scene.add.text(mainX, mainY, '🅿️', { font: '11px sans-serif' }).setOrigin(0.5));
    S.managementUI.push(scene.add.text(mainX + 10, mainY - 16, 'tu lote', {
        font: 'bold 8px monospace', color: '#a5b4fc'
    }));

    // Cards (compact form, side-by-side with the map on the right)
    const cardsX = mapX + mapW + 16;
    const cardsW = panelW - mapW - 70;
    ypos = mapY;
    LOT_TYPES.forEach((lot, idx) => {
        const owned = (S.branchLots || []).includes(lot.id);
        const locked = lot.unlockRequires && !S.upgrades[lot.unlockRequires];
        const canAfford = S.money >= lot.cost;
        const cardY = mapY + idx * 22;
        // Mini row card
        S.managementUI.push(scene.add.text(cardsX, cardY, lot.icon, {
            font: '14px sans-serif'
        }));
        S.managementUI.push(scene.add.text(cardsX + 22, cardY, lot.name, {
            font: 'bold 10px monospace', color: owned ? '#86efac' : '#cbd5e1'
        }));
        // Status / buy
        if (owned) {
            S.managementUI.push(scene.add.text(cardsX + cardsW - 10, cardY, '✅', {
                font: '12px sans-serif'
            }).setOrigin(1, 0));
        } else if (locked) {
            S.managementUI.push(scene.add.text(cardsX + cardsW - 10, cardY,
                `🔒 ${lot.unlockRequires}`, {
                font: '9px monospace', color: '#64748b'
            }).setOrigin(1, 0));
        } else {
            const btn = scene.add.text(cardsX + cardsW - 10, cardY,
                `${(lot.cost/1000000).toFixed(1)}M`, {
                font: 'bold 10px monospace',
                color: canAfford ? '#fff' : '#9ca3af',
                backgroundColor: canAfford ? '#0d9488' : '#374151',
                padding: { x: 6, y: 2 }
            }).setOrigin(1, 0);
            if (canAfford) {
                btn.setInteractive({ useHandCursor: true });
                btn.on('pointerdown', () => purchaseBranchLot(lot.id));
            }
            S.managementUI.push(btn);
        }
    });

    ypos = mapY + mapH + 14;
    // Detail section for owned lots
    if ((S.branchLots || []).length > 0) {
        S.managementUI.push(scene.add.text(tableX, ypos, '✨ TUS LOTES — Performance hoy', {
            font: 'bold 12px monospace', color: '#fde047'
        }));
        ypos += 16;
        const isWeekend = (S.dayOfWeek === 5 || S.dayOfWeek === 6);
        S.branchLots.forEach((id, i) => {
            const lot = LOT_TYPES.find(l => l.id === id);
            if (!lot) return;
            const factor = isWeekend ? lot.weekendFactor : lot.weekdayFactor;
            const todayIncome = lot.dailyIncome * factor;
            const col = i % 2;
            const row = Math.floor(i / 2);
            const lineX = tableX + col * 380;
            const lineY = ypos + row * 16;
            S.managementUI.push(scene.add.text(lineX, lineY,
                `${lot.icon} ${lot.name}: +$${Math.floor(todayIncome).toLocaleString('es-CL')} (${factor}x ${isWeekend ? 'S-D' : 'L-V'})`,
                { font: 'bold 10px monospace', color: '#86efac' }));
        });
    } else {
        S.managementUI.push(scene.add.text(tableX, ypos,
            '👉 Comprá tu primer lote arriba para diversificar el negocio.',
            { font: 'italic 11px monospace', color: '#94a3b8' }));
    }
}

function renderStatsTab(scene, contentY, panelW) {
    const W = CONFIG.width;
    const tableX = W/2 - panelW/2 + 24;

    let ypos = contentY;

    // ── ACHIEVEMENTS GALLERY ──────────────────────────────
    const unlocked = getUnlockedAchievements();
    const totalAchievements = ACHIEVEMENTS.length;
    const unlockedCount = ACHIEVEMENTS.filter(a => unlocked[a.id]).length;
    S.managementUI.push(scene.add.text(tableX, ypos, `🏆 LOGROS (${unlockedCount}/${totalAchievements})`, {
        font: 'bold 13px monospace', color: '#fde047'
    }));
    ypos += 18;
    // Grid: 9 per row, 3 rows fit 27 → enough for current set
    const itemsPerRow = 13;
    ACHIEVEMENTS.forEach((a, i) => {
        const col = i % itemsPerRow;
        const row = Math.floor(i / itemsPerRow);
        const ix = tableX + col * 30;
        const iy = ypos + row * 32;
        const isUnlocked = !!unlocked[a.id];
        // Circle background
        S.managementUI.push(scene.add.circle(ix + 12, iy + 12, 13,
            isUnlocked ? 0x064e3b : 0x1f2937).setStrokeStyle(1, isUnlocked ? 0xfde047 : 0x475569));
        // Icon (grayed if locked)
        const iconTxt = scene.add.text(ix + 12, iy + 12, a.icon, {
            font: '14px sans-serif'
        }).setOrigin(0.5);
        if (!isUnlocked) iconTxt.setAlpha(0.3);
        S.managementUI.push(iconTxt);
        // Hover tooltip: show name on the bottom of the gallery
        iconTxt.setInteractive({ useHandCursor: false });
    });
    ypos += Math.ceil(ACHIEVEMENTS.length / itemsPerRow) * 32 + 8;

    if (S.dailyStatsHistory.length === 0) {
        S.managementUI.push(scene.add.text(tableX, ypos,
            'Sin estadísticas aún. Termina al menos 1 día para ver trends.',
            { font: 'italic 13px monospace', color: '#94a3b8' }
        ));
        return;
    }

    // ── Leaderboard mini-card ──
    const lb = getLeaderboard();
    if (lb.bestUtility) {
        S.managementUI.push(scene.add.text(tableX, ypos, '🏆 RÉCORDS', {
            font: 'bold 12px monospace', color: '#fde047'
        }));
        ypos += 16;
        const items = [
            `Mejor día: $${Math.floor(lb.bestUtility).toLocaleString('es-CL')} (D${lb.bestDay || '?'})`,
            `Racha positiva: ${lb.longestStreak || 0} días`,
            `Lifetime atendidos: ${lb.lifetimeServed || 0}`,
            `Lifetime revenue: $${Math.floor(lb.lifetimeRevenue || 0).toLocaleString('es-CL')}`,
        ];
        items.forEach((line, i) => {
            S.managementUI.push(scene.add.text(tableX + (i % 2) * 380, ypos + Math.floor(i / 2) * 16,
                line, { font: '11px monospace', color: '#fde047' }));
        });
        ypos += 36;
    }

    S.managementUI.push(scene.add.text(tableX, ypos, '📊 GRÁFICO — Revenue / Sueldos / Utilidad por día', {
        font: 'bold 12px monospace', color: '#a5f3fc'
    }));
    ypos += 18;

    // ── Mini-chart (last 10 days) ──────────────────────
    const chartH = 70;
    const chartW = panelW - 60;
    const recent = S.dailyStatsHistory.slice(-10);
    // background
    S.managementUI.push(scene.add.rectangle(tableX + chartW/2, ypos + chartH/2,
        chartW, chartH, 0x0f172a).setStrokeStyle(1, 0x334155));
    // Find max for scaling
    const allValues = recent.flatMap(s => [s.revenue, s.salaries, Math.abs(s.revenue - s.salaries)]);
    const maxVal = Math.max(...allValues, 1);
    // 3 series: revenue (green), salaries (red), utility (yellow)
    const series = [
        { key: 'revenue',  color: 0x10b981, label: 'Revenue', labelColor: '#10b981' },
        { key: 'salaries', color: 0xef4444, label: 'Sueldos', labelColor: '#ef4444' },
        { key: 'utility',  color: 0xfbbf24, label: 'Utilidad', labelColor: '#fbbf24' },
    ];
    const stepX = recent.length > 1 ? chartW / (recent.length - 1) : chartW;
    series.forEach(s => {
        for (let i = 0; i < recent.length - 1; i++) {
            const v1 = s.key === 'utility' ? recent[i].revenue - recent[i].salaries : recent[i][s.key];
            const v2 = s.key === 'utility' ? recent[i+1].revenue - recent[i+1].salaries : recent[i+1][s.key];
            const y1 = ypos + chartH - Math.max(2, Math.min(chartH-4, (v1 / maxVal) * (chartH-8)));
            const y2 = ypos + chartH - Math.max(2, Math.min(chartH-4, (v2 / maxVal) * (chartH-8)));
            const x1 = tableX + i * stepX;
            const x2 = tableX + (i + 1) * stepX;
            // Draw line as a thin rotated rectangle
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            const ang = Math.atan2(dy, dx) * 180 / Math.PI;
            const line = scene.add.rectangle((x1+x2)/2, (y1+y2)/2, len, 2, s.color);
            line.setAngle(ang);
            S.managementUI.push(line);
        }
        // Dots at each data point
        recent.forEach((stat, i) => {
            const v = s.key === 'utility' ? stat.revenue - stat.salaries : stat[s.key];
            const y = ypos + chartH - Math.max(2, Math.min(chartH-4, (v / maxVal) * (chartH-8)));
            const x = tableX + i * stepX;
            S.managementUI.push(scene.add.circle(x, y, 2.5, s.color));
        });
    });
    // Legend
    let legX = tableX + chartW + 8;
    series.forEach((s, i) => {
        S.managementUI.push(scene.add.rectangle(legX, ypos + 8 + i * 18, 12, 4, s.color));
        S.managementUI.push(scene.add.text(legX + 10, ypos + 8 + i * 18, s.label, {
            font: '10px monospace', color: s.labelColor
        }).setOrigin(0, 0.5));
    });
    ypos += chartH + 14;

    S.managementUI.push(scene.add.text(tableX, ypos, '📋 TABLA DETALLADA — Últimos 15 días', {
        font: 'bold 12px monospace', color: '#a5f3fc'
    }));
    ypos += 18;

    const hdrs = ['Día', 'Revenue', 'Sueldos', 'Util.', 'Aten.', '😡', '🏃', 'Rep.'];
    const colWs = [70, 100, 100, 100, 70, 60, 60, 60];
    let cx = tableX;
    hdrs.forEach((h, i) => {
        S.managementUI.push(scene.add.text(cx, ypos, h, { font: 'bold 12px monospace', color: '#cbd5e1' }));
        cx += colWs[i];
    });
    ypos += 22;

    S.dailyStatsHistory.slice(-15).forEach(stat => {
        cx = tableX;
        const utility = stat.revenue - stat.salaries;
        const utilColor = utility >= 0 ? '#10b981' : '#ef4444';
        const cells = [
            { text: `D${stat.day}·${DAY_SHORT[stat.dow]}`, color: '#fff' },
            { text: `$${Math.floor(stat.revenue).toLocaleString('es-CL')}`, color: '#fbbf24' },
            { text: `$${Math.floor(stat.salaries).toLocaleString('es-CL')}`, color: '#f87171' },
            { text: `$${Math.floor(utility).toLocaleString('es-CL')}`, color: utilColor },
            { text: String(stat.served), color: '#86efac' },
            { text: String(stat.angry), color: '#fca5a5' },
            { text: String(stat.escaped), color: '#fca5a5' },
            { text: `${stat.reputation}%`, color: '#a5f3fc' },
        ];
        cells.forEach((cell, i) => {
            S.managementUI.push(scene.add.text(cx, ypos, cell.text, {
                font: 'bold 11px monospace', color: cell.color
            }));
            cx += colWs[i];
        });
        ypos += 20;
    });
}

// Small ParkingApp logo badge (blue rounded square with white "P")
// scale ≈ 1 → ~14x14 px; scale ≈ 0.6 → ~8x8 px (tiny sticker)
// ─── BRAND BADGES ─────────────────────────────────────────
// v0.72: colors updated to match the official ParkingApp + Redcomercio
// branding (both are orange #f97316-ish, not blue/red as before).
// User shared the real logos in chat — these vector approximations
// match the visual identity until we ship the PNG assets.
const BRAND_ORANGE = 0xf97316;       // matches the orange in both logos
const BRAND_ORANGE_DARK = 0xc2410c;  // for strokes / shadows
const BRAND_ORANGE_LIGHT = 0xfb923c; // highlight

function drawParkingAppBadge(scene, x, y, scale) {
    const s = scale || 1;
    const sprites = [];
    // Orange rounded body (square aspect ~ 14×16, the real logo is taller)
    sprites.push(scene.add.rectangle(x, y, 14*s, 16*s, BRAND_ORANGE).setStrokeStyle(1, BRAND_ORANGE_DARK));
    sprites.push(scene.add.rectangle(x, y - 3*s, 12*s, 4*s, BRAND_ORANGE_LIGHT, 0.6));   // highlight
    // White "P" — the iconic part of the ParkingApp logo
    sprites.push(scene.add.text(x, y - 1*s, 'P', {
        font: `bold ${Math.round(13*s)}px monospace`, color: '#ffffff'
    }).setOrigin(0.5));
    return sprites;
}

// Small Redcomercio badge: orange square outline with orange "R" inside,
// matching the real Redcomercio brand identity.
function drawRedcomercioBadge(scene, x, y, scale) {
    const s = scale || 1;
    const sprites = [];
    // White square with thick orange border (matches Redcomercio logo)
    sprites.push(scene.add.rectangle(x, y, 14*s, 14*s, 0xffffff).setStrokeStyle(2*s, BRAND_ORANGE));
    sprites.push(scene.add.text(x, y, 'R', {
        font: `bold ${Math.round(11*s)}px monospace`, color: '#f97316', stroke: '#c2410c', strokeThickness: 0.5*s
    }).setOrigin(0.5));
    return sprites;
}

function drawAdScreens(scene) {
    // LED billboards on the sidewalk flanking the openings
    const positions = [
        { x: L.entryOpeningX - 75, y: L.sidewalkY },
        { x: L.exitOpeningX  + 75, y: L.sidewalkY },
        { x: L.entryOpeningX + 75, y: L.sidewalkY },
    ];

    // Rotating ad slides. After ParkingApp cinematic, include ParkingApp + Redcomercio.
    const slides = [
        { line1: 'PARKING', line2: '★ AQUÍ ★', c1: '#38bdf8', c2: '#fde047' },
        { line1: '⚡ ParkingApp', line2: 'Paga rápido', c1: '#60a5fa', c2: '#a7f3d0' },
        { line1: 'Redcomercio', line2: 'Pago seguro', c1: '#fca5a5', c2: '#fde047' },
    ];

    for (let i = 0; i < S.upgrades.adScreens && i < positions.length; i++) {
        const { x, y } = positions[i];
        // Mounting bracket (vertical pole)
        scene.add.rectangle(x, y + 22, 5, 16, 0x4b5563);
        scene.add.rectangle(x, y + 28, 18, 4, 0x374151);
        // Bezel (outer black frame)
        scene.add.rectangle(x, y, 74, 38, 0x000000).setStrokeStyle(1, 0x1f2937);
        // Screen background (dark blue gradient feel)
        scene.add.rectangle(x, y, 68, 32, 0x0c4a6e).setStrokeStyle(1, 0x38bdf8);
        // "Scanline" effect — thin horizontal lines
        for (let r = -12; r <= 12; r += 4) {
            scene.add.rectangle(x, y + r, 66, 1, 0x000000, 0.15);
        }
        // Rotating text — each screen starts on a different slide so they look alive
        const startIdx = i % slides.length;
        const slide = slides[startIdx];
        const t1 = scene.add.text(x, y - 7, slide.line1, { font: 'bold 10px monospace', color: slide.c1 }).setOrigin(0.5);
        const t2 = scene.add.text(x, y + 7, slide.line2, { font: 'bold 9px monospace', color: slide.c2 }).setOrigin(0.5);
        // Cycle slides every 4 seconds
        let slideIdx = startIdx;
        scene.time.addEvent({
            delay: 4000, loop: true,
            callback: () => {
                slideIdx = (slideIdx + 1) % slides.length;
                const ns = slides[slideIdx];
                t1.setText(ns.line1); t1.setColor(ns.c1);
                t2.setText(ns.line2); t2.setColor(ns.c2);
            }
        });
        // Subtle blink on bottom text
        scene.tweens.add({ targets: t2, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });
        // Corner LEDs
        scene.add.rectangle(x - 32, y - 16, 2, 2, 0xef4444);
        scene.add.rectangle(x + 32, y - 16, 2, 2, 0xef4444);
        scene.add.rectangle(x - 32, y + 16, 2, 2, 0x10b981);
        scene.add.rectangle(x + 32, y + 16, 2, 2, 0x10b981);
    }
}

// ─── BARRIERS (Nivel 3) ────────────────────────────────────
// Automatic gate scanners powered by ParkingApp + Redcomercio LPR.
// Two gates: one at entry opening, one at exit opening.
// Each gate has a vertical post (housing the scanner) and a horizontal
// striped arm that rotates up to let cars through.
function drawBarriers(scene) {
    S.barriers = { entry: null, exit: null };

    const makeGate = (x, kind) => {
        // For ENTRY: post on the RIGHT side (so the totem can sit on the LEFT,
        //            accessible from the driver-side window of cars going south).
        // For EXIT:  post on the LEFT (driver-side for cars going north is the
        //            screen-right side anyway, this just keeps it visible).
        const onRight = (kind === 'entry');
        const postX = onRight ? x + 22 : x - 22;
        // ENTRY barrier sits at booth-sign level (cars stop at the totem,
        //   driver gets ticket, then this gate opens). EXIT barrier sits at
        //   the lot fence (where cars physically cross out of the lot —
        //   the exit wait queue forms SOUTH of this barrier, so it has to
        //   be at the fence line for cars to be blocked correctly).
        const postY = (kind === 'entry')
            ? L.placeholderCy + L.placeholderH/2 - 8   // booth sign level
            : L.lotFenceY;                              // lot fence (top)
        const sprites = [];

        // === POST (housing the scanner) ===
        // Concrete base
        sprites.push(scene.add.rectangle(postX, postY + 4, 12, 8, 0x52525b).setStrokeStyle(1, 0x27272a));
        // Tall post body
        sprites.push(scene.add.rectangle(postX, postY - 8, 8, 26, 0x71717a).setStrokeStyle(1, 0x3f3f46));
        // Top cap (where the arm hinges)
        sprites.push(scene.add.rectangle(postX, postY - 20, 12, 5, 0x3f3f46));
        // Scanner LED — blinks green when idle, red when scanning
        const led = scene.add.circle(postX, postY - 10, 2, 0x10b981);
        scene.tweens.add({ targets: led, alpha: { from: 1, to: 0.3 }, duration: 900, yoyo: true, repeat: -1 });
        sprites.push(led);
        // Small ParkingApp badge on the post (branded)
        drawParkingAppBadge(scene, postX, postY - 2, 0.5).forEach(s => sprites.push(s));

        // === ARM (rotates around the post = local origin 0,0) ===
        const arm = scene.add.container(postX, postY - 18);
        const armLength = 40;
        // armDir: +1 = arm extends right (post on left), -1 = arm extends left (post on right)
        const armDir = onRight ? -1 : 1;
        // Background bar — centered at armLength/2 in the direction it extends
        const bar = scene.add.rectangle(armDir * armLength/2, 0, armLength, 6, 0xfde047).setStrokeStyle(1, 0x713f12);
        arm.add(bar);
        // Diagonal black stripes — placed inside the bar in the extension direction
        for (let i = 0; i < 4; i++) {
            const stripe = scene.add.rectangle(armDir * (i * 10 + 4), 0, 5, 6, 0x1f1408);
            stripe.setAngle(-30);
            arm.add(stripe);
        }
        // Tip light at the far end
        const tipLed = scene.add.circle(armDir * armLength, 0, 1.8, 0xef4444);
        scene.tweens.add({ targets: tipLed, alpha: { from: 1, to: 0.2 }, duration: 500, yoyo: true, repeat: -1 });
        arm.add(tipLed);
        sprites.push(arm);

        // Gate starts CLOSED — arm horizontal. We use the container's angle.
        // For right-extending (exit): closed=0, open=-90
        // For left-extending  (entry): closed=0 also (the bar is already mirrored),
        //                              open=+90 (rotate up the other way).
        arm.angle = 0;

        // Depth: barriers should be ABOVE cars (cars must visually drive UNDER
        // the closed arm and stop). Set higher than default 0.
        sprites.forEach(s => { try { s.setDepth(18); } catch(e) {} });
        arm.setDepth(18);

        // Save references for animation
        S.barriers[kind] = { arm, led, sprites, isOpen: false, x, postX, postY, armDir };
    };

    makeGate(L.entryOpeningX, 'entry');
    makeGate(L.exitOpeningX, 'exit');
}

// Open/close a gate with a smooth tween. Calls onOpen once arm reaches top.
function operateGate(kind, onOpen, onClosed) {
    const gate = S.barriers && S.barriers[kind];
    if (!gate) { if (onOpen) onOpen(); if (onClosed) onClosed(); return; }
    if (gate.isOpen) { if (onOpen) onOpen(); return; }   // already up, just call

    gate.isOpen = true;
    // Scanner flash — LED turns red briefly
    gate.led.setFillStyle(0xef4444);
    SFX.beep && SFX.beep(800, 80, 0.2);

    // Rotate the arm UP (out of the way). The direction depends on which side
    // the post is on: right-extending arm rotates -90 (counter-clockwise, up),
    // left-extending arm rotates +90 (clockwise, up).
    const openAngle = (gate.armDir < 0) ? 90 : -90;
    S.scene.tweens.add({
        targets: gate.arm, angle: openAngle,
        duration: CONFIG.barrierScanMs, ease: 'Power2',
        onComplete: () => {
            if (onOpen) onOpen();
            // Auto-close after a brief moment
            S.scene.time.delayedCall(900, () => {
                S.scene.tweens.add({
                    targets: gate.arm, angle: 0,
                    duration: 350, ease: 'Power2',
                    onComplete: () => {
                        gate.isOpen = false;
                        gate.led.setFillStyle(0x10b981);
                        if (onClosed) onClosed();
                    }
                });
            });
        }
    });
}

// ─── ENTRY TICKET TOTEM (Final Nivel 3) ───────────────────
// Self-service ticket dispenser at the entry. Car arrives → ticket pops
// out → barrier opens → car drives in. No cobrador needed for entries.
// The cobrador now only handles exits (where the actual cobro happens).
//
// Position: on the LEFT side of the car (driver-side, accessible from the
// driver's window). Cars going SOUTH have their driver on the LEFT side
// (smaller x). The totem sits at lotFenceY - 35 so the slot/screen is at
// driver-window height when the car stops at the totem stop position.
const TOTEM_X_OFFSET = -20;   // LEFT of entry opening center (driver-side)
// Totem sits next to the gate. With the barrier moved to booth-sign level,
// the totem is also there — driver pulls ticket at the gate, then crosses.
function getTotemStopY() { return L.placeholderCy + L.placeholderH/2 - 35; }
function drawEntryTotem(scene) {
    const x = L.entryOpeningX + TOTEM_X_OFFSET;   // LEFT side of opening
    const y = L.placeholderCy + L.placeholderH/2 - 35;  // aligned to barrier height
    S.entryTotemSprites = [];
    // Concrete base
    S.entryTotemSprites.push(scene.add.rectangle(x, y + 18, 14, 6, 0x52525b));
    // Main body (dark slate — branded for ParkingApp)
    S.entryTotemSprites.push(scene.add.rectangle(x, y + 4, 12, 28, 0x1e293b).setStrokeStyle(1, 0x0f172a));
    // ParkingApp badge on top
    drawParkingAppBadge(scene, x, y - 5, 0.55).forEach(s => S.entryTotemSprites.push(s));
    // Screen (small green LCD) — at driver-eye level
    S.entryTotemSprites.push(scene.add.rectangle(x, y + 4, 9, 6, 0x10b981).setStrokeStyle(1, 0x064e3b));
    S.entryTotemSprites.push(scene.add.text(x, y + 4, 'TKT', {
        font: 'bold 4px monospace', color: '#0f172a'
    }).setOrigin(0.5));
    // Ticket dispense slot (thin horizontal line) — driver-window height
    S.entryTotemSprites.push(scene.add.rectangle(x, y + 12, 8, 1.5, 0x9ca3af));
    // Blinking LED (yellow when ready)
    const led = scene.add.circle(x + 4, y - 2, 1.2, 0xfde047);
    scene.tweens.add({ targets: led, alpha: { from: 1, to: 0.4 }, duration: 800, yoyo: true, repeat: -1 });
    S.entryTotemSprites.push(led);
}

// Animate a "ticket popping out" at the totem when a car is processed
function dispenseTicket() {
    if (!S.upgrades.entryTotem) return;
    const x = L.entryOpeningX + TOTEM_X_OFFSET;
    const y = L.placeholderCy + L.placeholderH/2 - 35 + 12;
    const ticket = S.scene.add.rectangle(x, y, 5, 3, 0xf3f4f6).setStrokeStyle(1, 0x6b7280);
    S.scene.tweens.add({
        targets: ticket, y: y + 8, alpha: { from: 1, to: 0 },
        duration: CONFIG.entryTotemDispenseMs, ease: 'Power2',
        onComplete: () => ticket.destroy()
    });
}

// ─── EXIT AUTOPAY TOTEM (Nivel 4) ──────────────────────────
// Self-service exit. Car arrives at exit barrier, totem reads ticket
// (LPR or ParkingApp QR), charges via Redcomercio, gate opens. No cobrador
// needed for exits — the operator can be 0 employees if entry also automated.
//
// Positioned BIG and PROMINENT next to the exit barrier (south of the
// booth, on the right). Bigger sprite + emoji label so it's impossible to
// miss.
const EXIT_TOTEM_X_OFFSET = 24;
function drawExitTotem(scene) {
    const x = L.exitOpeningX + EXIT_TOTEM_X_OFFSET;
    const y = L.placeholderCy + L.placeholderH/2 - 35;
    S.exitTotemSprites = [];

    // Big floating "AUTOPAGO" label above so the player spots it
    const label = scene.add.text(x, y - 26, 'AUTOPAGO', {
        font: 'bold 8px monospace', color: '#fff',
        backgroundColor: '#16a34a', padding: { x: 4, y: 2 }
    }).setOrigin(0.5);
    label.setDepth(20);

    // Wider concrete base
    scene.add.rectangle(x, y + 22, 22, 7, 0x52525b).setStrokeStyle(1, 0x27272a);
    // Main body — bright green (matches autopay/cash flow color)
    scene.add.rectangle(x, y + 5, 20, 36, 0x166534).setStrokeStyle(2, 0x22c55e);
    // Redcomercio badge prominent on top
    drawRedcomercioBadge(scene, x, y - 8, 0.8);
    // Big LCD screen
    scene.add.rectangle(x, y + 4, 16, 10, 0x0c4a6e).setStrokeStyle(1, 0x38bdf8);
    scene.add.text(x, y + 4, '$$$', { font: 'bold 7px monospace', color: '#fde047' }).setOrigin(0.5);
    // Card slot
    scene.add.rectangle(x, y + 13, 14, 2, 0xfbbf24).setStrokeStyle(1, 0x713f12);
    // QR scanner area (small black square below screen)
    scene.add.rectangle(x, y + 19, 8, 4, 0x0f172a).setStrokeStyle(1, 0x10b981);
    // Blinking green LED — ready to charge
    const led = scene.add.circle(x - 7, y - 2, 1.6, 0x22c55e);
    scene.tweens.add({ targets: led, alpha: { from: 1, to: 0.3 }, duration: 600, yoyo: true, repeat: -1 });
    // Pulse on the body to grab attention (subtle)
    const bodyGlow = scene.add.rectangle(x, y + 5, 24, 40, 0x22c55e, 0.0);
    scene.tweens.add({ targets: bodyGlow, alpha: { from: 0.0, to: 0.18 },
        duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}

function dispenseExitCharge() {
    if (!S.upgrades.exitTotem) return;
    const x = L.exitOpeningX + EXIT_TOTEM_X_OFFSET;
    const y = L.placeholderCy + L.placeholderH/2 - 35;
    const float = S.scene.add.text(x, y - 10, '💳', { font: '12px sans-serif' }).setOrigin(0.5);
    S.scene.tweens.add({
        targets: float, y: y - 30, alpha: { from: 1, to: 0 },
        duration: CONFIG.exitTotemScanMs, ease: 'Power2',
        onComplete: () => float.destroy()
    });
}

// ─── NIVEL 7-9 VISUALS ─────────────────────────────────────
// Parking vertical: badge "+N pisos" en una esquina del lote
function drawMultiLevel(scene) {
    const x = L.lotLeft + 60, y = L.lotFenceY + 22;
    scene.add.rectangle(x, y, 80, 30, 0x0c4a6e).setStrokeStyle(2, 0x38bdf8).setDepth(5);
    scene.add.text(x, y - 6, '🏢 +3 PISOS', {
        font: 'bold 9px monospace', color: '#38bdf8'
    }).setOrigin(0.5).setDepth(5);
    scene.add.text(x, y + 6, 'N7 · vertical', {
        font: 'bold 7px monospace', color: '#bae6fd'
    }).setOrigin(0.5).setDepth(5);
}

// Drones flotando sobre el lote, ambient delivery
function drawDrones(scene) {
    const positions = [
        { x: 200, y: 100, color: 0xa855f7 },
        { x: 500, y: 80, color: 0x7c3aed },
        { x: 800, y: 110, color: 0xa855f7 },
    ];
    positions.forEach(d => {
        // Body — small purple square with 4 propellers
        const body = scene.add.rectangle(d.x, d.y, 14, 10, d.color).setStrokeStyle(1, 0x2e1065);
        // 4 propellers (small ellipses at corners)
        const props = [
            scene.add.ellipse(d.x - 8, d.y - 5, 6, 2, 0xcbd5e1, 0.7),
            scene.add.ellipse(d.x + 8, d.y - 5, 6, 2, 0xcbd5e1, 0.7),
            scene.add.ellipse(d.x - 8, d.y + 5, 6, 2, 0xcbd5e1, 0.7),
            scene.add.ellipse(d.x + 8, d.y + 5, 6, 2, 0xcbd5e1, 0.7),
        ];
        // Red signal light
        scene.add.circle(d.x, d.y, 1.5, 0xef4444);
        // Drift left-right slowly
        scene.tweens.add({
            targets: [body, ...props], x: { from: d.x - 40, to: d.x + 40 },
            duration: 4000 + Math.random() * 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
        // Propeller "spin" effect — fast alpha pulse
        scene.tweens.add({
            targets: props, alpha: { from: 0.4, to: 0.9 },
            duration: 80, yoyo: true, repeat: -1
        });
    });
}

// Spaceport — naves espaciales sobre el lote (winner's overlay)
function drawSpaceport(scene) {
    // UFO 1 (purple/blue glowing)
    const ufo1X = 250, ufo1Y = 60;
    const ufo1Glow = scene.add.ellipse(ufo1X, ufo1Y + 12, 60, 14, 0x38bdf8, 0.3)
        .setBlendMode(Phaser.BlendModes.SCREEN);
    scene.tweens.add({ targets: ufo1Glow, alpha: { from: 0.3, to: 0.5 }, duration: 800, yoyo: true, repeat: -1 });
    const ufo1Base = scene.add.ellipse(ufo1X, ufo1Y, 50, 12, 0x6366f1).setStrokeStyle(2, 0x4338ca);
    const ufo1Dome = scene.add.ellipse(ufo1X, ufo1Y - 6, 26, 14, 0xa5b4fc).setStrokeStyle(1, 0x6366f1);
    scene.add.circle(ufo1X - 16, ufo1Y + 3, 2, 0xfde047);
    scene.add.circle(ufo1X, ufo1Y + 3, 2, 0xef4444);
    scene.add.circle(ufo1X + 16, ufo1Y + 3, 2, 0xfde047);
    scene.tweens.add({
        targets: [ufo1Base, ufo1Dome], y: { from: ufo1Y - 4, to: ufo1Y + 4 },
        duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // UFO 2 (red — bigger, hovering more east)
    const ufo2X = 700, ufo2Y = 50;
    const ufo2Glow = scene.add.ellipse(ufo2X, ufo2Y + 14, 80, 18, 0xef4444, 0.3)
        .setBlendMode(Phaser.BlendModes.SCREEN);
    scene.tweens.add({ targets: ufo2Glow, alpha: { from: 0.3, to: 0.6 }, duration: 700, yoyo: true, repeat: -1 });
    const ufo2Base = scene.add.ellipse(ufo2X, ufo2Y, 70, 16, 0xdc2626).setStrokeStyle(2, 0x7f1d1d);
    const ufo2Dome = scene.add.ellipse(ufo2X, ufo2Y - 8, 36, 18, 0xfca5a5).setStrokeStyle(1, 0xdc2626);
    scene.add.circle(ufo2X - 22, ufo2Y + 4, 2, 0xfde047);
    scene.add.circle(ufo2X, ufo2Y + 4, 2, 0x10b981);
    scene.add.circle(ufo2X + 22, ufo2Y + 4, 2, 0xfde047);
    scene.tweens.add({
        targets: [ufo2Base, ufo2Dome], y: { from: ufo2Y - 5, to: ufo2Y + 5 },
        duration: 2500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // "SPACEPORT" banner top-center
    const banner = scene.add.rectangle(CONFIG.width/2, 30, 200, 24, 0x0c4a6e).setStrokeStyle(2, 0xfde047);
    scene.add.text(CONFIG.width/2, 30, '🚀 SPACEPORT ACTIVO 🚀', {
        font: 'bold 11px monospace', color: '#fde047'
    }).setOrigin(0.5);
    scene.tweens.add({ targets: banner, alpha: { from: 1, to: 0.7 }, duration: 1200, yoyo: true, repeat: -1 });
}

function processExitViaTotem() {
    if (S.dayEnded || S.paused) return;
    const car = S.exitQueue.find(c => c.state === 'exit-waiting');
    if (!car) return;
    if (car.escapeHint) {
        S.scene.tweens.killTweensOf([car.sprite, car.windows]);
        car.sprite.setAngle(-90); car.windows.setAngle(-90);
        car.sprite.clearTint();
        if (car.angryEmoji) { car.angryEmoji.destroy(); car.angryEmoji = null; }
    }
    car.state = 'exit-attending';
    flashEvent(`💳 Tótem cobra automático vía Redcomercio...`);
    dispenseExitCharge();

    S.scene.time.delayedCall(CONFIG.exitTotemScanMs, () => {
        const stayedMin = Math.max(1, Math.ceil(S.timeMinutes - (car.entryTimeMinutes ?? S.timeMinutes)));
        let amount = stayedMin * CONFIG.pricePerMinute * getConvenioRevenueCut();
        if (car.isEV) amount *= CONFIG.evMultiplier;
        if (car.isAppUser) amount *= CONFIG.parkingAppTariffMultiplier;       // Nivel 5
        if (S.upgrades.valetAI) amount *= CONFIG.valetAITariffMultiplier;     // Nivel 6
        if (S.upgrades.drone) amount *= CONFIG.droneTariffMultiplier;         // Nivel 8
        if (S.upgrades.spaceport) amount *= CONFIG.spaceportTariffMultiplier; // Nivel 9
        if (car.washed) { amount += CONFIG.washPrice; flashEvent(`🚿 +$${CONFIG.washPrice.toLocaleString('es-CL')} lavado!`); }
        if (S.nextCarMultiplier > 1) {
            amount *= S.nextCarMultiplier;
            S.nextCarMultiplier = 1;
            flashEvent(`💎 VIP +$${Math.floor(amount).toLocaleString('es-CL')}`);
        } else {
            flashEvent(`💵 Cobrado +$${Math.floor(amount).toLocaleString('es-CL')} (${stayedMin} min)`);
        }
        car.revenue = amount;
        S.money += amount;
        S.revenueToday += amount;
        S.lifetimeRevenue += amount;
        S.carsServedToday++;
        S.lifetimeServed++;
        checkAchievements();
        // Premium sparkle sound when revenue tier is high (app user OR valet/+)
        if (car.isAppUser || S.upgrades.valetAI || S.upgrades.spaceport) {
            SFX.cashPremium();
            hapticBuzz('MEDIUM');  // stronger pulse for premium
        } else {
            SFX.cashRegister();
            hapticBuzz('LIGHT');
        }
        // Floating $ amount above the car — visual juice
        showMoneyFloat(car.sprite.x, car.sprite.y, Math.floor(amount), car.isAppUser);

        S.exitQueue = S.exitQueue.filter(c => c.id !== car.id);
        operateGate('exit');
        S.scene.time.delayedCall(CONFIG.barrierScanMs, () => {
            acquireLane('exitV', 1400, () => {
                driveCar(car, [
                    { x: L.exitVlaneX, y: L.exitWaitY - 20, duration: 300 },
                    { x: L.exitVlaneX, y: L.entryLaneY, duration: 500 },
                    { angle: 0, duration: 200 },
                    { x: L.exitOffscreenX, y: L.entryLaneY, duration: 900 },
                ], () => {
                    car.sprite.destroy(); car.windows.destroy();
                    S.cars = S.cars.filter(c => c.id !== car.id);
                });
            });
        });
        repositionExitQueue();
    });
}

// "Aceptamos:" sign — hung on the sidewalk pole next to the booth window
// (NOT on the road — cars drove over the old floor decal which made no sense)
function drawPaymentDecal(scene) {
    if (!S.cinematicShown || !S.upgrades.booth) return;
    // Hang the sign on the sidewalk just above the booth, where customers can read it
    const dx = L.placeholderCx + 60;
    const dy = L.lotFenceY - 14;
    // Sign pole
    scene.add.rectangle(dx, dy + 14, 2, 22, 0x4b5563);
    // White rounded sign body
    scene.add.rectangle(dx, dy, 72, 22, 0xf3f4f6).setStrokeStyle(1, 0x6b7280);
    // Header strip
    scene.add.rectangle(dx, dy - 7, 72, 6, 0x1e40af);
    scene.add.text(dx, dy - 7, 'PAGOS ACEPTADOS', {
        font: 'bold 6px monospace', color: '#dbeafe'
    }).setOrigin(0.5);
    // Mini ParkingApp + Redcomercio side by side
    drawParkingAppBadge(scene, dx - 14, dy + 4, 0.6);
    drawRedcomercioBadge(scene, dx + 12, dy + 4, 0.6);
}

function drawAesthetics(scene) {
    // Lamp posts (luminarias) — illuminate the DRIVE LANES (where cars actually
    // move). Two rows of 3 lamps each, evenly spaced along centerLane and
    // expansionLane (when row 3 is built), well clear of cameras/plants.
    if (S.upgrades.lights) {
        // Pick row Y just NORTH of the drive lane so light pools illuminate the road
        const driveLaneY = L.centerLaneY - 14;
        const expY = L.expansionLaneY ? L.expansionLaneY - 14 : null;
        const lampPositions = [
            // Drive lane lamps — 3 spaced across the main central road
            { x: L.lotLeft + 110, y: driveLaneY },
            { x: (L.lotLeft + L.lotRight) / 2, y: driveLaneY },
            { x: L.lotRight - 110, y: driveLaneY },
            // Bottom-edge lamps (front of lot, north sidewalk side)
            { x: L.lotLeft + 110, y: L.lotBottom - 22 },
            { x: (L.lotLeft + L.lotRight) / 2, y: L.lotBottom - 22 },
            { x: L.lotRight - 110, y: L.lotBottom - 22 },
        ];
        lampPositions.forEach(p => {
            // === LIGHT POOL ON GROUND (drawn FIRST so post is on top) ===
            // On mobile we drop the outer/mid pools (SCREEN blend is slow on phone GPUs)
            // and skip the breathing tweens — keep just one static glow + bulb.
            const mobile = isMobileDevice();
            // Big soft outer glow
            const groundPool = scene.add.ellipse(p.x, p.y + 2, 90, 70, 0xfde047, mobile ? 0.22 : 0.18);
            if (!mobile) groundPool.setBlendMode(Phaser.BlendModes.SCREEN);
            // Mid pool — warmer (skipped on mobile to halve overdraw)
            let midPool = null;
            if (!mobile) {
                midPool = scene.add.ellipse(p.x, p.y + 2, 60, 46, 0xfacc15, 0.22)
                    .setBlendMode(Phaser.BlendModes.SCREEN);
            }
            // Inner hot spot — brightest
            const hotSpot = scene.add.ellipse(p.x, p.y - 2, 32, 24, 0xfef08a, 0.32);
            if (!mobile) hotSpot.setBlendMode(Phaser.BlendModes.SCREEN);
            // Subtle breathing animation on the outer pool (desktop only)
            if (!mobile) {
                scene.tweens.add({ targets: groundPool, alpha: { from: 0.18, to: 0.28 }, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                scene.tweens.add({ targets: hotSpot, alpha: { from: 0.32, to: 0.45 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            }

            // === POLE + FIXTURE (above the light pool) ===
            // Pole (taller now)
            scene.add.rectangle(p.x, p.y + 8, 2, 22, 0x52525b);
            // Arm extending sideways
            scene.add.rectangle(p.x, p.y - 6, 10, 2, 0x52525b);
            // Light fixture (lampshade)
            scene.add.rectangle(p.x, p.y - 8, 12, 5, 0x27272a).setStrokeStyle(1, 0x18181b);
            // Bulb (small glowing dot at the bottom of the fixture)
            const bulb = scene.add.circle(p.x, p.y - 6, 2.5, 0xfef9c3);
            if (!mobile) scene.tweens.add({ targets: bulb, alpha: { from: 1, to: 0.7 }, duration: 1500, yoyo: true, repeat: -1 });
            // Small halo right around the bulb (desktop only)
            if (!mobile) {
                const halo = scene.add.circle(p.x, p.y - 6, 8, 0xfde047, 0.5)
                    .setBlendMode(Phaser.BlendModes.SCREEN);
                scene.tweens.add({ targets: halo, alpha: { from: 0.5, to: 0.7 }, duration: 1500, yoyo: true, repeat: -1 });
            }
        });
    }

    // Greenery (plants/trees) — placed on east/west OUTER walls and along the
    // central divider strip between rows, so they don't fight with cameras
    // (which now own the 4 lot corners) or lights (which line the drive lanes).
    if (S.upgrades.greenery) {
        const midY = (L.lotFenceY + L.lotBottom) / 2;
        const plantSpots = [
            // West outer wall — 2 plants stacked
            { x: L.lotLeft + 10, y: L.lotFenceY + 60 },
            { x: L.lotLeft + 10, y: L.lotBottom - 60 },
            // East outer wall — 2 plants stacked
            { x: L.lotRight - 10, y: L.lotFenceY + 60 },
            { x: L.lotRight - 10, y: L.lotBottom - 60 },
            // Central divider strip (between row 1 and row 2 lanes), away from
            // the booth/barrier area in the center.
            { x: L.lotLeft + 200, y: midY },
            { x: L.lotRight - 200, y: midY },
        ];
        plantSpots.forEach(p => {
            // Trunk (small brown rectangle peeking from under foliage)
            scene.add.rectangle(p.x, p.y + 6, 3, 6, 0x78350f);
            // Soil patch underneath
            scene.add.ellipse(p.x, p.y + 9, 18, 5, 0x422006);
            // Dark base foliage — large outer crown
            scene.add.circle(p.x, p.y, 11, 0x14532d);
            scene.add.circle(p.x - 6, p.y + 2, 8, 0x14532d);
            scene.add.circle(p.x + 6, p.y + 2, 8, 0x14532d);
            // Mid-green leaves
            scene.add.circle(p.x - 4, p.y - 2, 7, 0x16a34a);
            scene.add.circle(p.x + 4, p.y - 2, 7, 0x16a34a);
            scene.add.circle(p.x, p.y - 4, 8, 0x22c55e);
            // Highlight
            scene.add.circle(p.x - 2, p.y - 6, 4, 0x86efac);
            // Tiny flowers / spots on some
            if (Math.random() < 0.5) {
                scene.add.circle(p.x + 3, p.y - 1, 1.5, 0xfef08a);
                scene.add.circle(p.x - 3, p.y + 2, 1.5, 0xf9a8d4);
            }
        });
    }

    // Guard patrol — bright yellow vest + dark cap, clearly distinguishable from thief
    if (S.upgrades.guard) {
        const guard = scene.add.image(L.lotLeft + 30, L.lotBottom - 30, 'tomas_east').setScale(1.0); // was 0.75 v0.73
        guard.setTint(0xfde047);   // bright yellow safety vest
        S.guardSprite = guard;
        // Dark cap (police-style) — small dark ellipse on top of head
        const cap = scene.add.ellipse(guard.x, guard.y - 11, 12, 5, 0x1e293b).setStrokeStyle(1, 0x0f172a);
        const capBrim = scene.add.rectangle(guard.x, guard.y - 8, 13, 2, 0x0f172a);
        // SECURITY badge on chest (small white square with text)
        const badge = scene.add.rectangle(guard.x, guard.y, 8, 4, 0xf8fafc).setStrokeStyle(1, 0x1e40af);
        const badgeLabel = scene.add.text(guard.x, guard.y, 'SEC', {
            font: 'bold 3px monospace', color: '#1e40af'
        }).setOrigin(0.5);
        // Floating label above so the player can identify it instantly
        const label = scene.add.text(guard.x, guard.y - 18, '👮 GUARDIA', {
            font: 'bold 8px monospace', color: '#fff',
            backgroundColor: '#1e40af', padding: { x: 3, y: 1 }
        }).setOrigin(0.5);
        S.guardAccessories = [cap, capBrim, badge, badgeLabel, label];

        // Patrol path: walks along the central drive lane (where the lights
        // are now). Visible to cars + away from corner cameras/plants.
        const driveY = L.centerLaneY + 22;
        const path = [
            { x: L.lotRight - 40, y: driveY, duration: 8000 },
            { x: L.lotRight - 40, y: L.lotBottom - 40, duration: 4000 },
            { x: L.lotLeft + 40, y: L.lotBottom - 40, duration: 8000 },
            { x: L.lotLeft + 40, y: driveY, duration: 4000 },
        ];
        let i = 0;
        const next = () => {
            const wp = path[i % path.length];
            i++;
            scene.tweens.add({
                targets: [guard, cap, capBrim, badge, badgeLabel, label],
                x: wp.x, y: wp.y,
                duration: wp.duration, ease: 'Linear',
                onComplete: next,
                onUpdate: () => {
                    // Keep accessories aligned with the guard sprite
                    cap.x = guard.x; cap.y = guard.y - 11;
                    capBrim.x = guard.x; capBrim.y = guard.y - 8;
                    badge.x = guard.x; badge.y = guard.y;
                    badgeLabel.x = guard.x; badgeLabel.y = guard.y;
                    label.x = guard.x; label.y = guard.y - 18;
                }
            });
        };
        next();
    }
}

function drawSafetyAndServices(scene) {
    // Security cameras — mounted on tall POLES at the 4 lot corners, each
    // pointing INWARD with a faint vision-cone (so the player can see what
    // area each camera covers). Distinct from plants (which now live on
    // east/west walls) and lights (which line the drive lanes).
    if (S.upgrades.cameras) {
        // dir: which way the lens points (inward toward lot center).
        const corners = [
            { x: L.lotLeft + 14,  y: L.lotFenceY + 14, dirX:  1, dirY:  1 },   // TL → looks down-right
            { x: L.lotRight - 14, y: L.lotFenceY + 14, dirX: -1, dirY:  1 },   // TR → looks down-left
            { x: L.lotLeft + 14,  y: L.lotBottom - 14, dirX:  1, dirY: -1 },   // BL → looks up-right
            { x: L.lotRight - 14, y: L.lotBottom - 14, dirX: -1, dirY: -1 },   // BR → looks up-left
        ];
        corners.forEach(p => {
            // === MOUNTING POLE ===
            // Anchor base on the lot floor
            scene.add.rectangle(p.x, p.y + 12, 8, 4, 0x27272a).setStrokeStyle(1, 0x18181b);
            // Tall vertical pole
            scene.add.rectangle(p.x, p.y + 2, 3, 18, 0x52525b);
            // Mounting arm extending into the lot
            scene.add.rectangle(p.x + p.dirX * 4, p.y - 4, 10, 2, 0x52525b);
            // === CAMERA HOUSING ===
            // Body — slightly offset toward inward direction (where lens points)
            const camX = p.x + p.dirX * 6;
            const camY = p.y - 6;
            scene.add.rectangle(camX, camY, 16, 11, 0x111827).setStrokeStyle(2, 0xcbd5e1);
            // Lens (eye) — red glow at the inward end
            scene.add.circle(camX + p.dirX * 4, camY, 3, 0x7f1d1d).setStrokeStyle(1, 0xfca5a5);
            scene.add.circle(camX + p.dirX * 4, camY, 1.5, 0xef4444);
            // === VISION CONE ===
            // Faint triangle indicating what the camera sees. Cone extends
            // ~80px inward at ~60° spread. Drawn FIRST so other elements
            // (cars, etc.) render on top.
            const coneLen = 80;
            const coneSpread = 32;
            const coneG = scene.add.graphics();
            coneG.fillStyle(0xfde047, 0.08);
            coneG.beginPath();
            coneG.moveTo(camX + p.dirX * 4, camY);
            coneG.lineTo(camX + p.dirX * (4 + coneLen), camY + p.dirY * coneSpread);
            coneG.lineTo(camX + p.dirX * (4 + coneLen), camY - p.dirY * coneSpread);
            coneG.closePath();
            coneG.fillPath();
            coneG.setDepth(-1);   // behind everything
            // Subtle pulse on the cone
            scene.tweens.add({ targets: coneG, alpha: { from: 0.6, to: 1.0 }, duration: 2000, yoyo: true, repeat: -1 });
            // Recording LED — blinking green
            const led = scene.add.circle(camX - p.dirX * 5, camY - 3, 1.8, 0x10b981);
            scene.tweens.add({ targets: led, alpha: { from: 1, to: 0.2 }, duration: 800, yoyo: true, repeat: -1 });
            // 📹 emoji label above for instant ID
            scene.add.text(camX, camY - 13, '📹', { font: '10px sans-serif' }).setOrigin(0.5);
        });
    }

    // EV charger station — placed INSIDE the lot at the south of row 3 area (when expansion exists)
    // or below the lot bottom-left (visible on sidewalk far left)
    if (S.upgrades.evCharger) {
        const ex = L.lotLeft + 100, ey = L.sidewalkY;
        scene.add.rectangle(ex, ey, 90, 26, 0x166534).setStrokeStyle(2, 0x22c55e);
        scene.add.text(ex - 14, ey, '🔌', { font: '14px sans-serif' }).setOrigin(0.5);
        scene.add.text(ex + 12, ey - 4, 'EV', { font: 'bold 11px monospace', color: '#86efac' }).setOrigin(0.5);
        scene.add.text(ex + 12, ey + 7, 'premium', { font: '8px monospace', color: '#fde047' }).setOrigin(0.5);
    }

    // Car wash station — to the right, but smaller and clickable
    if (S.upgrades.carwash) {
        const wx = L.lotRight - 100, wy = L.sidewalkY;
        const washBg = scene.add.rectangle(wx, wy, 90, 26, 0x0f766e).setStrokeStyle(2, 0x14b8a6);
        scene.add.text(wx - 14, wy, '🚿', { font: '14px sans-serif' }).setOrigin(0.5);
        scene.add.text(wx + 12, wy - 4, 'LAVAR', { font: 'bold 11px monospace', color: '#5eead4' }).setOrigin(0.5);
        scene.add.text(wx + 12, wy + 7, 'click auto', { font: '8px monospace', color: '#fde047' }).setOrigin(0.5);
        // Make station "pulse" to draw attention
        scene.tweens.add({ targets: washBg, alpha: { from: 1, to: 0.7 }, duration: 1200, yoyo: true, repeat: -1 });
    }
}

function drawSigns(scene) {
    // Parking signs on the SIDEWALK, at the far edges (out of traffic, but visible)
    const positions = [
        { x: 50,                   y: L.sidewalkY }, // far west on sidewalk
        { x: CONFIG.width - 50,    y: L.sidewalkY }, // far east on sidewalk
    ];
    for (let i = 0; i < S.upgrades.signs && i < positions.length; i++) {
        const { x, y } = positions[i];
        // Pole base
        scene.add.rectangle(x, y + 22, 3, 18, 0x4b5563);
        scene.add.rectangle(x - 6, y + 30, 16, 3, 0x374151);
        // Sign shadow
        scene.add.rectangle(x + 1, y + 1, 44, 32, 0x000000, 0.3);
        // Sign body
        scene.add.rectangle(x, y, 44, 32, 0xfbbf24).setStrokeStyle(2, 0x78350f);
        scene.add.rectangle(x, y, 38, 26, 0xfbbf24).setStrokeStyle(1, 0x78350f);
        // "P" and arrow
        scene.add.text(x - 7, y - 1, 'P', { font: 'bold 18px monospace', color: '#000' }).setOrigin(0.5);
        scene.add.text(x + 9, y, i === 0 ? '→' : '←', { font: 'bold 14px monospace', color: '#000' }).setOrigin(0.5);
        // Highlight gleam
        scene.add.rectangle(x - 15, y - 11, 2, 6, 0xffffff, 0.7);
        // After ParkingApp cinematic: "powered by" plaque under the sign
        if (S.cinematicShown) {
            scene.add.rectangle(x, y + 21, 44, 7, 0x1e40af).setStrokeStyle(1, 0x1e3a8a);
            scene.add.text(x, y + 21, 'by ParkingApp', {
                font: 'bold 5px monospace', color: '#dbeafe'
            }).setOrigin(0.5);
        }
    }
}

function purchaseBooth() {
    if (S.upgrades.booth) return;
    if (S.money < CONFIG.boothCost) return;
    S.money -= CONFIG.boothCost;
    S.upgrades.booth = true;
    refreshPageTitle();
    flashEvent('🛂 ¡Caseta instalada! Cobradores ahora son tarjetas + 33% más rápido.');
    flagReopenManagement();
    S.scene.scene.restart();
}

function purchaseAdScreen() {
    if (S.upgrades.adScreens >= CONFIG.adScreenMax) return;
    if (S.money < CONFIG.adScreenCost) return;
    S.money -= CONFIG.adScreenCost;
    S.upgrades.adScreens++;
    flashEvent(`📺 Pantalla publicitaria #${S.upgrades.adScreens} instalada! +ingreso pasivo`);
    flagReopenManagement();
    S.scene.scene.restart();
}

function purchaseSign() {
    if (S.upgrades.signs >= CONFIG.signMax) return;
    if (S.money < CONFIG.signCost) return;
    S.money -= CONFIG.signCost;
    S.upgrades.signs++;
    flashEvent(`📣 Cartel #${S.upgrades.signs} instalado! +25% spawn`);
    flagReopenManagement();
    S.scene.scene.restart();
}

function purchaseExpansion() {
    if (S.upgrades.expansions >= CONFIG.expansionMax) return;
    if (S.money < CONFIG.expansionCost) return;
    S.money -= CONFIG.expansionCost;
    S.upgrades.expansions++;
    flashEvent(`🏗️ Lote ampliado! +${CONFIG.expansionExtraSpaces} espacios`);
    flagReopenManagement();
    S.scene.scene.restart();
}

function purchaseCameras() {
    if (S.upgrades.cameras) return;
    if (S.money < CONFIG.cameraCost) return;
    S.money -= CONFIG.cameraCost;
    S.upgrades.cameras = true;
    flashEvent('📹 Cámaras de seguridad instaladas. Robos y vandalismo bloqueados.');
    flagReopenManagement();
    S.scene.scene.restart();
}

function purchaseCarwash() {
    if (S.upgrades.carwash) return;
    if (S.money < CONFIG.washCost) return;
    S.money -= CONFIG.washCost;
    S.upgrades.carwash = true;
    flashEvent(`🚿 Lavado disponible. Click en autos estacionados para lavar (+$${CONFIG.washPrice.toLocaleString('es-CL')})`);
    flagReopenManagement();
    S.scene.scene.restart();
}

function triggerWash(car) {
    if (!S.upgrades.carwash || car.washed || car.state !== 'parked') return;
    car.washed = true;
    car.sprite.disableInteractive();
    // Visual: water droplets on the car
    const drops = S.scene.add.text(car.sprite.x, car.sprite.y - 24, '💦', {
        font: '24px sans-serif'
    }).setOrigin(0.5);
    S.scene.tweens.add({
        targets: drops, alpha: 0, y: drops.y - 14,
        duration: 800, ease: 'Power2',
        onComplete: () => drops.destroy()
    });
    car.sprite.setTint(0xa5f3fc);  // light cyan tint = clean
    flashEvent(`🚿 Auto lavado. +$${CONFIG.washPrice.toLocaleString('es-CL')} al salir.`);
    SFX.cobro();
}

function purchaseAesthetic(key, costKey, repBonusKey, name) {
    if (S.upgrades[key]) return;
    const cost = CONFIG[costKey];
    if (S.money < cost) return;
    S.money -= cost;
    S.upgrades[key] = true;
    const bonus = CONFIG[repBonusKey];
    S.reputation = Math.min(100, S.reputation + bonus);
    flashEvent(`✨ ${name} instalado! +${bonus} reputación.`);
    SFX.purchase();
    flagReopenManagement();
    S.scene.scene.restart();
}

function purchasePavement() { purchaseAesthetic('pavement', 'pavementCost', 'pavementRepBonus', 'Pavimentación'); }
function purchaseLines()    { purchaseAesthetic('lines',    'linesCost',    'linesRepBonus',    'Líneas pintadas'); }
function purchaseLights()   { purchaseAesthetic('lights',   'lightsCost',   'lightsRepBonus',   'Luminarias'); }
function purchaseGuard()    { purchaseAesthetic('guard',    'guardCost',    'guardRepBonus',    'Guardia'); }
function purchaseGreenery() { purchaseAesthetic('greenery', 'greeneryCost', 'greeneryRepBonus', 'Áreas verdes'); }

function purchaseEVCharger() {
    if (S.upgrades.evCharger) return;
    if (S.money < CONFIG.evChargerCost) return;
    S.money -= CONFIG.evChargerCost;
    S.upgrades.evCharger = true;
    flashEvent(`🔌 Cargador EV instalado. Atrae clientes EV (pagan ${CONFIG.evMultiplier}x).`);
    flagReopenManagement();
    S.scene.scene.restart();
}

function purchasePOS() {
    if (S.upgrades.pos) return;
    if (S.money < CONFIG.posCost) return;
    S.money -= CONFIG.posCost;
    S.upgrades.pos = true;
    refreshPageTitle();
    closeManagementPanel();
    showPOSCelebration();
}

function purchaseBarriers() {
    if (S.upgrades.barriers) return;
    if (!S.upgrades.pos) {
        flashEvent('⚠️ Necesitas POS Digital (Nivel 2) antes de instalar barreras.');
        return;
    }
    if (S.money < CONFIG.barriersCost) return;
    S.money -= CONFIG.barriersCost;
    S.upgrades.barriers = true;
    refreshPageTitle();
    closeManagementPanel();
    showBarriersCelebration();
}

function purchaseEntryTotem() {
    if (S.upgrades.entryTotem) return;
    if (!S.upgrades.barriers) {
        flashEvent('⚠️ Necesitas Barreras (Nivel 3) antes de instalar el tótem.');
        return;
    }
    if (S.money < CONFIG.entryTotemCost) return;
    S.money -= CONFIG.entryTotemCost;
    S.upgrades.entryTotem = true;
    refreshPageTitle();
    SFX.purchase();
    showLevelMilestone({
        icon: '🎫', color: 0x0891b2,
        title: 'TÓTEM DE ENTRADA',
        tagline: 'Nivel 3 final · self-service · cobrador solo cobra salidas',
        onClose: () => { flagReopenManagement(); S.scene.scene.restart(); }
    });
}

function purchaseExitTotem() {
    if (S.upgrades.exitTotem) return;
    if (!S.upgrades.entryTotem) {
        flashEvent('⚠️ Necesitas Tótem de entrada (Nivel 3 final) antes del autopago.');
        return;
    }
    if (S.money < CONFIG.exitTotemCost) return;
    S.money -= CONFIG.exitTotemCost;
    S.upgrades.exitTotem = true;
    refreshPageTitle();
    SFX.purchase();
    showLevelMilestone({
        icon: '💳', color: 0x16a34a,
        title: 'AUTOPAGO',
        tagline: 'Nivel 4 · salida self-service · 0 cobrador necesario',
        onClose: () => { flagReopenManagement(); S.scene.scene.restart(); }
    });
}

function purchaseParkingApp() {
    if (S.upgrades.parkingApp) return;
    if (!S.upgrades.exitTotem) {
        flashEvent('⚠️ Necesitas Autopago (Nivel 4) antes de integrar la app.');
        return;
    }
    if (S.money < CONFIG.parkingAppCost) return;
    S.money -= CONFIG.parkingAppCost;
    S.upgrades.parkingApp = true;
    refreshPageTitle();
    SFX.purchase();
    showLevelMilestone({
        icon: '📱', color: 0x3b82f6,
        title: 'PARKING APP',
        tagline: 'Nivel 5 · 30% premium · +$50/min · loyalty +50% patience',
        onClose: () => { flagReopenManagement(); S.scene.scene.restart(); }
    });
}

function purchaseValetAI() {
    if (S.upgrades.valetAI) return;
    if (!S.upgrades.parkingApp) {
        flashEvent('⚠️ Necesitas ParkingApp (Nivel 5) antes del valet AI.');
        return;
    }
    if (S.money < CONFIG.valetAICost) return;
    S.money -= CONFIG.valetAICost;
    S.upgrades.valetAI = true;
    refreshPageTitle();
    S.reputation = Math.min(100, S.reputation + CONFIG.valetAIRepBonus);
    SFX.purchase();
    showLevelMilestone({
        icon: '🤖', color: 0xa855f7,
        title: 'VALET AI',
        tagline: 'Nivel 6 · 1.8x tarifa luxury · autos se estacionan solos',
        onClose: () => { flagReopenManagement(); S.scene.scene.restart(); }
    });
}

function purchaseMultiLevel() {
    if (S.upgrades.multiLevel) return;
    if (!S.upgrades.valetAI) {
        flashEvent('⚠️ Necesitas Valet AI (Nivel 6) antes del parking vertical.');
        return;
    }
    if (S.money < CONFIG.multiLevelCost) return;
    S.money -= CONFIG.multiLevelCost;
    S.upgrades.multiLevel = true;
    refreshPageTitle();
    SFX.purchase();
    showLevelMilestone({
        icon: '🏢', color: 0x0284c7,
        title: 'PARKING VERTICAL',
        tagline: 'Nivel 7 · +3 pisos · +$200/min pasivo',
        onClose: () => { flagReopenManagement(); S.scene.scene.restart(); }
    });
}

function purchaseDrone() {
    if (S.upgrades.drone) return;
    if (!S.upgrades.multiLevel) {
        flashEvent('⚠️ Necesitas Parking Vertical (Nivel 7) antes de los drones.');
        return;
    }
    if (S.money < CONFIG.droneCost) return;
    S.money -= CONFIG.droneCost;
    S.upgrades.drone = true;
    refreshPageTitle();
    S.reputation = Math.min(100, S.reputation + CONFIG.droneRepBonus);
    SFX.purchase();
    showLevelMilestone({
        icon: '🚁', color: 0x7c3aed,
        title: 'DRONES',
        tagline: 'Nivel 8 · delivery aéreo · +1.3x tarifa · +$350/min',
        onClose: () => { flagReopenManagement(); S.scene.scene.restart(); }
    });
}

// ─── BRANCH LOT PURCHASE ──────────────────────────────────
function purchaseBranchLot(lotId) {
    const lot = LOT_TYPES.find(l => l.id === lotId);
    if (!lot) return;
    if (S.branchLots.includes(lotId)) { flashEvent(`Ya tienes el lote de ${lot.name}.`); return; }
    if (lot.unlockRequires && !S.upgrades[lot.unlockRequires]) {
        flashEvent(`⚠️ Necesitas ${lot.unlockRequires} para comprar ${lot.name}.`);
        return;
    }
    if (S.money < lot.cost) { flashEvent(`💸 Te faltan $${(lot.cost - S.money).toLocaleString('es-CL')} para ${lot.name}.`); return; }
    S.money -= lot.cost;
    S.branchLots.push(lotId);
    SFX.purchase();
    showLevelMilestone({
        icon: lot.icon, color: lot.color,
        title: lot.name.toUpperCase(),
        tagline: lot.flavor + ' · +$' + lot.dailyIncome.toLocaleString('es-CL') + '/día',
        onClose: () => { flagReopenManagement(); S.scene.scene.restart(); }
    });
}

// Computes the per-game-minute passive income from all branch lots,
// modulated by day-of-week.
function getBranchLotIncomePerGameMin() {
    if (!S.branchLots || S.branchLots.length === 0) return 0;
    const dow = S.dayOfWeek;
    const isWeekend = (dow === 5 || dow === 6);
    let total = 0;
    S.branchLots.forEach(id => {
        const lot = LOT_TYPES.find(l => l.id === id);
        if (!lot) return;
        const factor = isWeekend ? lot.weekendFactor : lot.weekdayFactor;
        // dailyIncome spread across ~840 game minutes (14h opening day)
        total += (lot.dailyIncome * factor) / 840;
    });
    return total;
}

function purchaseSpaceport() {
    if (S.upgrades.spaceport) return;
    if (!S.upgrades.drone) {
        flashEvent('⚠️ Necesitas Drones (Nivel 8) antes del Spaceport.');
        return;
    }
    if (S.money < CONFIG.spaceportCost) return;
    S.money -= CONFIG.spaceportCost;
    S.upgrades.spaceport = true;
    refreshPageTitle();
    S.reputation = Math.min(100, S.reputation + CONFIG.spaceportRepBonus);
    flashEvent('🚀 ¡SPACEPORT! Has llegado a las naves espaciales. ¡Ganaste el juego!');
    SFX.purchase();
    // BUG FIX v0.65: drawSpaceport() only runs inside create() — we need a
    // scene.restart so the UFOs / banner actually appear behind the win
    // celebration. Without this, the player sees an entirely black overlay
    // and assumes the spaceport visuals are missing.
    S.scene.scene.restart();
    // showGameWonCelebration must be deferred until after the new scene is
    // created — Phaser destroys all game objects during restart, including
    // the one we'd add here. Stash a flag for the new scene's create() to
    // pick up.
    S.shouldShowWinCelebration = true;
}

// Generic mini-cinematic for milestone purchases (N4, N5, N6, N7, N8).
// Brief overlay with title + tagline + confetti, dismissable with click.
function showLevelMilestone(opts) {
    if (!S.scene) return;
    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;
    const ui = [];
    // v0.78: don't pauseAll — it freezes the tween manager and our own
    // cinematic tweens (scale-in, alpha-in) never tick. The dim backdrop
    // hides any moving game-world sprites behind it. See showPOSCelebration.
    S.paused = true;
    hapticBuzz('MEDIUM');

    // Dim backdrop
    ui.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88).setDepth(1500));

    // Big icon ring (radial gradient feel)
    const halo = scene.add.circle(W/2, H/2 - 30, 70, opts.color || 0xfde047, 0.25).setDepth(1501);
    scene.tweens.add({ targets: halo, radius: 90, alpha: 0.15, duration: 1200, yoyo: true, repeat: -1 });
    ui.push(halo);

    // Big emoji in the center. Font stack explicitly includes the OS-specific
    // emoji fonts because Android WebView's default sans-serif sometimes lacks
    // coverage at large sizes — without these, the emoji renders as a blank
    // square and the player sees only the colored halo circle behind it.
    const icon = scene.add.text(W/2, H/2 - 30, opts.icon, {
        font: '64px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji","EmojiOne Color",sans-serif'
    }).setOrigin(0.5).setScale(0).setDepth(1502);
    scene.tweens.add({ targets: icon, scale: 1, duration: 500, ease: 'Back.easeOut' });
    ui.push(icon);

    // Title
    const title = scene.add.text(W/2, H/2 + 40, opts.title, {
        font: 'bold 26px monospace', color: '#fff',
        stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0).setDepth(1502);
    scene.tweens.add({ targets: title, alpha: 1, duration: 400, delay: 300 });
    ui.push(title);

    // Tagline
    const tagline = scene.add.text(W/2, H/2 + 70, opts.tagline, {
        font: 'italic 14px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setAlpha(0).setDepth(1502);
    scene.tweens.add({ targets: tagline, alpha: 1, duration: 400, delay: 600 });
    ui.push(tagline);

    // Confetti burst — scaled down on mobile to keep frame rate up
    const colors = [0xfde047, 0x10b981, 0xa855f7, 0x3b82f6, 0xef4444, 0x06b6d4];
    const confettiCount = Math.max(6, Math.round(20 * fxScale()));
    for (let i = 0; i < confettiCount; i++) {
        const c = scene.add.rectangle(
            W/2 + (Math.random() - 0.5) * 200,
            H/2 - 30 + (Math.random() - 0.5) * 100,
            5, 10,
            colors[Math.floor(Math.random() * colors.length)]
        ).setDepth(1502);
        scene.tweens.add({
            targets: c, y: c.y + 200 + Math.random() * 100, angle: 360 + Math.random() * 360,
            alpha: 0, duration: 1500 + Math.random() * 800,
            delay: Math.random() * 400, ease: 'Sine.easeIn',
        });
        ui.push(c);
    }

    // Continue button
    const btn = scene.add.text(W/2, H - 60, '▶  ¡SIGUE!', {
        font: 'bold 18px monospace', color: '#fff',
        backgroundColor: '#16a34a', padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setAlpha(0).setDepth(1502).setInteractive({ useHandCursor: true });
    scene.tweens.add({ targets: btn, alpha: 1, duration: 400, delay: 1200 });
    btn.on('pointerdown', () => {
        ui.forEach(o => { try { o.destroy(); } catch(e) {} });
        S.paused = false;
        // v0.78: no resumeAll, didn't pauseAll.
        if (opts.onClose) opts.onClose();
    });
    ui.push(btn);
}

function showGameWonCelebration() {
    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;
    const ui = [];
    // v0.78: don't pauseAll — see showPOSCelebration fix.
    S.paused = true;
    hapticBuzz('HEAVY');
    // Triple-buzz fanfare for the winner
    setTimeout(() => hapticBuzz('HEAVY'), 200);
    setTimeout(() => hapticBuzz('HEAVY'), 500);

    // Backdrop softened from 0.95 → 0.78 in v0.65 so the player can actually see
    // the spaceport visuals (UFOs, banner) behind the celebration text. Before
    // this it looked like the spaceport visuals were missing entirely.
    ui.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.78).setDepth(2000));

    const title = scene.add.text(W/2, 100, '🚀  ¡GANASTE!  🚀', {
        font: 'bold 44px monospace', color: '#fde047',
        stroke: '#7c2d12', strokeThickness: 6
    }).setOrigin(0.5).setScale(0).setDepth(2001);
    scene.tweens.add({ targets: title, scale: 1, duration: 700, ease: 'Back.easeOut' });
    ui.push(title);

    ui.push(scene.add.text(W/2, 160, 'Nivel 9 alcanzado: SPACEPORT', {
        font: 'italic 18px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setDepth(2001));

    const lines = [
        '«Empezaste con un block de papeletas...',
        ' ahora estacionas NAVES ESPACIALES.»',
        '',
        '🅿️ Día 1: Tomás caminaba con un block',
        '📱 Hoy: ParkingApp + Redcomercio + AI + drones + naves',
        '',
        'De $76.000 iniciales a tu imperio actual.',
        '',
        'Hecho con humor, Phaser 3 y PixelLab AI 🎨',
        '🎬 GAME OVER — winner edition',
    ];
    lines.forEach((line, i) => {
        const t = scene.add.text(W/2, 210 + i * 22, line, {
            font: i === 0 || i === 1 ? 'bold 16px monospace' : '14px monospace',
            color: i < 2 ? '#fde047' : '#fff'
        }).setOrigin(0.5).setAlpha(0).setDepth(2001);
        scene.tweens.add({ targets: t, alpha: 1, duration: 400, delay: 600 + i * 150 });
        ui.push(t);
    });

    const btn = scene.add.text(W/2, H - 50, '🔁  EMPEZAR DE NUEVO', {
        font: 'bold 18px monospace', color: '#fff',
        backgroundColor: '#16a34a', padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setAlpha(0).setDepth(2001).setInteractive({ useHandCursor: true });
    scene.tweens.add({ targets: btn, alpha: 1, duration: 400, delay: 2500 });
    btn.on('pointerdown', () => {
        ui.forEach(o => { try { o.destroy(); } catch(e) {} });
        clearSave();
        location.reload();
    });
    ui.push(btn);
}

function showBarriersCelebration() {
    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;
    const ui = [];

    // v0.78: see showPOSCelebration — don't pauseAll, it kills our own tweens.
    S.paused = true;

    SFX.purchase();
    setTimeout(() => beep && beep(800, 0.12, 'square', 0.07), 200);
    setTimeout(() => beep && beep(1200, 0.18, 'square', 0.08), 380);

    ui.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.94).setDepth(1000));

    // Title
    const title = scene.add.text(W/2, 80, '🚧  ¡BARRERAS INSTALADAS!  🚧', {
        font: 'bold 30px monospace', color: '#fde047',
        stroke: '#000', strokeThickness: 5
    }).setOrigin(0.5).setScale(0).setDepth(1001);
    scene.tweens.add({ targets: title, scale: 1, duration: 600, ease: 'Back.easeOut' });
    ui.push(title);

    ui.push(scene.add.text(W/2, 118, 'Nivel 3 — Acceso controlado', {
        font: 'italic 16px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setDepth(1001));

    // Ana portrait + dialog
    const portraitX = 180, portraitY = 270;
    const portraitCircle = scene.add.circle(portraitX, portraitY, 65, 0xa855f7)
        .setStrokeStyle(4, 0xfde047).setDepth(1001);
    const portraitEmoji = scene.add.image(portraitX, portraitY, 'ana_south').setScale(2.2).setDepth(1001);
    ui.push(portraitCircle, portraitEmoji);
    ui.push(scene.add.text(portraitX, portraitY + 90, 'Ana', {
        font: 'bold 18px monospace', color: '#fde047'
    }).setOrigin(0.5).setDepth(1001));
    ui.push(scene.add.text(portraitX, portraitY + 112, 'ParkingApp · Redcomercio', {
        font: 'italic 11px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setDepth(1001));

    // Dialog
    const dialogX = 320, dialogY = 180;
    ui.push(scene.add.rectangle(dialogX + 200, dialogY + 80, 420, 240, 0x1e293b, 0.95)
        .setStrokeStyle(2, 0xfde047).setDepth(1001));

    const lines = [
        '«Tus barreras ya están instaladas.»',
        '',
        '🚧 Gate físico en entrada y salida',
        '🎫 El cobrador retira ticket con POS',
        '⬆️ La barrera abre cuando el POS confirma',
        '🚫 -90% escapes (barrera física)',
        '',
        '«Ya no se escapan sin pagar.',
        ' Los autos esperan hasta que abras.»',
        '',
        '«Más adelante: LPR + autopago vía app.»',
    ];
    lines.forEach((line, i) => {
        const t = scene.add.text(dialogX + 16, dialogY + i * 19 + 10, line, {
            font: i === 0 ? 'bold 15px monospace' : '13px monospace',
            color: i === 0 ? '#fde047' : (line.match(/🚧|💳|⚡|🚫/) ? '#10b981' : '#fff')
        }).setAlpha(0).setDepth(1001);
        scene.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 500 + i * 70 });
        ui.push(t);
    });

    const btn = scene.add.text(W/2, H - 50, '▶   ¡VAMOS!   ▶', {
        font: 'bold 22px monospace', color: '#fff',
        backgroundColor: '#16a34a', padding: { x: 28, y: 14 }
    }).setOrigin(0.5).setAlpha(0).setDepth(1001).setInteractive({ useHandCursor: true });
    scene.tweens.add({ targets: btn, alpha: 1, duration: 400, delay: 1800 });
    scene.tweens.add({ targets: btn, scale: { from: 1, to: 1.05 },
        duration: 500, yoyo: true, repeat: -1, delay: 2200 });
    btn.on('pointerdown', () => {
        ui.forEach(o => { try { o.destroy(); } catch(e) {} });
        S.paused = false;
        // v0.78: no resumeAll, didn't pauseAll.
        flashEvent('🚧 Barreras operativas — autos se procesan solos.');
        S.scene.scene.restart();
    });
    ui.push(btn);
}

function showPOSCelebration() {
    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;
    const ui = [];

    // v0.78 bug fix: scene.tweens.pauseAll() puts the WHOLE tween manager into
    // a paused state — including any new tweens added afterwards. That meant
    // the title-scale-in, subtitle-alpha-in, dialog-line-alpha-in tweens never
    // ticked, leaving the title at scale 0 and the lines at alpha 0 (the
    // "círculo sin nada" the user reported). We only need to pause game
    // logic, not the tween manager. The dim backdrop hides any car movement
    // behind the cinematic, so leaving tweens running is fine visually.
    S.paused = true;

    // Fanfare sound — ascending chord
    SFX.purchase();
    setTimeout(() => beep(1047, 0.18, 'square', 0.07), 280);
    setTimeout(() => beep(1319, 0.25, 'square', 0.08), 460);

    // v0.78: every cinematic element MUST setDepth(>=1000) or it renders BEHIND
    // game-world sprites (cars, fence, signs) — that was the user-reported
    // "transición es un círculo sin nada" bug. The dim backdrop + halo were
    // the only things drawn at depth 0 that happened to be on top.

    // Dim background
    ui.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.94).setDepth(1000));

    // Animated radial glow behind title
    const glow = scene.add.circle(W/2, 100, 140, 0xfbbf24, 0.15).setDepth(1001);
    scene.tweens.add({ targets: glow, radius: 220, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    ui.push(glow);

    // Confetti — half as many on mobile
    const colors = [0xfbbf24, 0x10b981, 0xa855f7, 0x3b82f6, 0xef4444, 0x06b6d4];
    const confettiCount = Math.max(12, Math.round(40 * fxScale()));
    for (let i = 0; i < confettiCount; i++) {
        const c = scene.add.rectangle(
            Math.random() * W, -30 + Math.random() * -100,
            6, 12,
            colors[Math.floor(Math.random() * colors.length)]
        ).setDepth(1001);
        scene.tweens.add({
            targets: c, y: H + 40, angle: 360 + Math.random() * 360,
            duration: 1800 + Math.random() * 1500, delay: Math.random() * 700,
            ease: 'Sine.easeIn'
        });
        ui.push(c);
    }

    // Title with bounce
    const title = scene.add.text(W/2, 100, '🎉  ¡POS INSTALADO!  🎉', {
        font: 'bold 32px monospace', color: '#fbbf24',
        stroke: '#000', strokeThickness: 5
    }).setOrigin(0.5).setScale(0).setDepth(1002);
    scene.tweens.add({ targets: title, scale: 1, duration: 600, ease: 'Back.easeOut' });
    ui.push(title);

    const subtitle = scene.add.text(W/2, 138, 'Entrás a la era ParkingApp', {
        font: 'italic 16px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setAlpha(0).setDepth(1002);
    scene.tweens.add({ targets: subtitle, alpha: 1, duration: 600, delay: 400 });
    ui.push(subtitle);

    // Ana portrait
    const portraitX = 180, portraitY = 270;
    const halo = scene.add.circle(portraitX, portraitY, 78, 0xfbbf24, 0.3).setDepth(1001);
    scene.tweens.add({ targets: halo, radius: 90, alpha: 0.15, duration: 1000, yoyo: true, repeat: -1 });
    ui.push(halo);
    const portraitCircle = scene.add.circle(portraitX, portraitY, 65, 0xa855f7).setStrokeStyle(4, 0xfbbf24).setDepth(1002);
    const portraitEmoji = scene.add.image(portraitX, portraitY, 'ana_south').setScale(2.2).setDepth(1003);
    ui.push(portraitCircle, portraitEmoji);
    ui.push(scene.add.text(portraitX, portraitY + 90, 'Ana', {
        font: 'bold 18px monospace', color: '#fbbf24'
    }).setOrigin(0.5).setDepth(1003));
    ui.push(scene.add.text(portraitX, portraitY + 112, 'ParkingApp Sales', {
        font: 'italic 12px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setDepth(1003));

    // Dialog box
    const dialogX = 320, dialogY = 200;
    const dialogBg = scene.add.rectangle(dialogX + 200, dialogY + 70, 420, 220, 0x1e293b, 0.95)
        .setStrokeStyle(2, 0xa855f7).setDepth(1002);
    ui.push(dialogBg);

    const lines = [
        '«¡Felicitaciones!»',
        '',
        '⚡ Cobro papeleta:  1.5s',
        '⚡ Cobro con POS:    0.3s   (5x)',
        '',
        '«Más autos atendidos por hora.',
        ' Menos clientes se cansan.',
        ' Tu rep. sube. La plata fluye.»',
        '',
        '«Esto es solo el principio.»',
    ];
    lines.forEach((line, i) => {
        const t = scene.add.text(dialogX + 16, dialogY + i * 19 + 10, line, {
            font: i === 0 ? 'bold 16px monospace' : '14px monospace',
            color: i === 0 ? '#fbbf24' : (line.includes('⚡') ? '#10b981' : '#fff')
        }).setAlpha(0).setDepth(1003);
        scene.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 600 + i * 80 });
        ui.push(t);
    });

    // Continue button (delayed appearance)
    const btn = scene.add.text(W/2, H - 50, '▶   ¡VAMOS!   ▶', {
        font: 'bold 22px monospace', color: '#fff',
        backgroundColor: '#16a34a', padding: { x: 28, y: 14 }
    }).setOrigin(0.5).setAlpha(0).setDepth(1003).setInteractive({ useHandCursor: true });
    scene.tweens.add({ targets: btn, alpha: 1, duration: 400, delay: 2000 });
    scene.tweens.add({ targets: btn, scale: { from: 1, to: 1.05 },
        duration: 500, yoyo: true, repeat: -1, delay: 2400 });
    btn.on('pointerdown', () => {
        ui.forEach(o => { try { o.destroy(); } catch(e) {} });
        S.paused = false;
        // v0.78: no resumeAll needed since we didn't pauseAll.
        flashEvent('💳 POS operativo. Te paga sus beneficios en una semana.');
        // Restart so the booth re-renders with the POS terminal
        S.scene.scene.restart();
    });
    ui.push(btn);
}

function maybeShowParkingAppCinematic() {
    // Trigger conditions: day 3+ AND has booth OR revenue total >= 50k
    if (S.cinematicShown) return false;
    if (!(S.day >= 3 && (S.upgrades.booth || S.lifetimeRevenue >= 50000))) return false;
    S.cinematicShown = true;
    renderCinematic();
    return true;
}

function renderCinematic() {
    S.dayEnded = true;
    S.paused = true;
    // v0.78: pauseAll() killed every cinematic tween — and even though this
    // function doesn't use tweens directly, the call left the manager paused
    // so the NEXT cinematic (POS celebration) lost its animations. See
    // showPOSCelebration for the same fix.
    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;

    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];

    // v0.78: setDepth on EVERY cinematic element. Without it the dialog text
    // and buttons render at default depth 0, hidden behind cars/fence/signs.
    // The user saw "un círculo sin nada" — Ana's portrait circle (which
    // happens to be drawn after the lot, so it shows) but no readable text.
    S.endDayUI.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.93).setDepth(1500));

    // Title
    S.endDayUI.push(scene.add.text(W/2, 50, '✨ NUEVA OPORTUNIDAD', {
        font: 'bold 24px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setDepth(1502));

    // Ana portrait (placeholder circle)
    const portraitX = 180, portraitY = 200;
    S.endDayUI.push(scene.add.circle(portraitX, portraitY, 60, 0xa855f7).setStrokeStyle(3, 0xfbbf24).setDepth(1501));
    S.endDayUI.push(scene.add.text(portraitX, portraitY, '👩‍💼', { font: '52px sans-serif' }).setOrigin(0.5).setDepth(1502));
    S.endDayUI.push(scene.add.text(portraitX, portraitY + 80, 'Ana', {
        font: 'bold 18px monospace', color: '#fbbf24'
    }).setOrigin(0.5).setDepth(1502));
    S.endDayUI.push(scene.add.text(portraitX, portraitY + 102, 'ParkingApp', {
        font: 'italic 13px monospace', color: '#a5f3fc'
    }).setOrigin(0.5).setDepth(1502));

    // Dialog
    const dialog = [
        '— Buenos días. Vi cómo estás operando.',
        '   Tengo algo que te puede cambiar la vida.',
        '',
        '— Te ofrezco POS digital: el cobro se hace en',
        '   0.3 segundos. Olvídate de la papeleta.',
        '',
        '— Después podemos seguir: barreras, tótem',
        '   de autopago, app, suscripciones, multi-sucursal.',
        '',
        '— ¿Cuánto? Solo $40.000 por el POS.',
        '   Te paga sus propios beneficios en una semana.',
        ''
    ];
    const dialogX = 290, dialogY = 130;
    dialog.forEach((line, i) => {
        S.endDayUI.push(scene.add.text(dialogX, dialogY + i * 24, line, {
            font: '14px monospace', color: '#fff'
        }).setDepth(1502));
    });

    const acceptBtn = scene.add.text(W/2 - 110, H - 80, '💳  COMPRAR POS  -$40.000', {
        font: 'bold 16px monospace', color: '#fff',
        backgroundColor: S.money >= CONFIG.posCost ? '#16a34a' : '#475569',
        padding: { x: 16, y: 12 }
    }).setOrigin(0.5).setDepth(1502);
    if (S.money >= CONFIG.posCost) {
        acceptBtn.setInteractive({ useHandCursor: true });
        acceptBtn.on('pointerdown', () => {
            purchasePOS();
            closeCinematic();
        });
    }
    S.endDayUI.push(acceptBtn);

    const laterBtn = scene.add.text(W/2 + 130, H - 80, '⏰  Lo pienso (más tarde)', {
        font: 'bold 14px monospace', color: '#fff',
        backgroundColor: '#475569',
        padding: { x: 14, y: 11 }
    }).setOrigin(0.5).setDepth(1502).setInteractive({ useHandCursor: true });
    laterBtn.on('pointerdown', closeCinematic);
    S.endDayUI.push(laterBtn);

    S.endDayUI.push(scene.add.text(W/2, H - 25,
        '💡 El POS estará disponible siempre en Gestión.',
        { font: 'italic 12px monospace', color: '#cbd5e1' }
    ).setOrigin(0.5).setDepth(1502));
}

function closeCinematic() {
    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];
    S.dayEnded = false;
    S.paused = false;
    // v0.78: no resumeAll, didn't pauseAll.
    // Bug fix v0.67: if the cinematic was triggered from endDay() (i.e. the
    // day was already over when Ana popped up), dismissing it via "Lo pienso"
    // left the player with no end-of-day summary and no DÍA SIGUIENTE button
    // — game softlocked at 22:00. update() would fire endDay() again on the
    // next frame, but only if S.paused became false AND another tick brought
    // timeMinutes back past endHour. On a paused tween system the update
    // pipeline can miss this. So we explicitly re-enter the end-of-day flow
    // now that cinematicShown is true (which skips the cinematic branch).
    if (S.timeMinutes >= CONFIG.endHour * 60) {
        endDay();
    }
}

function purchaseSubscription() {
    if (S.subscriptions.length >= CONFIG.subscriptionMax) return;
    // Reserve the first available NON-EV space (mensualistas don't get the
    // green EV spots — those stay reserved for EV cars).
    let space = S.spaces.find(s => !s.occupied && !s.isEV);
    if (!space) space = S.spaces.find(s => !s.occupied);   // fallback if lot is super full
    if (!space) { flashEvent('❌ Sin espacios libres para mensualista'); return; }

    // Charge full subscription UPFRONT (prepaid)
    const total = CONFIG.subscriptionPricePerDay * CONFIG.subscriptionDayRange;
    S.money += total;            // payment received now
    S.revenueToday += total;
    S.lifetimeRevenue += total;
    S.subscriptionRevenueToday = (S.subscriptionRevenueToday || 0) + total;

    const sub = {
        id: 'sub-' + Math.random().toString(36).slice(2),
        startDay: S.day,
        endDay: S.day + CONFIG.subscriptionDayRange - 1,
        dailyPrice: CONFIG.subscriptionPricePerDay,
        totalPaid: total,
        spaceIndex: S.spaces.indexOf(space),
    };
    S.subscriptions.push(sub);
    space.occupied = 'subscription';
    space.sprite.setFillStyle(COLORS.spaceSubscription);
    if (space.label) { space.label.setText('M'); space.label.setColor('#fbcfe8'); }
    flashEvent(`📋 Mensualista #${sub.spaceIndex + 1} pagó adelantado: +$${total.toLocaleString('es-CL')} (${CONFIG.subscriptionDayRange}d)`);
}

// ─── HUD ───────────────────────────────────────────────────
function createHUD(scene) {
    // Day/Night overlay — full-canvas tint that changes by game hour.
    // Drawn BEFORE the HUD so the HUD bar sits on top, but UNDER the canvas
    // entities so cars/booth show through. Depth chosen between background
    // (default 0) and HUD elements.
    S.dayNightOverlay = scene.add.rectangle(
        CONFIG.width/2, (L.hudH + CONFIG.height) / 2,
        CONFIG.width, CONFIG.height - L.hudH,
        0x000033, 0
    ).setDepth(11);   // above booth (15? actually 12 vs cars) — fine-tune below
    // Actually want the tint OVER cars and lot but UNDER UI, so depth ~ 50.
    S.dayNightOverlay.setDepth(50);
    // BlendMode MULTIPLY would tint everything but rendering issues — use
    // simple alpha overlay with a tinted color so it darkens uniformly.

    scene.add.rectangle(CONFIG.width / 2, L.hudH / 2, CONFIG.width, L.hudH, 0x1e293b)
        .setStrokeStyle(2, 0x334155);

    S.hud.time = scene.add.text(20, 8, '', { font: 'bold 17px monospace', color: '#fff' });
    S.hud.money = scene.add.text(220, 8, '', { font: 'bold 17px monospace', color: '#fbbf24' });
    S.hud.reputation = scene.add.text(390, 8, '', { font: 'bold 17px monospace', color: '#10b981' });
    S.hud.queue = scene.add.text(500, 8, '', { font: 'bold 17px monospace', color: '#fff' });
    S.hud.exitQueue = scene.add.text(590, 8, '', { font: 'bold 17px monospace', color: '#fb7185' });
    S.hud.spaces = scene.add.text(690, 8, '', { font: 'bold 17px monospace', color: '#94a3b8' });

    S.hud.status = scene.add.text(20, 36, '', { font: 'bold 14px monospace', color: '#10b981' });
    S.hud.employees = scene.add.text(170, 36, '', { font: 'bold 14px monospace', color: '#a5f3fc' });
    S.hud.salary = scene.add.text(320, 36, '', { font: 'bold 14px monospace', color: '#f87171' });
    S.hud.demand = scene.add.text(490, 36, '', { font: 'bold 14px monospace', color: '#fbbf24' });
    S.hud.lossSum = scene.add.text(680, 36, '', { font: 'bold 14px monospace', color: '#fca5a5' });
    S.hud.rival = scene.add.text(820, 36, '', { font: 'bold 12px monospace', color: '#fb923c' });

    scene.add.rectangle(CONFIG.width / 2, CONFIG.height - 18, CONFIG.width, 36, 0x1e293b)
        .setStrokeStyle(2, 0x334155);
    S.hud.events = scene.add.text(15, CONFIG.height - 28, '', {
        font: 'bold 15px monospace', color: '#fbbf24'
    });

    // Hard mode badge in the HUD
    if (isHardMode()) {
        scene.add.text(CONFIG.width - 240, 10, '🔥 HARD', {
            font: 'bold 13px monospace', color: '#fff',
            backgroundColor: '#dc2626', padding: { x: 6, y: 3 }
        }).setOrigin(1, 0);
    }

    createPauseButton(scene);
    updateHUD();
}

function createPauseButton(scene) {
    const btn = scene.add.text(CONFIG.width - 20, 10, '⏸ PAUSA (P)', {
        font: 'bold 15px monospace', color: '#fff',
        backgroundColor: '#475569', padding: { x: 10, y: 6 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', togglePause);
    S.hud.pauseBtn = btn;

    // Speed control button (cycles 1x → 2x → 3x → 1x)
    const speedLabel = '⏩ ' + (S.speedMultiplier || 1) + 'x';
    const initialColor = (S.speedMultiplier || 1) === 1 ? '#475569' : ((S.speedMultiplier || 1) === 2 ? '#0891b2' : '#dc2626');
    const speedBtn = scene.add.text(CONFIG.width - 130, 10, speedLabel, {
        font: 'bold 15px monospace', color: '#fff',
        backgroundColor: initialColor, padding: { x: 10, y: 6 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    speedBtn.on('pointerdown', cycleSpeed);
    S.hud.speedBtn = speedBtn;
    // Re-apply runtime scale (in case scene restarted with multiplier already set)
    if (S.speedMultiplier && S.speedMultiplier !== 1) {
        scene.tweens.timeScale = S.speedMultiplier;
        scene.time.timeScale = S.speedMultiplier;
    }
}

function togglePause() {
    if (S.dayEnded) return;
    if (S.managementOpen) return;
    S.paused = !S.paused;
    if (S.paused) S.scene.tweens.pauseAll(); else S.scene.tweens.resumeAll();
    if (S.hud.pauseBtn) {
        S.hud.pauseBtn.setText(S.paused ? '▶ REANUDAR (P)' : '⏸ PAUSA (P)');
        S.hud.pauseBtn.setBackgroundColor(S.paused ? '#10b981' : '#475569');
    }
    flashEvent(S.paused ? '⏸ Juego pausado.' : '▶ Reanudando...');
}

// Cycle through 1x / 2x / 3x game speed. Scales game-time, tween speed,
// and delayed-call timers proportionally so the WHOLE game runs faster.
function cycleSpeed() {
    if (S.dayEnded) return;
    const speeds = [1, 2, 3];
    const cur = speeds.indexOf(S.speedMultiplier || 1);
    const next = speeds[(cur + 1) % speeds.length];
    S.speedMultiplier = next;
    if (S.scene && S.scene.tweens) S.scene.tweens.timeScale = next;
    if (S.scene && S.scene.time)   S.scene.time.timeScale   = next;
    if (S.hud.speedBtn) {
        S.hud.speedBtn.setText(`⏩ ${next}x`);
        S.hud.speedBtn.setBackgroundColor(next === 1 ? '#475569' : (next === 2 ? '#0891b2' : '#dc2626'));
    }
    flashEvent(`⏩ Velocidad: ${next}x`);
}

// ─── MAIN LOOP ─────────────────────────────────────────────
function update(time, delta) {
    if (S.dayEnded || S.paused) return;

    const gameMinutesAdvanced = (delta / 1000) * CONFIG.timeSpeed * (S.speedMultiplier || 1);
    S.timeMinutes += gameMinutesAdvanced;
    if (S.timeMinutes >= CONFIG.endHour * 60) { endDay(); return; }

    const hourNow = S.timeMinutes / 60;
    const onShiftCount = S.employees.filter(e => isOnShift(e, hourNow)).length;
    if (onShiftCount > 0) {
        const salaryPerGameMin = CONFIG.employeeSalary / CONFIG.employeeHoursPerShift / 60;
        const cost = onShiftCount * salaryPerGameMin * gameMinutesAdvanced;
        S.money -= cost;
        S.salariesPaidToday += cost;
        S.lifetimeSalaries += cost;
    }

    // Passive ad-screen income (24/7, even when closed)
    if (S.upgrades.adScreens > 0) {
        const adIncome = S.upgrades.adScreens * CONFIG.adScreenIncomePerGameMin * gameMinutesAdvanced;
        S.money += adIncome;
        S.revenueToday += adIncome;
        S.adRevenueToday = (S.adRevenueToday || 0) + adIncome;
        S.lifetimeRevenue += adIncome;
    }

    // ParkingApp subscriber passive revenue (Nivel 5) — also 24/7
    if (S.upgrades.parkingApp) {
        const appIncome = CONFIG.parkingAppSubscriptionIncomePerGameMin * gameMinutesAdvanced;
        S.money += appIncome;
        S.revenueToday += appIncome;
        S.appRevenueToday = (S.appRevenueToday || 0) + appIncome;
        S.lifetimeRevenue += appIncome;
    }

    // Multi-level vertical parking (Nivel 7) — pisos ocultos generan revenue
    if (S.upgrades.multiLevel) {
        const inc = CONFIG.multiLevelPassiveIncomePerMin * gameMinutesAdvanced;
        S.money += inc; S.revenueToday += inc; S.lifetimeRevenue += inc;
    }
    // Branch lots (multi-lot empire) — passive income from secondary lots
    if (S.branchLots && S.branchLots.length > 0) {
        const inc = getBranchLotIncomePerGameMin() * gameMinutesAdvanced;
        S.money += inc;
        S.revenueToday += inc;
        S.branchRevenueToday = (S.branchRevenueToday || 0) + inc;
        S.lifetimeRevenue += inc;
    }
    // Drone delivery (Nivel 8) — entregas constantes
    if (S.upgrades.drone) {
        const inc = CONFIG.droneAmbientRevenuePerMin * gameMinutesAdvanced;
        S.money += inc; S.revenueToday += inc; S.lifetimeRevenue += inc;
    }
    // Spaceport (Nivel 9) — naves espaciales
    if (S.upgrades.spaceport) {
        const inc = CONFIG.spaceportPassiveIncomePerMin * gameMinutesAdvanced;
        S.money += inc; S.revenueToday += inc; S.lifetimeRevenue += inc;
    }

    // Final-Nivel-3 upgrade: Tótem de tickets en la entrada.
    // Cuando está instalado, los autos sacan ticket automáticamente y entran
    // sin que el cobrador tenga que hacer nada. La salida sigue requiriendo
    // al cobrador (POS + cobro). Esto libera al operador para concentrarse
    // en cobros de salida (que es donde está la plata).
    if (S.upgrades.entryTotem && isOpen()) {
        S.entryTotemTimer = (S.entryTotemTimer || 0) + delta;
        if (S.entryTotemTimer >= CONFIG.entryTotemTickMs) {
            S.entryTotemTimer = 0;
            if (S.queue.some(c => c.state === 'queueing')) {
                processEntryViaTotem();
            }
        }
    }

    // Nivel 4: Tótem autopago en salida. Procesa exits sin necesidad de
    // cobrador. Cobrador puede ser 0 empleados (lot sigue "abierto" para
    // recepción ya que entryTotem se ocupa). Si no hay employee shifts, exit
    // totem sigue funcionando 24/7.
    if (S.upgrades.exitTotem) {
        S.exitTotemTimer = (S.exitTotemTimer || 0) + delta;
        if (S.exitTotemTimer >= CONFIG.exitTotemTickMs) {
            S.exitTotemTimer = 0;
            if (S.exitQueue.some(c => c.state === 'exit-waiting')) {
                processExitViaTotem();
            }
        }
    }

    // Employee AUTONOMY tick: level 3+ employees auto-attend cars without
    // requiring a player click. Probability scales with level. Gives the
    // player breathing room when running multiple shifts.
    S.employees.forEach(emp => {
        if (emp.busy) return;
        if (!isOnShift(emp, hourNow)) return;
        const lv = (emp.rosterEntry && emp.rosterEntry.level) || 1;
        const perMin = CONFIG.levelAutonomyPerMin[lv - 1];
        if (perMin <= 0) return;
        // Probability per ms = (perMin / 60000 game-ms) — but delta is real-ms.
        // Game minutes elapsed this tick = gameMinutesAdvanced.
        if (Math.random() < perMin * gameMinutesAdvanced) {
            attemptCobroBy(emp, true);   // silent — autopilot, don't spam toasts
        }
    });

    S.spawnTimer += delta;
    if (S.spawnTimer >= S.nextSpawnIn) {
        spawnCar();
        S.spawnTimer = 0;
        const demand = Math.max(0.2, getDemandMultiplier(hourNow));
        const signBoost = 1 + (S.upgrades.signs * CONFIG.signSpawnBoostPct / 100);
        const convenioBoost = getConvenioSpawnBoost();
        // Easier first 3 days — give the player time to learn the loop.
        // Hard mode skips the ease curve entirely + bumps spawn 40%.
        let earlyEase = 1;
        const hard = isHardMode();
        if (!hard) {
            if (S.day === 1) earlyEase = 0.5;
            else if (S.day === 2) earlyEase = 0.7;
            else if (S.day === 3) earlyEase = 0.85;
        } else {
            earlyEase = CONFIG.hardModeSpawnFactor;
        }
        // Rival lot opened nearby — reduces spawn rate
        if (S.rivalActive && S.day < (S.rivalUntilDay || 0)) {
            // small reduction
        } else if (S.rivalActive) {
            S.rivalActive = false;
        }
        const rivalFactor = (S.rivalActive && S.day < (S.rivalUntilDay || 0)) ? 0.75 : 1;
        const effective = demand * signBoost * convenioBoost * earlyEase * rivalFactor;
        const base = Phaser.Math.Between(CONFIG.spawnMinMs, CONFIG.spawnMaxMs);
        S.nextSpawnIn = Math.max(500, base / effective);
    }

    // Passing-by cars (street ambience — just drive through, never enter)
    S.passingTimer = (S.passingTimer || 0) + delta;
    if (S.passingTimer >= (S.nextPassingIn || 3000)) {
        S.passingTimer = 0;
        S.nextPassingIn = Phaser.Math.Between(CONFIG.passingCarMinMs, CONFIG.passingCarMaxMs);
        spawnPassingCar();
    }

    // Random event ticker
    S.eventTimer += delta;
    if (S.eventTimer >= S.nextEventIn) {
        S.eventTimer = 0;
        S.nextEventIn = Phaser.Math.Between(40000, 110000);
        triggerRandomEvent();
    }

    // Idle hints — rotate every ~15s when nothing important happens
    S.idleHintTimer += delta;
    if (S.idleHintTimer >= 15000 && S.queue.length === 0 && S.exitQueue.length === 0) {
        S.idleHintTimer = 0;
        showIdleHint();
    }

    for (const car of [...S.queue]) {
        if (car.state !== 'queueing') continue;  // skip cars still arriving
        car.patience -= delta;
        if (car.patience <= 0) { boredLeave(car); continue; }
        if (car.patience < CONFIG.patienceMs * 0.4 && !car.angryHint) {
            car.angryHint = true;
            SFX.angry();
            // Angry emoji above car + light red tint
            car.angryEmoji = S.scene.add.text(car.sprite.x, car.sprite.y - 30, '😡', {
                font: '22px sans-serif'
            }).setOrigin(0.5);
            S.scene.tweens.add({
                targets: car.angryEmoji,
                scale: { from: 1, to: 1.2 }, y: car.sprite.y - 34,
                duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
            car.sprite.setTint(0xff9999);
        }
        // Keep emoji glued above the car each frame
        if (car.angryEmoji) car.angryEmoji.x = car.sprite.x;
        if (car.evBadge) { car.evBadge.x = car.sprite.x; car.evBadge.y = car.sprite.y - 28; }
    }

    for (const car of [...S.parkedCars]) {
        car.stayRemainingMs -= delta;
        if (car.stayRemainingMs <= 0 && car.state === 'parked') requestExit(car);
    }

    for (const car of [...S.exitQueue]) {
        if (car.state !== 'exit-waiting') continue;
        car.exitPatience -= delta;
        if (car.exitPatience <= 0) {
            // Barriers physically block ~90% of escape attempts (configurable)
            if (S.upgrades.barriers && Math.random() * 100 < CONFIG.barrierEscapeReductionPct) {
                car.exitPatience = CONFIG.exitPatienceMs * 0.5;  // reset some patience — gate forces them to wait
                continue;
            }
            escapeWithoutPaying(car); continue;
        }
        if (car.exitPatience < CONFIG.exitPatienceMs * 0.4 && !car.escapeHint) {
            car.escapeHint = true;
            // Sneaky escaping emoji
            car.angryEmoji = S.scene.add.text(car.sprite.x, car.sprite.y - 30, '😤', {
                font: '22px sans-serif'
            }).setOrigin(0.5);
            S.scene.tweens.add({
                targets: car.angryEmoji,
                scale: { from: 1, to: 1.2 }, y: car.sprite.y - 34,
                duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
            car.sprite.setTint(0xffaa44);
        }
        if (car.angryEmoji) car.angryEmoji.x = car.sprite.x;
    }

    S.employees.forEach(updateEmployeeAppearance);
    updateClosedSign();
    updateHUD();
    updateEmployeeCardsHTML();
    updateInfoBoard();
}

// ─── DRIVE HELPER ──────────────────────────────────────────
// ─── MONEY FLOAT — visual juice when a car pays ────────────
// Shows the charged amount as a floating "+$X" above the car for ~1.2s.
// Premium customers get a special gold color and bigger font.
function showMoneyFloat(x, y, amount, isPremium) {
    if (!S.scene) return;
    const txt = '+$' + amount.toLocaleString('es-CL');
    const style = isPremium
        ? { font: 'bold 16px monospace', color: '#fde047', stroke: '#7c2d12', strokeThickness: 3 }
        : { font: 'bold 14px monospace', color: '#86efac', stroke: '#064e3b', strokeThickness: 2 };
    const float = S.scene.add.text(x, y - 18, txt, style).setOrigin(0.5).setDepth(50);
    S.scene.tweens.add({
        targets: float, y: y - 50, alpha: { from: 1, to: 0 }, scale: { from: 1, to: 1.3 },
        duration: 1300, ease: 'Power2',
        onComplete: () => float.destroy()
    });
}

// ─── CAR HOVER TOOLTIPS ────────────────────────────────────
// Mouse over a car shows a small info popup (state, patience, est. revenue).
function attachCarTooltip(car) {
    if (!car.sprite) return;
    car.sprite.setInteractive({ useHandCursor: false });
    car.sprite.on('pointerover', () => showCarTooltip(car));
    car.sprite.on('pointermove', () => showCarTooltip(car));
    car.sprite.on('pointerout', () => hideCarTooltip());
}

function showCarTooltip(car) {
    const tip = document.getElementById('car-tooltip');
    if (!tip || !car) return;
    let html = '';
    if (car.state === 'queueing' || car.state === 'arriving') {
        const patiencePct = Math.max(0, Math.round((car.patience / (CONFIG.patienceMs * 1.4)) * 100));
        const evTag = car.isEV ? '<br>⚡ <span style="color:#86efac">EV (+150% tarifa)</span>' : '';
        html = `🚗 En cola<br>⏳ Paciencia: <span style="color:${patiencePct < 40 ? '#f87171' : '#fde047'}">${patiencePct}%</span>${evTag}`;
    } else if (car.state === 'parked') {
        const stayedMin = Math.max(0, Math.ceil(S.timeMinutes - (car.entryTimeMinutes || S.timeMinutes)));
        let estCharge = stayedMin * CONFIG.pricePerMinute * getConvenioRevenueCut();
        if (car.isEV) estCharge *= CONFIG.evMultiplier;
        const washTag = car.washed ? '<br>🚿 +$' + CONFIG.washPrice.toLocaleString('es-CL') + ' lavado' : '';
        html = `🅿️ Estacionado<br>⏱️ ${stayedMin} min<br>💵 Estimado al salir: $${Math.floor(estCharge).toLocaleString('es-CL')}${washTag}`;
        if (S.upgrades.carwash && !car.washed) html += '<br><span style="color:#5eead4">Click para lavar (+$5.000)</span>';
    } else if (car.state === 'exit-waiting' || car.state === 'exit-attending') {
        const stayedMin = Math.max(1, Math.ceil(S.timeMinutes - (car.entryTimeMinutes || S.timeMinutes)));
        let charge = stayedMin * CONFIG.pricePerMinute * getConvenioRevenueCut();
        if (car.isEV) charge *= CONFIG.evMultiplier;
        if (car.washed) charge += CONFIG.washPrice;
        html = `🚙 Pidiendo salida<br>⏱️ ${stayedMin} min en lote<br>💵 A cobrar: <span style="color:#fde047">$${Math.floor(charge).toLocaleString('es-CL')}</span>`;
    } else {
        html = `🚘 ${car.state}`;
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    // Position near the car sprite via canvas pixel → page coords
    const canvas = document.querySelector('canvas');
    if (canvas && car.sprite) {
        const rect = canvas.getBoundingClientRect();
        const sx = rect.width / CONFIG.width;
        const sy = rect.height / CONFIG.height;
        tip.style.left = (rect.left + car.sprite.x * sx + 20) + 'px';
        tip.style.top  = (rect.top  + car.sprite.y * sy - 10) + 'px';
    }
}

function hideCarTooltip() {
    const tip = document.getElementById('car-tooltip');
    if (tip) tip.style.display = 'none';
}

function driveCar(car, waypoints, onDone) {
    let i = 0;
    const step = () => {
        if (i >= waypoints.length) { onDone && onDone(); return; }
        const wp = waypoints[i++];
        const cfg = {
            targets: [car.sprite, car.windows],
            duration: wp.duration ?? 600,
            ease: wp.ease ?? 'Power2',
            onComplete: step,
        };
        if (wp.x !== undefined) cfg.x = wp.x;
        if (wp.y !== undefined) cfg.y = wp.y;
        if (wp.angle !== undefined) cfg.angle = wp.angle;
        S.scene.tweens.add(cfg);
    };
    step();
}

// ─── LANE LOCKS — cars are solid objects, can't drive through each other ──
// We serialize movement on the two vertical lanes (entry going south, exit
// going north). Acquire before driving, release when the relevant segment
// of the route has cleared. Calls to acquireLane queue up if busy.
S.laneBusy = S.laneBusy || { entryV: false, exitV: false };
S.laneQueue = S.laneQueue || { entryV: [], exitV: [] };

function acquireLane(lane, holdMs, callback) {
    // If free, take it immediately; otherwise queue.
    const run = () => {
        S.laneBusy[lane] = true;
        // Auto-release after holdMs
        S.scene.time.delayedCall(holdMs, () => {
            S.laneBusy[lane] = false;
            const next = S.laneQueue[lane].shift();
            if (next) next();
        });
        callback();
    };
    if (!S.laneBusy[lane]) {
        run();
    } else {
        S.laneQueue[lane].push(run);
    }
}

// ─── SPAWN ─────────────────────────────────────────────────
function spawnCar() {
    if (!isOpen()) { spawnDrivePast(); return; }
    // Don't spawn if there's still a car too close to the spawn point — prevents overlap
    const tooClose = S.cars.some(c => c.sprite && c.sprite.x < 60 && c.sprite.y < 200);
    if (tooClose) {
        // Retry in a bit (skip this spawn)
        S.spawnTimer = Math.max(0, S.nextSpawnIn - 600);
        return;
    }
    spawnQueueCar();
}

function makeAppBadge(scene, car) {
    // Floating 📱 badge above ParkingApp cars
    const offsetY = car.evBadge ? -44 : -28;   // stack above EV badge if present
    const badge = scene.add.text(car.sprite.x, car.sprite.y + offsetY, '📱', {
        font: 'bold 14px sans-serif',
        backgroundColor: '#3b82f6', padding: { x: 4, y: 1 }
    }).setOrigin(0.5);
    scene.tweens.add({
        targets: badge, scale: { from: 1, to: 1.18 },
        duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    car.appBadge = badge;
    car.appBadgeOffsetY = offsetY;
}

function makeEVBadge(scene, car) {
    // Floating ⚡ badge above EV cars in queue
    const badge = scene.add.text(car.sprite.x, car.sprite.y - 28, '⚡EV', {
        font: 'bold 12px monospace', color: '#000',
        backgroundColor: '#4ade80', padding: { x: 4, y: 1 }
    }).setOrigin(0.5);
    scene.tweens.add({
        targets: badge, scale: { from: 1, to: 1.15 },
        duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    car.evBadge = badge;
}

function spawnQueueCar() {
    const scene = S.scene;
    // EV customers prefer green colors and pay more
    const isEV = S.upgrades.evCharger && Math.random() * 100 < CONFIG.evCustomerChance;
    // ParkingApp customers (Nivel 5) — premium tariff + loyalty patience
    const isAppUser = S.upgrades.parkingApp && Math.random() * 100 < CONFIG.parkingAppUserChance;
    // Vehicle variety — random size class: 15% trucks (bigger), 8% motos (smaller)
    // v0.73: scales bumped ~20% so cars are more readable on mobile.
    // User feedback: "que los monitos y autitos se vean más grandes".
    const vehicleRoll = Math.random();
    const isTruck = vehicleRoll < 0.15;
    const isMoto = !isTruck && vehicleRoll < 0.23;
    let scale = 1.9;           // was 1.6
    let randomTint = null;
    if (isTruck) {
        scale = 2.4;           // bigger sprite = truck/SUV (was 2.0)
        randomTint = Phaser.Math.RND.pick([0x71717a, 0x44403c, 0x57534e, 0x1f2937]);
    } else if (isMoto) {
        scale = 1.3;           // smaller = motorcycle (was 1.0)
        randomTint = Phaser.Math.RND.pick([0xfbbf24, 0xef4444, 0x10b981, 0x3b82f6]);
    } else if (Math.random() < 0.30) {
        // 30% of regular cars get a slight tint variation for visual diversity
        const variations = [0xfee2e2, 0xfed7aa, 0xfde68a, 0xdcfce7, 0xdbeafe, 0xe0e7ff, 0xf3e8ff];
        randomTint = Phaser.Math.RND.pick(variations);
    }

    const textureKey = isEV
        ? Phaser.Math.RND.pick(['car_green_1', 'car_green_2', 'car_green_3', 'car_cyan_1'])
        : Phaser.Math.RND.pick(CAR_TEXTURES);
    const stayMin = Phaser.Math.Between(CONFIG.stayMinMin, CONFIG.stayMaxMin);

    const sprite = scene.add.image(L.spawnX, L.entryLaneY, textureKey).setScale(scale);
    if (isEV) {
        sprite.setTint(0x4ade80);
        scene.tweens.add({
            targets: sprite, alpha: { from: 1, to: 0.85 },
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    } else if (randomTint !== null) {
        sprite.setTint(randomTint);
    }
    const windows = scene.add.rectangle(L.spawnX, L.entryLaneY, 1, 1, 0).setAlpha(0);

    // Patience: ad screens + app loyalty stack
    let patienceMul = 1 + (S.upgrades.adScreens * CONFIG.adScreenPatienceBonusPct / 100);
    if (isAppUser) patienceMul *= (1 + CONFIG.parkingAppPatienceBonusPct / 100);

    const car = {
        id: Math.random().toString(36).slice(2),
        sprite, windows, stayMin, isEV, isAppUser, isTruck, isMoto,
        stayRemainingMs: stayMin * (1000 / CONFIG.timeSpeed),
        patience: CONFIG.patienceMs * patienceMul,
        exitPatience: CONFIG.exitPatienceMs * patienceMul,
        state: 'arriving', space: null, revenue: 0,
        angryHint: false, escapeHint: false,
        entryTimeMinutes: null,
    };
    S.cars.push(car);
    S.queue.push(car);
    if (isEV) makeEVBadge(scene, car);
    if (isAppUser) makeAppBadge(scene, car);
    attachCarTooltip(car);

    // Head (idx==0) drives INTO the lot. Others stop on the street.
    const queueIdx = S.queue.length - 1;
    if (queueIdx === 0) {
        // Drive east to entry opening, turn south, enter lot to head position
        driveCar(car, [
            { x: L.entryOpeningX, y: L.entryLaneY, angle: 0, duration: 1000 },
            { angle: 90, duration: 200 },
            { x: L.queueHeadInsideX, y: L.queueHeadInsideY, duration: 600 },
        ], () => { car.state = 'queueing'; });
    } else {
        // Stop on the street west of the opening, behind other queued cars
        const targetX = L.entryOpeningX - queueIdx * L.queueStreetSpacing;
        driveCar(car, [
            { x: targetX, y: L.entryLaneY, angle: 0, duration: 1100 },
        ], () => { car.state = 'queueing'; });
    }
}

function spawnPassingCar() {
    // Ambient car driving through. Two-lane convention (right-side driving):
    //   - Top lane (bypassLaneY) = WEST-bound (cars going right-to-left, angle 180)
    //   - Bottom lane (entryLaneY) = EAST-bound (cars going left-to-right, angle 0)
    // Queue + exits use the bottom lane going east, so the bottom lane is
    // sometimes "busy" — when that happens we don't spawn a passing car
    // there (would collide with queued/exiting cars).
    const scene = S.scene;
    const textureKey = Phaser.Math.RND.pick(CAR_TEXTURES);
    const direction = Math.random() > 0.5 ? 'east' : 'west';
    const laneY = direction === 'east' ? L.entryLaneY : L.bypassLaneY;
    // Don't spawn an east-bound passing car if our queue is using the bottom lane
    if (direction === 'east' && S.queue.length > 0) return;
    const startX = direction === 'east' ? -50 : CONFIG.width + 50;
    const endX = direction === 'east' ? CONFIG.width + 50 : -50;
    const sprite = scene.add.image(startX, laneY, textureKey).setScale(1.4).setAlpha(0.65);
    if (direction === 'west') sprite.setAngle(180);
    scene.tweens.add({
        targets: sprite, x: endX,
        duration: 3500 + Math.random() * 2000,
        ease: 'Linear',
        onComplete: () => sprite.destroy()
    });
}

function spawnDrivePast() {
    const scene = S.scene;
    const textureKey = Phaser.Math.RND.pick(CAR_TEXTURES);
    const sprite = scene.add.image(L.spawnX, L.entryLaneY, textureKey).setScale(1.6).setAlpha(0.7);
    const windows = scene.add.rectangle(L.spawnX, L.entryLaneY, 1, 1, 0).setAlpha(0);

    S.drivePastToday++;

    // Car drives east on the east-bound lane (entryLaneY) and exits off-screen.
    // No lane switch — stays in its lane to respect traffic direction.
    scene.tweens.add({
        targets: [sprite, windows], x: L.exitOffscreenX,
        duration: 2200, ease: 'Linear',
        onComplete: () => { sprite.destroy(); windows.destroy(); }
    });
}

function repositionQueue() {
    // Head (i=0) goes INSIDE the lot at the entry vlane.
    // Everyone else stays on the street west of the entry opening.
    S.queue.forEach((car, i) => {
        if (car.state === 'arriving') return; // mid drive-in, leave its tween alone

        if (i === 0) {
            // Head position inside the lot. If currently on the street, drive in.
            const onStreet = car.sprite.y < L.lotFenceY;
            if (onStreet) {
                driveCar(car, [
                    { x: L.entryOpeningX, y: L.entryLaneY, angle: 0, duration: 400 },
                    { angle: 90, duration: 150 },
                    { x: L.queueHeadInsideX, y: L.queueHeadInsideY, duration: 450 },
                ], () => { car.state = 'queueing'; });
            } else {
                S.scene.tweens.add({
                    targets: [car.sprite, car.windows],
                    x: L.queueHeadInsideX, y: L.queueHeadInsideY, angle: 90,
                    duration: 400, ease: 'Power2'
                });
            }
        } else {
            // Street position west of opening
            const targetX = L.entryOpeningX - i * L.queueStreetSpacing;
            S.scene.tweens.add({
                targets: [car.sprite, car.windows],
                x: targetX, y: L.entryLaneY, angle: 0,
                duration: 500, ease: 'Power2'
            });
        }
    });
}

function repositionExitQueue() {
    S.exitQueue.forEach((car, i) => {
        if (car.state !== 'exit-waiting') return;
        S.scene.tweens.add({
            targets: [car.sprite, car.windows],
            x: L.exitWaitX, y: L.exitWaitY + i * L.exitQueueSpacing, angle: -90,
            duration: 500
        });
    });
}

// ─── COBRO ─────────────────────────────────────────────────
function attemptCobroAnyone() {
    // Diagnostic counter — incremented every time this is called. Used by the
    // honest-playthrough bot to confirm taps actually reach the handler.
    window.__cobroCalls = (window.__cobroCalls || 0) + 1;
    const emp = findAvailableEmployee();
    if (!emp) {
        window.__cobroNoEmp = (window.__cobroNoEmp || 0) + 1;
        if (!isOpen()) flashEvent('🚫 LOT CERRADO — sin personal en turno.');
        else flashEvent('🛂 Todos los cobradores ocupados!');
        return;
    }
    attemptCobroBy(emp);
}

// Second arg `silent` (autopilot calls with true) suppresses the noisy
// "ocupado" / "fuera de turno" / "Nada en cola" toasts that would otherwise
// flood the screen — those are intended for direct player clicks only.
function attemptCobroBy(emp, silent) {
    if (S.dayEnded) return;
    if (emp.busy) { if (!silent) flashEvent(`🛂 ${emp.name} ocupado!`); return; }
    if (!isOnShift(emp, S.timeMinutes / 60)) {
        if (!silent) flashEvent(`💤 ${emp.name} fuera de turno (${emp.shift.label}).`);
        return;
    }
    // Nivel 4: exit totem auto-charges. Cobrador can't intercept.
    if (!S.upgrades.exitTotem && S.exitQueue.some(c => c.state === 'exit-waiting')) {
        attendExit(emp); return;
    }
    if (S.upgrades.exitTotem && S.exitQueue.some(c => c.state === 'exit-waiting')) {
        if (!silent) flashEvent('💳 El tótem cobra las salidas automáticamente.');
        return;
    }
    if (!S.upgrades.entryTotem && S.queue.length > 0) { attendEntry(emp); return; }
    if (S.upgrades.entryTotem && S.queue.length > 0) {
        if (!silent) flashEvent('🎫 El tótem se encarga de las entradas.');
        return;
    }
    if (!silent) flashEvent('💭 Nada en cola.');
}

// ─── ENTRY VIA TOTEM (Final Nivel 3) ───────────────────────
// Self-service entry: car arrives → ticket dispenses from totem → barrier
// opens → car drives in. No cobrador interaction needed. Cobrador stays
// in booth and handles exits only.
function processEntryViaTotem() {
    if (S.dayEnded || S.paused) return;
    if (S.queue.length === 0) return;

    // EV-priority space allocation (same logic as attendEntry)
    const carIsEV = S.queue.find(c => c.state === 'queueing')?.isEV;
    let space;
    if (carIsEV) {
        space = S.spaces.find(s => !s.occupied && s.isEV);
        if (!space) space = S.spaces.find(s => !s.occupied && !s.isEV);
    } else {
        space = S.spaces.find(s => !s.occupied && !s.isEV);
    }
    if (!space) return;  // lot full, totem can't dispense

    const carIdx = S.queue.findIndex(c => c.state === 'queueing');
    if (carIdx < 0) return;
    const car = S.queue.splice(carIdx, 1)[0];
    car.state = 'attending-entry';
    if (car.angryHint) {
        S.scene.tweens.killTweensOf([car.sprite, car.windows]);
        car.sprite.setAngle(90); car.windows.setAngle(90);
        car.sprite.clearTint();
        if (car.angryEmoji) { car.angryEmoji.destroy(); car.angryEmoji = null; }
    }
    if (car.evBadge) { car.evBadge.destroy(); car.evBadge = null; }

    // Step 1: Drive the car forward from queue to the totem stop position.
    //         The car stops next to the totem (driver-side window aligned).
    flashEvent(`🚗 Auto llega al tótem...`);
    const stopY = getTotemStopY();
    acquireLane('entryV', 2200, () => {
        driveCar(car, [
            { x: L.entryVlaneX, y: stopY, angle: 90, duration: 600 },
        ], () => {
            // Step 2: Ticket pops out of the totem (driver-side, LEFT of car)
            flashEvent(`🎫 Tótem dispensa ticket...`);
            dispenseTicket();
            SFX.beep && SFX.beep(900, 60, 0.2);

            S.scene.time.delayedCall(CONFIG.entryTotemDispenseMs, () => {
                // Step 3: Barrier opens (it's south of the car at lotFenceY)
                operateGate('entry');
                flashEvent(`⬆️ Barrera abierta · pasa`);

                car.entryTimeMinutes = S.timeMinutes;
                car.space = space;
                space.occupied = car;
                space.sprite.setFillStyle(COLORS.spaceOccupied);

                const isLeftOfEntry = space.x < L.entryVlaneX;
                const horizontalAngle = isLeftOfEntry ? 180 : 0;
                const turnIntoSpaceAngle = space.facing === 'up' ? -90 : 90;
                const useSouthLane = space.y > L.row2Y + 30;
                // Step 4: Drive through the open barrier into the lot
                const wps = useSouthLane
                    ? [
                        { x: L.entryVlaneX, y: L.centerLaneY, duration: 500 },
                        { x: L.entryVlaneX, y: L.expansionLaneY, duration: 400 },
                        { angle: horizontalAngle, duration: 200 },
                        { x: space.x, y: L.expansionLaneY, duration: 500 },
                        { angle: turnIntoSpaceAngle, duration: 200 },
                        { x: space.x, y: space.y, duration: 350 },
                      ]
                    : [
                        { x: L.entryVlaneX, y: L.centerLaneY, duration: 500 },
                        { angle: horizontalAngle, duration: 200 },
                        { x: space.x, y: L.centerLaneY, duration: 600 },
                        { angle: turnIntoSpaceAngle, duration: 200 },
                        { x: space.x, y: space.y, duration: 450 },
                      ];
                S.scene.time.delayedCall(CONFIG.barrierScanMs, () => {
                    driveCar(car, wps, () => {
                        car.state = 'parked';
                        S.parkedCars.push(car);
                        if (S.upgrades.carwash && !car.washed) {
                            car.sprite.setInteractive({ useHandCursor: true });
                            car.sprite.on('pointerdown', () => triggerWash(car));
                        }
                    });
                });
                repositionQueue();
            });
        });
    });
}

// ─── ENTRY COBRO ───────────────────────────────────────────
function attendEntry(emp) {
    if (S.queue.length === 0) return;
    // EV-priority space allocation: EV cars take EV spaces first; non-EVs avoid them
    const carIsEV = S.queue.find(c => c.state === 'queueing')?.isEV;
    let space;
    if (carIsEV) {
        space = S.spaces.find(s => !s.occupied && s.isEV);
        if (!space) space = S.spaces.find(s => !s.occupied && !s.isEV);
    } else {
        space = S.spaces.find(s => !s.occupied && !s.isEV);
    }
    if (!space) { flashEvent('🅿️ ¡No hay espacios libres!'); return; }

    // Pick the FIRST car that is actually in queueing state (not still arriving)
    const carIdx = S.queue.findIndex(c => c.state === 'queueing');
    if (carIdx < 0) { flashEvent('🚙 Autos aún entrando...'); return; }
    const car = S.queue.splice(carIdx, 1)[0];
    car.state = 'attending-entry';
    if (car.angryHint) {
        S.scene.tweens.killTweensOf([car.sprite, car.windows]);
        car.sprite.setAngle(90); car.windows.setAngle(90);
        car.sprite.clearTint();
        if (car.angryEmoji) { car.angryEmoji.destroy(); car.angryEmoji = null; }
    }
    if (car.evBadge) { car.evBadge.destroy(); car.evBadge = null; }
    emp.busy = true;
    updateEmployeeAppearance(emp);
    updateEmployeeCardsHTML();

    const carX = car.sprite.x, carY = car.sprite.y;
    const hasBooth = S.upgrades.booth;
    const hasPos = S.upgrades.pos;
    const hasBarriers = S.upgrades.barriers;
    // Operator still uses POS (no LPR yet at Nivel 3). cobroDur is POS time.
    let cobroDur = hasPos ? CONFIG.posCobroDuration : (hasBooth ? CONFIG.boothCobroDuration : CONFIG.cobroDuration);
    // Employee level speeds up cobro
    const empLevel = (emp.rosterEntry && emp.rosterEntry.level) || 1;
    cobroDur = cobroDur * (1 - CONFIG.levelSpeedBonus[empLevel - 1]);

    const doPapeleta = () => {
        if (hasBooth && S.boothWindowSprite) S.boothWindowSprite.setFillStyle(COLORS.boothWindowBusy);
        const verb = hasPos ? 'genera ticket' : 'registra entrada';
        flashEvent(`✍️ ${emp.name} ${verb}${hasBooth ? ' (caseta)' : ''}${hasBarriers ? ' → abre barrera' : ''}...`);
        S.scene.time.delayedCall(cobroDur, () => {
            // POS scan complete → operator triggers the gate to open
            if (hasBarriers) operateGate('entry');
            if (hasBooth && S.boothWindowSprite) S.boothWindowSprite.setFillStyle(COLORS.boothWindow);

            car.entryTimeMinutes = S.timeMinutes;
            car.space = space;
            space.occupied = car;
            space.sprite.setFillStyle(COLORS.spaceOccupied);

            // Car is already inside the lot at the entry vlane facing south.
            // Just continue south to central lane, then to its space.
            const isLeftOfEntry = space.x < L.entryVlaneX;
            const horizontalAngle = isLeftOfEntry ? 180 : 0;
            const turnIntoSpaceAngle = space.facing === 'up' ? -90 : 90;
            // If destination is row 3 (expansion), use the south lane (expansionLaneY)
            const useSouthLane = space.y > L.row2Y + 30;
            const laneY = useSouthLane ? L.expansionLaneY : L.centerLaneY;
            const wps = useSouthLane
                ? [
                    { x: L.entryVlaneX, y: L.centerLaneY, angle: 90, duration: 500 },
                    { x: L.entryVlaneX, y: L.expansionLaneY, duration: 400 },
                    { angle: horizontalAngle, duration: 200 },
                    { x: space.x, y: L.expansionLaneY, duration: 500 },
                    { angle: turnIntoSpaceAngle, duration: 200 },
                    { x: space.x, y: space.y, duration: 350 },
                  ]
                : [
                    { x: L.entryVlaneX, y: L.centerLaneY, angle: 90, duration: 600 },
                    { angle: horizontalAngle, duration: 200 },
                    { x: space.x, y: L.centerLaneY, duration: 600 },
                    { angle: turnIntoSpaceAngle, duration: 200 },
                    { x: space.x, y: space.y, duration: 450 },
                  ];
            // With barriers active, hold the car for ~400ms so the gate visibly
            // opens before the car drives through.
            const driveDelay = hasBarriers ? CONFIG.barrierScanMs : 0;
            // Hold the entry lock for the FULL drive duration (vlane descent +
            // horizontal central-lane segment + parking). This ensures the next
            // car doesn't overlap on the central lane — a frequent source of
            // visual "cars passing through each other".
            // Non-row-3: 600 + 200 + 600 + 200 + 450 = ~2050ms → 1600 covers
            //   descent + horizontal segment (leaves parking move for next).
            // Row-3:     500 + 400 + 200 + 500 + 200 + 350 = ~2150ms → 1900.
            const entryLockMs = useSouthLane ? 1900 : 1600;
            S.scene.time.delayedCall(driveDelay, () => {
                acquireLane('entryV', entryLockMs, () => {
                    driveCar(car, wps, () => {
                        car.state = 'parked';
                        S.parkedCars.push(car);
                        // If carwash station purchased, make this car clickable to add a wash
                        if (S.upgrades.carwash && !car.washed) {
                            car.sprite.setInteractive({ useHandCursor: true });
                            car.sprite.on('pointerdown', () => triggerWash(car));
                        }
                    });
                });
            });
            // Award XP to the employee who registered the entry
            if (emp && emp.rosterEntry) awardXp(emp.rosterEntry, CONFIG.xpPerEntry);

            if (hasBooth) {
                emp.busy = false;
                updateEmployeeAppearance(emp);
                updateEmployeeCardsHTML();
                repositionQueue();
            } else {
                S.scene.tweens.add({
                    targets: [emp.sprite, emp.circle, emp.emoji, emp.tag, emp.hitZone],
                    x: emp.homeX, y: emp.homeY,
                    duration: 600, ease: 'Power2',
                    onComplete: () => {
                        emp.busy = false;
                        updateEmployeeAppearance(emp);
                        updateEmployeeCardsHTML();
                        repositionQueue();
                    }
                });
            }
        });
    };

    if (hasBooth) {
        doPapeleta();
    } else {
        // Cobrador walks INSIDE the lot to the car at the entry vlane
        S.scene.tweens.add({
            targets: [emp.sprite, emp.circle, emp.emoji, emp.tag, emp.hitZone],
            x: carX - 30, y: carY,   // stand just west of the car
            duration: 700, ease: 'Power2',
            onComplete: doPapeleta
        });
    }
}

// ─── REQUEST EXIT ──────────────────────────────────────────
function requestExit(car) {
    car.state = 'requesting-exit';
    if (car.space) {
        car.space.occupied = null;
        car.space.sprite.setFillStyle(COLORS.spaceEmpty);
    }
    S.parkedCars = S.parkedCars.filter(c => c.id !== car.id);

    const space = car.space;
    const queuePos = S.exitQueue.length;
    S.exitQueue.push(car);

    const turnToLaneAngle = space.facing === 'up' ? 90 : -90;
    const toExitAngle = space.x < L.exitVlaneX ? 0 : 180;
    // Row 3 (expansion) exits via the south lane (expansionLaneY)
    const isRow3 = space.y > L.row2Y + 30;
    const laneY = isRow3 ? L.expansionLaneY : L.centerLaneY;
    const wps = isRow3
        ? [
            { angle: turnToLaneAngle, duration: 200 },
            { x: space.x, y: L.expansionLaneY, duration: 400 },     // out of space, into south lane
            { angle: toExitAngle, duration: 200 },
            { x: L.exitVlaneX, y: L.expansionLaneY, duration: 600 }, // drive on south lane to exit vlane
            { angle: -90, duration: 200 },
            { x: L.exitVlaneX, y: L.centerLaneY, duration: 400 },    // up to main lane
            { x: L.exitWaitX, y: L.exitWaitY + queuePos * L.exitQueueSpacing, duration: 500 },
          ]
        : [
            { angle: turnToLaneAngle, duration: 200 },
            { x: space.x, y: L.centerLaneY, duration: 400 },
            { angle: toExitAngle, duration: 200 },
            { x: L.exitVlaneX, y: L.centerLaneY, duration: 700 },
            { angle: -90, duration: 200 },
            { x: L.exitWaitX, y: L.exitWaitY + queuePos * L.exitQueueSpacing, duration: 500 },
          ];
    // Lock the exit path for the FULL drive — cars going from a parked space
    // out across the central lane and up to the exit wait. Prevents collisions
    // with other parked-car exits and with new entries on the central lane.
    const exitLockMs = isRow3 ? 1900 : 1800;
    acquireLane('exitV', exitLockMs, () => {
        driveCar(car, wps, () => {
            car.state = 'exit-waiting';
            flashEvent('🚙 Auto pide salida');
        });
    });
}

// ─── EXIT COBRO ────────────────────────────────────────────
function attendExit(emp) {
    const car = S.exitQueue.find(c => c.state === 'exit-waiting');
    if (!car || car.state !== 'exit-waiting') return;

    car.state = 'exit-attending';
    if (car.escapeHint) {
        S.scene.tweens.killTweensOf([car.sprite, car.windows]);
        car.sprite.setAngle(-90); car.windows.setAngle(-90);
        car.sprite.clearTint();
        if (car.angryEmoji) { car.angryEmoji.destroy(); car.angryEmoji = null; }
    }
    emp.busy = true;
    updateEmployeeAppearance(emp);

    const carX = car.sprite.x, carY = car.sprite.y;
    const hasBooth = S.upgrades.booth;
    const hasPos = S.upgrades.pos;
    const hasBarriers = S.upgrades.barriers;
    // Operator still uses POS (no LPR yet at Nivel 3). cobroDur is POS time.
    let cobroDur = hasPos ? CONFIG.posCobroDuration : (hasBooth ? CONFIG.boothCobroDuration : CONFIG.cobroDuration);
    // Employee level speeds up cobro
    const empLevel = (emp.rosterEntry && emp.rosterEntry.level) || 1;
    cobroDur = cobroDur * (1 - CONFIG.levelSpeedBonus[empLevel - 1]);

    const doCobro = () => {
        if (hasBooth && S.boothWindowSprite) S.boothWindowSprite.setFillStyle(COLORS.boothWindowBusy);
        flashEvent(`💵 ${emp.name} cobra salida${hasBooth ? ' (caseta)' : ''}${hasBarriers ? ' → abre barrera' : ''}...`);
        S.scene.time.delayedCall(cobroDur, () => {
            if (hasBooth && S.boothWindowSprite) S.boothWindowSprite.setFillStyle(COLORS.boothWindow);

            const stayedMin = Math.max(1, Math.ceil(S.timeMinutes - (car.entryTimeMinutes ?? S.timeMinutes)));
            let amount = stayedMin * CONFIG.pricePerMinute * getConvenioRevenueCut();
            if (car.isEV) amount *= CONFIG.evMultiplier;
            if (car.isAppUser) amount *= CONFIG.parkingAppTariffMultiplier;   // Nivel 5 premium
            if (S.upgrades.valetAI) amount *= CONFIG.valetAITariffMultiplier;     // Nivel 6
        if (S.upgrades.drone) amount *= CONFIG.droneTariffMultiplier;         // Nivel 8
        if (S.upgrades.spaceport) amount *= CONFIG.spaceportTariffMultiplier; // Nivel 9
            // Car wash is now MANUAL — applied per car when player clicked it
            if (car.washed) {
                amount += CONFIG.washPrice;
                flashEvent(`🚿 +$${CONFIG.washPrice.toLocaleString('es-CL')} de lavado!`);
            }
            if (S.nextCarMultiplier > 1) {
                amount *= S.nextCarMultiplier;
                S.nextCarMultiplier = 1; // consume
                flashEvent(`💎 Cliente VIP — cobro doblado: +$${amount.toLocaleString('es-CL')} (${stayedMin} min)`);
            } else {
                flashEvent(`💵 Cobrado +$${amount.toLocaleString('es-CL')} (${stayedMin} min)`);
            }
            car.revenue = amount;
            S.money += car.revenue;
            S.revenueToday += car.revenue;
            S.lifetimeRevenue += car.revenue;
            S.carsServedToday++;
            S.lifetimeServed++;
            // Premium sparkle sound for app/valet/spaceport tier
            if (car.isAppUser || S.upgrades.valetAI || S.upgrades.spaceport) {
                SFX.cashPremium();
                hapticBuzz('MEDIUM');
            } else {
                SFX.cashRegister();
                hapticBuzz('LIGHT');
            }
            showMoneyFloat(car.sprite.x, car.sprite.y, Math.floor(amount), car.isAppUser);
            // Award XP to the employee who handled the exit cobro
            if (emp && emp.rosterEntry) awardXp(emp.rosterEntry, CONFIG.xpPerExit);

            S.exitQueue = S.exitQueue.filter(c => c.id !== car.id);
            // Operator triggers the exit gate to open after collecting payment
            if (hasBarriers) operateGate('exit');
            // Hold the car briefly so the gate visibly opens before driving through
            const driveDelay = hasBarriers ? CONFIG.barrierScanMs : 0;
            // Acquire the exit vlane — the car drives north out (300+600 = 900ms
            // in the vlane), then turns east on bypass.
            S.scene.time.delayedCall(driveDelay, () => {
                acquireLane('exitV', 1400, () => {
                    // Exit goes up to the EAST-bound lane (entryLaneY) — bypassLaneY is
                    // for west-bound passing cars only.
                    driveCar(car, [
                        { x: L.exitVlaneX, y: L.exitWaitY - 20, duration: 300 },
                        { x: L.exitVlaneX, y: L.entryLaneY, duration: 500 },
                        { angle: 0, duration: 200 },
                        { x: L.exitOffscreenX, y: L.entryLaneY, duration: 900 },
                    ], () => {
                        car.sprite.destroy(); car.windows.destroy();
                        S.cars = S.cars.filter(c => c.id !== car.id);
                    });
                });
            });

            if (hasBooth) {
                emp.busy = false;
                updateEmployeeAppearance(emp);
                repositionExitQueue();
            } else {
                S.scene.tweens.add({
                    targets: [emp.sprite, emp.circle, emp.emoji, emp.tag, emp.hitZone],
                    x: emp.homeX, y: emp.homeY,
                    duration: 700, ease: 'Power2',
                    onComplete: () => {
                        emp.busy = false;
                        updateEmployeeAppearance(emp);
                        repositionExitQueue();
                    }
                });
            }
        });
    };

    if (hasBooth) {
        doCobro();
    } else {
        S.scene.tweens.add({
            targets: [emp.sprite, emp.circle, emp.emoji, emp.tag, emp.hitZone],
            x: carX - 28, y: carY,
            duration: 700, ease: 'Power2',
            onComplete: doCobro
        });
    }
}

// ─── ESCAPE ────────────────────────────────────────────────
function escapeWithoutPaying(car) {
    if (car.state !== 'exit-waiting') return;
    car.state = 'escaping';
    S.reputation = Math.max(0, S.reputation - CONFIG.repenaltyEscape);
    S.escapedToday++;
    S.lifetimeEscaped++;
    flashEvent(`🏃 ¡Cliente escapó sin pagar! -${CONFIG.repenaltyEscape} rep`);
    SFX.escape();

    S.exitQueue = S.exitQueue.filter(c => c.id !== car.id);

    S.scene.tweens.killTweensOf([car.sprite, car.windows]);
    car.sprite.setAngle(-90); car.windows.setAngle(-90);

    if (car.angryEmoji) { car.angryEmoji.destroy(); car.angryEmoji = null; }
    driveCar(car, [
        { x: L.exitVlaneX, y: L.entryLaneY, duration: 500, ease: 'Power3' },
        { angle: 0, duration: 200 },
        { x: L.exitOffscreenX, y: L.entryLaneY, duration: 800 },
    ], () => {
        car.sprite.destroy(); car.windows.destroy();
        S.cars = S.cars.filter(c => c.id !== car.id);
    });
    repositionExitQueue();
}

// ─── BORED LEAVE ───────────────────────────────────────────
function boredLeave(car) {
    if (car.state !== 'queueing' && car.state !== 'arriving') return;
    car.state = 'bored';
    S.reputation = Math.max(0, S.reputation - CONFIG.repenaltyAngry);
    S.angryToday++;
    S.lifetimeAngry++;
    flashEvent('😡 Cliente se aburrió y se fue! -' + CONFIG.repenaltyAngry + ' rep');
    SFX.bored();

    S.queue = S.queue.filter(c => c.id !== car.id);
    S.cars = S.cars.filter(c => c.id !== car.id);

    S.scene.tweens.killTweensOf([car.sprite, car.windows]);

    const insideLot = car.sprite.y >= L.lotFenceY;
    if (insideLot) {
        // Head car inside lot: back out (north) through entry opening, merge UP to top bypass
        driveCar(car, [
            { angle: -90, duration: 200 },
            { x: L.entryVlaneX, y: L.entryLaneY, duration: 600 },             // back to street
            { angle: 0, duration: 150 },
            { y: L.bypassLaneY, duration: 400, ease: 'Power3' },              // merge UP to top
            { x: L.exitOffscreenX, y: L.bypassLaneY, duration: 1000 },
        ], () => { car.sprite.destroy(); car.windows.destroy(); });
    } else {
        // Car on street: merge UP to bypass lane and continue east
        driveCar(car, [
            { y: L.bypassLaneY, duration: 600, ease: 'Power3' },
            { x: L.exitOffscreenX, y: L.bypassLaneY, duration: 1000 },
        ], () => { car.sprite.destroy(); car.windows.destroy(); });
    }
    repositionQueue();
}

// Compute the current "Nivel X" label from upgrade state. Pure function so
// it's safe to call anytime (from update loop AND right after a purchase).
// Labels kept short so the H1 fits in one line on a 360-CSS-px phone viewport
// after "🅿️ Parking Tycoon — " prefix (~20 chars).
function currentLevelLabel() {
    if (S.upgrades.spaceport) return 'N9: 🚀 SPACEPORT';
    if (S.upgrades.drone) return 'N8: Drones';
    if (S.upgrades.multiLevel) return 'N7: Vertical';
    if (S.upgrades.valetAI) return 'N6: Valet AI';
    if (S.upgrades.parkingApp) return 'N5: ParkingApp';
    if (S.upgrades.exitTotem) return 'N4: Autopago';
    if (S.upgrades.entryTotem) return 'N3+: Tótem';
    if (S.upgrades.barriers) return 'N3: Barreras';
    if (S.upgrades.pos) return 'N2: POS';
    if (S.upgrades.booth) return 'N1: Caseta';
    return 'N1: Papeleta';
}
// Update the HTML page title to reflect current level. Cheap, side-effect-only.
// Called from updateInfoBoard (every frame) AND from each purchaseX() so the
// title updates immediately even while the game is paused for a cinematic.
function refreshPageTitle() {
    const title = document.getElementById('page-title');
    if (title) title.textContent = `🅿️ Parking Tycoon — ${currentLevelLabel()}`;
}

// Body classlist mirror of game state — used by CSS to hide touch-actions
// during modals so they don't overlap end-of-day / cinematic buttons.
// User-reported bug v0.68: in landscape, the fixed-bottom touch buttons
// covered the DÍA SIGUIENTE / GESTIÓN buttons of the FIN DEL DÍA modal,
// making it impossible to advance. The fix: when the day-end modal is up,
// the canvas's own buttons are the only valid input — hide the HTML overlay.
function syncBodyStateClasses() {
    if (typeof document === 'undefined') return;
    const cl = document.body.classList;
    if (typeof S !== 'undefined' && S) {
        cl.toggle('state-day-ended', !!S.dayEnded);
        cl.toggle('state-paused', !!S.paused);
    }
}

// ─── HUD UPDATE ────────────────────────────────────────────
function updateInfoBoard() {
    const $ = id => document.getElementById(id);
    if (!$('info-board')) return;

    refreshPageTitle();
    syncBodyStateClasses();

    // Hours / status
    const onShiftCount = S.employees.filter(e => isOnShift(e, S.timeMinutes / 60)).length;
    const isOpenNow = onShiftCount > 0;
    const t = `${pad(Math.floor(S.timeMinutes/60))}:${pad(Math.floor(S.timeMinutes%60))}`;
    $('info-today-status').textContent = isOpenNow
        ? `🟢 ABIERTO (${t} · ${DAY_LONG[S.dayOfWeek]})`
        : `🔴 CERRADO (${t} · ${DAY_LONG[S.dayOfWeek]})`;
    $('info-today-status').style.color = isOpenNow ? '#10b981' : '#ef4444';

    // EV tariff
    if (S.upgrades.evCharger) {
        $('info-ev-tariff').textContent = `$${(CONFIG.pricePerMinute * CONFIG.evMultiplier).toFixed(0)} / min`;
        $('info-ev-tariff').style.color = '#4ade80';
    } else {
        $('info-ev-tariff').textContent = '— sin cargador';
        $('info-ev-tariff').style.color = '#6b7280';
    }

    // Services
    const services = [];
    if (S.upgrades.booth) services.push({ label: '🛂 Caseta', active: true });
    if (S.upgrades.pos) services.push({ label: '💳 POS', active: true });
    if (S.upgrades.barriers) services.push({ label: '🚧 Barreras', active: true });
    if (S.upgrades.entryTotem) services.push({ label: '🎫 Tótem entrada', active: true });
    if (S.upgrades.exitTotem) services.push({ label: '💳 Autopago', active: true });
    if (S.upgrades.parkingApp) services.push({ label: '📱 App N5', active: true });
    if (S.upgrades.valetAI) services.push({ label: '🤖 Valet AI N6', active: true });
    if (S.upgrades.multiLevel) services.push({ label: '🏢 Vertical N7', active: true });
    if (S.upgrades.drone) services.push({ label: '🚁 Drones N8', active: true });
    if (S.upgrades.spaceport) services.push({ label: '🚀 SPACEPORT N9', active: true });
    // ParkingApp + Redcomercio shown as a "tech stack" badge once integrated
    if (S.cinematicShown) services.push({ label: '🅿️ ParkingApp', active: true });
    if (S.upgrades.pos) services.push({ label: '💳 Redcomercio', active: true });
    if (S.upgrades.adScreens > 0) services.push({ label: `📺 ${S.upgrades.adScreens} pantallas`, active: true });
    if (S.upgrades.signs > 0) services.push({ label: `📣 ${S.upgrades.signs} carteles`, active: true });
    if (S.upgrades.expansions > 0) services.push({ label: `🏗️ ${S.upgrades.expansions} expansión`, active: true });
    if (S.upgrades.cameras) services.push({ label: '📹 Cámaras', active: true });
    if (S.upgrades.carwash) services.push({ label: '🚿 Lavado', active: true });
    if (S.upgrades.evCharger) services.push({ label: '🔌 EV', active: true });
    if (S.subscriptions.length > 0) services.push({ label: `📋 ${S.subscriptions.length} mensualistas`, active: true });
    (S.upgrades.convenios || []).forEach(id => {
        const c = CONVENIOS[id];
        if (c) services.push({ label: `🤝 ${c.name.split(' ')[0]}`, active: true });
    });
    const servEl = $('info-services');
    if (services.length === 0) {
        servEl.innerHTML = '<span class="empty-state">Sin upgrades aún.<br>Abrí Gestión (G).</span>';
    } else {
        servEl.innerHTML = services.map(s => `<span class="service-badge active">${s.label}</span>`).join('');
    }

    // Daily stats
    const utility = S.revenueToday - S.salariesPaidToday;
    $('info-revenue-today').textContent = `$${Math.round(S.revenueToday).toLocaleString('es-CL')}`;
    $('info-salary-today').textContent = `-$${Math.round(S.salariesPaidToday).toLocaleString('es-CL')}`;
    const profitEl = $('info-profit-today');
    profitEl.textContent = `$${Math.round(utility).toLocaleString('es-CL')}`;
    profitEl.classList.toggle('negative', utility < 0);
    profitEl.style.color = utility >= 0 ? '#10b981' : '#f87171';
    $('info-served-today').textContent = String(S.carsServedToday);
}

// ─── DAY/NIGHT TINT (smooth interpolation) ─────────────────
// Defines keyframes (hour, color, alpha) and lerps between them so the
// tint changes continuously throughout the day instead of snapping.
const DAY_NIGHT_KEYFRAMES = [
    { h: 8.0,  color: 0xfbbf24, alpha: 0.10 }, // dawn warm
    { h: 9.5,  color: 0xfde047, alpha: 0.03 }, // morning soft
    { h: 12.0, color: 0xffffff, alpha: 0.00 }, // noon
    { h: 15.0, color: 0xffffff, alpha: 0.00 }, // bright
    { h: 17.0, color: 0xfed7aa, alpha: 0.06 }, // late afternoon
    { h: 18.5, color: 0xfb923c, alpha: 0.20 }, // golden hour
    { h: 19.5, color: 0x9333ea, alpha: 0.32 }, // dusk
    { h: 20.5, color: 0x4338ca, alpha: 0.42 }, // late dusk
    { h: 21.5, color: 0x1e1b4b, alpha: 0.55 }, // night
    { h: 22.5, color: 0x0c0a40, alpha: 0.60 }, // deep night
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    const r = Math.round(lerp(r1, r2, t));
    const g = Math.round(lerp(g1, g2, t));
    const b = Math.round(lerp(b1, b2, t));
    return (r << 16) | (g << 8) | b;
}

function getDayNightTint(hour) {
    // Clamp before first or after last keyframe
    if (hour <= DAY_NIGHT_KEYFRAMES[0].h) return DAY_NIGHT_KEYFRAMES[0];
    const last = DAY_NIGHT_KEYFRAMES[DAY_NIGHT_KEYFRAMES.length - 1];
    if (hour >= last.h) return last;
    // Find the bracketing keyframes and lerp
    for (let i = 0; i < DAY_NIGHT_KEYFRAMES.length - 1; i++) {
        const a = DAY_NIGHT_KEYFRAMES[i];
        const b = DAY_NIGHT_KEYFRAMES[i + 1];
        if (hour >= a.h && hour <= b.h) {
            const t = (hour - a.h) / (b.h - a.h);
            return {
                color: lerpColor(a.color, b.color, t),
                alpha: lerp(a.alpha, b.alpha, t),
            };
        }
    }
    return last;
}

function updateDayNightOverlay() {
    if (!S.dayNightOverlay) return;
    const hour = S.timeMinutes / 60;
    const t = getDayNightTint(hour);
    S.dayNightOverlay.setFillStyle(t.color, t.alpha);
}

function updateHUD() {
    const hours = Math.floor(S.timeMinutes / 60);
    const minutes = Math.floor(S.timeMinutes % 60);
    updateDayNightOverlay();
    S.hud.time.setText(`⏰ ${pad(hours)}:${pad(minutes)} ${DAY_SHORT[S.dayOfWeek]} D${S.day}`);
    S.hud.money.setText(`💰 $${Math.floor(S.money).toLocaleString('es-CL')}`);
    S.hud.reputation.setText(`⭐ ${S.reputation}%`);
    S.hud.queue.setText(`🚗 ${S.queue.length}`);
    S.hud.exitQueue.setText(`🅿️→ ${S.exitQueue.filter(c => c.state === 'exit-waiting').length}`);
    const occupied = S.spaces.filter(s => s.occupied).length;
    S.hud.spaces.setText(`P ${occupied}/${S.spaces.length}`);

    const open = isOpen();
    S.hud.status.setText(open ? '🟢 ABIERTO' : '🔴 CERRADO');
    S.hud.status.setColor(open ? '#10b981' : '#ef4444');

    const hour = S.timeMinutes / 60;
    const onDuty = S.employees.filter(e => isOnShift(e, hour)).length;
    S.hud.employees.setText(`👥 ${onDuty}/${S.employees.length}`);

    S.hud.salary.setText(`💸 -$${Math.round(S.salariesPaidToday).toLocaleString('es-CL')}`);
    const demand = getDemandMultiplier(S.timeMinutes / 60);
    S.hud.demand.setText(`📈 ${getDemandLabel(demand)}`);

    const losses = [];
    if (S.angryToday > 0) losses.push(`😡 ${S.angryToday}`);
    if (S.escapedToday > 0) losses.push(`🏃 ${S.escapedToday}`);
    if (S.drivePastToday > 0) losses.push(`💨 ${S.drivePastToday}`);
    S.hud.lossSum.setText(losses.join('  '));
    if (S.hud.rival) {
        if (S.rivalActive && S.day < (S.rivalUntilDay || 0)) {
            const daysLeft = S.rivalUntilDay - S.day;
            S.hud.rival.setText(`⚔️ RIVAL (-25% ${daysLeft}d)`);
            if (!S.hud.counterBtn) {
                const btn = S.scene.add.text(820, 52, '📣 Counter $20K', {
                    font: 'bold 10px monospace', color: '#fff',
                    backgroundColor: '#dc2626', padding: { x: 6, y: 3 }
                }).setInteractive({ useHandCursor: true });
                btn.on('pointerdown', counterRival);
                S.hud.counterBtn = btn;
            }
        } else {
            S.hud.rival.setText('');
            if (S.hud.counterBtn) { S.hud.counterBtn.destroy(); S.hud.counterBtn = null; }
        }
    }
}

function counterRival() {
    if (!S.rivalActive) return;
    if (S.money < 20000) { flashEvent('💸 Necesitás $20.000 para el counter-marketing.'); return; }
    S.money -= 20000;
    S.rivalActive = false;
    S.rivalUntilDay = 0;
    S.reputation = Math.min(100, S.reputation + 2);
    flashEvent('📣 ¡Counter-marketing exitoso! Rival eliminado. -$20.000 +2 rep.');
    SFX.purchase && SFX.purchase();
    if (S.hud.counterBtn) { S.hud.counterBtn.destroy(); S.hud.counterBtn = null; }
}

// ─── THIEF (ladrón) MECHANIC ───────────────────────────────
function spawnThief() {
    if (!S.scene || S.parkedCars.length === 0) {
        // No parked cars to rob, just notify
        flashEvent('🚨 Un ladrón pasó pero no había qué robar.');
        return;
    }
    const scene = S.scene;
    // Target a random parked car
    const targetCar = Phaser.Math.RND.pick(S.parkedCars);
    // Thief spawns at far edge and walks toward target
    const startX = Math.random() > 0.5 ? -30 : CONFIG.width + 30;
    const startY = L.lotBottom + 20;
    const thief = scene.add.image(startX, startY, 'ladron_east').setScale(0.9);
    thief.setDepth(50);
    // "!" warning emoji above thief
    const warn = scene.add.text(thief.x, thief.y - 26, '⚠️', { font: '20px sans-serif' }).setOrigin(0.5);
    warn.setDepth(51);
    scene.tweens.add({ targets: warn, y: thief.y - 32, duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    flashEvent('🚨 ¡LADRÓN! Click rápido para espantarlo antes que rompa un auto!');
    SFX.escape();

    let saved = false;

    // Walk toward target car (2-3 seconds)
    scene.tweens.add({
        targets: thief, x: targetCar.sprite.x, y: targetCar.sprite.y + 18,
        duration: 2500, ease: 'Linear',
        onComplete: () => {
            if (saved) return;
            // Made it — robbery happens
            S.money -= CONFIG.robberyPenalty;
            S.reputation = Math.max(0, S.reputation - CONFIG.robberyRepLoss);
            flashEvent(`🚨 ¡ROBO consumado! -$${CONFIG.robberyPenalty.toLocaleString('es-CL')} -${CONFIG.robberyRepLoss} rep`);
            SFX.gameOver();
            // Thief flees off-canvas
            scene.tweens.add({
                targets: thief, x: thief.x > CONFIG.width/2 ? CONFIG.width + 60 : -60,
                duration: 1500,
                onComplete: () => { thief.destroy(); warn.destroy(); }
            });
        }
    });

    // Make thief clickable to scare away
    thief.setInteractive({ useHandCursor: true });
    thief.on('pointerdown', () => {
        if (saved) return;
        saved = true;
        scene.tweens.killTweensOf(thief);
        scene.tweens.killTweensOf(warn);
        warn.setText('💨');
        // Reward player slightly
        const reward = 500 + Math.floor(Math.random() * 1500);
        S.money += reward;
        flashEvent(`✋ ¡Espantaste al ladrón! Bono: +$${reward.toLocaleString('es-CL')}`);
        SFX.cobro();
        // Thief flees in panic
        scene.tweens.add({
            targets: thief, x: thief.x > CONFIG.width/2 ? CONFIG.width + 60 : -60,
            y: thief.y + 40, alpha: 0.5,
            duration: 1000,
            onComplete: () => { thief.destroy(); warn.destroy(); }
        });
    });
}

function pad(n) { return n.toString().padStart(2, '0'); }
function flashEvent(text) { if (S.hud.events) S.hud.events.setText('📋 ' + text); }
function logEvent(text) { flashEvent(text); }

const IDLE_HINTS = [
    '💡 Contrata más cobradores (H) para cubrir todo el día',
    '💡 Abre Gestión (G) para ver upgrades y stats',
    '💡 Las pantallas publicitarias generan ingreso pasivo 24/7',
    '💡 Los mensualistas garantizan revenue fijo',
    '💡 Los carteles atraen más autos (+25% spawn)',
    '💡 Pico de demanda: almuerzo (12-13) y noche (18-19)',
    '💡 Sin cobrador en turno, el lote cierra',
    '💡 Compra caseta para que el cobrador no camine',
    '💡 5 días en rojo = bancarrota',
];
function showIdleHint() {
    const hint = IDLE_HINTS[Math.floor(Math.random() * IDLE_HINTS.length)];
    flashEvent(hint);
}

// ─── END OF DAY ────────────────────────────────────────────
const MAX_NEG_DAYS = 7;   // full week of red before bankruptcy

// Corrupt-employee mechanic
function runCorruptEmployeeCheck() {
    if (S.employeeRoster.length === 0 || S.revenueToday < 5000) return;
    // 12% base chance per day. Goes up if reputation is low.
    const chance = 0.12 + (S.reputation < 60 ? 0.08 : 0);
    if (Math.random() > chance) return;
    const corrupt = Phaser.Math.RND.pick(S.employeeRoster);
    const skim = Math.floor(S.revenueToday * (0.05 + Math.random() * 0.15));
    S.money -= skim;
    S.corruptEmployeeToday = { name: corrupt.name, amount: skim };
    S.reputation = Math.max(0, S.reputation - 3);
}

function endDay() {
    // Cinematic check
    if (!S.cinematicShown && S.day >= 3 && (S.upgrades.booth || S.lifetimeRevenue >= 50000)) {
        S.cinematicShown = true;
        renderCinematic();
        return;
    }
    S.dayEnded = true;
    S.paused = true;
    syncBodyStateClasses();   // hide touch-actions while day-end modal is up
    // NOTE: defer pauseAll() until AFTER the fade tween is created+started.
    // If we pauseAll first, Phaser pauses the tween system as a whole in
    // some versions and the new fade tween never fires its onComplete.

    // Corrupt-employee check (random per day, slim chance)
    runCorruptEmployeeCheck();

    // Dark-screen transition: fade-to-black, then show summary
    const scene = S.scene;
    const fader = scene.add.rectangle(CONFIG.width/2, CONFIG.height/2, CONFIG.width, CONFIG.height, 0x000000, 0)
        .setDepth(999);

    // Safety net: if onComplete doesn't fire (e.g. Phaser tween paused),
    // render the summary anyway after 1.5s.
    const fadeSafety = setTimeout(() => {
        if (S.endDayUI && S.endDayUI.length > 0) return;
        try { fader.destroy(); } catch(e) {}
        renderEndOfDay();
    }, 1500);

    scene.tweens.add({
        targets: fader, alpha: 1, duration: 900, ease: 'Power2',
        onComplete: () => {
            clearTimeout(fadeSafety);
            try { fader.destroy(); } catch(e) {}
            scene.tweens.pauseAll();   // pause background tweens AFTER fade
            renderEndOfDay();
        }
    });
    return;

    // Subscriptions are pre-paid; here just expire ones whose contract ended
    const stillActive = [];
    for (const sub of S.subscriptions) {
        if (S.day < sub.endDay) {
            stillActive.push(sub);
        } else {
            const space = S.spaces[sub.spaceIndex];
            if (space && space.occupied === 'subscription') {
                space.occupied = null;
                space.sprite.setFillStyle(space.isEV ? 0x14532d : (S.upgrades.pavement ? COLORS.spaceEmpty : 0x7d6b4a));
                if (space.label) { space.label.setText('P'); space.label.setColor('#9ca3af'); }
            }
            flashEvent(`📋 Mensualista #${sub.spaceIndex + 1} se fue (contrato terminado)`);
        }
    }
    S.subscriptions = stillActive;

    // Bankruptcy tracking
    if (S.money < 0) S.consecutiveNegDays++;
    else S.consecutiveNegDays = 0;

    if (S.consecutiveNegDays >= MAX_NEG_DAYS) {
        renderGameOver();
        return;
    }

    renderEndOfDay();
}

function renderGameOver() {
    S.gameOver = true;
    SFX.gameOver();
    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;

    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];

    S.endDayUI.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.92));

    S.endDayUI.push(scene.add.text(W/2, 70, '💀  GAME OVER', {
        font: 'bold 42px monospace', color: '#ef4444'
    }).setOrigin(0.5));

    S.endDayUI.push(scene.add.text(W/2, 115, 'BANCARROTA', {
        font: 'bold 22px monospace', color: '#fca5a5'
    }).setOrigin(0.5));

    S.endDayUI.push(scene.add.text(W/2, 150,
        `Llevas ${MAX_NEG_DAYS} días en números rojos. El banco se llevó el estacionamiento.`,
        { font: '14px monospace', color: '#fff' }
    ).setOrigin(0.5));

    const lines = [
        ``,
        `Sobreviviste:                  ${S.day} días`,
        `Día de la quiebra:             ${DAY_LONG[S.dayOfWeek]}`,
        `Reputación final:              ${S.reputation}%`,
        ``,
        `── LIFETIME ──`,
        `Autos atendidos con cobro:     ${S.lifetimeServed}`,
        `Revenue total:                 $${Math.floor(S.lifetimeRevenue).toLocaleString('es-CL')}`,
        `Sueldos pagados (total):       $${Math.floor(S.lifetimeSalaries).toLocaleString('es-CL')}`,
        `Clientes aburridos:            ${S.lifetimeAngry}`,
        `Clientes que escaparon:        ${S.lifetimeEscaped}`,
        ``,
        `Dinero final:                  $${Math.floor(S.money).toLocaleString('es-CL')}`,
    ];
    lines.forEach((line, i) => {
        S.endDayUI.push(scene.add.text(W/2, 190 + i * 22, line, {
            font: 'bold 14px monospace', color: '#cbd5e1'
        }).setOrigin(0.5));
    });

    const restartBtn = scene.add.text(W/2, H - 55, '🔄  EMPEZAR DE NUEVO', {
        font: 'bold 18px monospace', color: '#fff',
        backgroundColor: '#dc2626', padding: { x: 24, y: 14 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    restartBtn.on('pointerdown', () => { hardReset(); });
    S.endDayUI.push(restartBtn);
}

function hardReset() {
    // Full reset including ALL persistent state — used by Game Over → "Empezar de nuevo"
    clearSave();
    S.money = CONFIG.startMoney;
    S.day = 1;
    S.dayOfWeek = 0;
    S.reputation = 100;
    S.upgrades = {
        booth: false, pos: false, barriers: false, entryTotem: false, exitTotem: false,
        parkingApp: false, valetAI: false, multiLevel: false, drone: false, spaceport: false,
        adScreens: 0, signs: 0, expansions: 0,
        convenios: [],
        cameras: false, carwash: false, evCharger: false,
        pavement: false, lines: false, lights: false, guard: false, greenery: false,
    };
    S.employeeRoster = [];
    S.subscriptions = [];
    S.lifetimeServed = 0; S.lifetimeRevenue = 0; S.lifetimeSalaries = 0;
    S.lifetimeAngry = 0; S.lifetimeEscaped = 0;
    S.consecutiveNegDays = 0;
    S.gameOver = false;
    S.cinematicShown = false;
    S.branchLots = [];
    S.dailyStatsHistory = [];
    S.subscriptionRevenueToday = 0;
    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];
    if (S.hud && S.hud.events) S.hud.events.setVisible(true);
    S.scene.scene.restart();
}

function renderEndOfDay() {
    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];
    SFX.dayEnd();

    // Hide canvas event log + clean up any floating emojis on cars
    if (S.hud && S.hud.events) S.hud.events.setVisible(false);
    S.cars.forEach(c => {
        if (c.angryEmoji) { try { c.angryEmoji.destroy(); } catch(e) {} c.angryEmoji = null; }
    });

    // Record stats
    const utility = S.revenueToday - S.salariesPaidToday;
    S.dailyStatsHistory.push({
        day: S.day, dow: S.dayOfWeek,
        revenue: S.revenueToday, salaries: S.salariesPaidToday,
        served: S.carsServedToday, angry: S.angryToday,
        escaped: S.escapedToday, drivePast: S.drivePastToday,
        endMoney: S.money, reputation: S.reputation,
    });
    if (S.dailyStatsHistory.length > 30) S.dailyStatsHistory.shift();
    // Track best days / lifetime stats in leaderboard + check achievements
    updateLeaderboard({ day: S.day, utility });
    checkAchievements();

    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;
    // `utility` already declared above (line ~6003) — reuse it
    const subRev = S.subscriptionRevenueToday || 0;
    const adRev = S.adRevenueToday || 0;
    const appRev = S.appRevenueToday || 0;
    const branchRev = S.branchRevenueToday || 0;
    // Estimate passive revenue from N7/N8/N9 (game ran for 14h × 60 = 840 game min)
    const mlRev = S.upgrades.multiLevel ? CONFIG.multiLevelPassiveIncomePerMin * 840 : 0;
    const drnRev = S.upgrades.drone ? CONFIG.droneAmbientRevenuePerMin * 840 : 0;
    const spRev = S.upgrades.spaceport ? CONFIG.spaceportPassiveIncomePerMin * 840 : 0;
    const profit = utility >= 0;

    // Solid backdrop — fully opaque AND with depth 1000 so all canvas elements stay underneath
    const backdrop = scene.add.rectangle(W/2, H/2, W, H, 0x0f172a, 1).setDepth(1000);
    S.endDayUI.push(backdrop);
    // Decorative top accent line
    S.endDayUI.push(scene.add.rectangle(W/2, 18, W - 40, 2, profit ? 0x10b981 : 0xef4444));

    // Title (smaller)
    S.endDayUI.push(scene.add.text(W/2, 36, `FIN DEL DÍA ${S.day} — ${DAY_LONG[S.dayOfWeek]}`, {
        font: 'bold 22px monospace', color: '#fbbf24'
    }).setOrigin(0.5));

    // 3 columns of stats — compact
    const colX = [W/2 - 280, W/2 - 30, W/2 + 220];
    const startY = 75;

    // Column 1 — Customers
    const col1 = [
        { label: '👥 Clientes', color: '#a5f3fc', bold: true },
        { label: `Atendidos:`, val: S.carsServedToday, color: '#86efac' },
        { label: `Aburridos:`, val: S.angryToday, color: '#fca5a5' },
        { label: `Escaparon:`, val: S.escapedToday, color: '#fca5a5' },
        { label: `Pasaron largo:`, val: S.drivePastToday, color: '#fca5a5' },
    ];
    col1.forEach((line, i) => {
        const txt = line.bold
            ? line.label
            : line.label.padEnd(14, ' ') + String(line.val);
        S.endDayUI.push(scene.add.text(colX[0], startY + i * 19, txt, {
            font: line.bold ? 'bold 14px monospace' : '13px monospace',
            color: line.color
        }));
    });

    // Column 2 — Money flow (full breakdown including passive sources)
    const col2 = [
        { label: '💰 Flujo', color: '#a5f3fc', bold: true },
        { label: `Revenue:`,   val: `+$${Math.floor(S.revenueToday).toLocaleString('es-CL')}`, color: '#fbbf24' },
        subRev > 0 ? { label: `  Mensualistas:`, val: `+$${Math.floor(subRev).toLocaleString('es-CL')}`, color: '#cbd5e1' } : null,
        S.upgrades.adScreens > 0 ? { label: `  Pantallas:`, val: `+$${Math.floor(adRev).toLocaleString('es-CL')}`, color: '#cbd5e1' } : null,
        S.upgrades.parkingApp ? { label: `  App subs:`, val: `+$${Math.floor(appRev).toLocaleString('es-CL')}`, color: '#bfdbfe' } : null,
        (S.branchLots && S.branchLots.length > 0) ? { label: `  Sucursales (${S.branchLots.length}):`, val: `+$${Math.floor(branchRev).toLocaleString('es-CL')}`, color: '#fde047' } : null,
        S.upgrades.multiLevel ? { label: `  Vertical N7:`, val: `+$${Math.floor(mlRev).toLocaleString('es-CL')}`, color: '#bae6fd' } : null,
        S.upgrades.drone ? { label: `  Drones N8:`, val: `+$${Math.floor(drnRev).toLocaleString('es-CL')}`, color: '#ddd6fe' } : null,
        S.upgrades.spaceport ? { label: `  Spaceport N9:`, val: `+$${Math.floor(spRev).toLocaleString('es-CL')}`, color: '#fef08a' } : null,
        { label: `Sueldos:`,    val: `-$${Math.floor(S.salariesPaidToday).toLocaleString('es-CL')}`, color: '#f87171' },
        { label: `Utilidad:`,   val: `$${Math.floor(utility).toLocaleString('es-CL')}`, color: profit ? '#10b981' : '#ef4444', bold: true },
    ].filter(x => x);
    col2.forEach((line, i) => {
        const txt = line.bold && !line.val ? line.label : (line.val ? line.label.padEnd(14, ' ') + line.val : line.label);
        S.endDayUI.push(scene.add.text(colX[1], startY + i * 19, txt, {
            font: line.bold ? 'bold 14px monospace' : '13px monospace',
            color: line.color
        }));
    });

    // Column 3 — Status
    const col3 = [
        { label: '📊 Estado', color: '#a5f3fc', bold: true },
        { label: `Saldo:`, val: `$${Math.floor(S.money).toLocaleString('es-CL')}`, color: '#fbbf24' },
        { label: `Reputación:`, val: `${S.reputation}%`, color: '#10b981' },
        { label: `Día:`, val: `${S.day}`, color: '#cbd5e1' },
        { label: `Lifetime:`, val: `${S.lifetimeServed} autos`, color: '#cbd5e1' },
    ];
    col3.forEach((line, i) => {
        const txt = line.bold ? line.label : line.label.padEnd(12, ' ') + line.val;
        S.endDayUI.push(scene.add.text(colX[2], startY + i * 19, txt, {
            font: line.bold ? 'bold 14px monospace' : '13px monospace',
            color: line.color
        }));
    });

    // Separator
    S.endDayUI.push(scene.add.rectangle(W/2, 200, W - 80, 1, 0x334155));

    // Next day banner + bankruptcy warning
    const nextDow = (S.dayOfWeek + 1) % 7;
    S.endDayUI.push(scene.add.text(W/2, 220, `→  Próximo día: ${DAY_LONG[nextDow]}`, {
        font: 'bold 16px monospace', color: '#a5f3fc'
    }).setOrigin(0.5));

    if (S.consecutiveNegDays > 0) {
        const remaining = MAX_NEG_DAYS - S.consecutiveNegDays;
        S.endDayUI.push(scene.add.text(W/2, 250,
            `⚠️  ${S.consecutiveNegDays}/${MAX_NEG_DAYS} días en rojo  ·  ${remaining} más y QUIEBRA`,
            { font: 'bold 14px monospace', color: '#ef4444' }
        ).setOrigin(0.5));
    }

    // Corrupt employee warning (if it happened today)
    if (S.corruptEmployeeToday) {
        const c = S.corruptEmployeeToday;
        S.endDayUI.push(scene.add.rectangle(W/2, 250, 540, 32, 0x7c1d1d).setStrokeStyle(2, 0xef4444));
        S.endDayUI.push(scene.add.text(W/2, 250,
            `💸 ¡${c.name} se metió $${c.amount.toLocaleString('es-CL')} al bolsillo!  Considera despedirlo.`,
            { font: 'bold 13px monospace', color: '#fca5a5' }
        ).setOrigin(0.5));
    }

    // Random Tip / advice
    const tips = [
        '💡 Contratá un cobrador para el turno tarde si te perdés clientes en la noche',
        '💡 Las pantallas publicitarias dan $25/min pasivo 24/7',
        '💡 Comprá cámaras antes de que te empiecen a robar',
        '💡 Los EVs pagan 2.5x la tarifa — instalá el cargador',
        '💡 Lavado: click en autos estacionados para +$5k por auto',
        '💡 Mensualistas pagan upfront pero ocupan 1 espacio fijo',
        '💡 Cinemática POS se activa Día 3+ con caseta',
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    S.endDayUI.push(scene.add.text(W/2, 290, tip, {
        font: 'italic 12px monospace', color: '#94a3b8'
    }).setOrigin(0.5));

    // Buttons (centered, large)
    const gestBtn = scene.add.text(W/2 - 140, H - 60, '🏗️  GESTIÓN', {
        font: 'bold 18px monospace', color: '#fff',
        backgroundColor: '#7c3aed', padding: { x: 22, y: 14 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    gestBtn.on('pointerdown', () => { openManagementPanel(); });
    S.endDayUI.push(gestBtn);

    const nextBtn = scene.add.text(W/2 + 140, H - 60, '▶  DÍA SIGUIENTE', {
        font: 'bold 18px monospace', color: '#fff',
        backgroundColor: '#3b82f6', padding: { x: 22, y: 14 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    nextBtn.on('pointerdown', () => {
        S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
        S.endDayUI = [];
        if (S.hud && S.hud.events) S.hud.events.setVisible(true);
        S.day++;
        S.dayOfWeek = (S.dayOfWeek + 1) % 7;
        // Auto-save: persist progress so the player can reload and continue.
        saveGame();
        S.scene.scene.restart();
    });
    S.endDayUI.push(nextBtn);

    S.endDayUI.push(scene.add.text(W/2, H - 20,
        '⏯  Aprovecha el cambio para contratar, despedir o comprar upgrades',
        { font: 'italic 11px monospace', color: '#64748b' }
    ).setOrigin(0.5));

    // Lift all endDayUI elements above the canvas so cars/emojis stay underneath
    S.endDayUI.forEach(o => { try { o.setDepth(1001); } catch(e) {} });
    backdrop.setDepth(1000);  // backdrop just below content
}
