# PSAcademy Front — React 19 + Vite 8

SPA de la plataforma PSAcademy. Despliegue en **Vercel**.

## Stack

| Capa | Tecnología | Versión |
|------|------------|---------|
| Framework | React | 19.2 |
| Build | Vite | 8.3 |
| Lenguaje | TypeScript | 6.0 |
| Estilos | Tailwind CSS | 4.3 (via `@tailwindcss/vite`) |
| Router | React Router | 7.18 |
| HTTP | Axios | 1.20 |
| Editor código | Monaco Editor | 4.7 (`@monaco-editor/react`) |
| Lint | ESLint | 10 + React Compiler (babel-plugin-react-compiler) |

## Arquitectura de despliegue

```
┌─────────────────────────────────────────────────────────────┐
│ Vercel (Static + Edge)                                      │
│  ├─ Build: `npm ci && npm run build` → `dist/`             │
│  ├─ Rewrites: `/(.*)` → `/index.html` (SPA fallback)       │
│  ├─ Headers: CSP, HSTS, cache, security                    │
│  └─ Env: `VITE_API_URL` inyectada en build                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ HTTPS
                    ┌───────────────┐
                    │ Render API    │
                    │ /api/*        │
                    └───────────────┘
```

## Requisitos previos

- Node 20+ (LTS)
- npm 10+ (incluido con Node)

## Desarrollo local

```powershell
cd Front\PSAcademyFront

# 1. Instalar dependencias (usa el lockfile)
npm ci

# 2. Variable de entorno
Copy-Item .env.example .env
# Edita .env si tu backend corre en otro puerto

# 3. Arrancar (Vite dev server + HMR)
npm run dev
# http://localhost:5173 (puerto por defecto de Vite)
```

El backend debe estar corriendo en `http://localhost:5077` (ver `Back/PSAcademyBack/README.md`).

## Variables de entorno

| Variable | Descripción | Dónde se define |
|----------|-------------|-----------------|
| `VITE_API_URL` | URL base de la API **incluyendo `/api`** | `.env` (local) / Vercel > Environment Variables (prod) |

> **Importante**: Vite incrusta `VITE_API_URL` en el bundle **en tiempo de build** (`import.meta.env.VITE_API_URL`). Cambiarla requiere **nuevo build + redeploy**.

### Desarrollo (`.env`)

```bash
VITE_API_URL=http://localhost:5077/api
```

### Producción (Vercel dashboard)

```bash
VITE_API_URL=https://psacademy-api.onrender.com/api
```

> Copia **exactamente** el dominio que muestra el dashboard del Web Service de Render.

## Scripts disponibles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Vite dev server con HMR |
| `npm run build` | `tsc -b && vite build` → `dist/` listo para Vercel |
| `npm run lint` | ESLint |
| `npx tsc -b --noEmit` | Comprobación de tipos sin generar archivos |
| `npm run preview` | Sirve `dist/` localmente para validar el build |

Antes de cada commit: `npx tsc -b --noEmit` y `npm run lint` deben pasar sin errores.

## Despliegue en Vercel

### Opción A: Vercel CLI (una vez)

```bash
cd Front/PSAcademyFront
npm i -g vercel
vercel login
vercel --prod
# Framework = Vite, Build = npm run build, Output = dist
# Añadir VITE_API_URL en Environment Variables
```

### Opción B: Git + Vercel Dashboard (recomendado)

1. Push a GitHub (repo: `https://github.com/EdiGit08/PSAcademyFront`).
2. En Vercel: **Add New > Project > Import Git Repository**.
3. Framework Preset: **Vite** (se detecta solo).
4. Build Command: `npm run build`. Output Directory: `dist`.
5. **Environment Variables**: añadir `VITE_API_URL=https://psacademy-api.onrender.com/api`.
6. Deploy.

Vercel lee `vercel.json` y aplica rewrites SPA, headers de seguridad (CSP, HSTS, etc.) y cache largo para `/assets/*`.

## CORS: el paso que a menudo se olvida

El navegador **bloquea** las llamadas a la API si el origen del front no está en la lista CORS del backend.

En **Render > Environment** del backend:

```
Cors__AllowedOrigins__0 = https://psacademy.vercel.app
```

(Con dominio propio en Vercel, añadirlo también como `__1`, `__2`…). Sin barra final.

**Orden de despliegue seguro**:
1. Desplegar el frontend con la `VITE_API_URL` nueva.
2. Añadir el dominio de Vercel a `Cors__AllowedOrigins` en Render.
3. Render redespliega automáticamente.

Después de desplegar, abre el front, F12 > Network: no debe haber errores de CORS ni redirecciones 308.

## Monaco Editor: dependencia externa

`@monaco-editor/react` carga el editor desde **jsDelivr CDN**. El CSP de `vercel.json` ya lo autoriza:

```http
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
worker-src 'self' blob:;
connect-src 'self' https://*.onrender.com https://cdn.jsdelivr.net;
```

Si cambias de CDN o usas Monaco autoalojado, actualiza el CSP en `vercel.json`.

## Estructura del proyecto

```
Front/PSAcademyFront/
├── public/                 # favicon.svg, icons.svg (servidos tal cual)
├── src/
│   ├── components/         # NotificationBell, SubmissionsPanel, ThemeToggle, ConceptCard, ...
│   ├── contexts/           # AuthContext, ThemeContext
│   ├── hooks/              # useNotifications, useSessionActivity
│   ├── monaco/             # Configuración del editor para PSeInt
│   ├── pages/              # Login, Register, Dashboard, Tutorial, Workspace, Admin*
│   ├── services/
│   │   ├── api.ts          # Axios + interceptores (401 → refresh) + mapeo de DTOs
│   │   └── monacoLanguages.ts
│   ├── types/              # Tipos TypeScript compartidos con la API
│   ├── App.tsx             # Rutas (BrowserRouter + ProtectedRoute)
│   ├── main.tsx            # Entry point
│   └── index.css           # Tailwind + variables CSS
├── index.html              # HTML base + script de tema oscuro pre-paint
├── vercel.json             # Rewrites + Headers + Build config
├── vite.config.ts          # Plugins: react(), tailwindcss()
├── tsconfig.json           # Project references
├── tsconfig.app.json       # Config de la app (ES2023, bundler)
├── eslint.config.js        # Flat config + React Compiler
├── package.json
├── .env.example            # Documentación de variables
├── .env.production.example # Valores típicos de producción
└── .gitignore              # Ignora .env, .env.*, dist, node_modules
```

## Rutas (React Router)

| Ruta | Componente | Auth | Notas |
|------|------------|------|-------|
| `/` | Redirect → `/dashboard` | Sí | |
| `/login` | LoginPage | No | |
| `/register` | RegisterPage | No | 1er usuario = Admin |
| `/dashboard` | DashboardPage | Sí | Catálogo de categorías y ejercicios, con el estado de cada uno |
| `/workspace/:exerciseId` | WorkspacePage | Sí | Editor Monaco + ejecución |
| `/admin` | AdminLayout + hijos | Admin | Categorías/ejercicios y bandeja de envíos |
| `*` | Redirect → `/dashboard` | — | Catch-all |

## Autenticación en el front

- El front guarda el access token (JWT) y el refresh token en `localStorage`; los nombres de las claves están en `src/services/api.ts`.
- El interceptor de Axios inyecta `Authorization: Bearer <token>`.
- Ante un **401** en una ruta no pública, el interceptor intenta **renovar el token una vez** (`/auth/refresh`) y repite la petición original. Si varias peticiones fallan a la vez, comparten un único refresh.
- La renovación se **sincroniza entre pestañas**, para que dos pestañas no usen el mismo refresh token a la vez (el backend lo rota y revoca el anterior).
- Si el refresh falla, se limpia la sesión y se redirige a `/login`.
- `isAdmin()` normaliza el rol (`admin`/`Admin`) para la UI.

## Ejecución de código y calificación

`WorkspacePage` → `executeCode()` → `POST /api/exercises/{id}/execute` → backend → Piston.

El front **no** habla con Piston directamente: todo pasa por la API (oculta credenciales, rate limiting, timeouts).

- **Tutorial**: se autocorrige; el último paso completa la lección.
- **Ejercicios normales**: al acertar la salida, la solución se envía a calificación en la misma llamada (no hay segundo botón). El ejercicio queda en "Esperando calificación" y **solo ese ejercicio** no admite otro envío hasta que el profesor responda; el resto de la plataforma se usa con normalidad.
- Cuando el profesor califica, el alumno recibe una notificación en la campana (`NotificationBell`, contador desde la cabecera `X-Unread-Count`). Si se devuelve con comentario, el Workspace muestra qué corregir y se puede reenviar.

### Estados de un ejercicio

El tipo `ProgressStatus` (`src/types`) es `'attempted' | 'completed' | 'pendingReview' | 'incorrect'`.

El backend manda el estado **en minúscula** (`"pendingreview"`), así que `api.ts` lo pasa por `normalizeStatus()` al mapear los DTOs y al leer la respuesta de `/execute`. Cualquier pantalla nueva que lea un estado debe usar el valor ya normalizado. Si se añade un estado nuevo en el backend, hay que añadirlo también en `normalizeStatus` y en la tabla `STATUS_STYLES` del Dashboard.

## Tailwind CSS v4

Se usa el plugin oficial de Vite (`@tailwindcss/vite`). No hay `tailwind.config.js` ni `postcss.config.js`: la configuración vive en CSS (`@import "tailwindcss";` en `index.css`).

## Lint / Formato

- ESLint 10 con flat config (`eslint.config.js`).
- React Compiler activado (`babel-plugin-react-compiler`).
- No hay Prettier.

## Problemas conocidos / FAQ

| Síntoma | Causa | Solución |
|---------|-------|----------|
| Pantalla negra al volver al dashboard tras enviar una solución | Un estado llegó con un formato que la UI no conoce (p. ej. `pendingreview` en minúscula) y un componente falló al pintarse | Normalizar con `normalizeStatus()` en `api.ts`; en el Dashboard, acceder a `STATUS_STYLES[...]?.label` con `?.` |
| La pantalla se pone negra y la pestaña Network no muestra errores | Error de JavaScript al renderizar, no de red | Abrir F12 > **Console**: el error en rojo señala el archivo y la línea |
| "Failed to fetch" / error de CORS | Dominio de Vercel no está en `Cors__AllowedOrigins` del backend | Añadirlo en Render y redesplegar |
| Editor Monaco no carga | CSP bloquea jsDelivr o no hay red | Verificar `connect-src` y `script-src` en `vercel.json` |
| `VITE_API_URL` no aplica | Se cambió en Vercel pero no se redesplegó | Hacer *Redeploy* (Vercel inyecta las variables en el build) |
| Me manda a `/login` de repente | El refresh token expiró (14 días) o fue revocado | Iniciar sesión de nuevo |
| 502 al ejecutar código | Piston caído o `Piston__BaseUrl` mal configurada en el backend | Ver `Back/PSAcademyBack/README.md` |
| Build falla en Vercel | `package-lock.json` desincronizado | `npm ci` local, commit del lockfile, push |

## Licencia

Uso educativo interno. Sin licencia de distribución.