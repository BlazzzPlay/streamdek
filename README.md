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
- **REST** (`/api/v1/*`) con autenticación JWT Bearer para comandos
- **WebSocket** (`/ws`) con JWT en el primer frame para estado en tiempo real
- **StateStore** cachea el estado del reproductor desde eventos WS (volumen solo por WS debido al bug #4458)
- **ConnectionManager** auto-detecta pear-desktop, maneja la máquina de estados con reconexión exponencial (1s → 60s máximo)
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
5. Hacé clic en **Generate Token** para crear un JWT

### 2. Configurar Streamdek

1. Abrí la aplicación Stream Deck
2. Arrastrá cualquier acción de Streamdek a tu layout
3. El **Property Inspector** se abre automáticamente
4. Hacé clic en **Auto-Discover** para detectar pear-desktop
5. Pegá tu token JWT en el campo correspondiente
6. Hacé clic en **Save Settings**

El plugin se conecta automáticamente y muestra el estado del reproductor en los botones.

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

- **REST API** with JWT Bearer auth for commands
- **WebSocket** with JWT first-frame auth for real-time player state
- **Auto-discovery** of pear-desktop on localhost:26538
- **Per-action disconnect warnings** on both Keypad and Encoder displays
- **Exponential backoff** reconnection (1s → 60s cap)

### Quick Start

```bash
pnpm install
pnpm build
# Copy com.streamdek.sdPlugin/ to your Stream Deck plugins folder
```

### Activation

1. Enable **API Server** in pear-desktop settings
2. Generate a JWT token
3. Add any Streamdek action to your Stream Deck layout
4. Use **Auto-Discover** in the Property Inspector and paste your token

### Dev

```bash
pnpm test          # 111 tests, 87% coverage
pnpm test:coverage
pnpm typecheck     # tsc --noEmit
pnpm dev           # watch mode
```
