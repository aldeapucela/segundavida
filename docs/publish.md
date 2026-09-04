# Publicar un objeto desde Telegram

El formulario exige al menos una foto y acepta hasta dos. Las selecciones sucesivas se acumulan,
se pueden quitar individualmente y se redimensionan en el navegador antes de
enviarse. El contrato completo de la subida y la modificación del workflow de
n8n está en [`publish-photos.md`](./publish-photos.md).

## Workflow de n8n

Importa [`sv_publish_item_photos.workflow.json`](./sv_publish_item_photos.workflow.json)
en n8n. Es el workflow operativo para crear una fila en `sv_items`, validar el
contenido y subir hasta dos fotos mediante la credencial existente
`NocoDB Token account`.

Antes de activarlo:

1. Configurar una variable privada de proyecto llamada `TELEGRAM_BOT_TOKEN` con
   el valor actual del token de `Pucelo Bot` (o la variable de entorno con ese
   nombre). El token solo debe existir dentro de n8n; no se debe guardar en
   este repositorio ni en el navegador.
2. Confirmar que el nodo `Create NocoDB row` conserva la credencial y la tabla
   `Segunda Vida`.
3. En NocoDB, crear estos campos en `sv_items` antes de activar el workflow:
   `condition` (SingleSelect con `Como nuevo`, `Bueno`, `Aceptable` y `Roto`),
   `consent_accepted` (Checkbox), `consent_version` (SingleLineText) y
   `consent_at` (DateTime).
4. Activar el workflow.

El endpoint de producción será:

```text
POST https://tasks.nukeador.com/webhook/segundavida/publish
```

El contenido lógico que envía el frontend tiene esta forma dentro del campo
multipart `payload`:

```json
{
  "initData": "<Telegram.WebApp.initData>",
  "item": {
    "public_id": "k2vT7M4mX9qL3aBc",
    "title": "Mesa auxiliar",
    "category": "Hogar",
    "zone": "Delicias - Canterac",
    "condition": "Bueno",
    "description": "En buen estado.",
    "duration_days": 14
  },
  "consent": {
    "accepted": true,
    "version": "sv-publish-2026-08-17-v3"
  }
}
```

La identidad se valida con el HMAC de `initData`; no se confía en
`initDataUnsafe`, en un `telegram_id` enviado por el navegador ni en una
cabecera que el cliente pueda falsificar. `owner_telegram_id` se guarda solo en
NocoDB y no se devuelve al catálogo público.

El workflow también exige el consentimiento explícito, comprueba su versión y
genera `consent_at` en n8n. La fecha no se acepta desde el navegador.
El consentimiento informa además de que el texto y las fotos compartidos se
publican bajo la licencia [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es)
y de que deben cumplir las condiciones de SegundaVida. La moderación de n8n
comprueba el título, la descripción y las imágenes para rechazar publicaciones
no permitidas, además de contenido ofensivo o spam.

El frontend genera un identificador opaco seguro antes del primer envío y lo
reutiliza si la conexión falla. El servidor valida su formato y lo escribe en
`item-id`, que es el único campo de identificador público existente en la tabla
actual. Si un cliente antiguo no envía `public_id`, n8n conserva el fallback
actual con `crypto.randomBytes(6).toString('base64url')`.

El identificador no autentica a nadie ni concede permisos. Antes de crear una
fila, n8n busca ese valor y comprueba que la fila existente pertenece al
`owner_telegram_id` validado por Telegram. Una repetición del mismo intento
devuelve la publicación existente y no vuelve a subir fotos, notificar ni
disparar la regeneración estática. Si la fila aún está oculta porque se están
procesando fotos, responde `publication_pending` para que el frontend siga
comprobando `/mine`.

Las filas antiguas que tengan un `item-id` como
`sv-2191395-1786900112374` deben editarse una vez en NocoDB y recibir un valor
opaco, por ejemplo `k8Qm2LxP`, en ese campo. Las URLs antiguas se aceptan
solo como fallback de navegación y se normalizan a `/i/<public_id>/`; no se
generan enlaces nuevos con el valor antiguo.

## Generación de la ficha después de publicar

El workflow de publicación responde con `public_id` (manteniendo `item_id` como
alias temporal). La generación de fichas utiliza la proyección pública del
objeto y no requiere credenciales en este repositorio.

Contrato de llamada para n8n:

```json
{
  "public_id": "k8Qm2LxP",
  "items": [{
    "public_id": "k8Qm2LxP",
    "title": "Mesa auxiliar",
    "description": "En buen estado.",
    "category": "Hogar",
    "zone": "Delicias - Canterac",
    "condition": "Bueno",
    "status": "available",
    "expires_at": "2026-09-01T12:00:00+02:00",
    "image_url": null,
    "owner_display_name": "Vecindad",
    "owner_username": "vecino",
    "interest_count": 0,
    "contact_attempt_count": 0,
    "favorite_count": 0
  }]
}
```

El runner autorizado debe guardar ese JSON temporalmente y ejecutar:

```bash
python3 scripts/generate_static_pages.py \
  --input public-item.json \
  --output-dir generated-site \
  --site-url https://segundavida.aldeapucela.org
```

El generador produce `i/<public_id>/index.html`, `sitemap.xml`, `feed.xml`,
`robots.txt` y un `404.html` de fallback. Rechaza campos sensibles, escapa HTML y usa la
marca de SegundaVida como imagen fallback.

### Momento exacto para disparar GitHub Actions

En `SV · Publish Item`, la llamada debe ir después de que `Create NocoDB row`
haya respondido correctamente y antes de `Respond to Webhook`. Así el
`public_id` ya existe y la generación puede leer `/data` con la fila publicada.
La llamada es asíncrona; no hay que esperar a que termine GitHub para devolver
el `200` de `/publish`.

Añade un nodo `HTTP Request` con una credencial privada de GitHub (nunca pegues
el token en el código) que haga:

```text
POST https://api.github.com/repos/aldeapucela/segundavida/actions/workflows/generate-static-pages.yml/dispatches
```

Headers:

```text
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Authorization: Bearer <GITHUB_ACTIONS_TOKEN>
```

Body JSON:

```json
{
  "ref": "main",
  "inputs": {
    "source_url": "https://api.aldeapucela.org/segundavida/data?scope=all"
  }
}
```

El workflow reutiliza el artefacto anterior y compara el inventario completo:
añade la ficha recién publicada sin borrar las entregadas. No es necesario
enviar `item_id` para esta reconciliación. Configura el nodo para continuar
aunque GitHub no esté disponible: la fila de NocoDB ya se ha publicado y la
ejecución programada podrá recuperar el sitio.
El token debe tener permiso para ejecutar workflows y vivir solo en las
credenciales de n8n.

También puedes ejecutar manualmente o por schedule
`.github/workflows/generate-static-pages.yml`. La variable
`SEGUNDAVIDA_PUBLIC_ITEMS_URL` es opcional porque el workflow ya contiene la
URL pública real de `/data` como valor predeterminado.

## Respuestas

Éxito:

```json
{
  "ok": true,
  "item_id": "k8Qm2LxP",
  "status": "available",
  "message": "Publicado correctamente"
}
```

Error de validación:

```json
{
  "ok": false,
  "valid": false,
  "error": "zone_invalid"
}
```

La configuración actual permite probar desde `localhost:8000` y desde
`https://segundavida.aldeapucela.org`. Las fotos se envían como binarios
`photo_0` y `photo_1`; sus límites y validaciones están en
[`publish-photos.md`](./publish-photos.md).

## Enlace para abrir la Mini App

El botón del formulario usa `https://t.me/pucelobot/segundavida`, configurado
en `js/telegram.js`. Es el enlace directo de la Mini App independiente
`SegundaVida`, creada en BotFather con el `short_name` `segundavida`; no
requiere activar la Main Mini App. El botón de menú que ya has configurado
sigue siendo válido y es la ruta principal para entrar.

Esta Mini App usa enlaces contextuales para conservar la pantalla de origen:
`?startapp=offer` abre Ofrecer y `?startapp=profile` abre Perfil. El formato
general es `https://t.me/pucelobot/<short_name>?startapp=<contexto>`.
