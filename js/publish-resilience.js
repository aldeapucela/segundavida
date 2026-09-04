// Utilidades pequeñas para que un error de transporte no convierta una
// publicación ya aceptada por el servidor en un duplicado.
(function exposePublishResilience(root) {
  const PUBLISH_ID_BYTES = 12;
  const PUBLISH_ID_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;
  const PUBLISH_RECONCILIATION_DELAYS_MS = Object.freeze([0, 3000, 5000, 8000, 13000, 20000, 30000]);

  function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return root.btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function createPublicId() {
    if (!root.crypto?.getRandomValues || typeof root.btoa !== "function") {
      throw new Error("secure_random_unavailable");
    }
    const bytes = new Uint8Array(PUBLISH_ID_BYTES);
    do {
      root.crypto.getRandomValues(bytes);
    } while (bytes[0] >= 248);
    const publicId = bytesToBase64Url(bytes);
    if (!PUBLISH_ID_PATTERN.test(publicId)) throw new Error("public_id_invalid");
    return publicId;
  }

  function fingerprint(values) {
    return JSON.stringify({
      title: String(values?.title ?? "").trim(),
      category: String(values?.category ?? "").trim(),
      zone: String(values?.zone ?? "").trim(),
      condition: String(values?.condition ?? "").trim(),
      description: String(values?.description ?? "").trim(),
      duration_days: Number(values?.duration_days ?? values?.duration ?? 14),
    });
  }

  function isTransportError(error) {
    return error?.code === "network_error"
      || error?.kind === "transport"
      || error?.name === "TypeError"
      || String(error?.message ?? "").trim().toLowerCase() === "failed to fetch";
  }

  async function reconcile({ load, publicId, delays = PUBLISH_RECONCILIATION_DELAYS_MS, shouldStop = () => false, isComplete = () => true }) {
    for (const delayMs of delays) {
      if (shouldStop()) return null;
      if (delayMs > 0) await new Promise((resolve) => root.setTimeout(resolve, delayMs));
      if (shouldStop()) return null;
      try {
        const items = await load();
        const found = (Array.isArray(items) ? items : []).find((item) => String(item?.id ?? "") === publicId);
        if (found && isComplete(found)) return found;
      } catch {
        // La comprobación usa el mismo canal que falló; seguimos intentando
        // sin convertir el error secundario en otra publicación.
      }
    }
    return null;
  }

  root.SecondaVidaPublishResilience = Object.freeze({
    PUBLISH_ID_PATTERN,
    PUBLISH_RECONCILIATION_DELAYS_MS,
    createPublicId,
    fingerprint,
    isTransportError,
    reconcile,
  });
}(typeof window === "undefined" ? globalThis : window));
