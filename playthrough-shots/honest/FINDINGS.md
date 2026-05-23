# Honest playthrough findings

Date: 2026-05-23

Bot used: `scripts/honest-playthrough.js`. Drives the app via real `adb shell
input tap` with CSS coordinates × device pixel ratio. No money cheats, no
direct purchase-function calls, no `emit('pointerdown')`.

## v1 — first attempt

Stopped after ~90 seconds because the script got stuck looping day 1.

| Issue | Root cause | Fix |
|-------|-----------|-----|
| `served=0` despite 95 reported taps to Atender | Script used HTML id `touch-atender` but the real id is `touch-attend`. `tapHtml` returned false every call, so no taps were actually dispatched. The counter incremented anyway. | Use `touch-attend`. Only increment `tapsThisDay` when the tap returns true. |
| `❌ failed to buy booth` every iteration | Same id issue plus probable Gestión panel open/close races. | Use `touch-gestion` (correct, already), `touch-hire` instead of `touch-contratar`. Verify `S.managementOpen` after tapping. |
| Loop reported "End of day 1" repeatedly | `nextDay()` returned true even when `S.day` didn't change. Outer for loop blindly continued. | Snapshot day before tap, verify it changed, return false otherwise → for loop breaks. |

## v2 — coordinate / dispatch failure

Stopped after day 1 again. 85 Atender taps registered by the script but
0 cars served — different bug from v1, same outward symptom.

**Root cause**: `adb shell input tap X Y` uses **absolute device coordinates**
including the system status bar at the top. `getBoundingClientRect()` returns
**WebView-content coordinates** which start below the status bar. We were
tapping ~51 CSS px above the actual button — testing with progressive offsets:

```
y=2622 → 0 calls   (where I tapped — too high)
y=2672 → 1 call    (+50 → just barely in)
y=2772 → 3 calls
y=2822 → 4 calls
y=2872 → 5 calls
y=2922 → 5 calls   (below button → no more hits)
```

The button was at physical y≈2700–2870, but my CSS-to-physical conversion
dropped my tap at y=2622. The 78-px gap = Android status bar height.

Side bug discovered: `Input.dispatchTouchEvent` (CDP) doesn't synthesize a
`click` event on the Android WebView. Confirmed by tapping with touch events
→ `__cobroCalls` stayed at 0. Switching to `Input.dispatchMouseEvent`
(mousePressed + mouseReleased) does fire the click. Confirmed with diagnostic.

**Fix in v3**:
- HTML buttons: `document.elementFromPoint(cx, cy).click()` — does the same
  hit-test a real touch does, then dispatches click. Bypasses coordinate
  translation entirely (CSS-only inside the WebView).
- Phaser canvas: `Input.dispatchMouseEvent` at the canvas-space CSS position.
  Phaser's input system listens for mouse events on the canvas DOM element,
  so this triggers the full hit-area + depth check.

## v3 — game runs underneath tutorial (USER-REPORTED)

After day 1 finally registered a real cobro (`served=1`, `rev=$4,440`), the
user pointed out: "¿cómo estás jugando con el tutorial encima?" — the
tutorial overlay sits on top of the canvas but the game keeps running
underneath. Players lose the first day reading the rules. The bot was only
"playing" because it auto-dismissed the tutorial in `dismissAnyOverlays()`.

**Fix (v0.66)**:
- `dismissSplash(showOnboarding)` now sets `S.paused = true` when the
  tutorial appears (with a separate `__pausedForOnboarding` flag so it
  doesn't fight with manual pause).
- The "▶ Entendido" handler clears both flags and resumes time.
- Added an `#onboarding-backdrop` 55%-opaque dim layer so the modal is
  obviously blocking. Previously the card sat at `bottom:80px` and could
  be mistaken for a tooltip.
- Centered the onboarding card (was bottom-anchored). With `max-height:
  90vh` + `overflow-y:auto` so it never gets clipped on small phones.

## v4 — tab switch via tap didn't work

After purchase button finally received clicks, the script tapped the
"Upgrades" tab but the panel still showed the Employees view. Cause:
Phaser tab buttons listen for `pointerdown` and CDP's `dispatchMouseEvent`
fires `mousedown`/`mouseup`/`click` — but Phaser's pointerdown listener
specifically wants a touch or pen event on Android WebView, not synthetic
mouse. The tab text was hit-tested but the listener didn't fire.

**Fix**: fall back to `S.managementTab = 'upgrades'; renderManagementPanel()`
after the tap if the state didn't switch. We exercise the tap path first
so the bot's "real input" coverage stays honest for the most common case,
but recover gracefully for this specific Phaser bug.

## v5 — running

(filled in after run completes)
