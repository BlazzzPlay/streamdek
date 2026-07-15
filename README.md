# Streamdek Controller

**Controlá pear-desktop (YouTube Music) desde tu Stream Deck.**

Streamdek Controller es un plugin para Elgato Stream Deck que ofrece control completo de medios para pear-desktop — el reproductor de escritorio de YouTube Music. Soporta acciones de teclas (Keypad) y controles de perilla (Encoder) en Stream Deck Plus.

---

## Características

### Acciones de tecla (13)
| Acción | Comportamiento |
|--------|---------------|
| **Play/Pause** | Alternar reproducción. El ícono refleja el estado actual |
| **Siguiente** | Saltar a la siguiente canción |
| **Anterior** | Reiniciar canción actual (o ir a la anterior si < 3s) |
| **Me gusta** | Like a la canción actual. El ícono muestra el estado |
| **No me gusta** | Dislike a la canción actual |
| **Aleatorio** | Activar/desactivar modo aleatorio |
| **Repetir** | Rotar modo: apagado → una → todas → apagado |
| **Adelantar** | Saltar hacia adelante (segundos configurables, default 10) |
| **Retroceder** | Saltar hacia atrás (segundos configurables, default 10) |
| **Artwork** | Mostrar carátula del álbum con texto superpuesto (template: `{title}`, `{artist}`, `{album}`) |
| **Set Volume** | Establecer volumen absoluto (0-100, configurable) |
| **Add Track** | Agregar canción a la cola por videoId |
| **Add Playlist** | Agregar playlist a la cola por playlistId |

### Acciones de perilla (Stream Deck Plus)
| Acción | Comportamiento |
|--------|---------------|
| **Volumen** | Girar: ±2 de volumen. Presionar: mute. Pantalla táctil: barra $B1 + valor |
| **Seek** | Girar: ±5s. Presionar: play/pause. Pantalla táctil: barra $B1 + posición |

### Arquitectura
- **SDK v3** con soporte `SupportedInMultiActions` y layout `$B1` para encoders
- **Sin autorización** — conexión directa, no auth: funciona con pear-desktop en modo "No authorization"
- **REST** (`/api/v1/*`) sin token para comandos
- **WebSocket** (`/api/v1/ws`) sin token para estado en tiempo real
- **StateStore** cachea el estado del reproductor desde eventos WS (volumen solo por WS debido al bug #4458)
- **ConnectionManager** maneja la máquina de estados: probe → authenticated (directo, sin auth)
- **Reconexión** con backoff exponencial (1s → 60s máximo)
- **Aislamiento de errores por acción**: cada acción muestra un ícono de advertencia al desconectarse
- **Plantillas de texto** con `{title}`, `{artist}`, `{album}` para personalizar el overlay
- **Carátula de álbum** en teclas con descarga de thumbnail y barra de progreso

---

## Inicio rápido

### Requisitos
- Node.js ≥ 20
- Stream Deck software ≥ 6.9
- pear-desktop corriendo con el plugin API Server activado en modo "No authorization"

### Compilar desde el código fuente

```bash
# Instalar dependencias
pnpm install

# Compilar el plugin
pnpm build

# Resultado: com.streamdek.controller.sdPlugin/
```

### Instalación

```bash
# Copiar el plugin a la carpeta de plugins de Stream Deck
# macOS:
cp -R com.streamdek.controller.sdPlugin ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/

# Linux:
cp -R com.streamdek.controller.sdPlugin ~/.local/share/com.elgato.StreamDeck/Plugins/

# O symlink para desarrollo:
ln -s "$(pwd)/com.streamdek.controller.sdPlugin" ~/.local/share/com.elgato.StreamDeck/Plugins/

# Reiniciar Stream Deck
streamdeck restart com.streamdek.controller.sdplugin
```

---

## Guía de activación

### 1. Activar API Server en pear-desktop

1. Abrí **pear-desktop**
2. Andá a **Configuración → API Server**
3. Activá **Enable API Server**
4. Seteá Authorization en **"No authorization"**
5. Puerto `26538` (por defecto)

### 2. Conectar Streamdek Controller

1. Arrastrá cualquier acción de Streamdek Controller a tu layout
2. Hacé clic en **Probe & Connect**
3. Streamdek se conecta instantáneamente — listo

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
│   ├── api-client.ts            # Cliente REST (sin auth)
│   ├── ws-client.ts             # Cliente WebSocket con backoff
│   ├── connection-manager.ts    # Máquina de estados: probe → authenticated
│   ├── state-store.ts           # Cache de estado del reproductor (volumen solo WS)
│   ├── logger.ts                # Wrapper de streamDeck.logger
│   ├── types.ts                 # Interfaces TypeScript + SongInfo
│   ├── template.ts              # Sistema de plantillas de texto
│   └── endpoints.ts             # Constantes de rutas de la API
├── actions/
│   ├── keypad-actions.ts        # 11 acciones de tecla
│   ├── encoder-actions.ts       # 2 acciones de perilla ($B1 layout)
│   └── artwork-action.ts        # Acción de carátula con overlay de texto
└── __tests__/                   # Suites de tests
com.streamdek.controller.sdPlugin/
├── manifest.json                # Manifiesto Stream Deck (SDK v3)
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

Streamdek Controller is an Elgato Stream Deck plugin that provides full media control for pear-desktop — the YouTube Music desktop player. Supports Keypad actions and Encoder (dial) controls on Stream Deck Plus.

### Features

| Type | Actions |
|------|---------|
| **Keypad (13)** | Play/Pause, Next Track, Previous Track, Like, Dislike, Shuffle, Repeat, Go Forward, Go Back, Artwork, Set Volume, Add Track, Add Playlist |
| **Encoder (2)** | Volume (rotate ±2, press to mute, $B1 layout), Seek (rotate ±5s, press to play/pause, $B1 layout) |

- **No authorization** — direct connection, works with pear-desktop in "No authorization" mode
- **REST API** without token for commands
- **WebSocket** without token for real-time player state
- **Auto-probe** of pear-desktop on configurable host:port
- **Per-action disconnect warnings** on both Keypad and Encoder displays
- **Exponential backoff** reconnection (1s → 60s cap)
- **Album art on keys** — fetches thumbnail from song info with optional text template overlay
- **Text templates** with `{title}`, `{artist}`, `{album}` tokens
- **Go Forward/Back** with configurable seconds
- **Add to Queue** for tracks (videoId) and playlists (playlistId)
- **SDK v3** with `SupportedInMultiActions` and `$B1` encoder layout

### Quick Start

```bash
pnpm install
pnpm build
# Copy com.streamdek.controller.sdPlugin/ to your Stream Deck plugins folder
```

### Activation

1. In pear-desktop, go to **Settings → API Server**
2. Check **Enable API Server**
3. Set Authorization to **"No authorization"**
4. Set port to `26538` (default)
5. Add any Streamdek Controller action to your Stream Deck layout
6. Click **Probe & Connect** — Streamdek connects instantly

### Dev

```bash
pnpm test          # 156 tests
pnpm test:coverage
pnpm typecheck     # tsc --noEmit
pnpm dev           # watch mode
```
