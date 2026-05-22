# 🅿️ Parking Tycoon

Juego de gestión de estacionamientos con progresión narrativa: de cobrar con **papeleta** a manejar **naves espaciales**, pasando por POS, barreras, tótem, app y suscripciones — todo enmarcado en la tecnología de **ParkingApp**.

> Prototipo HTML/JS con Phaser 3 + sprites pixel-art generados con PixelLab AI.

## 🎮 Demo rápido

```bash
# Servidor Python (si lo tienes)
cd prototype
python -m http.server 8123
# o un mini server PowerShell que viene en el repo
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Abre `http://localhost:8123` y arranca el día 1.

## 🕹️ Controles

| Tecla | Acción |
|-------|--------|
| `Click` | Atender un auto desde la tarjeta del empleado o el sprite |
| `Espacio` | Atender con el primer cobrador disponible |
| `G` | Abrir/cerrar Gestión |
| `H` | Contratar nuevo cobrador |
| `P` | Pausar / Reanudar |
| `ESC` | Cerrar panel de gestión |

## 🎯 Nivel 1 — Papeleta

- **Cobrador a pie** atendiendo entrada y salida (sin caseta)
- **Cola se acumula en la calle** mientras el primer auto espera en la entrada del lote
- **Mensualistas** ocupan espacios reservados (M morado), pagan **upfront** 14 días
- **Convenios** con restaurante / mall / cine — suben flujo, bajan margen
- **Pantallas publicitarias** generan ingreso pasivo + paciencia
- **Carteles** atraen más autos (+25% spawn)
- **Eventos aleatorios** (VIP, evento masivo, inspector, review, propina)
- **Curva de demanda por hora** (pico almuerzo + salida laboral)
- **Días de la semana** con turnos específicos (L-V / S-D / 7 días)

## 🚀 Progresión

```
Nivel 1: Papeleta + Caseta
        ↓ (cinemática "Conoce a ParkingApp")
Nivel 2: POS digital (0.3s por cobro, 5x productividad)
        ↓
Nivel 3: Barreras automáticas (futuro)
        ↓
Nivel 4: Tótem de autopago
        ↓
Nivel 5: App + suscripciones
        ↓
...
Nivel 9: Estacionamiento de naves espaciales 🚀
```

## 📊 Mecánicas clave

- **Bancarrota**: 7 días en rojo seguidos = Game Over
- **Sueldos descontados en tiempo real** mientras el cobrador está en turno
- **Tarifa por minuto** ($10/min), cobrada al salir
- **Cobrador no atendido a tiempo** = cliente escapa sin pagar (-10 rep)
- **Turnos**: 8h/día por persona; sin cobertura → lot cerrado → autos pasan de largo

## 🎨 Assets

- **Pixel art generado con PixelLab AI**: Tomás (cobrador), Ana (ParkingApp), 3 modelos de autos × 8 colores = 24 sprites
- **Sprites secundarios** (caseta, carteles, pantallas) dibujados programáticamente con shapes en Phaser
- **Sonidos** sintetizados con Web Audio API

## 📁 Estructura

```
parking-tycoon/
├── GDD.md                  — Documento de diseño (10 secciones)
├── ASSETS-NEEDED.md        — Inventario de sprites
├── prototype/
│   ├── index.html          — HTML + CSS de las tarjetas
│   ├── game.js             — Lógica completa (~2200 líneas)
│   └── assets/             — Sprites PixelLab
└── serve.ps1               — Mini HTTP server PowerShell
```

## 🛠️ Stack

- **Phaser 3.70** (vía CDN)
- HTML5 Canvas + JS vanilla
- Sprites PixelLab AI (PNG)
- Web Audio API para SFX

## 📝 Estado actual

Prototipo jugable del Nivel 1 con todo el loop funcionando. Falta:

- [ ] Niveles 3-9 (barreras → naves espaciales)
- [ ] Pixel art para caseta/carteles/pantallas (PixelLab trial agotado, usando shapes)
- [ ] Música ambient
- [ ] Persistencia (localStorage para guardar partidas)
- [ ] Mobile touch controls

---

Hecho con [Claude Code](https://claude.com/claude-code) + [PixelLab](https://pixellab.ai).
