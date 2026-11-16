# RFA — Roll For Ambience

Reproductor gratuito de música para D&D con fundido cruzado, carpetas de campaña, buscador y soundboard táctil para Android, listo para GitHub Pages.

## Por qué no funciona con Live Server en el `index.html` raíz

Este proyecto está hecho con **React + TypeScript + Vite**. El archivo `index.html` de la raíz apunta al código fuente (`/src/main.tsx`), y los navegadores no pueden ejecutar archivos `.tsx` directamente sin compilarlos primero con Vite. Además, los módulos ES (`type="module"`) tampoco se ejecutan abriendo el archivo con doble clic (`file://`).

## Cómo abrirlo en Visual Studio Code

Necesitas tener instalado **Node.js** (versión 18 o superior). Abre la terminal integrada de VS Code (`Ctrl + ñ` o menú `Terminal > Nuevo terminal`) dentro de la carpeta del proyecto y ejecuta:

1. Instalar dependencias (solo la primera vez):
   ```bash
   npm install
   ```

2. Arrancar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   Luego abre en tu navegador `http://localhost:3000`.

### Si quieres usar VS Code Live Server
1. Ejecuta primero la compilación estática:
   ```bash
   npm run build
   ```
2. Esto genera la carpeta **`dist/`** con el HTML, JS y CSS ya compilados.
3. Haz clic derecho sobre **`dist/index.html`** y elige **Open with Live Server** (o ejecuta `npm run preview`).

## Cómo publicarlo gratis en GitHub Pages

### Opción 1: Automática con GitHub Actions (recomendada, sin compilar en tu PC)
1. Sube todo el proyecto (asegurándote de incluir la carpeta oculta `.github/workflows/deploy.yml`) a un repositorio en GitHub en la rama `main` (o `master`).
2. En tu repositorio de GitHub, ve a **Settings → Pages**.
3. En **Build and deployment → Source**, selecciona **GitHub Actions**.
4. GitHub instalará dependencias, compilará la app y te dará tu URL `https://tu-usuario.github.io/tu-repo/` lista para abrir e instalar en Android.

### Opción 2: Subiendo solo la carpeta compilada `dist/`
Si prefieres usar **Deploy from a branch** en GitHub Pages en lugar de GitHub Actions:
1. Ejecuta `npm install` y `npm run build` en tu PC.
2. Sube el **contenido interior de la carpeta `dist/`** (donde están `index.html`, `assets/`, `sw.js`, etc.) a la raíz de tu repositorio o rama `gh-pages`.
