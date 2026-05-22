# Parking Tycoon — Documento de Diseño

**Versión**: 0.1 (draft inicial)
**Fecha**: 2026-05-21
**Estado**: Concepto en desarrollo

---

## 1. Concepto y Pitch

**Tagline**: *De la papeleta a las naves espaciales.*

**Pitch corto**:
Parking Tycoon es un juego de gestión donde el jugador parte cobrando estacionamiento con papeleta y boleta manual, y evoluciona hasta administrar puertos de naves espaciales. El gancho narrativo: al final del nivel 1, el protagonista conoce la tecnología **ParkingApp**, que se vuelve el árbol de upgrades central del juego. Cada nivel es un sandbox de optimización con decisiones reales — mensualistas vs. transeúntes, convenios con comercios cercanos, infraestructura vs. personal, ingresos secundarios vs. capacidad — que enseñan, sin que el jugador se dé cuenta, cómo funciona realmente la industria del parking moderno.

**Diferenciador**:
- Curva de aprendizaje basada en *dolor real* (cobro manual antes de la tecnología) que hace que cada upgrade se sienta ganado.
- Decisiones de portafolio, no solo upgrades lineales: el jugador balancea cartera de clientes, no solo compra mejoras.
- Progresión que arranca realista (Santiago, mall, aeropuerto) y termina absurda (naves espaciales).

**Género**: Tycoon / Management Sim
**Audiencia objetivo**: Fans de Game Dev Tycoon, Two Point Hospital, Mini Motorways. Audiencia secundaria: profesionales de la industria del parking que reconocen las mecánicas.

---

## 2. Loop de Juego

### Loop momento a momento (segundos)
- Llega un auto al acceso
- El jugador (o el sistema, según nivel) cobra: papeleta manual → POS → tótem → app
- El auto entra, ocupa un espacio, permanece tiempo X, sale
- En paralelo: gestionar filas, atender eventos puntuales (auto sin pagar, cliente molesto, barrera rota)

### Loop diario (1 sesión de juego ≈ 10-15 min)
- Apertura: configurar turnos del personal, ajustar tarifa del día
- Operación: atender el ciclo de demanda (mañana → peak almuerzo → tarde → peak noche)
- Eventos: 1-3 eventos aleatorios (positivo o negativo)
- Cierre: revisar KPIs del día (revenue, ocupación promedio, satisfacción, conversion rate de tótem)

### Loop de progresión (entre niveles)
- Acumular capital
- Comprar upgrades dentro del nivel actual (infraestructura, personal, tech, ingresos secundarios)
- Cumplir condiciones de avance (capital X, satisfacción Y%, días Z)
- Desbloquear próximo nivel → nueva mecánica + nuevas variables a optimizar

---

## 3. Progresión de Niveles

| # | Categoría | Mecánica nueva | Tecnología ParkingApp |
|---|-----------|----------------|----------------------|
| 1 | **Papeleta manual** | Cobrar a mano, escribir hora, fila lenta, errores humanos | ❌ Era pre-tech |
| 🎬 | **Cinemática: conoce ParkingApp** | Después de un sábado caótico, aparece el mentor (vendedor ParkingApp) | — |
| 2 | **POS** | Cobro digital con tarjeta. Primer producto ParkingApp | ✅ Inicio |
| 3 | **Barreras automáticas** | Ticket impreso, validación, control de flujo | ✅ |
| 4 | **Tótem de autopago** | Cliente paga solo, sube conversion rate, baja costo personal | ✅ |
| 5 | **App + suscripciones** | Pago por celular, abonos mensuales, ingresos recurrentes | ✅ |
| 6 | **LPR (lectura de patente)** | Entrada/salida sin ticket, experiencia premium | ✅ |
| 7 | **Multi-sucursal** | Dashboard centralizado, gestión paralela | ✅ |
| 8 | **Mall / Aeropuerto** | Volumen masivo, integraciones de validación, segmentos múltiples | ✅ |
| 9 | **Naves espaciales** 🚀 | Endgame absurdo: ParkingApp Galactic Edition | ✅ |

**Nota de diseño**: El nivel 1 debe ser corto (5-7 min in-game) pero suficientemente doloroso. El clímax — una fila enorme un sábado en la noche que el jugador NO logra atender — es lo que justifica la cinemática y el cambio de mecánica.

---

## 4. Sistemas de Gestión (los 5 ejes)

Cada nivel es un sandbox donde el jugador optimiza simultáneamente cinco ejes. Las opciones disponibles dentro de cada eje crecen con la progresión.

### 4.1. Infraestructura y accesos
- Cantidad de entradas y salidas (más lanes = menos fila pero ocupa espacios)
- Pasillos one-way vs. doble sentido
- Tipos de espacios: normales, reservados, discapacitados, EV, abonados, motos
- Iluminación, señalética, demarcación

### 4.2. Personal
| Rol | Función | Cuándo importa |
|-----|---------|----------------|
| Cobrador | Cobro manual / atención POS | Niveles 1-3 |
| Guardia | Reduce no-pagos y vandalismo | Todos |
| Valet | Aumenta capacidad efectiva | Niveles 3+ con espacios premium |
| Técnico | Repara barreras/tótems rápido | Niveles 3+ |
| Supervisor | Mejora rendimiento del turno | Niveles 5+ |
| Operador remoto | Atiende múltiples sucursales | Niveles 7+ |

Con turnos mañana/tarde/noche → scheduling como mini-decisión.

### 4.3. Tecnología (árbol ParkingApp)
POS → Barreras → Tótem → App → Suscripciones → LPR → Multi-sucursal → Integraciones premium

### 4.4. Ingresos secundarios
- **Pantallas publicitarias** → ingreso pasivo + reducen percepción de espera en filas
- **Convenios con comercios cercanos** → más flujo, costo en margen
- **Cargadores EV** → cobro por kWh + atrae segmento premium
- **Lavado / detailing** → upsell mientras el auto está estacionado
- **Espacios delivery / motos** → nuevos segmentos
- **Servicio valet** → premium

### 4.5. Layout / UX del estacionamiento
- Pintura y demarcación (afecta tiempo de estacionar)
- Cámaras (reduce robos, sube confianza → reviews)
- Música ambiente, baños limpios (satisfacción)
- Apps de búsqueda de espacio (UX premium)

---

## 5. Economía (primera pasada de números)

Valores en CLP, referenciales para el diseño inicial. Tunear con playtesting.

### Nivel 1 — Papeleta
- 20 espacios
- Tarifa: $500/hora
- Demanda: ~30 autos/día, permanencia promedio 2h
- Revenue bruto/día: ~$30.000
- Costos: cobrador ($12.000/día), insumos ($2.000) = $14.000
- **Utilidad neta/día**: ~$16.000
- **Tiempo a unlock POS**: ~7-10 días in-game

### Nivel 2 — POS
- Inversión inicial: $250.000 (one-time) + 3% por transacción
- Velocidad de cobro +40% → reduce filas, +15% capacidad efectiva
- Permite operar con 1 cobrador en lugar de 2 en peak
- **Payback estimado**: 12-18 días

### Nivel 3 — Barreras
- Inversión: $1.500.000 por par (entrada+salida)
- Permite operar sin cobrador en valle (solo guardia)
- Habilita mensualistas (necesita identificación de vehículo)

### Nivel 4 — Tótem
- Inversión: $2.500.000 por tótem
- Conversion rate inicial: ~60% (40% sigue usando cobrador)
- Mejorable con UX (señalética, iluminación, demos)
- Apunta a 90%+ con buena gestión

### Mensualistas (mecánica transversal)
- Precio: $50.000-$80.000/mes (24/7), $30.000 (diurno), $20.000 (nocturno)
- Cada mensualista ocupa ~1 espacio efectivo en su horario
- Revenue por espacio mensualista vs. rotación: depende de ocupación promedio
- **Decisión clave del jugador**: % del lote a mensualistas

### Convenios
- Comercio paga $X o asume Y% del descuento
- Aporta ~10-30% más flujo según calidad del partner
- Riesgo: si llena el lote, canibaliza tarifa premium

---

## 6. Segmentos de Clientes

| Segmento | Comportamiento | Atraído por | Repelido por |
|----------|----------------|-------------|--------------|
| **Oficinistas** | Lun-vie, 8-18h, mensualidad | Plan mensual, ubicación, app | Inestabilidad, falta de cupos |
| **Compradores** | Fin de semana, 2-4h | Convenios con comercios, validación | Filas, tarifa alta sin convenio |
| **Eventos** | Picos impredecibles, premium | Capacidad disponible, tarifa flexible | Estar lleno |
| **Premium / EV** | Pocos, alto margen | Cargadores, valet, espacios reservados | Estacionamiento sucio o inseguro |
| **Delivery / motos** | Rotación rapidísima, low margin | Espacios dedicados, tarifa por minuto | Espacios bloqueados |

Cada decisión del jugador atrae o repele segmentos. El juego se vuelve sobre *qué tipo de estacionamiento quieres ser*.

---

## 7. Mecánicas Especiales

### 7.1. Eventos aleatorios
Disparados por tiempo, capacidad o decisiones del jugador.

**Negativos**:
- Auto sin pagar intenta huir (sin guardia: pérdida; con guardia: cobro + multa)
- Barrera/tótem se rompe (sin técnico: lento; con técnico: rápido)
- Cliente molesto deja mala review (impacto en reputación)
- Inspector municipal (multa si no cumples normativa)

**Positivos**:
- Evento masivo cercano (concierto, partido) → demanda x3 por unas horas
- Cliente VIP recurrente
- Nota positiva en redes sociales → boost de reputación

### 7.2. Mensualistas
Sistema de cartera de planes:
- Vender plan: ingreso fijo + ocupa espacio en su ventana horaria
- Tipos: 24/7, diurno, nocturno, fin de semana
- Trade-off explícito en UI: "$X garantizado vs. $Y potencial por rotación"

### 7.3. Convenios
Negocia con comercios cercanos:
- Restaurante, mall, cine, gimnasio, hotel, hospital
- Cada uno aporta perfil distinto de cliente y horario
- Costo (descuento, fee de validación) vs. beneficio (flujo) visible

### 7.4. Pantallas publicitarias
- Inversión one-time + revenue mensual fijo
- Bonus: reducen percepción de espera (mejora satisfacción)
- Ubicación importa (entrada, fila de pago, áreas de espera)

### 7.5. Reputación y reviews
- Cada cliente sale con una percepción (rápido/lento, seguro/inseguro, caro/justo)
- Suma a un score de reputación global
- Afecta demanda futura (más reputación = más autos)

---

## 8. Narrativa y Personajes

### Protagonista
- Nombre placeholder: **"Tomás"**
- Background: heredó/compró un terreno pequeño en una ciudad como Santiago
- Sueño: convertir esto en algo grande
- Voz: optimista pero pragmático

### Mentor ParkingApp
- Nombre placeholder: **"Ana"**
- Rol: ejecutiva de ParkingApp
- Aparece al final del nivel 1 después del sábado caótico
- Cumple función de tutorial integrado en la narrativa
- Reaparece en cada hito tecnológico mayor (tótem, app, multi-sucursal)

### Arco
1. **Acto 1** (Niveles 1-3): operador local sobreviviendo
2. **Acto 2** (Niveles 4-6): empresario en crecimiento, expandiendo
3. **Acto 3** (Niveles 7-9): magnate regional → global → galáctico

### Cinemáticas clave
- Apertura: Tomás recibe las llaves del estacionamiento
- Fin nivel 1: el sábado caótico + aparición de Ana
- Cada cambio de acto: salto narrativo + visual

---

## 9. MVP — Scope para validar el concepto

**Objetivo del MVP**: validar que el loop core es divertido y que el momento "conoce ParkingApp" se siente como recompensa.

### Incluye
- Nivel 1 completo (papeleta, 20 espacios, cobrador único)
- Cinemática de transición
- Nivel 2 (POS) con al menos 1 ciclo de día
- 3-5 tipos de auto/cliente
- Sistema básico de fila y satisfacción
- 2-3 eventos aleatorios
- Dashboard de KPIs al cierre de cada día

### NO incluye en MVP
- Mensualistas (viene en nivel 3+)
- Convenios
- Multi-sucursal
- Naves espaciales
- Customización profunda de personal

### Métricas de éxito del MVP
- Tester juega los 2 niveles completos sin abandonar
- Tester reporta que el momento POS "se siente bien"
- Tester pregunta qué viene después → señal de que quiere seguir

---

## 10. Referencias e Inspiración

### Juegos de referencia
- **Game Dev Tycoon** — progresión por eras, decisiones con consecuencias
- **Two Point Hospital** — humor + gestión profunda
- **Mini Motorways** — flujo y optimización visual
- **RollerCoaster Tycoon** — sandbox tycoon clásico
- **Stardew Valley** — loop diario satisfactorio

### Tono visual — DECIDIDO: Stardew Valley
- **Pixel art 16-bit estilo Stardew Valley**: cálido, detallado, personalidad
- **Perspectiva**: top-down con leve inclinación 3⁄4 (no isométrico puro)
- **Paleta**: cálida y saturada, contrasta con la frialdad típica de un estacionamiento
- **Ciclo día/noche** con cambios de iluminación (lámparas del estacionamiento se prenden al atardecer, neones reflejados en el pavimento mojado)
- **Animaciones**: autos entrando con sus intermitentes, conductor sale, camina al tótem, cobrador escribe la papeleta a mano
- **Retratos de diálogo**: portraits estilo Stardew para Ana (mentora ParkingApp), clientes VIP, dueños de comercios al negociar convenios
- **Endgame galáctico**: el contraste pixel art + naves espaciales es parte de la gracia. Animaciones de despegue, parking 3D antigravitatorio mostrado en 2D con creatividad.

### Tecnología sugerida para este estilo
- **Engine**: Godot 4 (excelente pixel art workflow, gratis, multi-plataforma) o GameMaker Studio (lo que usa Stardew)
- **Resolución base**: 480x270 o 320x180 escalada
- **Tile size**: 16x16 o 32x32 (32 da más detalle, más alineado con Stardew)

### Tono narrativo
- Humor seco, optimismo emprendedor
- Localizado a Chile/LATAM en los primeros niveles (estacionamiento del barrio, mall conocido) → expansión global → absurdo

---

## 11. Preguntas abiertas

Cosas que faltan decidir:

1. **Plataforma final**: web, móvil, PC o multi-plataforma
2. **Engine**: Godot 4 (recomendado) vs. GameMaker
3. **Monetización**: premium one-time, freemium, ads, IAP
4. ~~Estilo visual definitivo~~ ✅ Decidido: pixel art Stardew Valley
5. **Multiplayer/competitivo**: ¿leaderboards? ¿ranking de estacionamientos?
6. **Integración real con ParkingApp**: ¿datos reales de KPIs? ¿benchmarks?
7. **Nombre final del juego**

---

## Apéndice: Glosario

- **Conversion rate (tótem)**: % de clientes que pagan en tótem vs. cobrador humano
- **Mensualista**: cliente con plan mensual de estacionamiento
- **Transeúnte**: cliente que paga por uso individual
- **Convenio**: acuerdo con comercio cercano para validar tickets
- **LPR**: License Plate Recognition (lectura de patente)
- **Permanencia**: tiempo promedio que un auto pasa estacionado
