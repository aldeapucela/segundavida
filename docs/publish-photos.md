# Publicación con fotos

El workflow completo importable está en
[`sv_publish_item_photos.workflow.json`](./sv_publish_item_photos.workflow.json).

La web envía ahora la publicación como `multipart/form-data`. El campo
`payload` contiene el JSON de la publicación y las fotos llegan como binarios
independientes:

```text
payload  = { initData, item: { public_id, ... }, consent }
photo_0  = primera foto optimizada en JPEG
photo_1  = segunda foto optimizada en JPEG (opcional)
```

El navegador conserva las selecciones sucesivas hasta dos fotos, permite quitar
cualquiera de ellas y las redimensiona a un máximo de 1280 px por lado antes de
enviarlas. El límite de entrada es de 20 MB por foto. Si el navegador o WebView
no puede redimensionar una imagen, n8n la normaliza en servidor antes de
guardarla en NocoDB.

El formulario exige al menos una foto e informa y solicita aceptar que el texto
y las fotos compartidos se publiquen bajo la licencia
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es), además
de cumplir las condiciones de SegundaVida.

## Cambios en el workflow de n8n

El Webhook puede conservar el mismo método, ruta y CORS. Hay que cambiar el
nodo `Validate Telegram and item` para que:

1. Lea `body.payload` cuando la petición sea multipart.
2. Parsee ese valor como JSON.
3. Valide también `consent`.
4. Valide que existan como máximo dos binarios `photo_0` y `photo_1`, con MIME
   `image/jpeg`, `image/png` o `image/webp` y tamaño máximo de 20 MB.
5. Devuelva el binario original junto al JSON validado.

Al principio del nodo, sustituye la función `result` y la lectura actual de
`input/body` por este bloque. Las constantes de categorías y barrios se pueden
mantener tal como están:

```javascript
const incoming = $input.first() ?? {};
const input = incoming.json ?? {};
const inputBinary = incoming.binary ?? {};

function result(json) {
  return [{ json, binary: inputBinary }];
}

function invalid(error) {
  return result({ ok: false, valid: false, error });
}

let body = input.body ?? input;
if (typeof body === 'string') {
  try {
    body = JSON.parse(body);
  } catch {
    return invalid('invalid_json');
  }
}

const multipartPayload = body?.payload ?? input.payload;
if (typeof multipartPayload === 'string') {
  try {
    body = JSON.parse(multipartPayload);
  } catch {
    return invalid('invalid_payload');
  }
} else if (multipartPayload && typeof multipartPayload === 'object') {
  body = multipartPayload;
}

const consent = body.consent && typeof body.consent === 'object' ? body.consent : {};
const consentVersion = typeof consent.version === 'string' ? consent.version.trim() : '';
if (consent.accepted !== true) return invalid('consent_required');
if (consentVersion !== 'sv-publish-2026-08-17-v3') {
  return invalid('consent_version_invalid');
}

const photoEntries = Object.entries(inputBinary)
  .filter(([name, file]) => /^photo_[01]$/.test(name) && file?.data)
  .sort(([left], [right]) => left.localeCompare(right));

if (photoEntries.length > 2) return invalid('too_many_photos');

for (const [, file] of photoEntries) {
  const mimeType = file.mimeType ?? file.mimetype ?? '';
  const size = Number(file.fileSize ?? file.size ?? 0);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return invalid('photo_type_invalid');
  }
  if (!Number.isFinite(size) || size <= 0 || size > 20 * 1024 * 1024) {
    return invalid('photo_too_large');
  }
}
```

Después, en el mismo nodo, cambia la lectura del objeto `item` para que use
el `body` ya parseado. En el objeto final añade:

```javascript
public_id: itemId,
consent_accepted: true,
consent_version: consentVersion,
consent_at: new Date().toISOString(),
photo_count: photoEntries.length,
```

`public_id` llega dentro de `item` y debe usarse para `public_id` y `item-id`.
Si no llega, el workflow conserva el fallback de compatibilidad:

```javascript
const requestedId = typeof item.public_id === 'string' ? item.public_id.trim() : '';
const publicIdPattern = /^[A-Za-z0-9_-]{6,80}$/;
const itemId = publicIdPattern.test(requestedId)
  ? requestedId
  : crypto.randomBytes(6).toString('base64url');
```

## Subir las fotos con el nodo nativo de NocoDB

El workflow importable ya contiene el flujo completo:

1. `Create NocoDB row` crea primero la fila. Si hay fotos, la crea con estado
   `hidden` para que no se publique antes de tiempo.
2. `Prepare photo uploads` conserva cada binario como una entrada separada.
3. `Upload photo to NocoDB` usa `NocoDB → Row → Upload`, en modo `Base64`, y
   apunta al campo Attachment `photos`.
4. `Activate NocoDB row` cambia el estado a `available` después de subir todas
   las fotos.

Todos los nodos NocoDB usan directamente la credencial existente
`NocoDB Token account`. No hay `NOCODB_API_TOKEN`, `HTTP Request` ni token
adicional que configurar.

Al importar el workflow, comprueba únicamente que el nodo `Upload photo to
NocoDB` mantiene el campo `photos` seleccionado. Si tu instancia de n8n muestra
el selector vacío, abre ese nodo, selecciona la base `Aldea Pucela`, la tabla
`Segunda Vida` y el campo Attachment `photos`, y guarda el workflow. No cambies
el modo `Base64` ni los campos `Filename`, `Content Type` y `Base64 Value`.

El campo `photos` puede contener los dos archivos; no hay que crear `foto_1` y
`foto_2` como columnas separadas. La API de NocoDB no debe recibir el array de
adjuntos en `Create`: la operación nativa `Row Upload` lo añade a la celda de
la fila ya creada.

## Moderación de contenido

Después de preparar las fotos, el workflow analiza cada imagen junto con el
título y la descripción mediante el modelo de OpenRouter configurado en n8n.
Además de contenido ofensivo y spam, comprueba las categorías no permitidas
descritas en el formulario: armas, drogas, medicamentos sujetos a prescripción,
animales, datos personales, dinero, servicios, publicidad, ventas, trueques y
otros objetos o publicaciones ilegales, peligrosos o engañosos.

Si detecta una categoría prohibida, la publicación no se crea y el endpoint
devuelve un mensaje como: `No se puede publicar «Título» porque no está
permitido en SegundaVida. Motivo: animales. Revisa las condiciones de
publicación.`

## Proyección pública

El endpoint `/data`, el endpoint individual y `mine` deberían convertir el
campo `Fotos` en:

```json
{
  "image_url": "url-de-la-primera-foto",
  "image_urls": [
    "url-de-la-primera-foto",
    "url-de-la-segunda-foto"
  ]
}
```

La web sigue usando `image_url` como portada y ya acepta `image_urls` para una
galería futura.

## Edición de publicaciones

El workflow [`sv_edit_item.workflow.json`](./sv_edit_item.workflow.json) expone
`POST /segundavida/edit`. Recibe un `payload` con `initData`, `item_id`,
`expected_updated_at`, los campos editados —incluido `condition`— y
`keep_photo_keys`; las fotos nuevas llegan como `photo_0` y `photo_1`. El
backend comprueba propietario o rol de administrador, estado y concurrencia
optimista. El propietario solo edita una publicación disponible; un
administrador puede editar cualquier publicación visible disponible,
reservada, entregada o caducada. Modera siempre título y descripción y modera
también cada foto nueva o sustituida. No cambia el identificador público, el
estado operativo (`status`) ni la fecha de caducidad.
