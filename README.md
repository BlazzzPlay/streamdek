# Streamdek

**Controlá pear-desktop (YouTube Music) desde tu Stream Deck.**

Streamdek es un plugin para Elgato Stream Deck que ofrece control completo de medios para pear-desktop — el reproductor de escritorio de YouTube Music. Soporta acciones de teclas (Keypad) y controles de perilla (Encoder) en Stream Deck Plus.

---

## Características

### Acciones de tecla (7)
| Acción | Comportamiento |
|--------|---------------|
| **Play/Pause** | Alternar reproducción. El ícono refleja el estado actual |
| **Siguiente** | Saltar a la siguiente canción |
| **Anterior** | Reiniciar canción actual (o ir a la anterior si < 3s) |
| **Me gusta** | Like a la canción actual. El ícono muestra el estado |
| **No me gusta** | Dislike a la canción actual |
| **Aleatorio** | Activar/desactivar modo aleatorio |
| **Repetir** | Rotar modo: apagado → una → todas → apagado |

### Acciones de perilla (Stream Deck Plus)
| Acción | Comportamiento |
|--------|---------------|
| **Volumen** | Girar: ±2 de volumen. Presionar: mute. Pantalla táctil: valor actual |
| **Seek** | Girar: ±5s. Presionar: play/pause. Pantalla táctil: posición del track |

### Arquitectura
- **Auth** (`POST /auth/{clientId}`) — autorización nativa: pear-desktop muestra diálogo, usuario hace clic en Allow (opcional: modo sin auth disponible)
- **REST** (`/api/v1/*`) con token Bearer para comandos (sin token cuando useAuth=false)
- **WebSocket** (`/api/v1/ws?token=<jwt>`) con token como query param para estado en tiempo real
- **StateStore** cachea el estado del reproductor desde eventos WS (volumen solo por WS debido al bug #4458)
- **ConnectionManager** maneja la máquina de estados: probe → connected → waiting_for_auth → authenticated
- **Reconexión** con backoff exponencial (1s → 60s máximo)
- **Aislamiento de errores por acción**: cada acción muestra un ícono de advertencia al desconectarse

---

## Inicio rápido

### Requisitos
- Node.js ≥ 24
- Stream Deck software ≥ 7.1
- pear-desktop corriendo con el plugin API Server activado

### Compilar desde el código fuente

```bash
# Instalar dependencias
pnpm install

# Compilar el plugin
pnpm build

# Resultado: com.streamdek.sdPlugin/
```

### Instalación

```bash
# Copiar el plugin a la carpeta de plugins de Stream Deck
# macOS:
cp -R com.streamdek.sdPlugin ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/

# Linux:
cp -R com.streamdek.sdPlugin ~/.local/share/com.elgato.StreamDeck/Plugins/

# O symlink para desarrollo:
ln -s "$(pwd)/com.streamdek.sdPlugin" ~/.local/share/com.elgato.StreamDeck/Plugins/

# Reiniciar Stream Deck
streamdeck restart com.streamdek.sdplugin
```

---

## Guía de activación

### 1. Activar API Server en pear-desktop

1. Abrí **pear-desktop**
2. Andá a **Configuración → API Server**
3. Activá **Enable API Server**
4. Puerto `26538` (por defecto)

### 2. Configurar Streamdek

**Opción A — Sin autorización (recomendada)**

1. En pear-desktop, seteá Authorization en **"No authorization"**
2. En Streamdek, dejá **"Use authentication" destildado**
3. Arrastrá cualquier acción de Streamdek a tu layout
4. Hacé clic en **Probe Connection**
5. Streamdek se conecta instantáneamente — listo

**Opción B — Con autorización (AUTH_AT_FIRST)**

1. En pear-desktop, seteá Authorization en **"AUTH_AT_FIRST"**
2. En Streamdek, **tildá "Use authentication"**
3. Hacé clic en **Connect & Authorize**
4. pear-desktop te muestra un diálogo — hacé clic en **Allow**
5. Streamdek se conecta automáticamente

> **Sin tokens manuales**: Streamdek usa el flow de autorización nativo de pear-desktop. No necesitás copiar ni pegar ningún JWT.

---

## Desarrollo

```bash
# Ejecutar tests
pnpm test

# Tests con coverage
pnpm test:coverage

# Type-check
pnpm typecheck

# Modo watch (recompila automáticamente)
pnpm dev
```

### Estructura del proyecto

```
src/
├── plugin.ts                    # Punto de entrada
├── common/
│   ├── api-client.ts            # Cliente REST con JWT
│   ├── ws-client.ts             # Cliente WebSocket con backoff
│   ├── connection-manager.ts    # Máquina de estados: probe → conectar → autenticar
│   ├── state-store.ts           # Cache de estado del reproductor (volumen solo WS)
│   ├── logger.ts                # Wrapper de streamDeck.logger
│   ├── types.ts                 # Interfaces TypeScript
│   └── endpoints.ts             # Constantes de rutas de la API
├── actions/
│   ├── keypad-actions.ts        # 7 acciones de tecla
│   └── encoder-actions.ts       # 2 acciones de perilla (dial)
└── __tests__/                   # Suites de tests
com.streamdek.sdPlugin/
├── manifest.json                # Manifiesto Stream Deck (SDK v2)
├── bin/plugin.js                # Plugin compilado
├── ui/settings.html             # Property Inspector
├── ui/settings.js               # JS del PI
└── imgs/                        # Íconos de acciones (PNG)
```

### Testing

Los tests usan Jest con ts-jest para TypeScript ESM. El SDK `@elgato/streamdeck` se mockea para testing unitario.

Restricción de diseño clave: **el volumen nunca se lee por REST** (mitigación del bug #4458). El `StateStore` obtiene el volumen exclusivamente por eventos WebSocket.

---

## Licencia

MIT

---

## English

**Control pear-desktop (YouTube Music) from your Stream Deck.**

Streamdek is an Elgato Stream Deck plugin that provides full media control for pear-desktop — the YouTube Music desktop player. Supports Keypad actions and Encoder (dial) controls on Stream Deck Plus.

### Features

| Type | Actions |
|------|---------|
| **Keypad (7)** | Play/Pause, Next Track, Previous Track, Like, Dislike, Shuffle, Repeat |
| **Encoder (2)** | Volume (rotate ±2, press to mute), Seek (rotate ±5s, press to play/pause) |

- **Native auth flow** — pear-desktop dialog, no manual JWT (optional: no-auth mode for instant connection)
- **REST API** with Bearer token for commands (no token header in no-auth mode)
- **WebSocket** with token as URL query param for real-time player state
- **Auto-probe** of pear-desktop on configurable host:port
- **Per-action disconnect warnings** on both Keypad and Encoder displays
- **Exponential backoff** reconnection (1s → 60s cap)

### Quick Start

```bash
pnpm install
pnpm build
# Copy com.streamdek.sdPlugin/ to your Stream Deck plugins folder
```

### Activation

**Option A — No Authorization (recommended)**

1. In pear-desktop, set Authorization to **"No authorization"**
2. In Streamdek, leave **"Use authentication" unchecked**
3. Add any Streamdek action to your Stream Deck layout
4. Click **Probe Connection** — Streamdek connects instantly

**Option B — With Authorization (AUTH_AT_FIRST)**

1. In pear-desktop, set Authorization to **"AUTH_AT_FIRST"**
2. In Streamdek, **check "Use authentication"**
3. Click **Connect & Authorize** — pear-desktop will show a dialog
4. Click **Allow** in pear-desktop — Streamdek connects automatically

> **No manual tokens**: Streamdek uses pear-desktop's native authorization flow. No JWT copying needed.

### Dev

```bash
pnpm test          # 111 tests, 87% coverage
pnpm test:coverage
pnpm typecheck     # tsc --noEmit
pnpm dev           # watch mode
```
