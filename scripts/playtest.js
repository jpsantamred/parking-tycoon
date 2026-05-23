#!/usr/bin/env node
// Playtest harness: advances days, attempts upgrades, watches for errors.
// Uses CDP via the running adb forward (assumes localhost:9229 already forwarded).

const { WebSocket } = require('ws');

const WS_TIMEOUT = 5000;

async function getWsUrl() {
    const list = await fetch('http://127.0.0.1:9229/json').then(r => r.json());
    return list[0].webSocketDebuggerUrl;
}

let ws, id = 1;
const pending = new Map();

async function connect() {
    const url = await getWsUrl();
    ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });
    ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.id && pending.has(m.id)) {
            const { resolve } = pending.get(m.id);
            pending.delete(m.id);
            resolve(m.result || m);
        }
    });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Console.enable');
}

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const reqId = id++;
        pending.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
        setTimeout(() => {
            if (pending.has(reqId)) {
                pending.delete(reqId);
                reject(new Error(`Timeout: ${method}`));
            }
        }, WS_TIMEOUT);
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
        throw new Error('JS exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result?.value;
}

const errors = [];
const consoleErrors = [];
function watchConsoleErrors() {
    ws.on('message', (data) => {
        const m = JSON.parse(data.toString());
        if (m.method === 'Runtime.exceptionThrown') {
            errors.push(m.params.exceptionDetails);
        }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            consoleErrors.push(m.params.args.map(a => a.value || a.description).join(' '));
        }
    });
}

async function nextDay() {
    // First check if there's a cinematic blocking — try to dismiss it
    const cinematicDismissed = await evalJs(`(() => {
        // Look for any phaser Text with skip/later/dismiss keywords
        const list = window.game?.scene?.scenes?.[0]?.children?.list || [];
        const skipTexts = list.filter(c => c.type === 'Text' && /Lo pienso|Cerrar|Saltar|Entendido|Siguiente vez|Skip|Dismiss/i.test(c.text || ''));
        if (skipTexts.length === 0) return false;
        // Click the first dismiss-able one
        const t = skipTexts[0];
        try { t.emit('pointerdown'); return 'dismissed: ' + t.text; } catch (e) { return 'fail: ' + e.message; }
    })()`);
    if (cinematicDismissed) {
        console.log('  (dismissed cinematic:', cinematicDismissed + ')');
        await new Promise(r => setTimeout(r, 500));
    }
    return evalJs(`(() => {
        const btn = S.endDayUI?.find(o => o.text === '▶  DÍA SIGUIENTE');
        if (btn) { btn.emit('pointerdown'); return true; }
        return false;
    })()`);
}

async function waitFor(predicate, maxMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        if (await predicate()) return true;
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

async function buyUpgradeIfAffordable() {
    // Try to buy POS, barriers, app, etc. in order — fastest path to progression.
    return evalJs(`(() => {
        const bought = [];
        if (!S.upgrades.booth && S.money >= CONFIG.boothCost) {
            S.money -= CONFIG.boothCost; S.upgrades.booth = true; bought.push('booth');
        }
        if (!S.upgrades.pos && S.upgrades.booth && S.money >= CONFIG.posCost) {
            S.money -= CONFIG.posCost; S.upgrades.pos = true; bought.push('pos');
        }
        if (!S.upgrades.barriers && S.upgrades.pos && S.money >= CONFIG.barriersCost) {
            S.money -= CONFIG.barriersCost; S.upgrades.barriers = true; bought.push('barriers');
        }
        return bought;
    })()`);
}

async function summary() {
    return evalJs(`({
        day: S.day,
        money: Math.floor(S.money),
        rep: S.reputation,
        upgrades: Object.keys(S.upgrades).filter(k => S.upgrades[k] === true),
        cars: S.cars.length,
        served: S.carsServedToday,
        revenue: Math.floor(S.revenueToday),
        utility: Math.floor(S.revenueToday - S.salariesPaidToday),
        consecutiveNeg: S.consecutiveNegDays,
        dayEnded: S.dayEnded,
        empLevel: S.employeeRoster[0]?.level,
        jsHeapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1024/1024) : null,
        objects: window.game?.scene?.scenes?.[0]?.children?.list?.length || 0,
        tweens: window.game?.scene?.scenes?.[0]?.tweens?._active?.length || 0,
    })`);
}

(async () => {
    await connect();
    watchConsoleErrors();
    console.log('Connected. Starting playtest...');

    // Boost initial state for faster gameplay
    await evalJs(`
        S.money = 500000;
        S.employeeRoster.forEach(e => { e.xp = 5000; e.level = 5; });
    `);

    const days = parseInt(process.argv[2] || '8');
    const log = [];
    for (let i = 0; i < days; i++) {
        // Wait until day ends naturally
        const ended = await waitFor(() => evalJs('S.dayEnded'), 90000);
        if (!ended) {
            console.log(`Day ${i+1}: TIMEOUT waiting for end of day`);
            break;
        }
        const stats = await summary();
        const bought = await buyUpgradeIfAffordable();
        log.push({ ...stats, bought });
        console.log(`Day ${stats.day}: served=${stats.served} rev=$${stats.revenue} util=$${stats.utility} money=$${stats.money} rep=${stats.rep} bought=${JSON.stringify(bought)} heap=${stats.jsHeapMB}MB obj=${stats.objects} tweens=${stats.tweens}`);

        // Advance to next day
        const advanced = await nextDay();
        if (!advanced) {
            console.log('Could not advance day — button not found');
            break;
        }
        // Brief wait for scene restart
        await new Promise(r => setTimeout(r, 1500));
        // Re-boost employees in case the roster reset
        await evalJs(`if (S.employeeRoster[0]) { S.employeeRoster[0].level = 5; }`);
    }

    console.log('\n=== Final state ===');
    console.log(JSON.stringify(await summary(), null, 2));
    console.log('\n=== Runtime exceptions caught ===');
    console.log(errors.length ? JSON.stringify(errors, null, 2) : 'none');
    console.log('\n=== Console errors ===');
    console.log(consoleErrors.length ? consoleErrors.join('\n') : 'none');
    process.exit(0);
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
