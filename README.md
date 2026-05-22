# 🅿️ Parking Tycoon

Juego de gestión de estacionamientos con progresión narrativa: de cobrar con **papeleta** a manejar **naves espaciales**, pasando por POS, barreras, tótem, app, valet AI y un imperio de sucursales — todo enmarcado en la tecnología de **ParkingApp** + **Redcomercio**.

> Prototipo HTML/JS con Phaser 3 + sprites pixel-art generados con PixelLab AI.

## 🎮 Demo rápido

```bash
cd prototype
python -m http.server 8123
# o el mini server PowerShell que viene en el repo:
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Abre `http://localhost:8123` y arranca el día 1.

## 🕹️ Controles

### Desktop
| Tecla | Acción |
|-------|--------|
| `Click` | Atender un auto desde la tarjeta del empleado o el sprite |
| `Espacio` | Atender con el primer cobrador disponible |
| `G` | Abrir/cerrar Gestión |
| `H` | Contratar nuevo cobrador |
| `P` | Pausar / Reanudar |
| `T` | Cambiar velocidad de juego (1x / 2x / 3x) |
| `ESC` | Cerrar panel de gestión |

### Mobile
4 botones touch fijos en el bottom: `🛂 Atender · ⚙️ Gestión · ➕ Contratar · ⏸ Pausa`.

## 🚀 Progresión completa (9 niveles)

```
Nivel 1: Papeleta            — Cobrador a pie con block de tickets
Nivel 1.5: Caseta            — Cobrador en booth, cobro 33% más rápido
        ↓ (cinemática "Conoce a ParkingApp")
Nivel 2: POS Digital         — Cobro 0.3s, 5x productividad
Nivel 3: Barreras            — Gate físico, -90% escapes
Nivel 3 final: Tótem entrada — Self-service, cobrador solo en salidas
Nivel 4: Tótem autopago      — Self-service salida vía Redcomercio
Nivel 5: ParkingApp          — 30% clientes premium · $50/min suscripciones
Nivel 6: Valet AI            — Autos se estacionan solos · 1.8x tarifa luxury
Nivel 7: Parking Vertical    — +3 pisos · $200/min pasivo
Nivel 8: Drones              — Delivery aéreo · 1.3x tarifa
Nivel 9: 🚀 SPACEPORT        — ¡GANAR EL JUEGO!
```

## 🏢 Sistema multi-lot (sucursales)

Después de Nivel 5 podés comprar sucursales en otros barrios. Cada una tiene personalidad por día de semana:

| Lote | Costo | L-V | S-D | Requisito |
|------|-------|-----|-----|-----------|
| 🏖️ Playa Reñaca | $1.5M | 0.5× | **2.0×** | ParkingApp |
| 🏥 Hospital Central | $2.5M | 1.0× | 1.0× | ParkingApp |
| 🛍️ Mall Costanera | $3.5M | 0.7× | **1.6×** | ParkingApp |
| 🏢 Distrito Financiero | $5M | **1.5×** | 0.1× | Valet AI |
| ✈️ Aeropuerto AMB | $8M | 1.1× | 1.2× | Vertical |
| 🏟️ Estadio Monumental | $12M | 0.4× | **2.5×** | Drones |

## 📊 Mecánicas clave

- **Bancarrota**: 7 días en rojo seguidos = Game Over
- **Sueldos descontados en tiempo real** mientras el cobrador está en turno
- **Tarifa por minuto** ($30/min), cobrada al salir
- **Turnos**: 8h/día por persona; sin cobertura → lot cerrado → autos pasan de largo
- **Empleados con niveles**: ganan XP atendiendo, suben hasta Lv 5 con +40% velocidad y autonomía
- **Bonos**: $5k → +25 XP para acelerar el progreso de un empleado
- **Suscripciones (mensualistas)**: pagan upfront 14 días, ocupan 1 espacio fijo
- **Convenios** con restaurante / mall / cine — suben flujo, bajan margen
- **Pantallas publicitarias** generan ingreso pasivo + paciencia
- **Carteles** atraen más autos (+25% spawn)
- **Día/noche cycle** visual continuo con tint interpolado
- **Hard mode**: $30k inicial (vs $80k), +40% spawn rate, sin ease

## 🎲 27 Eventos random

**Generales** (17): VIP, evento masivo, inspector, review, propina, robbery, vandalism, lluvia, tow, blackout, festival, perro suelto, accidente, food truck, famoso, protesta, rival open/close.

**Por sucursal** (10, solo si poseés el lote): 🌊 marea alta playa, 🌞 calor récord playa, 🚑 emergencia hospital, 💐 visita hospital, 🛒 Black Friday mall, 📉 crisis financiera, 💼 IPO grande, ✈️ vuelos demorados, ⚽ clásico estadio, 🌧️ partido suspendido.

## ⚔️ Sistema de rivales

Después del Día 5, **ParkClub / EasyPark / FastLot / MegaPark** pueden abrir lotes a 2 cuadras tuyas:
- -25% spawn rate por 3 días
- -3 reputación al instante
- **Counter-marketing**: paga $20k para eliminarlos al toque

## 🏆 27 Achievements

Logros desbloqueables con toast notification + galería en Stats tab:
- Cobros: 1, 10, 100, 1000 autos
- Revenue: $100K, $1M, $10M, $100M lifetime
- Días: 7 y 30 sobrevividos
- Niveles: cada upgrade del 1 al 9
- Empleados: top a Lv 5, equipo de 3+
- Reputación 100%
- Sucursales: primera + las 6 (imperio total)
- Hard mode: día 7 sin bancarrota

## 💾 Save / Load

Auto-save al cerrar día. En la splash aparece **CONTINUAR (Día N · $M)** si hay save. Botón secundario para empezar nueva partida.

LocalStorage keys:
- `parking-tycoon-save-v1` — partida actual
- `parking-tycoon-leaderboard-v1` — mejores días + lifetime
- `parking-tycoon-achievements-v1` — logros desbloqueados
- `parking-tycoon-difficulty` — Normal / Hard

## 🎨 Assets

- **Pixel art generado con PixelLab AI**: Tomás (cobrador), Ana (ParkingApp), Ladrón, 3 modelos de autos × 8 colores = 24 sprites
- **Caseta, pantallas, carteles, tótems, barreras, naves espaciales, drones** dibujados programáticamente con shapes en Phaser
- **Sonidos** sintetizados con Web Audio API (cobro normal, kaching premium, bored, angry, escape, level-up, achievement fanfare)
- **Música ambient** loop tipo chill drone + arpegio Am/F/C/G

## 📁 Estructura

```
parking-tycoon/
├── GDD.md                  — Documento de diseño
├── ASSETS-NEEDED.md        — Inventario de sprites
├── README.md               — Este archivo
├── prototype/
│   ├── index.html          — HTML + CSS + splash + onboarding + touch controls
│   ├── game.js             — Lógica completa (~5000 líneas)
│   └── assets/             — Sprites PixelLab (.png)
└── serve.ps1               — Mini HTTP server PowerShell
```

## 🛠️ Stack

- **Phaser 3.70** (vía CDN)
- HTML5 Canvas + JS vanilla
- Sprites PixelLab AI (PNG)
- Web Audio API para SFX + música ambient

## 🎯 Hecho con

- [Claude Code](https://claude.com/claude-code) — pair programming completo
- [PixelLab](https://pixellab.ai) — sprites pixel-art

---

**~76 commits · 9 niveles · 6 sucursales · 27 eventos · 27 achievements · 64 nombres chilenos · 1 imperio.**
