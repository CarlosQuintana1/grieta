# Colaborar en Grieta

## Acceso al repo

El repo es privado: `https://github.com/CarlosQuintana1/grieta`.

1. El dueño agrega la cuenta de GitHub de JP como colaborador desde **Settings → Collaborators**. JP acepta la invitación.
2. JP instala Git, Node.js y npm. Para cambios en `modelo/`, también Python 3.
3. JP clona el repo:

   ```sh
   git clone https://github.com/CarlosQuintana1/grieta.git
   cd grieta
   ```

4. En Codex, JP abre esa carpeta como proyecto con su propia cuenta. No necesita la cuenta de Codex del dueño.
5. Antes de trabajar, pide a Codex que lea este archivo y el issue asignado. El dueño crea las tareas como issues de GitHub con alcance, archivos, verificación y criterio de terminado.

No se comparten contraseñas, tokens, claves, archivos `.env` ni sesiones personales. `AGENTS.md`, `CONTEXTO.md` y `TAREAS.md` son archivos locales excluidos de Git; no se envían al repo. Este archivo contiene las reglas técnicas compartibles.

## Trabajo con Codex

- Trabajar solo en el issue asignado; no agregar funciones o rediseños por iniciativa propia.
- Crear una rama por tarea, por ejemplo `jp/ajustes-accesibles`.
- No hacer push directo a `main`. Al terminar, crear un pull request para que el dueño lo revise y lo integre.
- Commits de una línea en español, sin `Co-Authored-By`.
- No publicar a producción desde un pull request ni desde una rama.
- Seguir el sistema de diseño de Figma: https://spring-beluga-34867594.figma.site. Menos elementos y efectos; no usar degradados, sombras, emojis como iconos, tarjetas anidadas ni acordeones. No quitar datos centrales de comparación (precios, opción más barata, ahorro, tiempo adicional y llegada).

Prompt inicial para Codex:

```text
Lee COLABORAR.md y el issue que te asigné. Trabaja solo en ese alcance, en una rama propia. Antes de editar, revisa la pantalla actual y compárala con Figma. Al terminar, ejecuta solo las verificaciones que pide el issue, resume resultados y deja una rama lista para pull request. No publiques.
```

## Comandos de desarrollo

Ejecutar solo los pasos de la parte que se esté modificando.

```sh
# Demo web
python3 -m http.server 8791 --bind 127.0.0.1 --directory demo

# API
cd api && npm ci
SQLITE=/tmp/grieta.sqlite UPLOADS=/tmp/grieta-uploads PORT=3000 npm start
cd api && npm test

# Captura
cd captura && npm ci
npm run dev
npm run build
npm run lint

# Modelo
cd modelo && python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python exportar_demo.py

# Sintaxis de la demo
node --check demo/app.js && node --check demo/grieta.js
```

## Publicar la app

La publicación se hace desde `main`, después de integrar y revisar el pull request. El dueño decide cuándo se publica. Si autoriza a JP a publicar, le asigna acceso individual y limitado a los recursos de producción; JP inicia sesión con sus propias cuentas de Azure y Cloudflare. No se copian claves ni tokens.

```sh
git switch main
git pull --ff-only
./scripts/publicar-app.sh
```

El script pide confirmar la versión y publica la API y `demo/` en Azure App Service, Azure Storage y Cloudflare Pages. Requiere `az` autenticado con permisos de despliegue en los recursos de Grieta, acceso de escritura al contenedor `$web` mediante inicio de sesión, y Wrangler autenticado con permiso para desplegar el proyecto Pages `grieta-demo`. Si falta un permiso, detenerse y pedir al dueño que asigne acceso; no pedirle su contraseña ni una clave.

Después del despliegue, comprobar que los tres sitios sirven la misma versión `grieta-N` y que `/api/salud` responde `200`. Si un sitio conserva la versión anterior, no dar la publicación por terminada.

La app de captura tiene su propio despliegue. Solo cuando el issue lo incluya y el dueño lo autorice:

```sh
cd captura && npm run deploy
```

Este comando publica el Worker de captura en Cloudflare y requiere permisos separados. Nunca ejecutar `wrangler d1 execute --remote` sin instrucciones explícitas del dueño.
