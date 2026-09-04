# SegundaVida · Aldea Pucela

SegundaVida es una aplicación web y una Mini App de Telegram para que las
personas de Valladolid compartan gratis objetos que ya no necesitan. Su
objetivo es alargar la vida útil de las cosas y facilitar que encuentren una
nueva casa dentro de la comunidad de Aldea Pucela.

- Aplicación: [segundavida.aldeapucela.org](https://segundavida.aldeapucela.org/)
- Mini App: [t.me/pucelobot/segundavida](https://t.me/pucelobot/segundavida)
- Código: [github.com/aldeapucela/segundavida](https://github.com/aldeapucela/segundavida)

El repositorio contiene el frontend estático, el generador de fichas públicas,
los contratos de integración y los workflows importables de n8n. La aplicación
no utiliza un framework ni necesita un proceso de compilación.

## Funcionalidades

### Explorar y encontrar objetos

- Catálogo público de objetos disponibles, ordenado por fecha de publicación.
- Búsqueda por texto y filtros por categoría.
- Favoritos guardados en el navegador, disponibles sin iniciar sesión.
- Fichas individuales con descripción, estado del objeto, zona aproximada,
  persona que lo ofrece, disponibilidad y hasta dos fotografías.
- Perfiles públicos (`/u/<username>/`) con todas las publicaciones de una
  persona, incluidas las entregadas, y acceso al formulario de reporte.
- URLs públicas estables (`/i/<public_id>/`) con metadatos para buscadores y
  redes sociales.
- Navegación interna con rutas reales: `/ofrecer/`, `/perfil/`, `/u/<username>/`
  y la ruta reservada `/favoritos/`; las vistas de gestión no se indexan y los
  perfiles públicos sí.
- Diseño responsive, navegación atrás/adelante, tema claro/oscuro y soporte
  para el modo Mini App de Telegram.

### Ofrecer un objeto

La publicación se realiza dentro de Telegram para validar la identidad de la
persona. El formulario permite indicar título, categoría, zona aproximada,
estado del objeto (`Como nuevo`, `Bueno`, `Aceptable` o `Roto`), descripción y
duración de la publicación (7, 14 o 30 días), además de adjuntar entre una y
dos fotos. Las imágenes se validan y optimizan en el navegador antes de
enviarse.

Antes de publicar se solicita el consentimiento para hacer visible el
contenido, facilitar el contacto y ofrecer el objeto gratis. El backend valida
de nuevo la identidad, los datos y las condiciones de moderación.

### Contacto y gestión

- El botón **Me interesa** abre el chat de Telegram de quien ofrece el objeto
  con un mensaje preparado y el enlace de la ficha.
- **Mis publicaciones** permite consultar publicaciones activas y entregadas.
- La persona propietaria puede marcar un objeto como entregado o volver a
  publicarlo si sigue disponible.
- La persona propietaria puede borrar una publicación con confirmación. El
  borrado la oculta de la plataforma sin marcarla como entregada.
- La persona propietaria puede editar en línea el título, la descripción, la
  categoría, el estado del objeto, la zona y las fotos de una publicación
  disponible. Los cambios pasan por la misma moderación automática que una
  publicación nueva.
- Los administradores pueden editar esos mismos campos en cualquier ficha
  visible, aunque pertenezca a otra persona, conservando su estado de
  disponibilidad y pasando también por moderación.
- Las publicaciones sin nombre de usuario público se mantienen visibles, pero
  no habilitan el contacto directo.

## Arquitectura

La aplicación se divide en tres piezas:

1. **Frontend estático**: `index.html`, `404.html`, `css/` y `js/`. Se puede
   servir desde GitHub Pages o desde cualquier servidor HTTP estático.
2. **Backend de integración**: n8n expone los endpoints públicos y protegidos,
   valida `Telegram.WebApp.initData` y aplica las reglas de publicación.
3. **Persistencia**: NocoDB almacena los objetos, su estado físico
   (`condition`), el estado de disponibilidad (`status`), las fotografías y
   los datos operativos privados.

El catálogo público solo recibe una proyección segura de los datos. Los
identificadores de Telegram, chats, hilos, mensajes y credenciales permanecen
en n8n/NocoDB y nunca se incrustan en las fichas públicas.

## Instalación local

No hay dependencias de Node ni paquetes que instalar. Hace falta Python 3 para
levantar un servidor HTTP local:

```bash
git clone https://github.com/aldeapucela/segundavida.git
cd segundavida
python3 scripts/serve_static.py 8000
```

Abre [http://localhost:8000/](http://localhost:8000/) en el navegador. El
frontend usa por defecto los endpoints de producción definidos en
[`js/api.js`](js/api.js), por lo que esta instalación sirve para revisar la
interfaz y consultar el catálogo existente. Para una instalación independiente
hay que sustituir esas URLs por las de la instancia propia de n8n.

El servidor local incluye el fallback necesario para que las rutas profundas,
como `/u/<username>/` y `/i/<public_id>/`, también funcionen al recargar la
página. En producción, el `404.html` cumple esa misma función en el hosting
estático.

## Replicar la aplicación

### 1. Preparar NocoDB

Importa [`data/sv_items.csv`](data/sv_items.csv) y configura la tabla y sus
campos según [`docs/nocodb.md`](docs/nocodb.md). El CSV contiene únicamente las
cabeceras: no incluye objetos de ejemplo.

El identificador público debe ser aleatorio, estable y opaco (`public_id`). No
se debe construir a partir de un identificador de Telegram, chat, timestamp ni
otro dato privado.

### 2. Preparar n8n y Telegram

Importa y activa los workflows JSON de `docs/` para estos endpoints. Para
publicar con fotografías, utiliza el workflow de fotos:

| Endpoint | Función | Workflow |
| --- | --- | --- |
| `GET /segundavida/data` | Catálogo público | Configuración descrita en [`docs/nocodb.md`](docs/nocodb.md) |
| `GET /segundavida/item/<public_id>` | Ficha pública individual | [`sv_get_item.workflow.json`](docs/sv_get_item.workflow.json) |
| `POST /segundavida/whoami` | Validación de identidad Telegram | [`sv_validate_telegram_user.workflow.json`](docs/sv_validate_telegram_user.workflow.json) |
| `POST /segundavida/publish` | Publicación con fotos y consentimiento | [`sv_publish_item_photos.workflow.json`](docs/sv_publish_item_photos.workflow.json) |
| `POST /segundavida/edit` | Edición inline autenticada y moderada de publicaciones propias o gestionadas por administración | [`sv_edit_item.workflow.json`](docs/sv_edit_item.workflow.json) |
| `POST /segundavida/mine` | Publicaciones de la persona autenticada | [`sv_mine_items.workflow.json`](docs/sv_mine_items.workflow.json) |
| `POST /segundavida/complete` | Reservar, liberar, marcar entregado, reabrir u ocultar | [`sv_complete_item.workflow.json`](docs/sv_complete_item.workflow.json) |
| `POST /segundavida/interaction` | Incrementar interés, intento de contacto o contador aproximado de corazones | [`sv_record_interaction.workflow.json`](docs/sv_record_interaction.workflow.json) |

Configura en n8n la credencial de NocoDB y la variable privada
`TELEGRAM_BOT_TOKEN`. El token nunca debe guardarse en este repositorio, en el
frontend ni en NocoDB. Los nodos de código que validan Telegram necesitan el
módulo `crypto` habilitado en instalaciones self-hosted.

Los workflows importables y sus instrucciones detalladas están en:

- [`docs/auth.md`](docs/auth.md): autenticación y validación de Telegram.
- [`docs/publish.md`](docs/publish.md) y
  [`docs/publish-photos.md`](docs/publish-photos.md): publicación y fotos.
- [`docs/complete.md`](docs/complete.md): entrega y reapertura.
- [`docs/reservations.md`](docs/reservations.md): reservas configurables y caducidad automática.
- [`docs/nocodb.md`](docs/nocodb.md): modelo de datos y contrato público.

### 3. Configurar el frontend

Actualiza en [`js/api.js`](js/api.js) las URLs de catálogo, ficha, publicación,
gestión y entrega. Actualiza también en [`js/telegram.js`](js/telegram.js) el
enlace de la Mini App del bot. El dominio propio debe estar incluido en los
orígenes permitidos de los webhooks de n8n.

El frontend no necesita variables de entorno ni secretos. Los datos sensibles
se validan exclusivamente en el backend.

### 4. Publicar los archivos estáticos

Sube la raíz del repositorio a GitHub Pages, a otro hosting estático o a un
servidor HTTP. `CNAME` contiene el dominio usado por la instalación actual.

Las fichas indexables se generan con
[`scripts/generate_static_pages.py`](scripts/generate_static_pages.py):

```bash
python3 scripts/generate_static_pages.py \
  --source-url https://api.aldeapucela.org/segundavida/data?scope=all \
  --output-dir generated-site \
  --site-url https://segundavida.example \
  --mode full
```

El generador crea las rutas `/i/<public_id>/`, `sitemap.xml`, `feed.xml`,
`robots.txt` y un `404.html` de fallback. El feed RSS contiene las mismas
publicaciones públicas que las fichas estáticas y está disponible en
`/feed.xml`. La salida generada no se versiona; el workflow de GitHub Actions
la prepara como artefacto y la publica en GitHub Pages. Puede
ejecutarse manualmente o con la programación incluida en
[`.github/workflows/generate-static-pages.yml`](.github/workflows/generate-static-pages.yml).

El workflow parte del último artefacto generado y usa el modo incremental por
defecto en las ejecuciones disparadas por publicación. Conserva las fichas sin
cambios, añade las nuevas, actualiza solo los metadatos sociales editados y
elimina las ocultas. Los estados `reserved`, `completed` y `expired` se
hidratan desde `/item/<id>` y no fuerzan una reescritura del HTML.

Para reparar o migrar todas las fichas, ejecuta manualmente el workflow con
`force_full=true`. La fuente debe incluir siempre `scope=all`; la respuesta
ligera de la portada no puede utilizarse para podar el sitio.

Para usar otra fuente de datos en GitHub Actions, define la variable de
repositorio `SEGUNDAVIDA_PUBLIC_ITEMS_URL` o proporciona `source_url` al lanzar
el workflow. El workflow añade `scope=all` a las fuentes que no lo incluyen.

## Configuración opcional

La analítica utiliza Matomo para medir navegación agregada sin enviar datos
personales. La configuración está documentada en [`docs/analytics.md`](docs/analytics.md).
El sistema visual y las decisiones de accesibilidad se describen en
[`docs/design-system.md`](docs/design-system.md).

## Seguridad, privacidad y límites

- La consulta del catálogo y el contacto son públicos; publicar y gestionar
  objetos requiere una identidad Telegram validada por n8n. El contacto directo
  solo está disponible cuando la persona oferente tiene nombre de usuario
  público.
- La zona es aproximada: no se publican direcciones exactas.
- No se almacenan tokens ni sesiones persistentes en el navegador.
- No hay mensajería interna: el contacto se realiza en Telegram. Las reservas
  son manuales, visibles públicamente y caducan según la duración elegida.
- Las publicaciones deben ofrecer objetos legales, seguros, propios y sin
  contraprestación. La moderación puede retirar contenido que incumpla las
  condiciones de la comunidad.
- El texto y las fotografías compartidos se publican bajo
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es).

El código de la aplicación se distribuye bajo
[GNU AGPL-3.0](LICENSE). El contenido aportado por las personas usuarias se
gestiona según la licencia indicada en el formulario de publicación.
