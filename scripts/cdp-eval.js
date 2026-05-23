#!/usr/bin/env node
// Tiny Chrome DevTools Protocol REPL — sends `Runtime.evaluate` to a WebView.
// Usage:
//   node cdp-eval.js "document.title"
//   node cdp-eval.js "Object.keys(window).filter(k => k.length < 20).slice(0, 30)"
//   node cdp-eval.js --file path/to/script.js

const WebSocket = (() => {
    try { return require('ws'); } catch (e) {}
    return null;
})();

async function main() {
    // 1. Find the WebView's WebSocket URL
    const list = await fetch('http://127.0.0.1:9229/json').then(r => r.json());
    if (!list.length) {
        console.error('No pages found at localhost:9229. Did you `adb forward`?');
        process.exit(1);
    }
    const wsUrl = list[0].webSocketDebuggerUrl;
    console.error('Connected to:', list[0].url);

    // 2. Get the JS expression to evaluate
    let expr;
    if (process.argv[2] === '--file') {
        expr = require('fs').readFileSync(process.argv[3], 'utf8');
    } else {
        expr = process.argv.slice(2).join(' ');
    }
    if (!expr) {
        console.error('Usage: node cdp-eval.js "<JS expression>"   or   --file <path>');
        process.exit(1);
    }

    // 3. Use built-in WebSocket if available (Node 22+), otherwise ws module
    const ws = WebSocket
        ? new WebSocket(wsUrl)
        : new (await import('ws')).WebSocket(wsUrl);

    let id = 1;
    const pending = new Map();
    ws.on('open', () => {
        send('Runtime.enable');
        send('Runtime.evaluate', {
            expression: expr,
            returnByValue: true,
            awaitPromise: true,
            allowUnsafeEvalBlockedByCSP: true,
            includeCommandLineAPI: true,
        }).then(result => {
            if (result.exceptionDetails) {
                console.error('JS exception:', result.exceptionDetails.text);
                if (result.exceptionDetails.exception) {
                    console.error(result.exceptionDetails.exception.description || result.exceptionDetails.exception.value);
                }
                process.exit(2);
            }
            console.log(JSON.stringify(result.result.value, null, 2));
            ws.close();
            process.exit(0);
        });
    });
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id && pending.has(msg.id)) {
            const { resolve } = pending.get(msg.id);
            pending.delete(msg.id);
            resolve(msg.result || msg);
        }
    });
    ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });

    function send(method, params = {}) {
        return new Promise((resolve) => {
            const reqId = id++;
            pending.set(reqId, { resolve });
            ws.send(JSON.stringify({ id: reqId, method, params }));
        });
    }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
