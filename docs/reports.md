# Incidencias de Segunda Vida

La tabla `sv_reports` guarda incidencias enviadas desde la Mini App de
Telegram. El navegador público no puede crear incidencias: la persona debe
abrir la Mini App y enviar `Telegram.WebApp.initData`, que n8n valida con el
token privado del bot.

## Importar la tabla

Importa [`data/sv_reports.csv`](../data/sv_reports.csv) en la base `Aldea Pucela`
y ponle el nombre `Segunda Vida - Incidencias` (o `sv_reports`).

No añadas manualmente `Id`, `CreatedAt` ni `UpdatedAt`: NocoDB los crea como
campos del sistema.

| Campo | Tipo recomendado | Privacidad | Uso |
| --- | --- | --- | --- |
| `dedupe_key` | SingleLineText, único si es posible | Privado | Hash de publicación + usuario para evitar duplicados |
| `item_public_id` | SingleLineText | Interno | Publicación reportada |
| `item_title` | SingleLineText | Interno | Copia del título para moderación |
| `owner_telegram_id` | SingleLineText | Privado | Persona propietaria de la publicación |
| `owner_display_name` | SingleLineText | Interno | Nombre visible en la publicación |
| `reporter_telegram_id` | SingleLineText | Privado | Persona que reporta |
| `reporter_username` | SingleLineText | Privado | Usuario de Telegram en el momento del reporte |
| `reporter_display_name` | SingleLineText | Privado | Nombre de Telegram en el momento del reporte |
| `reason` | SingleSelect | Interno | Motivo estructurado de la incidencia |
| `details` | LongText | Privado | Explicación para moderación |
| `allow_admin_contact` | Checkbox | Privado | Permiso para contactar con quien reporta |
| `moderation_status` | SingleSelect | Interno | `pending`, `approved` o `rejected` |
| `moderation_note` | LongText | Privado | Decisión y notas del administrador |
| `moderated_by_telegram_id` | SingleLineText | Privado | Administrador que revisa |
| `moderated_at` | DateTime | Interno | Fecha de revisión |
| `source` | SingleLineText | Interno | Origen, actualmente `telegram_miniapp` |
| `created_at` | DateTime | Interno | Fecha generada por n8n |

Valores de `reason`:

- `no_entregado`
- `pidio_dinero`
- `objeto_no_disponible`
- `informacion_falsa`
- `contenido_inadecuado`
- `datos_personales`
- `spam_publicidad`
- `planton`
- `conducta_abusiva`
- `otro`

## Workflow n8n

El workflow **Segunda Vida - Reportar incidencia** está publicado en n8n y el
nodo **Upsert report in NocoDB** ya apunta a `Segunda Vida - Incidencias`. El
endpoint de producción está activo para probarlo con `initData` real de
Telegram. La tabla de publicaciones existente ya está configurada y se usa para
comprobar que la publicación existe y evitar que su propietario se reporte a
sí mismo.

Webhook de producción:

```text
POST https://tasks.nukeador.com/webhook/segundavida/report
```

Body esperado:

```json
{
  "initData": "<Telegram.WebApp.initData>",
  "item_id": "<public_id>",
  "reason": "pidio_dinero",
  "details": "La persona pidió dinero por la entrega.",
  "allow_admin_contact": true
}
```

El mismo endpoint y formulario se reutilizan desde el perfil público de una
persona. En ese caso el cliente envía una publicación representativa de ese
perfil en `item_id` y mantiene exactamente el mismo contrato de campos y la
misma tabla de incidencias.

El endpoint devuelve solo el resultado de la operación y nunca devuelve IDs de
Telegram ni los detalles guardados.

## Contacto de quien reporta

`reporter_telegram_id` se guarda siempre, aunque la persona no tenga un
`reporter_username` público. El ID sirve para identificar el reporte y para
mostrar en el aviso de administración un enlace interno de Telegram al perfil
de esa persona; no se muestra el ID numérico en el grupo.

Esto no garantiza que un administrador pueda iniciar un chat privado solo con
el ID: un bot no puede comenzar una conversación con un usuario que nunca lo
ha iniciado o contactado. Por eso la interfaz pide el consentimiento explícito
y el flujo de producción debe hacer que la persona abra/contacte primero al
bot. Si hay nombre de usuario, el aviso muestra `@usuario`; si no lo hay,
muestra el nombre visible como enlace al perfil cuando Telegram lo permite.

Después de guardar correctamente la incidencia en NocoDB, el workflow envía un
aviso HTML al grupo de administradores `-1002671330741`, en el hilo `1380`.
El aviso incluye la publicación, el motivo, los detalles, la persona que
reporta y el enlace de revisión. En «Publicado por» se enlaza el nombre de
usuario público de Telegram del autor cuando existe y tiene un formato válido;
en caso contrario solo se muestra su nombre visible, sin incluir su ID
numérico privado. Si Telegram no consigue enviar el aviso, la
incidencia no se pierde: el nodo está configurado para continuar porque el
guardado en NocoDB es la operación principal.

La autorización para que el equipo contacte es obligatoria tanto en el
formulario como en n8n; no se acepta una petición que la omita.

## Demo local

Para revisar el formulario sin autenticación ni efectos externos, abre la app
local con:

```text
http://127.0.0.1:8000/?demo=report&item=<public_id>
```

El modo demo solo funciona en `localhost` y `127.0.0.1`; el botón de envío no
llama a n8n.

## Enlace directo a una incidencia

Cada detalle de publicación muestra **Reportar un problema**. Desde un
navegador público, el botón abre la Mini App directamente en el formulario:

```text
https://t.me/pucelobot/segundavida?startapp=report_<public_id>
```

La Mini App lee `start_param`/`tgWebAppStartParam`, extrae el `public_id`, carga
la publicación y muestra el formulario de **Reportar un problema**. El
parámetro usa únicamente letras, números, `_` y `-`; los `public_id` actuales
son suficientemente cortos para este enlace.

## Enlace de administración

El aviso enviado al grupo de administradores usa un enlace de gestión dentro
de Telegram:

```text
https://t.me/pucelobot/segundavida?startapp=manage_<public_id>
```

Al abrirlo, la Mini App carga la publicación y valida al administrador con el
workflow de identidad existente. Si la cuenta tiene el rol `admin` activo,
muestra las acciones de gestión de la publicación; una visita desde la web
pública no permite esas acciones.
