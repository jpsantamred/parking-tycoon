// Captures the Phaser game canvas via game.renderer.snapshot — used when
// Page.captureScreenshot doesn't capture WebGL output (Android WebView).
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const outPath = process.argv[2] || './canvas-snapshot.png';

(async () => {
    const list = await new Promise(resolve => {
        http.get('http://127.0.0.1:9229/json', res => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => resolve(JSON.parse(buf)));
        });
    });
    if (!list.length) {
        console.error('No CDP targets at :9229');
        process.exit(1);
    }
    const sock = new WebSocket(list[0].webSocketDebuggerUrl);
    await new Promise(r => sock.on('open', r));
    const result = await new Promise(resolve => {
        sock.on('message', m => {
            const msg = JSON.parse(m);
            if (msg.id === 1) resolve(msg.result);
        });
        sock.send(JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: {
                expression: 'new Promise(r => window.game.renderer.snapshot(img => r(img.src)))',
                returnByValue: true,
                awaitPromise: true,
            },
        }));
    });
    if (result && result.result && result.result.value) {
        const dataUrl = result.result.value;
        const b64 = dataUrl.split(',')[1];
        fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
        console.log('Saved', outPath, b64.length, 'bytes');
    } else {
        console.error('No data:', JSON.stringify(result));
        process.exit(1);
    }
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
