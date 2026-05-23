#!/usr/bin/env node
// Full progression playthrough: drives the game from Nivel 1 to Nivel 9 via CDP,
// taking screenshots and inspecting the UI at each milestone to look for bugs.
//
// Assumes the emulator is running, app is installed, and `adb forward tcp:9229`
// is already set up.

const { WebSocket } = require('ws');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ADB = process.env.LOCALAPPDATA + '\\Android\\Sdk\\platform-tools\\adb.exe';
const SHOT_DIR = path.join(__dirname, '..', 'playthrough-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let ws, id = 1;
const pending = new Map();
const issues = [];
const milestones = [];

async function connect() {
    const list = await fetch('http://127.0.0.1:9229/json').then(r => r.json());
    ws = new WebSocket(list[0].webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.on('message', d => {
        const m = JSON.parse(d.toString());
        if (m.id && pending.has(m.id)) {
            const { resolve } = pending.get(m.id);
            pending.delete(m.id);
            resolve(m.result || m);
        }
    });
    await send('Runtime.enable');
    await send('Log.enable');
}

function send(method, params = {}) {
    return new Promise(resolve => {
        const reqId = id++;
        pending.set(reqId, { resolve });
        ws.send(JSON.stringify({ id: reqId, method, params }));
    });
}

async function evalJs(expr) {
    const r = await send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
        includeCommandLineAPI: true,
    });
    if (r.exceptionDetails) {
        const err = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
        issues.push({ at: currentLevel, type: 'js-error', msg: err });
        throw new Error('JS: ' + err);
    }
    return r.result?.value;
}

let currentLevel = 'N1';

function shot(label) {
    const filename = `${currentLevel}-${label.replace(/\s+/g, '-')}.png`;
    const filepath = path.join(SHOT_DIR, filename);
    execSync(`"${ADB}" exec-out screencap -p > "${filepath}"`, { shell: 'cmd.exe' });
    console.log(`  📸 ${filename}`);
    return filepath;
}

async function dismissModals() {
    // Click any cinematic dismiss button + the end-of-day next-day button
    for (let i = 0; i < 5; i++) {
        const result = await evalJs(`(() => {
            const list = window.game?.scene?.scenes?.[0]?.children?.list || [];
            const re = /Lo pienso|Cerrar|Entendido|Saltar|Siguiente|SIGUE|×|Skip|Dismiss/i;
            const t = list.find(c => c.type === 'Text' && re.test(c.text || '') && c.input?.enabled);
            if (t) { try { t.emit('pointerdown'); return t.text; } catch (e) {} }
            return null;
        })()`);
        if (!result) break;
        console.log(`  (dismissed: ${result.trim()})`);
        await sleep(300);
    }
}

async function nextDay() {
    await dismissModals();
    const ok = await evalJs(`(() => {
        const btn = S.endDayUI?.find(o => o.text === '▶  DÍA SIGUIENTE');
        if (btn) { btn.emit('pointerdown'); return true; }
        return false;
    })()`);
    if (!ok) {
        // Maybe day not ended yet — fast-forward time
        await evalJs(`if (typeof endDay === 'function' && !S.dayEnded) endDay();`);
        await sleep(800);
        await dismissModals();
        return evalJs(`(() => {
            const btn = S.endDayUI?.find(o => o.text === '▶  DÍA SIGUIENTE');
            if (btn) { btn.emit('pointerdown'); return true; }
            return false;
        })()`);
    }
    return ok;
}

async function waitForScene(maxMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        const ok = await evalJs(`!!(window.game?.scene?.scenes?.[0]?.children?.list?.length > 5 && typeof S !== 'undefined' && !S.dayEnded)`);
        if (ok) return true;
        await sleep(200);
    }
    return false;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function buy(key, fn) {
    const before = await evalJs(`({ money: S.money, has: !!S.upgrades['${key}'] })`);
    console.log(`\n→ Compra ${key} (tenemos $${Math.floor(before.money).toLocaleString('en')})`);
    if (before.has) { console.log(`  (ya lo tenía)`); return; }
    // Ensure plenty of money
    await evalJs(`S.money = 5000000;`);
    await evalJs(`${fn}();`);
    await sleep(600);
    // Some purchases trigger cinematics — dismiss them
    await dismissModals();
    const after = await evalJs(`({ has: !!S.upgrades['${key}'], rep: S.reputation, money: Math.floor(S.money) })`);
    if (!after.has) {
        issues.push({ at: currentLevel, type: 'upgrade-failed', msg: `${key} did not unlock via ${fn}()` });
        console.log(`  ⚠️ NO se compró ${key}`);
    } else {
        console.log(`  ✅ ${key} desbloqueado · rep=${after.rep} · $${after.money.toLocaleString('en')}`);
    }
}

async function audit(level) {
    const snapshot = await evalJs(`(() => {
        const sc = window.game?.scene?.scenes?.[0];
        if (!sc) return { error: 'no scene' };
        const list = sc.children?.list || [];
        // Find buttons / interactive elements with their positions
        const interactives = list.filter(c => c.input?.enabled).map(c => ({
            type: c.type, text: (c.text || '').slice(0, 40),
            x: Math.round(c.x || 0), y: Math.round(c.y || 0),
            w: Math.round((c.displayWidth || c.width || 0)),
            h: Math.round((c.displayHeight || c.height || 0)),
            depth: c.depth || 0,
            visible: c.visible !== false,
        }));
        // Detect overlapping clickable elements (potential UX bug)
        const overlaps = [];
        for (let i = 0; i < interactives.length; i++) {
            for (let j = i+1; j < interactives.length; j++) {
                const a = interactives[i], b = interactives[j];
                if (!a.visible || !b.visible) continue;
                const ax1 = a.x - a.w/2, ax2 = a.x + a.w/2;
                const ay1 = a.y - a.h/2, ay2 = a.y + a.h/2;
                const bx1 = b.x - b.w/2, bx2 = b.x + b.w/2;
                const by1 = b.y - b.h/2, by2 = b.y + b.h/2;
                if (ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1 && Math.abs(a.depth - b.depth) < 1) {
                    overlaps.push({ a: a.text, b: b.text, pos: \`(\${a.x},\${a.y}) vs (\${b.x},\${b.y})\` });
                }
            }
        }
        return {
            fps: sc.game?.loop?.actualFps?.toFixed(1),
            heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null,
            objectCount: list.length,
            interactiveCount: interactives.length,
            overlaps: overlaps.slice(0, 5),
            interactives: interactives.slice(0, 12),
            upgrades: Object.keys(S.upgrades).filter(k => S.upgrades[k] === true || (typeof S.upgrades[k] === 'number' && S.upgrades[k] > 0)),
            money: Math.floor(S.money),
            day: S.day,
            rep: S.reputation,
        };
    })()`);
    console.log(`  📊 day=${snapshot.day} money=$${snapshot.money.toLocaleString('en')} rep=${snapshot.rep} fps=${snapshot.fps} heap=${snapshot.heap}MB objs=${snapshot.objectCount} interactives=${snapshot.interactiveCount}`);
    console.log(`  upgrades: ${snapshot.upgrades.join(', ') || '(none)'}`);
    if (snapshot.overlaps?.length) {
        console.log(`  ⚠️ OVERLAPS:`);
        snapshot.overlaps.forEach(o => {
            console.log(`     - "${o.a}" overlaps "${o.b}" at ${o.pos}`);
            issues.push({ at: level, type: 'overlap', a: o.a, b: o.b, pos: o.pos });
        });
    }
    milestones.push({ level, ...snapshot });
}

(async () => {
    await connect();
    console.log('Connected. Starting full N1→N9 playthrough.\n');

    // Make sure we're on a fresh game (not in splash, not in modal)
    await evalJs(`
        if (document.getElementById('splash')?.style.display !== 'none') {
            document.getElementById('splash-start').click();
        }
    `);
    await sleep(1500);
    await waitForScene();

    // Dismiss the onboarding tutorial overlay (a real player would tap
    // "▶ Entendido" — without this it stays on top of the canvas the whole
    // run, obscuring whatever visual issues might be lurking underneath).
    await evalJs(`
        const ob = document.getElementById('onboarding-close');
        if (ob) ob.click();
    `);
    await sleep(300);
    console.log('Onboarding tutorial dismissed.');

    // === N1: Papeleta (default state) ===
    currentLevel = 'N1-Papeleta';
    console.log(`\n========== ${currentLevel} ==========`);
    await audit(currentLevel);
    shot('initial');

    // === N1.5: Booth ===
    currentLevel = 'N1.5-Booth';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('booth', 'purchaseBooth');
    await audit(currentLevel);
    shot('initial');

    // === N2: POS ===
    currentLevel = 'N2-POS';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('pos', 'purchasePOS');
    await audit(currentLevel);
    shot('initial');

    // === N3: Barriers ===
    currentLevel = 'N3-Barriers';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('barriers', 'purchaseBarriers');
    await audit(currentLevel);
    shot('initial');

    // === N3-final: Entry Totem ===
    currentLevel = 'N3-EntryTotem';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('entryTotem', 'purchaseEntryTotem');
    await audit(currentLevel);
    shot('initial');

    // === N4: Exit Totem ===
    currentLevel = 'N4-ExitTotem';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('exitTotem', 'purchaseExitTotem');
    await audit(currentLevel);
    shot('initial');

    // === N5: ParkingApp ===
    currentLevel = 'N5-ParkingApp';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('parkingApp', 'purchaseParkingApp');
    await audit(currentLevel);
    shot('initial');

    // === N6: Valet AI ===
    currentLevel = 'N6-ValetAI';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('valetAI', 'purchaseValetAI');
    await audit(currentLevel);
    shot('initial');

    // === N7: Multi-Level Vertical ===
    currentLevel = 'N7-Vertical';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('multiLevel', 'purchaseMultiLevel');
    await audit(currentLevel);
    shot('initial');

    // === N8: Drone ===
    currentLevel = 'N8-Drone';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('drone', 'purchaseDrone');
    await audit(currentLevel);
    shot('initial');

    // === N9: Spaceport ===
    currentLevel = 'N9-Spaceport';
    console.log(`\n========== ${currentLevel} ==========`);
    await buy('spaceport', 'purchaseSpaceport');
    await sleep(2000);  // let the win celebration play
    await audit(currentLevel);
    shot('win');

    // === Final report ===
    console.log('\n\n╔═══════════════════════════════╗');
    console.log('║  FINAL REPORT                 ║');
    console.log('╚═══════════════════════════════╝');
    console.log(`Issues found: ${issues.length}`);
    if (issues.length) {
        issues.forEach(i => console.log(`  - [${i.at}] ${i.type}: ${JSON.stringify(i)}`));
    } else {
        console.log('  ✅ No issues!');
    }
    console.log('\nScreenshots saved to:', SHOT_DIR);
    fs.writeFileSync(path.join(SHOT_DIR, 'report.json'), JSON.stringify({ issues, milestones }, null, 2));

    process.exit(0);
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
