// API pública estable; Nginx oculta las rutas internas de n8n.
const API_BASE_URL = "https://api.aldeapucela.org/segundavida";
const N8N_DATA_URL = `${API_BASE_URL}/data`;
const N8N_ITEM_URL = `${API_BASE_URL}/item`;
const N8N_PUBLISH_URL = `${API_BASE_URL}/publish`;
const N8N_EDIT_URL = `${API_BASE_URL}/edit`;
const N8N_COMPLETE_URL = `${API_BASE_URL}/complete`;
const N8N_MINE_URL = `${API_BASE_URL}/mine`;
const N8N_REPORT_URL = `${API_BASE_URL}/report`;
const N8N_INTERACTION_URL = `${API_BASE_URL}/interaction`;
const NOCODB_BASE_URL = "https://proyectos.aldeapucela.org";

const catalogInFlight = new Map();
const itemInFlight = new Map();
let mineInFlight = null;
let mineInFlightSession = "";

function asAttachmentList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    return [];
  }

  return [];
}

function normalizeAttachmentUrl(value) {
  const attachment = typeof value === "string"
    ? value
    : value?.url ?? value?.signedUrl ?? value?.signed_url
      ?? value?.path ?? value?.signedPath ?? value?.signed_path
      ?? value?.thumbnails?.small?.signedPath
      ?? value?.thumbnails?.small?.signedUrl
      ?? value?.thumbnails?.card_cover?.signedPath
      ?? value?.thumbnails?.card_cover?.signedUrl
      ?? "";
  const url = String(attachment).trim();

  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${NOCODB_BASE_URL}${url}`;
  if (url.startsWith("download/") || url.startsWith("dltemp/")) {
    return `${NOCODB_BASE_URL}/${url}`;
  }
  return "";
}

function extractImageUrls(value) {
  return asAttachmentList(value)
    .map(normalizeAttachmentUrl)
    .filter(Boolean);
}

function normalizeItem(record, { privateFields = false } = {}) {
  const fields = record?.fields ?? record ?? {};
  const favoriteCount = Number(fields.favorite_count ?? 0);
  const imageUrls = [...new Set([
    ...extractImageUrls(fields.image_urls),
    ...extractImageUrls(fields.Fotos ?? fields.fotos ?? fields.photos),
  ])];
  const imageUrl = normalizeAttachmentUrl(fields.image_url) || imageUrls[0] || null;

  return {
    id: fields.public_id ?? fields["item-id"] ?? record?.public_id ?? record?.id ?? "",
    title: fields.title ?? "Objeto sin título",
    description: fields.description ?? "",
    category: fields.category ?? "Otros",
    zone: fields.zone ?? "Valladolid",
    condition: window.SecondaVidaItemCondition?.normalize(fields.condition) ?? "",
    ownerDisplayName: fields.owner_display_name ?? "Vecindad",
    ownerUsername: fields.owner_username ?? "",
    ownerTelegramId: privateFields ? fields.owner_telegram_id ?? "" : "",
    status: fields.status ?? "hidden",
    createdAt: fields.created_at ?? fields.CreatedAt ?? null,
    updatedAt: fields.updated_at ?? fields["Last modified time"] ?? fields.UpdatedAt ?? null,
    completedAt: fields.completed_at ?? null,
    expiresAt: fields.expires_at ?? null,
    reservedAt: privateFields ? fields.reserved_at ?? null : null,
    reservationExpiresAt: privateFields ? fields.reservation_expires_at ?? null : null,
    imageUrl,
    imageUrls,
    photoKeys: privateFields
      ? [...new Set(asAttachmentList(fields.photo_keys ?? fields.photoKeys).map((key) => String(key).trim()).filter(Boolean))]
      : [],
    interestCount: Number(fields.interest_count ?? 0),
    contactAttemptCount: Number(fields.contact_attempt_count ?? 0),
    favoriteCount: Number.isFinite(favoriteCount) ? Math.max(0, favoriteCount) : 0,
  };
}

function parseItemsPayload(payload, options = {}) {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : null;

  if (!records) {
    throw new Error("Respuesta de catálogo no válida");
  }

  return records.map((record) => normalizeItem(record, options));
}

async function listMineItems(initData) {
  if (!N8N_MINE_URL) {
    return [];
  }

  const sessionKey = String(initData ?? "");
  if (mineInFlight && mineInFlightSession === sessionKey) {
    return mineInFlight;
  }

  const request = (async () => {
    const response = await fetch(N8N_MINE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initData }),
    });

    const payload = await response.json();
    const records = parseItemsPayload(payload, { privateFields: true });

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error ?? `n8n respondió con HTTP ${response.status}`);
    }

    return records;
  })();

  mineInFlight = request;
  mineInFlightSession = sessionKey;
  try {
    return await request;
  } finally {
    if (mineInFlight === request) {
      mineInFlight = null;
      mineInFlightSession = "";
    }
  }
}

async function listItems({ scope = "active", ownerUsername = "", fresh = false } = {}) {
  if (!N8N_DATA_URL) {
    return [];
  }

  const normalizedScope = scope === "all" ? "all" : "active";
  const params = new URLSearchParams();
  if (normalizedScope === "all") params.set("scope", "all");
  const normalizedOwnerUsername = String(ownerUsername ?? "").trim().replace(/^@/, "");
  if (normalizedScope === "all" && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(normalizedOwnerUsername)) {
    params.set("owner_username", normalizedOwnerUsername);
  }
  const queryString = params.toString();
  const requestUrl = queryString ? `${N8N_DATA_URL}?${queryString}` : N8N_DATA_URL;
  const requestKey = `${requestUrl}|${fresh ? "fresh" : "default"}`;
  if (catalogInFlight.has(requestKey)) return catalogInFlight.get(requestKey);

  const request = (async () => {
    const headers = { Accept: "application/json" };
    if (fresh) headers["Cache-Control"] = "no-cache";
    const response = await fetch(requestUrl, {
      method: "GET",
      headers,
      cache: fresh ? "no-store" : "default",
    });

    if (!response.ok) {
      throw new Error(`n8n respondió con HTTP ${response.status}`);
    }

    const payload = await response.json();
    const records = parseItemsPayload(payload);

    if (!Array.isArray(payload) && payload.ok !== true) {
      throw new Error("Respuesta de catálogo no válida");
    }

    return records;
  })();

  catalogInFlight.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (catalogInFlight.get(requestKey) === request) catalogInFlight.delete(requestKey);
  }
}

async function getItem(itemId, { fresh = false } = {}) {
  const publicId = String(itemId ?? "").trim();
  if (!publicId) {
    throw new Error("Identificador público vacío");
  }

  const requestKey = `${publicId}|${fresh ? "fresh" : "default"}`;
  if (itemInFlight.has(requestKey)) {
    return itemInFlight.get(requestKey);
  }

  const request = (async () => {
    const headers = { Accept: "application/json" };
    if (fresh) headers["Cache-Control"] = "no-cache";
    const response = await fetch(`${N8N_ITEM_URL}/${encodeURIComponent(publicId)}`, {
      method: "GET",
      headers,
      cache: fresh ? "no-store" : "default",
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 404 || payload?.error === "not_found") {
      const error = new Error("not_found");
      error.code = "not_found";
      throw error;
    }

    if (!response.ok || payload?.ok !== true || !payload?.item) {
      throw new Error(payload?.error ?? `n8n respondió con HTTP ${response.status}`);
    }

    return normalizeItem(payload.item);
  })();

  itemInFlight.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (itemInFlight.get(requestKey) === request) {
      itemInFlight.delete(requestKey);
    }
  }
}

function invalidateCatalog() {
  // The catalog cache only contains the pending promise. Keep it alive so an
  // invalidation cannot create a second request while the first is running.
}

function invalidateMine() {
  // Private data is not persisted; pending-request deduplication remains active.
}

async function publishItem(payload, files = []) {
  if (!N8N_PUBLISH_URL) {
    throw new Error("El endpoint de publicación todavía no está configurado.");
  }

  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  files.forEach((file, index) => {
    body.append(`photo_${index}`, file, file.name);
  });

  let response;
  try {
    response = await fetch(N8N_PUBLISH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body,
    });
  } catch (cause) {
    const error = new Error("No se pudo conectar con el servicio de publicación.");
    error.name = "PublishTransportError";
    error.code = "network_error";
    error.kind = "transport";
    error.cause = cause;
    throw error;
  }

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  result = Array.isArray(result) ? result[0] ?? null : result;

  if (!response.ok) {
    const error = new Error(result?.error ?? `n8n respondió con HTTP ${response.status}`);
    error.code = result?.error_code ?? result?.error ?? `http_${response.status}`;
    throw error;
  }

  return result ?? { ok: false, error: "Respuesta vacía del endpoint de publicación." };
}

async function completeItem(payload) {
  if (!N8N_COMPLETE_URL) {
    throw new Error("El endpoint de gestión todavía no está configurado.");
  }

  const response = await fetch(N8N_COMPLETE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let payloadResult = null;
  try {
    payloadResult = await response.json();
  } catch {
    payloadResult = null;
  }

  if (!response.ok) {
    throw new Error(payloadResult?.error ?? `n8n respondió con HTTP ${response.status}`);
  }

  const result = Array.isArray(payloadResult) ? payloadResult[0] : payloadResult;
  return result ?? { ok: false, error: "Respuesta vacía del endpoint de gestión." };
}

async function editItem(payload, files = []) {
  if (!N8N_EDIT_URL) {
    throw new Error("El endpoint de edición todavía no está configurado.");
  }

  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  files.forEach((file, index) => {
    body.append(`photo_${index}`, file, file.name);
  });

  const response = await fetch(N8N_EDIT_URL, {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  result = Array.isArray(result) ? result[0] ?? null : result;

  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.error ?? `n8n respondió con HTTP ${response.status}`);
    error.code = result?.error_code ?? result?.error ?? `http_${response.status}`;
    throw error;
  }

  return result;
}

async function reportProblem(payload) {
  if (!N8N_REPORT_URL) {
    throw new Error("El endpoint de reportes todavía no está configurado.");
  }

  const response = await fetch(N8N_REPORT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  result = Array.isArray(result) ? result[0] ?? null : result;
  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.error ?? `n8n respondió con HTTP ${response.status}`);
    error.code = result?.error_code ?? result?.error ?? `http_${response.status}`;
    throw error;
  }

  return result;
}

async function recordInteraction(payload) {
  if (!N8N_INTERACTION_URL) {
    throw new Error("El endpoint de interacciones todavía no está configurado.");
  }

  const response = await fetch(N8N_INTERACTION_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  result = Array.isArray(result) ? result[0] ?? null : result;
  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.error ?? `n8n respondió con HTTP ${response.status}`);
    error.code = result?.error_code ?? result?.error ?? `http_${response.status}`;
    throw error;
  }

  return result;
}

window.SecondaVidaApi = Object.freeze({
  isConfigured: Boolean(N8N_DATA_URL),
  isDataConfigured: Boolean(N8N_DATA_URL),
  isItemConfigured: Boolean(N8N_ITEM_URL),
  isPublishConfigured: Boolean(N8N_PUBLISH_URL),
  isEditConfigured: Boolean(N8N_EDIT_URL),
  isCompleteConfigured: Boolean(N8N_COMPLETE_URL),
  isMineConfigured: Boolean(N8N_MINE_URL),
  isReportConfigured: Boolean(N8N_REPORT_URL),
  isInteractionConfigured: Boolean(N8N_INTERACTION_URL),
  listItems,
  getItem,
  listMineItems,
  invalidateCatalog,
  invalidateMine,
  publishItem,
  editItem,
  completeItem,
  reportProblem,
  recordInteraction,
});
