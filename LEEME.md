# Mis Finanzas

App de finanzas personales para tus clientes. Funciona sin internet y guarda los datos solo en el dispositivo de cada cliente.

## Publicarla en GitHub Pages

1. En GitHub, crea un repositorio nuevo y público (por ejemplo, `mis-finanzas`).
2. Pulsa **Add file → Upload files** y arrastra **todo el contenido** de esta carpeta, incluidas las carpetas `fonts` e `icons`. No hace falta subir este LEEME.
3. Pulsa **Commit changes**.
4. Ve a **Settings → Pages** y elige **Branch: main** y **/ (root)**. Guarda.
5. En uno o dos minutos la app estará en `https://jorgehernangro-maker.github.io/mis-finanzas/`. Ese es el enlace que mandas a los clientes.

La app tiene que estar en una dirección **https**. Si abres el `index.html` directamente desde tu ordenador, funciona, pero no se puede instalar ni usar sin conexión.

## Instalarla (lo que hace el cliente)

- **iPhone:** abrir el enlace en Safari → botón Compartir → «Añadir a pantalla de inicio». Hay que instalarla así, porque si se usa solo desde Safari, iOS puede borrar los datos tras unos días sin abrirla.
- **Android:** abrir el enlace en Chrome → «Instalar app» (o menú ⋮ → «Añadir a pantalla de inicio»).
- **Windows / Mac:** abrir el enlace en Chrome o Edge → icono de instalar en la barra de direcciones. También funciona como página web normal.

## Publicar una versión nueva

Sube los archivos cambiados y, en `sw.js`, cambia el número de `VERSION` (por ejemplo, `mf-v1.0.1`). Los clientes verán «Hay una versión nueva» en Inicio. Al actualizar no pierden sus datos.

## Archivos

- `index.html`, `styles.css`, `app.js`: la app.
- `sw.js`: hace que funcione sin conexión.
- `manifest.webmanifest`, `icons/`: nombre e iconos al instalarla.
- `fonts/`: tipografía Montserrat incluida, para que se vea igual sin internet.
