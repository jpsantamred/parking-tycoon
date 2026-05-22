# 📱 Capacitor — Build nativo Android / iOS

Esta guía empaqueta el prototipo (`prototype/`) como app nativa lista para Google Play / App Store usando [Capacitor 6](https://capacitorjs.com/).

> **TL;DR**: el `package.json` y `capacitor.config.json` ya están listos en la raíz. Sólo necesitas correr `npm install` + `npx cap add android` y abrir Android Studio.

## ✅ Pre-requisitos

| Para | Necesitas |
|------|-----------|
| **Android** | Node 18+, JDK 17, [Android Studio](https://developer.android.com/studio) |
| **iOS** | macOS, Xcode 15+, CocoaPods (`sudo gem install cocoapods`) |

## 🚀 Setup paso a paso

### 1. Instalar dependencias

```bash
cd C:\Users\jpsan\parking-tycoon
npm install
```

Esto baja `@capacitor/core`, plugin de Android/iOS, splash-screen, status-bar, haptics, etc.

### 2. Inicializar Capacitor (sólo la primera vez)

El `capacitor.config.json` ya está creado — saltarse `cap init`. Verificar que existe:

```bash
type capacitor.config.json
```

### 3. Agregar plataforma Android

```bash
npm run cap:android:add     # = npx cap add android
```

Esto crea `android/` con el proyecto Gradle. El `webDir` está apuntando a `prototype/` así que no hay que mover archivos.

### 4. Sincronizar assets web

Cada vez que cambies algo en `prototype/`:

```bash
npm run cap:android:sync    # = npx cap sync android
```

### 5. Abrir en Android Studio

```bash
npm run cap:android:open    # = npx cap open android
```

Click **Run ▶** en el dispositivo conectado (o emulador).

## 🍎 iOS (sólo en Mac)

```bash
npm run cap:ios:add
npm run cap:ios:sync
npm run cap:ios:open       # Abre Xcode
```

## 🎨 Iconos + Splash

Los iconos de `prototype/icons/` son los iconos web PWA. Para producción Android/iOS, usa [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):

```bash
npm install -D @capacitor/assets
# Crear assets/icon.png (1024x1024) + assets/splash.png (2732x2732)
npx capacitor-assets generate
```

## 📦 Generar APK / AAB para Play Store

Dentro de Android Studio:
1. `Build → Generate Signed Bundle / APK`
2. Elegir **Android App Bundle (.aab)** para Google Play (formato moderno)
3. Crear o seleccionar un keystore (guárdalo seguro — sin éste no podés actualizar la app)
4. Build → te queda en `android/app/release/app-release.aab`

Subir ese `.aab` a [Google Play Console](https://play.google.com/console/).

## 🔧 Plugins ya configurados

| Plugin | Para qué sirve |
|--------|----------------|
| `@capacitor/app` | Listener back-button Android, app state |
| `@capacitor/haptics` | Vibrar al cobrar / al subir de nivel |
| `@capacitor/keep-awake` | Que no se apague la pantalla mientras juegan |
| `@capacitor/preferences` | LocalStorage nativo (mejor que web localStorage en wrap) |
| `@capacitor/screen-orientation` | Bloquear landscape si se quiere |
| `@capacitor/splash-screen` | Pantalla de carga al abrir |
| `@capacitor/status-bar` | Pintar barra de notificaciones del color del juego |

## 🪝 Activar haptics opcional (mobile feel)

Después de `npm install`, podés agregar en `prototype/game.js` un wrapper:

```js
// Al inicio de game.js
const Haptics = window.Capacitor?.Plugins?.Haptics;
function vibrate(style = 'LIGHT') {
    if (Haptics) Haptics.impact({ style }).catch(() => {});
}

// Ejemplos:
//   vibrate('LIGHT')   → cobro normal
//   vibrate('MEDIUM')  → upgrade
//   vibrate('HEAVY')   → level milestone / win
```

## 🐛 Debugging en device

Android: abrir `chrome://inspect` en Chrome desktop con el cel conectado por USB → ver la consola del WebView.

iOS: Safari → Develop → [tu iPhone] → [Parking Tycoon].

## 📝 Checklist pre-store

- [ ] `appId` único: `cl.parkingapp.tycoon` ✓
- [ ] Icono 512×512 + 1024×1024
- [ ] Screenshots 1080×1920 (mínimo 2)
- [ ] Texto descripción ES + EN
- [ ] Privacy policy URL (obligatorio)
- [ ] Política contenido (juego no tiene IAPs ni ads aún → easy)
- [ ] Build signed AAB
- [ ] Test en device real, no sólo emulador

---

**Estimado de tiempo total** desde cero hasta APK instalable: ~30 min en Windows con Android Studio ya instalado.
