// Sanity test: tap touch-attend 5x via CDP and check __cobroCalls
const { WebSocket } = require('ws');
let ws, id = 1; const pending = new Map();
async function connect() {
    const list = await fetch('http://127.0.0.1:9229/json').then(r => r.json());
    ws = new WebSocket(list[0].webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.on('message', d => {
        const m = JSON.parse(d.toString());
        if (m.id && pending.has(m.id)) { const { resolve } = pending.get(m.id); pending.delete(m.id); resolve(m.result || m); }
    });
    await send('Runtime.enable');
}
function send(method, params = {}) {
    return new Promise(resolve => { const reqId = id++; pending.set(reqId, { resolve }); ws.send(JSON.stringify({ id: reqId, method, params })); });
}
async function evalJs(e) {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value;
}
(async () => {
    await connect();
    // Make sure we're past splash
    await evalJs(`document.getElementById('splash-start')?.click()`);
    await new Promise(r => setTimeout(r, 1500));
    await evalJs(`document.getElementById('onboarding-close')?.click()`);
    await new Promise(r => setTimeout(r, 500));

    await evalJs(`window.__cobroCalls = 0`);
    const pos = await evalJs(`(() => {
        const r = document.getElementById('touch-attend').getBoundingClientRect();
        return { x: r.left + r.width/2, y: r.top + r.height/2 };
    })()`);
    console.log('Button center CSS:', pos);

    // Test 3 dispatch approaches and see which works
    for (let i = 1; i <= 3; i++) {
        // 1. Mouse events
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 30));
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
        await new Promise(r => setTimeout(r, 200));
        let calls = await evalJs(`window.__cobroCalls`);
        console.log(`  Mouse  ${i} → __cobroCalls = ${calls}`);
    }
    for (let i = 1; i <= 3; i++) {
        // 2. el.click() via JS (the new tapHtml)
        const r = await evalJs(`(() => {
            const el = document.getElementById('touch-attend');
            const rc = el.getBoundingClientRect();
            const hit = document.elementFromPoint(rc.left + rc.width/2, rc.top + rc.height/2);
            if (hit === el || el.contains(hit)) { hit.click(); return 'clicked'; }
            return 'covered by ' + (hit?.id || hit?.tagName);
        })()`);
        await new Promise(r => setTimeout(r, 200));
        let calls = await evalJs(`window.__cobroCalls`);
        console.log(`  Click  ${i} (${r}) → __cobroCalls = ${calls}`);
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
