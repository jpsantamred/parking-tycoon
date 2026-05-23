# Brand logos

The official ParkingApp and Redcomercio brand identities use orange
(approximately `#f97316`) with white interior. Until the high-resolution
PNG files are dropped in here, the game uses vector approximations
drawn directly in Phaser (see `drawParkingAppBadge` and
`drawRedcomercioBadge` in `game.js`).

## To use the real logos

Save the two PNG files in this folder:

```
prototype/assets/parkingapp-logo.png   (orange P with "PARKING APP")
prototype/assets/redcomercio-logo.png  (orange square outline with R + "REDCOMERCIO")
```

Then preload them in `game.js` `preload()`:

```js
this.load.image('parkingapp_logo', 'assets/parkingapp-logo.png');
this.load.image('redcomercio_logo', 'assets/redcomercio-logo.png');
```

And use them anywhere via `scene.add.image(x, y, 'parkingapp_logo').setScale(s)`.

## Recommended sizes

- `parkingapp-logo.png` — 256×320 transparent PNG (aspect ~4:5 to match the
  real logo shape: P icon + "PARKING APP" text below)
- `redcomercio-logo.png` — 256×256 transparent PNG (square, matches the real
  bordered-square layout)

Both with transparent background so they overlay clean on any color.
