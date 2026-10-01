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

```bash
cd Front/PSAcademyFront

# 1. Instalar dependencias (usa lockfile)
npm ci

# 2. Configurar variable de entorno
cp .env.example .env
# Editar .env si tu backend corre en otro puerto

# 3. Arrancar (Vite dev server + HMR)
npm run dev
# http://localhost:5173 (puerto por defecto de Vite)
```

El backend debe estar corriendo en `http://localhost:5077` (ver `Backend/README.md`).

## Variables de entorno

| Variable | Descripción | Dónde se define |
|----------|-------------|-----------------|
| `VITE_API_URL` | URL base de la API **incluyendo `/api`** | `.env` (local) / Vercel Project Settings > Environment Variables (prod) |

> **Importante**: Vite incrusta `VITE_API_URL` en el bundle **en tiempo de build** (`import.meta.env.VITE_API_URL`). Cambiarla requiere **nuevo build + redeploy**. No se puede cambiar desde el panel de Vercel sin redesplegar.

### Desarrollo (`.env`)

```bash
VITE_API_URL=http://localhost:5077/api
```

### Producción (Vercel dashboard)

```bash
VITE_API_URL=https://psacademy-api.onrender.com/api
```

> El dominio Render real se ve en el dashboard del Web Service (`psacademy-api.onrender.com` o similar). Copiar **exactamente** ese dominio.

## Scripts disponibles

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Vite dev server con HMR |
| `npm run build` | `tsc -b && vite build` → `dist/` listo para Vercel |
| `npm run lint` | ESLint (pasa en CI) |
| `npm run preview` | Sirve `dist/` localmente para validar build |

## Despliegue en Vercel

### Opción A: Vercel CLI (una vez)

```bash
cd Front/PSAcademyFront
npm i -g vercel
vercel login
vercel --prod
# Seleccionar: Framework = Vite, Build = npm run build, Output = dist
# Añadir VITE_API_URL en Environment Variables
```

### Opción B: Git + Vercel Dashboard (recomendado)

1. Push a GitHub (este repo ya está en `https://github.com/EdiGit08/PSAcademyFront`)
2. En Vercel: **Add New > Project > Import Git Repository**
3. Framework Preset: **Vite** (se detecta solo)
4. Build Command: `npm run build` (default)
5. Output Directory: `dist` (default)
6. **Environment Variables**: añadir `VITE_API_URL=https://psacademy-api.onrender.com/api`
7. Deploy

Vercel leerá `vercel.json` y aplicará:
- Rewrites SPA (`/index.html` para rutas de React Router)
- Headers de seguridad (CSP, HSTS, cache, etc.)
- Cache largo para `/assets/*` (hash en nombre de archivo)

## CORS: el paso que a menudo se olvida

El frontend vive en `https://psacademy.vercel.app` (o tu dominio). El navegador **bloquea** las llamadas a la API si ese origen no está en la lista CORS del backend.

En **Render > Environment** del backend, declarar:

```
Cors__AllowedOrigins__0 = https://psacademy.vercel.app
```

(Si usas dominio propio en Vercel, añadir también como `__1`, `__2`…)

**Orden de despliegue seguro**:
1. Desplegar frontend con la **nueva** `VITE_API_URL`
2. Añadir el dominio Vercel a `Cors__AllowedOrigins` en Render
3. Render redeploya automáticamente (autoDeploy: true)

Así nunca queda la API sin origen válido.

## Monaco Editor: dependencia externa

`@monaco-editor/react` carga el editor desde **jsDelivr CDN** (`https://cdn.jsdelivr.net/npm/monaco-editor@.../min/vs`). El CSP en `vercel.json` ya autoriza:

```http
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
worker-src 'self' blob:;
connect-src 'self' https://*.onrender.com https://cdn.jsdelivr.net;
```

Si cambias de CDN o usas Monaco self-hosted, actualiza el CSP en `vercel.json`.

## Estructura del proyecto

```
Front/PSAcademyFront/
├── public/                 # favicon.svg, icons.svg (servidos tal cual)
├── src/
│   ├── components/         # UI reutilizable (Button, Card, Layout, etc.)
│   ├── contexts/           # AuthContext, ThemeContext
│   ├── pages/              # Login, Register, Dashboard, Workspace, Admin*
│   ├── services/
│   │   ├── api.ts          # Axios instance + interceptors + DTO mapping
│   │   └── monacoLanguages.ts
│   ├── types/              # Tipos TypeScript compartidos con API
│   ├── App.tsx             # Rutas (BrowserRouter + ProtectedRoute)
│   ├── main.tsx            # Entry point
│   └── index.css           # Tailwind + variables CSS
├── index.html              # HTML base + script tema oscuro pre-paint
├── vercel.json             # Rewrites + Headers + Build config
├── vite.config.ts          # Plugins: react(), tailwindcss()
├── tsconfig.json           # Project references
├── tsconfig.app.json       # App config (ES2023, bundler)
├── eslint.config.js        # Flat config + React Compiler
├── package.json
├── .env.example            # Documentación de variables
├── .env.production.example # Valores típicos de producción
└── .gitignore              # Ignora .env, .env.*, dist, node_modules
```

## Rutas (React Router)

| Ruta | Componente | Auth | Notas |
|------|------------|------|-------|
| `/` | Redirect → `/dashboard` | ✅ | |
| `/login` | LoginPage | ❌ | |
| `/register` | RegisterPage | ❌ | 1er usuario = Admin |
| `/dashboard` | DashboardPage | ✅ | Catálogo categorías/ejercicios |
| `/workspace/:exerciseId` | WorkspacePage | ✅ | Editor Monaco + ejecución |
| `/admin` | AdminLayout + hijos | ✅ Admin | CRUD categorías/ejercicios |
| `*` | Redirect → `/dashboard` | — | Catch-all |

## Autenticación en el front

- Token JWT en `localStorage` (`psacademy.token`)
- Usuario en `localStorage` (`psacademy.user`)
- Interceptor Axios inyecta `Authorization: Bearer <token>`
- 401 en ruta no pública → limpia storage + redirect a `/login`
- `isAdmin()` normaliza rol (`admin`/`Admin`) para UI

## Ejecución de código (Piston)

`WorkspacePage` → `executeCode()` → `POST /api/exercises/{id}/execute` → backend → Piston.

El front **no** habla con Piston directamente; todo pasa por la API (oculta credenciales, rate limiting, timeouts).

## Tailwind CSS v4

Se usa el plugin oficial Vite (`@tailwindcss/vite`). No hay `tailwind.config.js` ni `postcss.config.js`: la configuración vive en CSS (`@import "tailwindcss";` en `index.css`).

## Lint / Formato

- ESLint 10 flat config (`eslint.config.js`)
- React Compiler activado (`babel-plugin-react-compiler`)
- `npm run lint` pasa en CI (GitHub Actions, Vercel, etc.)
- No hay Prettier: ESLint maneja formato via `eslint-plugin-format` o reglas nativas

## Problemas conocidos / FAQ

| Síntoma | Causa | Solución |
|---------|-------|----------|
| "Failed to fetch" / CORS error | Dominio Vercel no en `Cors__AllowedOrigins` backend | Añadir en Render y redespelgar |
| Editor Monaco no carga | CSP bloquea jsDelivr / red sin internet | Verificar `connect-src` / `script-src` en `vercel.json` |
| `VITE_API_URL` no aplica | Cambiaste en Vercel pero **no redesplegaste** | Vercel inyecta envs en build; hacer *Redeploy* |
| 401 al ejecutar código | Token expirado (60 min) | El interceptor limpia y redirige a `/login` |
| Build falla en Vercel | `package-lock.json` desincronizado | `npm ci` local, commit lockfile, push |

## Licencia

Uso educativo interno. Sin licencia de distribución.