#!/usr/bin/env node
// Static audit pass over game.js — flag patterns that often indicate bugs
// or that strict-mode V8 will reject. Lightweight, no external deps.

const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'game.js'), 'utf8');
const lines = code.split('\n');

const findings = [];

// 1. Duplicate top-level `const`/`let`/`var` declarations within the same function/block scope.
//    Brace-aware: tracks nesting and detects redeclares within current scope.
function checkDuplicateDeclarations() {
    let depth = 0;
    const stack = [new Set()];  // one Set per scope depth
    const declRegex = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/;
    lines.forEach((line, i) => {
        const trimmed = line.replace(/\/\/.*$/, '');     // strip line comments
        const match = trimmed.match(declRegex);
        if (match) {
            const name = match[1];
            // Look for `const ... =` (skip destructuring multi-assign for simplicity)
            if (stack[depth].has(name)) {
                findings.push({ severity: 'ERROR', line: i + 1, type: 'duplicate-decl', msg: `Duplicate '${name}' in same block scope (already declared at this depth)` });
            } else {
                stack[depth].add(name);
            }
        }
        // Track braces (very rough — strings/comments could fool us)
        const opens = (trimmed.match(/{/g) || []).length;
        const closes = (trimmed.match(/}/g) || []).length;
        for (let k = 0; k < opens; k++) { depth++; if (!stack[depth]) stack[depth] = new Set(); }
        for (let k = 0; k < closes; k++) { if (stack[depth]) stack[depth] = null; depth = Math.max(0, depth - 1); }
    });
}

// 2. Undefined CONFIG.X usage — find every `CONFIG.foo` reference and verify foo is defined.
function checkUndefinedConfigKeys() {
    const configMatch = code.match(/const CONFIG = \{([\s\S]*?)\n\};/);
    if (!configMatch) { findings.push({ severity: 'WARN', line: 0, type: 'audit', msg: 'Could not locate CONFIG object' }); return; }
    const configBody = configMatch[1];
    const definedKeys = new Set();
    (configBody.match(/^\s*([A-Za-z_$][\w$]*)\s*:/gm) || []).forEach(m => {
        definedKeys.add(m.replace(/[\s:]/g, ''));
    });
    const usageRegex = /CONFIG\.([A-Za-z_$][\w$]*)/g;
    const usages = new Map();
    let m;
    while ((m = usageRegex.exec(code)) !== null) {
        const k = m[1];
        const lineNo = code.slice(0, m.index).split('\n').length;
        if (!definedKeys.has(k)) {
            if (!usages.has(k)) usages.set(k, lineNo);
        }
    }
    usages.forEach((lineNo, k) => {
        findings.push({ severity: 'WARN', line: lineNo, type: 'undefined-CONFIG', msg: `CONFIG.${k} not in CONFIG definition (could be runtime-added or typo)` });
    });
}

// 3. Function called but never defined (best-effort)
function checkUndefinedFunctions() {
    const definedFns = new Set();
    const fnRegex = /(?:^|\s)function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = fnRegex.exec(code)) !== null) definedFns.add(m[1]);
    // Also pick up `const foo = (...) =>` and `const foo = function`
    const arrowRegex = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$])\s*=>/g;
    while ((m = arrowRegex.exec(code)) !== null) definedFns.add(m[1]);

    // Whitelist browser globals + Phaser APIs we don't have visibility into
    const globals = new Set([
        'parseInt', 'parseFloat', 'isNaN', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Math', 'Date', 'JSON',
        'Set', 'Map', 'Promise', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
        'localStorage', 'navigator', 'window', 'document', 'console', 'Phaser', 'fetch', 'URL', 'URLSearchParams',
        'AudioContext', 'webkitAudioContext', 'Audio',
    ]);

    // Look for `someName(` calls that aren't defined, methods, or globals
    const callRegex = /(?:^|[^\w.$])([A-Za-z_$][\w$]{2,})\s*\(/g;
    const seen = new Set();
    while ((m = callRegex.exec(code)) !== null) {
        const name = m[1];
        if (seen.has(name) || definedFns.has(name) || globals.has(name)) continue;
        if (/^(if|for|while|switch|catch|return|typeof|new|throw|await|case|delete|void|in|of)$/.test(name)) continue;
        seen.add(name);
        // Verify it's not a method call (preceded by `.`)
        const lineNo = code.slice(0, m.index).split('\n').length;
        // Only flag if it appears callable in this file
        // Skip Phaser/Browser/DOM method-looking names
        if (/^(get|set|on|create|update|preload|spawn|attend|draw|render|build|init|show|hide|destroy|toggle|open|close|start|stop|run|reset|save|load|clear|click|press|tap)/i.test(name)) {
            // many of these are user-defined — only flag if not in definedFns
            findings.push({ severity: 'INFO', line: lineNo, type: 'maybe-undefined-fn', msg: `${name}() called but not found in this file (could be from Phaser/built-in)` });
        }
    }
}

// 4. typo detection: known patterns that have bitten us
function checkKnownTypos() {
    // CONFIG.repenalty exists, repPenalty does not — flag the inconsistency
    if (code.includes('repenalty') && code.includes('repPenalty')) {
        findings.push({ severity: 'WARN', line: 0, type: 'inconsistent-naming', msg: 'Both `repenalty` and `repPenalty` appear — pick one' });
    }
}

// 5. Catch tweens that loop forever without cleanup
function checkInfiniteTweens() {
    const matches = code.matchAll(/scene\.tweens\.add\([^)]*repeat:\s*-1[^)]*\)/g);
    let count = 0;
    for (const _ of matches) count++;
    findings.push({ severity: 'INFO', line: 0, type: 'audit', msg: `${count} infinite tweens (repeat: -1) — verify none leak after scene.restart` });
}

checkDuplicateDeclarations();
checkUndefinedConfigKeys();
// checkUndefinedFunctions();   // disabled — too noisy
checkKnownTypos();
checkInfiniteTweens();

console.log(`\n=== Audit of game.js (${lines.length} lines) ===\n`);
const bySeverity = { ERROR: [], WARN: [], INFO: [] };
findings.forEach(f => bySeverity[f.severity].push(f));
['ERROR', 'WARN', 'INFO'].forEach(sev => {
    const list = bySeverity[sev];
    if (!list.length) return;
    console.log(`--- ${sev} (${list.length}) ---`);
    list.forEach(f => console.log(`  [L${f.line}] ${f.type}: ${f.msg}`));
});
console.log(`\nTotal: ${findings.length} findings`);
