// Parking Tycoon — Nivel 1: Papeleta
// Prototype v0.8
//   - Day-of-week tracking (Lun-Dom)
//   - Shifts with specific working days (40h/week = 5 days × 8h)
//   - Weekly schedule view in management panel
//   - Employee CARDS at lot bottom when booth is owned
//   - Employee sprites on sidewalk when no booth

const CONFIG = {
    width: 960, height: 540,
    startHour: 8, endHour: 22, timeSpeed: 14,
    startMoney: 40000,                    // bumped from $25k for a softer start
    pricePerMinute: 10,
    cobroDuration: 1500,
    boothCobroDuration: 1000,
    boothCost: 20000,

    // Ad screens (passive income + patience bonus)
    adScreenCost: 10000,
    adScreenIncomePerGameMin: 8,    // $8 per game-minute = ~$112/hour per screen
    adScreenPatienceBonusPct: 10,    // +10% patience to queue cars per screen (max 3)
    adScreenMax: 3,

    // Signs (more cars spawn)
    signCost: 5000,
    signSpawnBoostPct: 25,           // +25% spawn rate per sign
    signMax: 2,

    // Capacity expansion (limit to 1 — more rows overflow canvas)
    expansionCost: 15000,
    expansionExtraSpaces: 8,
    expansionMax: 1,

    // Monthly subscriptions
    subscriptionPricePerDay: 2500,
    subscriptionDayRange: 14,
    subscriptionMax: 6,

    // POS upgrade (Nivel 2 transition)
    posCost: 40000,
    posCobroDuration: 300,           // dramatically faster than papeleta

    spawnMinMs: 3500, spawnMaxMs: 6500,  // slower spawn to prevent overlap
    patienceMs: 22000, repenaltyAngry: 5,
    exitPatienceMs: 16000, repenaltyEscape: 10,
    stayMinMin: 30, stayMaxMin: 180,
    employeeSalary: 8000,
    employeeHoursPerShift: 8,
    severanceMultiplier: 5,
};

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
// Triggered ~once every 60-180 game-minutes during a day.
// Each has weight + effect + flashEvent message.
const EVENTS = [
    {
        id: 'vip',
        weight: 12,
        name: 'Cliente VIP',
        apply: () => {
            // Next car to be parked pays 2x
            S.nextCarMultiplier = 2;
            flashEvent('💎 ¡Cliente VIP llegando! Próximo cobro paga doble.');
        }
    },
    {
        id: 'rush',
        weight: 15,
        name: 'Spike de demanda',
        apply: () => {
            S.rushUntilMin = S.timeMinutes + 60;
            flashEvent('🎪 ¡Evento masivo cercano! Demanda x2 por 1 hora.');
        }
    },
    {
        id: 'inspector',
        weight: 8,
        name: 'Inspector municipal',
        apply: () => {
            const fine = 3000 + S.angryToday * 200 + S.escapedToday * 500;
            S.money -= fine;
            flashEvent(`👮 Inspector municipal. Multa: -$${fine.toLocaleString('es-CL')}`);
        }
    },
    {
        id: 'review',
        weight: 10,
        name: 'Review en redes',
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
        id: 'lostkey',
        weight: 6,
        name: 'Cliente perdió papeleta',
        apply: () => {
            // Loss: cobrador busy for some time without revenue
            // Simplest implementation: small instant penalty
            S.money -= 500;
            flashEvent('🗝️ Cliente perdió papeleta. Tarifa máxima diaria: -$500');
        }
    },
    {
        id: 'tip',
        weight: 5,
        name: 'Propina inesperada',
        apply: () => {
            const tip = 1000 + Math.floor(Math.random() * 2000);
            S.money += tip;
            flashEvent(`🎁 Propina inesperada de un cliente regular: +$${tip.toLocaleString('es-CL')}`);
        }
    },
];

function triggerRandomEvent() {
    const totalWeight = EVENTS.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const ev of EVENTS) {
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

    centerLaneY: 345, laneH: 40,
    row1Y: 245, row2Y: 415,            // moved tighter — leaves room for expansion row
    spaceW: 50, spaceH: 60,            // shorter so expansion row fits in canvas
    cols: [70, 155, 240, 325, 590, 675, 760, 845],

    // v0.10c — Queue: HEAD inside lot at entry vlane; rest on street going WEST
    queueHeadInsideX: 420,          // == entryVlaneX
    queueHeadInsideY: 235,          // head car position just south of fence opening
    queueStreetY: 130,              // == entryLaneY (cars on the street)
    queueStreetSpacing: 55,         // horizontal spacing on the street

    // Exit waiting (after swap, exit vlane is on the right)
    exitWaitX: 540,                 // == exitVlaneX
    exitWaitY: 245, exitQueueSpacing: 40,

    placeholderCx: 480, placeholderCy: 278, placeholderW: 80, placeholderH: 70,

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
    lotFloor: 0x374151, lotBorder: 0x60a5fa, fenceBar: 0x9ca3af,
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
const S = {
    money: CONFIG.startMoney, day: 1, dayOfWeek: 0, reputation: 100,
    timeMinutes: CONFIG.startHour * 60,

    upgrades: {
        booth: false,
        pos: false,                    // Level 2 unlock
        adScreens: 0,
        signs: 0,
        expansions: 0,
        convenios: [],                 // active convenio IDs
    },
    cinematicShown: false,             // ParkingApp intro
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
    pixelArt: false, antialias: true, roundPixels: true,
    scale: {
        mode: Phaser.Scale.FIT,            // canvas scales to fit viewport
        autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    },
    scene: { preload, create, update }
};
let game = new Phaser.Game(phaserConfig);

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
}

// Build the texture pool: 24 (color, design) combos
const CAR_TEXTURES = [];
CAR_COLOR_NAMES.forEach(color => {
    for (let i = 1; i <= 3; i++) CAR_TEXTURES.push(`car_${color}_${i}`);
});

// Chilean first names pool for randomly-hired employees
const EMPLOYEE_NAMES = [
    'Camila', 'Javier', 'Sofía', 'Matías', 'Valentina', 'Diego', 'Antonia', 'Felipe',
    'Constanza', 'Benjamín', 'Florencia', 'Vicente', 'Isidora', 'Joaquín', 'Martina', 'Cristóbal',
    'Catalina', 'Sebastián', 'Emilia', 'Maximiliano', 'Fernanda', 'Agustín', 'Trinidad', 'Lucas',
    'Renata', 'Nicolás', 'Amanda', 'Ignacio', 'Pascale', 'Vicente', 'Magdalena', 'Rodrigo',
    'Paloma', 'Andrés', 'Bárbara', 'Pablo', 'Macarena', 'Carlos', 'Daniela', 'Gonzalo',
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
    bored: () => { beep(180, 0.15, 'sawtooth', 0.04); },
    escape: () => { beep(150, 0.08, 'sawtooth'); setTimeout(() => beep(90, 0.15, 'sawtooth'), 70); },
    purchase: () => { beep(523, 0.08); setTimeout(() => beep(659, 0.08), 80); setTimeout(() => beep(784, 0.12), 160); },
    dayEnd: () => { beep(440, 0.1); setTimeout(() => beep(550, 0.1), 110); setTimeout(() => beep(660, 0.15), 220); },
    gameOver: () => { beep(440, 0.2, 'sawtooth'); setTimeout(() => beep(330, 0.25, 'sawtooth'), 220); setTimeout(() => beep(220, 0.4, 'sawtooth'), 480); },
};

function resetTransientState() {
    S.cars = []; S.queue = []; S.parkedCars = []; S.exitQueue = [];
    S.spaces = []; S.employees = [];
    S.spawnTimer = 0; S.nextSpawnIn = 3000;
    S.dayEnded = false; S.paused = false;
    S.hud = {};
    S.timeMinutes = CONFIG.startHour * 60;
    S.carsServedToday = 0; S.angryToday = 0; S.escapedToday = 0;
    S.revenueToday = 0; S.drivePastToday = 0; S.salariesPaidToday = 0;
    S.nextCarMultiplier = 1; S.rushUntilMin = 0;
    S.eventTimer = 0; S.nextEventIn = Phaser.Math.Between(45000, 120000);
    S.subscriptionRevenueToday = 0;
    S.managementOpen = false; S.managementUI = [];
    S.boothSprites = []; S.boothWindowSprite = null; S.boothCobradorSprite = null;
    S.closedSignGroup = null; S.streetClosedSign = null;
    S.endDayUI = [];
}

function ensureInitialRoster() {
    if (S.employeeRoster.length === 0) {
        S.employeeRoster.push({
            id: 'emp-' + Math.random().toString(36).slice(2),
            name: 'Tomás', shift: SHIFTS.wd_morning,
            salary: CONFIG.employeeSalary, hiredOnDay: 1,
        });
    }
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
    this.input.keyboard.on('keydown-H', () => hireEmployee());
    this.input.keyboard.on('keydown-G', () => toggleManagementPanel());
    this.input.keyboard.on('keydown-ESC', () => { if (S.managementOpen) closeManagementPanel(); });

    logEvent(`Día ${S.day} (${DAY_LONG[S.dayOfWeek]}) — ${S.upgrades.booth ? 'caseta operativa' : 'a pie nomás'}`);
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
    scene.add.rectangle(lotCX, lotCY, lotW, lotH, COLORS.lotFloor)
        .setStrokeStyle(3, COLORS.lotBorder);

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
}

function drawPlaceholder(scene) {
    scene.add.rectangle(L.placeholderCx, L.placeholderCy, L.placeholderW, L.placeholderH, 0x000000, 0)
        .setStrokeStyle(2, COLORS.placeholderStroke);
    scene.add.text(L.placeholderCx, L.placeholderCy - 10, 'CASETA', {
        font: 'italic 13px monospace', color: '#9ca3af'
    }).setOrigin(0.5);
    scene.add.text(L.placeholderCx, L.placeholderCy + 10, '(upgrade)', {
        font: 'italic 11px monospace', color: '#9ca3af'
    }).setOrigin(0.5);

    // Without booth, show a CERRADO sign at the lot entrance when no operators
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
    const cobrador = scene.add.image(cx, cy - h/2 + 28, 'tomas_south').setScale(0.55);
    sprites.push(cobrador);
    scene.tweens.add({
        targets: cobrador, y: { from: cobrador.y, to: cobrador.y - 2 },
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // Glass reflection (diagonal shine)
    sprites.push(scene.add.rectangle(cx - 12, cy - h/2 + 18, 3, 12, 0xffffff, 0.4));

    // Counter / cobro slot at bottom of window
    sprites.push(scene.add.rectangle(cx, cy - h/2 + 40, w - 20, 4, 0x1f1408));

    // Sign at bottom: "$ CASETA $"
    sprites.push(scene.add.rectangle(cx, cy + h/2 - 8, w - 14, 16, 0xfbbf24).setStrokeStyle(1, 0x713f12));
    sprites.push(scene.add.text(cx, cy + h/2 - 8, '$ CASETA $', {
        font: 'bold 10px monospace', color: '#1f1408'
    }).setOrigin(0.5));

    // CERRADO sign overlay (shown when no operators)
    const closedBg = scene.add.rectangle(cx, cy - h/2 + 26, w - 24, 22, 0xb91c1c).setStrokeStyle(2, 0xfca5a5);
    const closedTxt = scene.add.text(cx, cy - h/2 + 26, 'CERRADO', {
        font: 'bold 11px monospace', color: '#fff'
    }).setOrigin(0.5);
    S.closedSignGroup = [closedBg, closedTxt];

    S.boothSprites = sprites;
    S.boothWindowSprite = windowGlass;
    S.boothCobradorSprite = cobrador;
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
        addSpace(scene, x, L.row1Y, 'up', c);
        addSpace(scene, x, L.row2Y, 'down', c);
    });
    // Expansion row (only 1 max — placed right below row 2, fits in canvas)
    if (S.upgrades.expansions > 0) {
        const y = L.row2Y + 60;  // ~y=475, spans 445-505 — fits in lot bottom (510)
        for (let c = 0; c < CONFIG.expansionExtraSpaces && c < L.cols.length; c++) {
            addSpace(scene, L.cols[c], y, 'down', c + 10);
        }
    }
}

function addSpace(scene, x, y, facing, col) {
    const rect = scene.add.rectangle(x, y, L.spaceW, L.spaceH, COLORS.spaceEmpty)
        .setStrokeStyle(2, COLORS.spaceBorder);
    const label = scene.add.text(x, y, 'P', { font: 'bold 16px monospace', color: '#9ca3af' }).setOrigin(0.5);
    S.spaces.push({ x, y, sprite: rect, label, occupied: null, facing, col });
}

function applySubscriptionsToSpaces() {
    S.subscriptions.forEach(sub => {
        const space = S.spaces[sub.spaceIndex];
        if (space && !space.occupied) {
            space.occupied = 'subscription';
            space.sprite.setFillStyle(COLORS.spaceSubscription);
            if (space.label) { space.label.setText('M'); space.label.setColor('#fbcfe8'); }
        }
    });
}

// ─── EMPLOYEES ─────────────────────────────────────────────
function createEmployeeSprite(scene, rosterEntry, idx) {
    const homeX = L.employeeNoBoothStartX + idx * L.employeeNoBoothSpacing;
    const homeY = L.employeeNoBoothY;

    // Cobrador image (Tomás sprite, scale to ~32px tall)
    const sprite = scene.add.image(homeX, homeY, 'tomas_south').setScale(0.85);

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
            <div class="emp-stat-line"><span class="label">Sueldo:</span> <span class="val">$${entry.salary.toLocaleString('es-CL')}/día</span></div>
            <div class="emp-meta">
                <span class="meta-item">Desde D${entry.hiredOnDay}</span>
                <span class="meta-item">${daysWorked}d trabajados</span>
                <span class="meta-item">$${totalPaid.toLocaleString('es-CL')} pagado</span>
            </div>
        `;
        card.addEventListener('click', () => {
            const target = S.employees.find(e => e.id === entry.id);
            if (target) attemptCobroBy(target);
        });
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
    };
    S.employeeRoster.push(entry);
    if (S.upgrades.booth) createEmployeeRemote(S.scene, entry, S.employees.length);
    else createEmployeeSprite(S.scene, entry, S.employees.length);
    flashEvent(`✅ Contrataste a ${name} (${shift.label} ${shift.start}-${shift.end})`);
    updateEmployeeCardsHTML();
    updateHUD();
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
    const btn = scene.add.text(CONFIG.width - 20, CONFIG.height - 56, '+ Cobrador (H)', {
        font: 'bold 14px monospace', color: '#fff',
        backgroundColor: '#16a34a', padding: { x: 12, y: 8 }
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => hireEmployee());
}

function createManagementButton(scene) {
    const btn = scene.add.text(CONFIG.width - 150, CONFIG.height - 56, '🏗️ GESTIÓN (G)', {
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
        { id: 'stats',     label: '📊 Stats' },
    ];
    const tabY = 84;
    const tabStartX = W/2 - panelW/2 + 24;
    tabs.forEach((t, i) => {
        const active = S.managementTab === t.id;
        const btn = scene.add.text(tabStartX + i * 140, tabY, ` ${t.label} `, {
            font: 'bold 14px monospace',
            color: active ? '#fff' : '#94a3b8',
            backgroundColor: active ? '#7c3aed' : '#334155',
            padding: { x: 12, y: 8 }
        }).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => { S.managementTab = t.id; renderManagementPanel(); });
        S.managementUI.push(btn);
    });

    // Tab content starts at y=130
    const contentY = 130;
    if (S.managementTab === 'employees') renderEmployeesTab(scene, contentY, panelW);
    else if (S.managementTab === 'upgrades') renderUpgradesTab(scene, contentY, panelW);
    else if (S.managementTab === 'stats') renderStatsTab(scene, contentY, panelW);

    S.managementUI.push(scene.add.text(W/2, H - 14, 'ESC o ✕ para cerrar  ·  G abre/cierra', {
        font: 'italic 11px monospace', color: '#94a3b8'
    }).setOrigin(0.5));
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
    const tableX = W/2 - panelW/2 + 24;
    const upY = contentY;

    let ypos = upY;

    // Caseta
    if (!S.upgrades.booth) {
        const canAfford = S.money >= CONFIG.boothCost;
        const btn = scene.add.text(tableX, ypos, `  🛂  CASETA  $${CONFIG.boothCost.toLocaleString('es-CL')}  `, {
            font: 'bold 13px monospace', color: canAfford ? '#fff' : '#9ca3af',
            backgroundColor: canAfford ? '#3b82f6' : '#374151',
            padding: { x: 12, y: 7 }
        });
        if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', purchaseBooth); }
        S.managementUI.push(btn);
        S.managementUI.push(scene.add.text(tableX + 245, ypos + 3,
            '• sin caminata · cobro 33% más rápido',
            { font: '12px monospace', color: '#cbd5e1' }
        ));
    } else {
        S.managementUI.push(scene.add.text(tableX, ypos, '  ✅  Caseta',
            { font: 'bold 13px monospace', color: '#10b981' }
        ));
    }
    ypos += 38;

    // Ad screens
    const adRemaining = CONFIG.adScreenMax - S.upgrades.adScreens;
    if (adRemaining > 0) {
        const canAfford = S.money >= CONFIG.adScreenCost;
        const btn = scene.add.text(tableX, ypos, `  📺  PANTALLA  $${CONFIG.adScreenCost.toLocaleString('es-CL')}  (${S.upgrades.adScreens}/${CONFIG.adScreenMax})  `, {
            font: 'bold 13px monospace', color: canAfford ? '#fff' : '#9ca3af',
            backgroundColor: canAfford ? '#0891b2' : '#374151',
            padding: { x: 12, y: 7 }
        });
        if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => { purchaseAdScreen(); renderManagementPanel(); }); }
        S.managementUI.push(btn);
        S.managementUI.push(scene.add.text(tableX + 285, ypos + 3,
            `• +$${CONFIG.adScreenIncomePerGameMin}/min pasivo · +${CONFIG.adScreenPatienceBonusPct}% paciencia`,
            { font: '12px monospace', color: '#cbd5e1' }
        ));
    } else {
        S.managementUI.push(scene.add.text(tableX, ypos, `  ✅  Pantallas (3/3)`, { font: 'bold 13px monospace', color: '#10b981' }));
    }
    ypos += 38;

    // Signs
    const signRemaining = CONFIG.signMax - S.upgrades.signs;
    if (signRemaining > 0) {
        const canAfford = S.money >= CONFIG.signCost;
        const btn = scene.add.text(tableX, ypos, `  📣  CARTEL  $${CONFIG.signCost.toLocaleString('es-CL')}  (${S.upgrades.signs}/${CONFIG.signMax})  `, {
            font: 'bold 13px monospace', color: canAfford ? '#fff' : '#9ca3af',
            backgroundColor: canAfford ? '#ca8a04' : '#374151',
            padding: { x: 12, y: 7 }
        });
        if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => { purchaseSign(); renderManagementPanel(); }); }
        S.managementUI.push(btn);
        S.managementUI.push(scene.add.text(tableX + 265, ypos + 3,
            `• +${CONFIG.signSpawnBoostPct}% spawn de autos`,
            { font: '12px monospace', color: '#cbd5e1' }
        ));
    } else {
        S.managementUI.push(scene.add.text(tableX, ypos, `  ✅  Carteles (2/2)`, { font: 'bold 13px monospace', color: '#10b981' }));
    }
    ypos += 38;

    // Expansion
    const expRemaining = CONFIG.expansionMax - S.upgrades.expansions;
    if (expRemaining > 0) {
        const canAfford = S.money >= CONFIG.expansionCost;
        const btn = scene.add.text(tableX, ypos, `  🏗️  AMPLIAR  $${CONFIG.expansionCost.toLocaleString('es-CL')}  (${S.upgrades.expansions}/${CONFIG.expansionMax})  `, {
            font: 'bold 13px monospace', color: canAfford ? '#fff' : '#9ca3af',
            backgroundColor: canAfford ? '#16a34a' : '#374151',
            padding: { x: 12, y: 7 }
        });
        if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => { purchaseExpansion(); }); }
        S.managementUI.push(btn);
        S.managementUI.push(scene.add.text(tableX + 285, ypos + 3,
            `• +${CONFIG.expansionExtraSpaces} espacios de estacionamiento`,
            { font: '12px monospace', color: '#cbd5e1' }
        ));
    } else {
        S.managementUI.push(scene.add.text(tableX, ypos, `  ✅  Lote al máximo (3/3)`, { font: 'bold 13px monospace', color: '#10b981' }));
    }
    ypos += 38;

    // Subscriptions (Mensualistas)
    const subActive = S.subscriptions.length;
    const subRemaining = CONFIG.subscriptionMax - subActive;
    if (subRemaining > 0) {
        const btn = scene.add.text(tableX, ypos, `  📋  MENSUALISTA  $${CONFIG.subscriptionPricePerDay.toLocaleString('es-CL')}/día x${CONFIG.subscriptionDayRange}d  (${subActive}/${CONFIG.subscriptionMax})  `, {
            font: 'bold 13px monospace', color: '#fff',
            backgroundColor: '#a855f7',
            padding: { x: 12, y: 7 }
        });
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => { purchaseSubscription(); renderManagementPanel(); });
        S.managementUI.push(btn);
        S.managementUI.push(scene.add.text(450, ypos + 3,
            '• Revenue fijo · ocupa 1 espacio',
            { font: '12px monospace', color: '#cbd5e1' }
        ));
    } else {
        S.managementUI.push(scene.add.text(tableX, ypos, `  ✅  Mensualistas al máximo`, { font: 'bold 13px monospace', color: '#10b981' }));
    }
    ypos += 38;

    // POS upgrade (Nivel 2) — ONLY after Ana's cinematic introduces ParkingApp
    if (S.upgrades.booth && !S.upgrades.pos && S.cinematicShown) {
        const canAfford = S.money >= CONFIG.posCost;
        const btn = scene.add.text(tableX, ypos, `  💳  POS DIGITAL  $${CONFIG.posCost.toLocaleString('es-CL')}  `, {
            font: 'bold 13px monospace', color: canAfford ? '#fff' : '#9ca3af',
            backgroundColor: canAfford ? '#dc2626' : '#374151',
            padding: { x: 12, y: 7 }
        });
        if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => { purchasePOS(); renderManagementPanel(); }); }
        S.managementUI.push(btn);
        S.managementUI.push(scene.add.text(tableX + 235, ypos + 3,
            '• Nivel 2 · cobro súper rápido (0.3s) · 5x productividad',
            { font: '12px monospace', color: '#cbd5e1' }
        ));
    } else if (S.upgrades.pos) {
        S.managementUI.push(scene.add.text(tableX, ypos, '  ✅  POS Digital INSTALADO (Nivel 2)', {
            font: 'bold 13px monospace', color: '#10b981'
        }));
    }
    ypos += 38;

    // ── CONVENIOS ──────────────────────────────────────────
    S.managementUI.push(scene.add.text(45, ypos, '🤝 CONVENIOS', {
        font: 'bold 15px monospace', color: '#a5f3fc'
    }));
    ypos += 24;
    Object.values(CONVENIOS).forEach(c => {
        const active = S.upgrades.convenios.includes(c.id);
        const canAfford = S.money >= c.cost;
        if (active) {
            S.managementUI.push(scene.add.text(45, ypos, `  ✅  ${c.name}`, {
                font: 'bold 12px monospace', color: '#10b981'
            }));
        } else {
            const btn = scene.add.text(tableX, ypos, `  ${c.name}  $${c.cost.toLocaleString('es-CL')}  +${c.spawnBoost}% / -${c.revenueCut}%  `, {
                font: 'bold 12px monospace', color: canAfford ? '#fff' : '#9ca3af',
                backgroundColor: canAfford ? '#0d9488' : '#374151',
                padding: { x: 10, y: 5 }
            });
            if (canAfford) { btn.setInteractive({ useHandCursor: true }); btn.on('pointerdown', () => { purchaseConvenio(c.id); renderManagementPanel(); }); }
            S.managementUI.push(btn);
        }
        ypos += 26;
    });

}

function renderStatsTab(scene, contentY, panelW) {
    const W = CONFIG.width;
    const tableX = W/2 - panelW/2 + 24;

    if (S.dailyStatsHistory.length === 0) {
        S.managementUI.push(scene.add.text(tableX, contentY,
            'Sin estadísticas aún. Termina al menos 1 día para ver trends.',
            { font: 'italic 13px monospace', color: '#94a3b8' }
        ));
        return;
    }

    let ypos = contentY;
    S.managementUI.push(scene.add.text(tableX, ypos, '📊 ÚLTIMOS DÍAS', {
        font: 'bold 15px monospace', color: '#a5f3fc'
    }));
    ypos += 26;

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

function drawAdScreens(scene) {
    // LED billboards on the sidewalk flanking the openings
    const positions = [
        { x: L.entryOpeningX - 75, y: L.sidewalkY },
        { x: L.exitOpeningX  + 75, y: L.sidewalkY },
        { x: L.entryOpeningX + 75, y: L.sidewalkY },
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
        // Pixel text
        const t1 = scene.add.text(x, y - 7, 'PARKING', { font: 'bold 10px monospace', color: '#38bdf8' }).setOrigin(0.5);
        const t2 = scene.add.text(x, y + 7, '★ AQUÍ ★', { font: 'bold 9px monospace', color: '#fde047' }).setOrigin(0.5);
        // Blinking text effect
        scene.tweens.add({ targets: t2, alpha: { from: 1, to: 0.4 }, duration: 700, yoyo: true, repeat: -1 });
        // Corner LEDs
        scene.add.rectangle(x - 32, y - 16, 2, 2, 0xef4444);
        scene.add.rectangle(x + 32, y - 16, 2, 2, 0xef4444);
        scene.add.rectangle(x - 32, y + 16, 2, 2, 0x10b981);
        scene.add.rectangle(x + 32, y + 16, 2, 2, 0x10b981);
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
    }
}

function purchaseBooth() {
    if (S.upgrades.booth) return;
    if (S.money < CONFIG.boothCost) return;
    S.money -= CONFIG.boothCost;
    S.upgrades.booth = true;
    flashEvent('🛂 ¡Caseta instalada! Cobradores ahora son tarjetas + 33% más rápido.');
    closeManagementPanel();
    S.scene.scene.restart();
}

function purchaseAdScreen() {
    if (S.upgrades.adScreens >= CONFIG.adScreenMax) return;
    if (S.money < CONFIG.adScreenCost) return;
    S.money -= CONFIG.adScreenCost;
    S.upgrades.adScreens++;
    flashEvent(`📺 Pantalla publicitaria #${S.upgrades.adScreens} instalada! +ingreso pasivo`);
    closeManagementPanel();
    S.scene.scene.restart();  // refresh canvas so the screen appears
}

function purchaseSign() {
    if (S.upgrades.signs >= CONFIG.signMax) return;
    if (S.money < CONFIG.signCost) return;
    S.money -= CONFIG.signCost;
    S.upgrades.signs++;
    flashEvent(`📣 Cartel #${S.upgrades.signs} instalado! +25% spawn`);
    closeManagementPanel();
    S.scene.scene.restart();  // refresh canvas so the sign appears
}

function purchaseExpansion() {
    if (S.upgrades.expansions >= CONFIG.expansionMax) return;
    if (S.money < CONFIG.expansionCost) return;
    S.money -= CONFIG.expansionCost;
    S.upgrades.expansions++;
    flashEvent(`🏗️ Lote ampliado! +${CONFIG.expansionExtraSpaces} espacios`);
    closeManagementPanel();
    S.scene.scene.restart();
}

function purchasePOS() {
    if (S.upgrades.pos) return;
    if (S.money < CONFIG.posCost) return;
    S.money -= CONFIG.posCost;
    S.upgrades.pos = true;
    flashEvent('💳 ¡POS instalado! Cobro súper rápido (0.3s).');
    closeManagementPanel();
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
    S.scene.tweens.pauseAll();
    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;

    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];

    S.endDayUI.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.93));

    // Title
    S.endDayUI.push(scene.add.text(W/2, 50, '✨ NUEVA OPORTUNIDAD', {
        font: 'bold 24px monospace', color: '#a5f3fc'
    }).setOrigin(0.5));

    // Ana portrait (placeholder circle)
    const portraitX = 180, portraitY = 200;
    S.endDayUI.push(scene.add.circle(portraitX, portraitY, 60, 0xa855f7).setStrokeStyle(3, 0xfbbf24));
    S.endDayUI.push(scene.add.text(portraitX, portraitY, '👩‍💼', { font: '52px sans-serif' }).setOrigin(0.5));
    S.endDayUI.push(scene.add.text(portraitX, portraitY + 80, 'Ana', {
        font: 'bold 18px monospace', color: '#fbbf24'
    }).setOrigin(0.5));
    S.endDayUI.push(scene.add.text(portraitX, portraitY + 102, 'ParkingApp', {
        font: 'italic 13px monospace', color: '#a5f3fc'
    }).setOrigin(0.5));

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
        }));
    });

    const acceptBtn = scene.add.text(W/2 - 110, H - 80, '💳  COMPRAR POS  -$40.000', {
        font: 'bold 16px monospace', color: '#fff',
        backgroundColor: S.money >= CONFIG.posCost ? '#16a34a' : '#475569',
        padding: { x: 16, y: 12 }
    }).setOrigin(0.5);
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
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    laterBtn.on('pointerdown', closeCinematic);
    S.endDayUI.push(laterBtn);

    S.endDayUI.push(scene.add.text(W/2, H - 25,
        '💡 El POS estará disponible siempre en Gestión.',
        { font: 'italic 12px monospace', color: '#cbd5e1' }
    ).setOrigin(0.5));
}

function closeCinematic() {
    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];
    S.dayEnded = false;
    S.paused = false;
    S.scene.tweens.resumeAll();
}

function purchaseSubscription() {
    if (S.subscriptions.length >= CONFIG.subscriptionMax) return;
    // Reserve the first available space
    const space = S.spaces.find(s => !s.occupied);
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

    scene.add.rectangle(CONFIG.width / 2, CONFIG.height - 18, CONFIG.width, 36, 0x1e293b)
        .setStrokeStyle(2, 0x334155);
    S.hud.events = scene.add.text(15, CONFIG.height - 28, '', {
        font: 'bold 15px monospace', color: '#fbbf24'
    });

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

// ─── MAIN LOOP ─────────────────────────────────────────────
function update(time, delta) {
    if (S.dayEnded || S.paused) return;

    const gameMinutesAdvanced = (delta / 1000) * CONFIG.timeSpeed;
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
        S.lifetimeRevenue += adIncome;
    }

    S.spawnTimer += delta;
    if (S.spawnTimer >= S.nextSpawnIn) {
        spawnCar();
        S.spawnTimer = 0;
        const demand = Math.max(0.2, getDemandMultiplier(hourNow));
        const signBoost = 1 + (S.upgrades.signs * CONFIG.signSpawnBoostPct / 100);
        const convenioBoost = getConvenioSpawnBoost();
        const effective = demand * signBoost * convenioBoost;
        const base = Phaser.Math.Between(CONFIG.spawnMinMs, CONFIG.spawnMaxMs);
        S.nextSpawnIn = Math.max(500, base / effective);
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
    }

    for (const car of [...S.parkedCars]) {
        car.stayRemainingMs -= delta;
        if (car.stayRemainingMs <= 0 && car.state === 'parked') requestExit(car);
    }

    for (const car of [...S.exitQueue]) {
        if (car.state !== 'exit-waiting') continue;
        car.exitPatience -= delta;
        if (car.exitPatience <= 0) { escapeWithoutPaying(car); continue; }
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
}

// ─── DRIVE HELPER ──────────────────────────────────────────
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

function spawnQueueCar() {
    const scene = S.scene;
    const textureKey = Phaser.Math.RND.pick(CAR_TEXTURES);
    const stayMin = Phaser.Math.Between(CONFIG.stayMinMin, CONFIG.stayMaxMin);

    const sprite = scene.add.image(L.spawnX, L.entryLaneY, textureKey).setScale(1.6);
    // Invisible alias so legacy tween targets [sprite, windows] still work
    const windows = scene.add.rectangle(L.spawnX, L.entryLaneY, 1, 1, 0).setAlpha(0);

    // Ad screens give patience bonus
    const patienceBonus = 1 + (S.upgrades.adScreens * CONFIG.adScreenPatienceBonusPct / 100);

    const car = {
        id: Math.random().toString(36).slice(2),
        sprite, windows, stayMin,
        stayRemainingMs: stayMin * (1000 / CONFIG.timeSpeed),
        patience: CONFIG.patienceMs * patienceBonus,
        exitPatience: CONFIG.exitPatienceMs * patienceBonus,
        state: 'arriving', space: null, revenue: 0,
        angryHint: false, escapeHint: false,
        entryTimeMinutes: null,
    };
    S.cars.push(car);
    S.queue.push(car);

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

function spawnDrivePast() {
    const scene = S.scene;
    const textureKey = Phaser.Math.RND.pick(CAR_TEXTURES);
    const sprite = scene.add.image(L.spawnX, L.entryLaneY, textureKey).setScale(1.6).setAlpha(0.7);
    const windows = scene.add.rectangle(L.spawnX, L.entryLaneY, 1, 1, 0).setAlpha(0);

    S.drivePastToday++;

    scene.tweens.add({
        targets: [sprite, windows], x: 380, duration: 1000, ease: 'Power2',
        onComplete: () => {
            scene.tweens.add({
                targets: [sprite, windows], y: L.bypassLaneY, duration: 600, ease: 'Power3',
                onComplete: () => {
                    scene.tweens.add({
                        targets: [sprite, windows], x: L.exitOffscreenX, duration: 1100,
                        onComplete: () => { sprite.destroy(); windows.destroy(); }
                    });
                }
            });
        }
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
    const emp = findAvailableEmployee();
    if (!emp) {
        if (!isOpen()) flashEvent('🚫 LOT CERRADO — sin personal en turno.');
        else flashEvent('🛂 Todos los cobradores ocupados!');
        return;
    }
    attemptCobroBy(emp);
}

function attemptCobroBy(emp) {
    if (S.dayEnded) return;
    if (emp.busy) { flashEvent(`🛂 ${emp.name} ocupado!`); return; }
    if (!isOnShift(emp, S.timeMinutes / 60)) {
        flashEvent(`💤 ${emp.name} fuera de turno (${emp.shift.label}).`); return;
    }
    if (S.exitQueue.some(c => c.state === 'exit-waiting')) { attendExit(emp); return; }
    if (S.queue.length > 0) { attendEntry(emp); return; }
    flashEvent('💭 Nada en cola.');
}

// ─── ENTRY COBRO ───────────────────────────────────────────
function attendEntry(emp) {
    if (S.queue.length === 0) return;
    const space = S.spaces.find(s => !s.occupied);
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
    emp.busy = true;
    updateEmployeeAppearance(emp);
    updateEmployeeCardsHTML();

    const carX = car.sprite.x, carY = car.sprite.y;
    const hasBooth = S.upgrades.booth;
    const hasPos = S.upgrades.pos;
    const cobroDur = hasPos ? CONFIG.posCobroDuration : (hasBooth ? CONFIG.boothCobroDuration : CONFIG.cobroDuration);

    const doPapeleta = () => {
        if (hasBooth && S.boothWindowSprite) S.boothWindowSprite.setFillStyle(COLORS.boothWindowBusy);
        flashEvent(`✍️ ${emp.name} ${hasPos ? 'cobra con POS' : 'registra entrada'}${hasBooth ? ' (caseta)' : ''}...`);
        S.scene.time.delayedCall(cobroDur, () => {
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
            const wps = [
                { x: L.entryVlaneX, y: L.centerLaneY, angle: 90, duration: 600 },
                { angle: horizontalAngle, duration: 200 },
                { x: space.x, y: L.centerLaneY, duration: 600 },
                { angle: turnIntoSpaceAngle, duration: 200 },
                { x: space.x, y: space.y, duration: 450 },
            ];
            driveCar(car, wps, () => { car.state = 'parked'; S.parkedCars.push(car); });

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
    // Exit vlane is on the RIGHT (x=540). Drive east or west to reach it.
    const toExitAngle = space.x < L.exitVlaneX ? 0 : 180;   // east if exit is east of space
    const wps = [
        { angle: turnToLaneAngle, duration: 200 },
        { x: space.x, y: L.centerLaneY, duration: 400 },
        { angle: toExitAngle, duration: 200 },
        { x: L.exitVlaneX, y: L.centerLaneY, duration: 700 },
        { angle: -90, duration: 200 },
        { x: L.exitWaitX, y: L.exitWaitY + queuePos * L.exitQueueSpacing, duration: 500 },
    ];
    driveCar(car, wps, () => {
        car.state = 'exit-waiting';
        flashEvent('🚙 Auto pide salida');
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
    const cobroDur = hasPos ? CONFIG.posCobroDuration : (hasBooth ? CONFIG.boothCobroDuration : CONFIG.cobroDuration);

    const doCobro = () => {
        if (hasBooth && S.boothWindowSprite) S.boothWindowSprite.setFillStyle(COLORS.boothWindowBusy);
        flashEvent(`💵 ${emp.name} cobra salida${hasBooth ? ' (caseta)' : ''}...`);
        S.scene.time.delayedCall(cobroDur, () => {
            if (hasBooth && S.boothWindowSprite) S.boothWindowSprite.setFillStyle(COLORS.boothWindow);

            const stayedMin = Math.max(1, Math.ceil(S.timeMinutes - (car.entryTimeMinutes ?? S.timeMinutes)));
            let amount = stayedMin * CONFIG.pricePerMinute * getConvenioRevenueCut();
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
            SFX.cashRegister();

            S.exitQueue = S.exitQueue.filter(c => c.id !== car.id);
            driveCar(car, [
                { x: L.exitVlaneX, y: L.exitWaitY - 20, duration: 300 },
                { x: L.exitVlaneX, y: L.bypassLaneY, duration: 600 },
                { angle: 0, duration: 200 },
                { x: L.exitOffscreenX, y: L.bypassLaneY, duration: 900 },
            ], () => {
                car.sprite.destroy(); car.windows.destroy();
                S.cars = S.cars.filter(c => c.id !== car.id);
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
        { x: L.exitVlaneX, y: L.bypassLaneY, duration: 600, ease: 'Power3' },
        { angle: 0, duration: 200 },
        { x: L.exitOffscreenX, y: L.bypassLaneY, duration: 800 },
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

// ─── HUD UPDATE ────────────────────────────────────────────
function updateHUD() {
    const hours = Math.floor(S.timeMinutes / 60);
    const minutes = Math.floor(S.timeMinutes % 60);
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

    S.hud.salary.setText(`💸 -$${Math.floor(S.salariesPaidToday).toLocaleString('es-CL')}`);
    const demand = getDemandMultiplier(S.timeMinutes / 60);
    S.hud.demand.setText(`📈 ${getDemandLabel(demand)}`);

    const losses = [];
    if (S.angryToday > 0) losses.push(`😡 ${S.angryToday}`);
    if (S.escapedToday > 0) losses.push(`🏃 ${S.escapedToday}`);
    if (S.drivePastToday > 0) losses.push(`💨 ${S.drivePastToday}`);
    S.hud.lossSum.setText(losses.join('  '));
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

function endDay() {
    // First check: trigger cinematic instead of normal end-of-day if appropriate
    if (!S.cinematicShown && S.day >= 3 && (S.upgrades.booth || S.lifetimeRevenue >= 50000)) {
        S.cinematicShown = true;
        renderCinematic();
        return;
    }
    S.dayEnded = true;
    S.paused = true;
    S.scene.tweens.pauseAll();

    // Subscriptions are pre-paid; here just expire ones whose contract ended
    const stillActive = [];
    for (const sub of S.subscriptions) {
        if (S.day < sub.endDay) {
            stillActive.push(sub);
        } else {
            const space = S.spaces[sub.spaceIndex];
            if (space && space.occupied === 'subscription') {
                space.occupied = null;
                space.sprite.setFillStyle(COLORS.spaceEmpty);
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
    // Full reset including PERSISTENT state
    S.money = CONFIG.startMoney;
    S.day = 1;
    S.dayOfWeek = 0;
    S.reputation = 100;
    S.upgrades = { booth: false };
    S.employeeRoster = [];
    S.lifetimeServed = 0; S.lifetimeRevenue = 0; S.lifetimeSalaries = 0;
    S.lifetimeAngry = 0; S.lifetimeEscaped = 0;
    S.consecutiveNegDays = 0;
    S.gameOver = false;
    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];
    S.scene.scene.restart();
}

function renderEndOfDay() {
    S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
    S.endDayUI = [];
    SFX.dayEnd();

    // Record stats for this day
    S.dailyStatsHistory.push({
        day: S.day,
        dow: S.dayOfWeek,
        revenue: S.revenueToday,
        salaries: S.salariesPaidToday,
        served: S.carsServedToday,
        angry: S.angryToday,
        escaped: S.escapedToday,
        drivePast: S.drivePastToday,
        endMoney: S.money,
        reputation: S.reputation,
    });
    if (S.dailyStatsHistory.length > 30) S.dailyStatsHistory.shift();

    const scene = S.scene;
    const W = CONFIG.width, H = CONFIG.height;

    S.endDayUI.push(scene.add.rectangle(W/2, H/2, W, H, 0x000000, 0.88));
    S.endDayUI.push(scene.add.text(W/2, 50, `FIN DEL DÍA ${S.day} — ${DAY_LONG[S.dayOfWeek]}`, {
        font: 'bold 28px monospace', color: '#fbbf24'
    }).setOrigin(0.5));

    const utility = S.revenueToday - S.salariesPaidToday;
    const subRev = S.subscriptionRevenueToday || 0;
    const adRev = (S.upgrades.adScreens * CONFIG.adScreenIncomePerGameMin * 14 * 60) || 0; // approx
    const lines = [
        `Autos atendidos (con cobro):   ${S.carsServedToday}`,
        `Se aburrieron en cola:         ${S.angryToday}`,
        `Escaparon sin pagar:           ${S.escapedToday}`,
        `Pasaron de largo (cerrado):    ${S.drivePastToday}`,
        ``,
        `Revenue total del día:         +$${Math.floor(S.revenueToday).toLocaleString('es-CL')}`,
        subRev > 0 ? `  ↳ Mensualistas:             +$${Math.floor(subRev).toLocaleString('es-CL')}` : null,
        S.upgrades.adScreens > 0 ? `  ↳ Pantallas (estimado):     +$${Math.floor(adRev).toLocaleString('es-CL')}` : null,
        `Sueldos pagados:               -$${Math.floor(S.salariesPaidToday).toLocaleString('es-CL')}`,
        `──────────────────────────────────────`,
        `Utilidad neta:                 $${Math.floor(utility).toLocaleString('es-CL')}`,
        `Dinero total:                  $${Math.floor(S.money).toLocaleString('es-CL')}`,
        `Reputación:                    ${S.reputation}%`,
        ``,
        `── LIFETIME ──`,
        `Atendidos: ${S.lifetimeServed}  ·  Revenue: $${Math.floor(S.lifetimeRevenue).toLocaleString('es-CL')}`,
    ].filter(x => x !== null);
    lines.forEach((line, i) => {
        S.endDayUI.push(scene.add.text(W/2, 100 + i * 24, line, {
            font: 'bold 15px monospace', color: '#fff'
        }).setOrigin(0.5));
    });

    // Show NEXT DAY name + bankruptcy warning
    const nextDow = (S.dayOfWeek + 1) % 7;
    S.endDayUI.push(scene.add.text(W/2, H - 100, `→  Próximo: ${DAY_LONG[nextDow]}`, {
        font: 'italic 14px monospace', color: '#a5f3fc'
    }).setOrigin(0.5));

    if (S.consecutiveNegDays > 0) {
        const remaining = MAX_NEG_DAYS - S.consecutiveNegDays;
        S.endDayUI.push(scene.add.text(W/2, H - 78,
            `⚠️  ${S.consecutiveNegDays} día(s) en rojo. Quiebra a los ${MAX_NEG_DAYS} (te quedan ${remaining}).`,
            { font: 'bold 14px monospace', color: '#ef4444' }
        ).setOrigin(0.5));
    }

    const gestBtn = scene.add.text(W/2 - 130, H - 55, '🏗️  GESTIÓN', {
        font: 'bold 18px monospace', color: '#fff',
        backgroundColor: '#7c3aed', padding: { x: 18, y: 12 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    gestBtn.on('pointerdown', () => { openManagementPanel(); });
    S.endDayUI.push(gestBtn);

    const nextBtn = scene.add.text(W/2 + 130, H - 55, '▶  DÍA SIGUIENTE', {
        font: 'bold 18px monospace', color: '#fff',
        backgroundColor: '#3b82f6', padding: { x: 18, y: 12 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    nextBtn.on('pointerdown', () => {
        S.endDayUI.forEach(o => { try { o.destroy(); } catch(e) {} });
        S.endDayUI = [];
        S.day++;
        S.dayOfWeek = (S.dayOfWeek + 1) % 7;
        S.scene.scene.restart();
    });
    S.endDayUI.push(nextBtn);

    S.endDayUI.push(scene.add.text(W/2, H - 20,
        '💡 Aprovecha el cambio de día para contratar, despedir o comprar upgrades.',
        { font: 'italic 13px monospace', color: '#cbd5e1' }
    ).setOrigin(0.5));
}
