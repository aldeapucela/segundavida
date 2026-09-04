# Modelo de datos de SegundaVida en NocoDB

## Tabla inicial: `sv_items`

Importar [`data/sv_items.csv`](../data/sv_items.csv) para crear la tabla nueva.
El CSV contiene solo las cabeceras; no añade objetos ficticios. Las filas reales
deben entrar desde el workflow de publicación o desde una importación validada.

### Campos y tipos recomendados

| Campo | Tipo NocoDB | Requerido | Uso |
| --- | --- | --- | --- |
| `Id` | System field, primary key | Automático | Identificador técnico interno de NocoDB |
| `CreatedAt` | System DateTime | Automático | Fecha de creación de NocoDB |
| `UpdatedAt` | System DateTime | Automático | Última modificación en NocoDB |
| `public_id` | SingleLineText | Sí | Identificador público opaco, aleatorio y estable generado por n8n; nunca contiene el Telegram user ID |
| `item-id` | SingleLineText | Transición | Alias legado compatible con los workflows existentes; debe copiar `public_id` durante la migración |
| `title` | SingleLineText | Sí | Título visible |
| `description` | LongText | Sí | Descripción del objeto |
| `category` | SingleSelect | Sí | `Hogar`, `Muebles`, `Electrodomésticos`, `Infantil`, `Ropa`, `Libros`, `Música y cine`, `Tecnología`, `Móviles y telefonía`, `Informática`, `Deportes y ocio`, `Bicicletas`, `Juegos y videojuegos`, `Manualidades y coleccionismo`, `Jardín y bricolaje`, `Otros` |
| `zone` | SingleLineText | Sí | Zona aproximada, no dirección exacta |
| `condition` | SingleSelect | Sí | Estado del objeto: `Como nuevo`, `Bueno`, `Aceptable`, `Roto` |
| `owner_telegram_id` | SingleLineText | Sí | Identidad privada de Telegram |
| `owner_display_name` | SingleLineText | Sí | Nombre público mostrado |
| `owner_username` | SingleLineText | No | Nombre de usuario opcional |
| `status` | SingleSelect | Sí | `available`, `reserved`, `completed`, `expired`, `hidden` |
| `expires_at` | DateTime | Sí | Fin de disponibilidad |
| `completed_at` | DateTime | No | Cuándo se finalizó |
| `reserved_at` | DateTime | No | Cuándo comenzó la reserva |
| `reservation_expires_at` | DateTime | No | Cuándo caduca la reserva, según los días elegidos al reservar |
| `Fotos` | Attachment | No | Hasta dos fotos públicas; la primera es la portada |
| `image_url` | URL | No | Compatibilidad: URL de la primera foto |
| `telegram_chat_id` | SingleLineText | No | Referencia privada para n8n |
| `telegram_thread_id` | SingleLineText | No | Referencia privada para n8n |
| `telegram_message_id` | SingleLineText | No | Referencia privada para n8n |
| `interest_count` | Number | Sí | Contador agregado, valor inicial `0` |
| `contact_attempt_count` | Number | Sí | Contador agregado de aperturas confirmadas del chat, valor inicial `0` |
| `favorite_count` | Number | Sí | Contador aproximado de corazones, valor inicial `0` |
| `consent_accepted` | Checkbox | Sí | Confirmación de aceptación de publicación y contacto |
| `consent_version` | SingleLineText | Sí | Versión del texto aceptado por la persona |
| `consent_at` | DateTime | Sí | Fecha generada por n8n al publicar |

El estado `hidden` oculta la publicación del catálogo, de su ficha pública y
de `Mis publicaciones` sin eliminar la fila. Puede utilizarse tanto para
moderación como para el borrado solicitado por la persona propietaria.

NocoDB ya aporta `CreatedAt` y `UpdatedAt`; no hay que crearlos ni rellenarlos
desde el CSV. n8n los expondrá como `created_at` y `updated_at` en la respuesta
pública. Telegram IDs se guardan como texto para evitar problemas de precisión o
limitaciones de tamaño en campos numéricos. El modelo no contempla una tabla de
intereses. Las reservas no se crean automáticamente:
solo la persona propietaria puede activar `reserved`, con un plazo elegido entre
1 y 30 días. Cuando haya un `owner_username` público,
`Me interesa` abre directamente el chat del vecino o la vecina con un mensaje
preparado y el enlace a la ficha concreta. Por eso el formulario exige
configurar un nombre de usuario público antes de publicar. Las
publicaciones antiguas sin nombre de usuario se mantienen visibles, pero no ofrecen un
canal de contacto. Los contadores de intereses, aperturas y corazones son
agregados y se mantienen en el registro del objeto. `contact_attempt_count`
registra las aperturas confirmadas del chat desde la ficha; no demuestra que el
mensaje se haya enviado. `favorite_count` es una señal aproximada: no identifica
personas únicas y puede sufrir manipulaciones o pequeñas desviaciones por el
carácter anónimo de la interacción.

## Importación en NocoDB

1. Crear o seleccionar la base `SegundaVida`.
2. Elegir `Import CSV` y subir `data/sv_items.csv`.
3. Nombrar la tabla `sv_items`.
4. Revisar los tipos según la tabla anterior, especialmente `DateTime`,
   `SingleSelect`, `URL` y `Number`.
5. Mantener `Id` como clave técnica de NocoDB y usar `public_id` como identificador
   de negocio; crear una vista `Public catalog`.
6. Ordenar por `created_at` descendente. El endpoint `/data` conserva su
   respuesta ligera por defecto para la portada; el historial completo se pide
   explícitamente con `scope=all`.

Antes de activar las fichas públicas, añade `public_id` y asigna a cada fila un
valor opaco generado aleatoriamente. Durante la transición, copia el mismo
valor a `item-id` para no romper `/data`, `/mine` ni `/complete`. Las filas de
prueba antiguas, si existieran en NocoDB, deben migrarse o eliminarse
manualmente antes de activar el catálogo.

### Migración no destructiva

1. Añade `public_id` como `SingleLineText` y hazlo único si NocoDB lo permite.
2. Genera valores como `k8Qm2LxP` desde n8n; nunca derives el valor de un
   Telegram user ID, `chat_id`, timestamp u otro dato privado.
3. Escribe el valor en `public_id` y en `item-id` durante la transición.
4. Actualiza los workflows para leer `public_id` primero y `item-id` solo como
   fallback de lectura.
5. Cuando todos los consumidores usen `public_id`, `item-id` puede retirarse en
   una migración posterior coordinada.

Antes de activar el webhook de publicación, añade también los tres campos de
consentimiento anteriores a la tabla existente. No hace falta volver a importar
el CSV ni rellenarlos en las filas existentes: los completará n8n en cada nueva
publicación.

## Contrato público de n8n

El endpoint que ya está conectado es:

```text
GET /webhook/segundavida/data
```

Devuelve una envoltura JSON con `ok`, `items` y `total`. n8n proyecta solo los
campos públicos antes de responder; los campos privados de Telegram no salen al
navegador. Sin modificador devuelve las publicaciones activas que ya consumía
la web (`available` y `reserved`, respetando sus caducidades).

Para los perfiles públicos existe un modo histórico explícito:

```text
GET /webhook/segundavida/data?scope=all
```

`scope=all` incluye `available`, `reserved`, `completed` y `expired`, también
cuando la fecha de disponibilidad ya pasó. Para un perfil se añade el filtro
del propietario:

```text
GET /webhook/segundavida/data?scope=all&owner_username=Xenopose
```

Así NocoDB filtra por `owner_username` antes de devolver las filas; el perfil no
descarga el catálogo completo. El estado `hidden` nunca se expone.

El endpoint individual disponible en n8n es:

```text
GET /webhook/segundavida/item/<public_id>
```

Debe buscar por `public_id` (y solo durante la transición por `item-id`),
devolver `200` con `{ ok: true, item }` para `available`, `reserved`, `completed` o
`expired`, y `404` con `{ ok: false, error: "not_found" }` si no existe o está
`hidden`. La proyección debe usar solo los campos públicos documentados y no
incluir IDs de Telegram, chats, hilos, `initData` ni credenciales.

Puedes importarlo directamente desde
[`sv_get_item.workflow.json`](./sv_get_item.workflow.json). Después de
importarlo:

1. Abre el nodo `Search rows` y selecciona la credencial existente de NocoDB.
   El workflow no contiene ningún token.
2. Comprueba que `workspaceId`, `projectId` y `table` apuntan a tu tabla
   `sv_items`/`Segunda Vida`. Si tu instalación usa otros IDs, selecciónalos en
   el nodo.
3. Guarda y activa el workflow. La URL de producción será
   `https://<tu-n8n>/webhook/segundavida/item/<public_id>`.
4. Prueba primero con un registro `available`, después con `completed` y
   `expired`, y finalmente con un ID inexistente: debe devolver HTTP 404 y
   `{ "ok": false, "error": "not_found" }`.

El nodo `Project public item` solo devuelve los campos públicos. Aunque NocoDB
entregue una fila con `owner_telegram_id`, `telegram_chat_id`,
`telegram_thread_id` o `telegram_message_id`, ninguno entra en la respuesta.

Flujo previsto:

```text
Webhook
  -> NocoDB: listar sv_items
  -> filtrar status público y conservar available, reserved, completed o expired
  -> mapear solo campos públicos
  -> Respond to Webhook
```

### Workflow actual

El flujo activo tiene `Webhook -> Search rows -> Code -> Respond to Webhook`.
El filtro está en `Search rows > Options > Where` y se evalúa en NocoDB antes
de traer los registros:

```text
scope=all + owner_username -> (owner_username,eq,<username>)
scope=all sin propietario -> sin filtro de estado, solo para una petición histórica explícita
sin scope=all -> (status,eq,available)~or(status,eq,reserved)
```

El nodo `Code` lee el mismo modificador y aplica la última barrera de
visibilidad. En el modo normal conserva `available` y `reserved`, valida las
caducidades y las reservas; con `scope=all` permite además `completed` y
`expired` y no descarta el histórico por `expires_at`. En ambos casos proyecta
solo los campos públicos y excluye `hidden`.

Los demás workflows que consultan publicaciones también filtran en NocoDB:

- `/item/<public_id>` busca una única fila por `item-id`/`public_id` compatible.
- `/mine` filtra por `owner_telegram_id` después de validar `initData`.
- `/report` busca únicamente la publicación que se quiere reportar antes de
  comprobar propietario y deduplicación.

En `Respond to Webhook`, cambia `Respond With` de `All Incoming Items` a
`JSON` y pon como `Response Body`:

```text
={{ $json }}
```

La conexión final debe quedar:

```text
Webhook -> Search rows -> Code (public catalog) -> Respond to Webhook
```

La respuesta no debe devolver Telegram IDs, chats, hilos ni mensajes. El
identificador de negocio (`public_id`, con `item-id` como alias temporal) es
público, opaco y aleatorio; no contiene el Telegram user ID. Se transforma en
`id` en la API pública. Contrato
inicial de cada objeto:

```json
{
  "id": "sv-...",
  "title": "Silla de escritorio",
  "description": "Silla giratoria en buen estado.",
  "category": "Hogar",
  "zone": "Delicias",
  "status": "available",
  "created_at": "2026-08-16T10:00:00+02:00",
  "expires_at": "2026-09-15T23:59:00+02:00",
  "image_url": null,
  "owner_display_name": "Pepe",
  "owner_username": "pepe_demo",
  "interest_count": 0,
  "favorite_count": 0
}
```

La respuesta completa solo se solicita para el historial del perfil. La portada
continúa recibiendo la respuesta activa por defecto:

```json
{
  "ok": true,
  "items": [],
  "total": 0
}
```

Los datos privados solo se usarán dentro de n8n para publicar en Telegram,
gestionar intereses y resolver acciones del propietario.

En el nodo Code de n8n, acceder al campo de NocoDB y normalizarlo así:

```javascript
{
  id: row.public_id || row["item-id"],
  title: row.title,
  description: row.description,
  category: row.category,
  zone: row.zone,
  condition: row.condition || null,
  status: row.status,
  created_at: row.CreatedAt,
  updated_at: row.UpdatedAt,
  expires_at: row.expires_at,
  image_url: row.image_url || null,
  owner_display_name: row.owner_display_name,
  owner_username: row.owner_username || null,
  interest_count: Number(row.interest_count || 0),
  favorite_count: Math.max(0, Number(row.favorite_count || 0)),
}
```

No usar `row.item-id`, porque JavaScript lo interpretaría como una resta.

### Interacciones y contador de corazones

`POST /segundavida/interaction` acepta las acciones existentes `interest` y
`contact_attempt`, además de `favorite_add` y `favorite_remove`. Para los
corazones el cuerpo debe incluir un UUID v4 anónimo en `actor_id`:

```json
{
  "item_id": "k8Qm2LxP",
  "action": "favorite_add",
  "actor_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

El cliente no envía el contador. n8n calcula el delta (`+1` o `-1`), limita la
frecuencia por actor y por IP cuando está disponible, y devuelve el valor
resultante en `favorite_count`, sin permitir valores negativos. La publicación
de este workflow debe ejecutarse con concurrencia `1` (o detrás de una cola
serializada) para que la lectura y actualización de NocoDB no pierda
incrementos simultáneos; el nodo de actualización no acepta una expresión de
incremento atómico.
