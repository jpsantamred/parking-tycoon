# Parking Tycoon — Lista de assets para pixel art

Sin un MCP de generación de imágenes (DALL-E, Stable Diffusion, Recraft), necesito que tú los generes o que los compres/descargues. Tres caminos:

## Opción A: Sprites libres de itch.io (recomendado para empezar rápido)

Busca packs en:
- https://itch.io/game-assets/free/tag-pixel-art (filtrar por "topdown")
- https://itch.io/game-assets/tag-cars
- https://kenney.nl/assets (assets gratis siempre)

Tipo Stardew → busca "16-bit RPG" o "topdown city".

## Opción B: Conectar un MCP de imágenes y los genero yo

MCPs útiles:
- Recraft MCP (genera pixel art con prompt)
- Stable Diffusion local
- Midjourney via API

Conecta uno y te genero los 12 sprites en una pasada.

## Opción C: Artista pixel art freelance

Si quieres calidad Stardew real (animaciones, sombras, paletas coherentes): Fiverr ~$50-150 USD por el set completo.

---

## Lista de sprites necesarios (12-15)

### Autos (top-down 32x16 px, vista cenital)
- [ ] `car_red.png` — sedan rojo
- [ ] `car_blue.png` — sedan azul
- [ ] `car_yellow.png` — sedan amarillo
- [ ] `car_white.png` — sedan blanco
- [ ] `car_silver.png` — gris/plata
- [ ] `car_truck.png` — camioneta (representa "premium")
- [ ] `car_taxi.png` — taxi (cliente VIP del evento)

Cada uno con 4 frames de rotación: norte, sur, este, oeste (o usar `Phaser.Math.degToRad` para rotar dinámicamente).

### Personajes (32x32 px)
- [ ] `cobrador_idle.png` — cobrador parado (frame único)
- [ ] `cobrador_walk.png` — sprite sheet 4 frames de caminar
- [ ] `cobrador_papeleta.png` — escribiendo papeleta
- [ ] `ana_portrait.png` — retrato de Ana (ParkingApp) para cinemática, 64x64

### Infraestructura
- [ ] `booth.png` — caseta de cobro (80x70 px, vista cenital)
- [ ] `pos_terminal.png` — POS pequeño que se pone sobre la caseta (Nivel 2)
- [ ] `sign.png` — cartel publicitario "ESTACIONAMIENTO →" (40x80 px)
- [ ] `ad_screen.png` — pantalla publicitaria animada (60x40 px, 2-3 frames)
- [ ] `barrier.png` — barrera (32x16 px) para Nivel 3
- [ ] `totem.png` — tótem autopago para Nivel 4

### Espacios y entorno
- [ ] `parking_slot_empty.png` — celda vacía con líneas blancas
- [ ] `parking_slot_occupied.png` — overlay para celda ocupada
- [ ] `pavement_tile.png` — tile de asfalto (16x16)
- [ ] `sidewalk_tile.png` — tile de vereda (16x16)
- [ ] `fence_post.png` — poste de la reja (8x8 px)

### Decoración (opcional)
- [ ] `tree.png` — árbol para los bordes del lote
- [ ] `streetlight.png` — farol de calle
- [ ] `building_bg.png` — edificio de fondo (256x128 px)

---

## Cómo se integran al código

Sustituir cada `scene.add.rectangle(...)` por `scene.add.image(x, y, 'spriteKey')`. Cargar en `preload()`:

```js
function preload() {
    this.load.image('car_red', 'assets/car_red.png');
    this.load.image('car_blue', 'assets/car_blue.png');
    // ... etc
    this.load.spritesheet('cobrador_walk', 'assets/cobrador_walk.png', { frameWidth: 32, frameHeight: 32 });
}
```

Y al spawnear un auto:
```js
const sprite = scene.add.image(L.spawnX, L.entryLaneY, 'car_red');
sprite.setScale(1); // o ajustar
```

Cuando tengas los assets en `prototype/assets/` me avisas y cambio el código de un saque.
