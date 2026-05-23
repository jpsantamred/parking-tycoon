// Usage: node cdp-snapshot.js OUTPATH [WIDTH HEIGHT SCALE]
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const outPath = process.argv[2] || './snapshot.png';
const width = parseInt(process.argv[3]) || 944;
const height = parseInt(process.argv[4]) || 372;
const scale = parseFloat(process.argv[5]) || 1.0;

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
            method: 'Page.captureScreenshot',
            params: { format: 'png', clip: { x: 0, y: 0, width, height, scale } },
        }));
    });
    if (result && result.data) {
        fs.writeFileSync(outPath, Buffer.from(result.data, 'base64'));
        console.log('Saved', outPath, result.data.length, 'bytes');
    } else {
        console.error('No data:', JSON.stringify(result));
        process.exit(1);
    }
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
