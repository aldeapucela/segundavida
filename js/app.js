// Punto de entrada del frontend de Segunda Vida.
document.documentElement.classList.add("app-ready");

const telegramWebApp = window.Telegram?.WebApp;
const telegramQuery = new URLSearchParams(window.location.search);
const telegramRuntime = window.SecondaVidaTelegram ?? {
  isTelegram: Boolean(telegramWebApp?.initData?.trim()),
  sdkAvailable: Boolean(telegramWebApp?.initData?.trim()),
  miniAppUrl: "https://t.me/pucelobot/segundavida",
  startParam: telegramWebApp?.initDataUnsafe?.start_param
    ?? telegramQuery.get("tgWebAppStartParam")
    ?? telegramQuery.get("startapp")
    ?? "",
};
const isNotFoundPage = document.body?.dataset.page === "not-found";

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

const auth = window.SecondaVidaAuth;
const api = window.SecondaVidaApi;
const catalogResilience = window.SecondaVidaCatalogResilience;
const publishResilience = window.SecondaVidaPublishResilience;
const itemCondition = window.SecondaVidaItemCondition;
const CONSENT_VERSION = "sv-publish-2026-08-17-v3";
const MAX_OFFER_PHOTOS = 2;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const PHOTO_OPTIMIZE_THRESHOLD = 1.5 * 1024 * 1024;
const PHOTO_MAX_EDGE = 1280;
const PHOTO_JPEG_QUALITY = 0.74;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CATALOG_INITIAL_RENDER_COUNT = 24;
const CATALOG_RENDER_BATCH_SIZE = 24;
const CATALOG_LOAD_AHEAD_PX = 720;
const CATALOG_RETRY_DELAYS_MS = catalogResilience?.CATALOG_RETRY_DELAYS_MS
  ?? Object.freeze([1000, 2000, 4000, 8000, 15000, 30000]);
const IMAGE_RETRY_DELAY_MS = 500;
const IMAGE_LOAD_TIMEOUT_MS = 10000;
const IMAGE_REFRESH_INTERVAL_MS = 30000;
const OWN_ITEMS_STORAGE_KEY = "segundavida:my-items:v1";
const FAVORITES_STORAGE_KEY = "segundavida:favorites:v1";
const INTERACTION_STORAGE_KEY = "segundavida:interaction-events:v1";
const FAVORITE_ACTOR_STORAGE_KEY = "segundavida:favorite-actor:v1";
const THEME_STORAGE_KEY = "segundavida:theme:v1";
const PUBLISH_DRAFT_STORAGE_KEY = "segundavida:publish-draft:v1";
const PUBLISH_DRAFT_VALUES_KEY = "segundavida:publish-draft-values:v1";
const PUBLISH_ATTEMPT_STORAGE_KEY = "segundavida:publish-attempt:v1";
const PUBLISH_ATTEMPT_MAX_AGE_MS = 30 * 60 * 1000;
const PUBLISH_DRAFT_DB_NAME = "segundavida-drafts-v1";
const PUBLISH_DRAFT_STORE_NAME = "drafts";
const LOCAL_AUTHOR_DEMO_MODE =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).get("demo") === "author";
const LOCAL_REPORT_DEMO_MODE =
  ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).get("demo") === "report";
const LOCAL_REPORT_DEMO_ITEM_ID =
  new URLSearchParams(window.location.search).get("item")?.trim() || "";
const LOCAL_REPORT_DEMO_USERNAME = "usuario_demo";
const LOCAL_AUTHOR_DEMO_DISPLAY_NAME = "Nuke";
const LOCAL_AUTHOR_DEMO_USERNAME = "tionuke";
const PUBLIC_SITE_ORIGIN = "https://segundavida.aldeapucela.org";
const VIEW_ROUTES = Object.freeze({
  explore: "/",
  offer: "/ofrecer/",
  posts: "/perfil/",
  favorites: "/favoritos/",
});
const USER_PROFILE_VIEW = "user-profile";
const ROUTE_VIEW_NAMES = new Set([...Object.keys(VIEW_ROUTES), USER_PROFILE_VIEW]);
const PRIVATE_VIEW_NAMES = new Set(["offer", "posts", "favorites", "publish-success"]);
const VIEW_TITLES = Object.freeze({
  explore: "Segunda Vida · Aldea Pucela",
  offer: "Ofrecer algo · Segunda Vida",
  posts: "Mi perfil · Segunda Vida",
  favorites: "Favoritos · Segunda Vida",
  [USER_PROFILE_VIEW]: "Perfil público · Segunda Vida",
  "publish-success": "Publicación realizada · Segunda Vida",
  "not-found": "Página no encontrada · Segunda Vida",
});
const state = {
  items: [],
  catalogItems: [],
  catalogLoaded: false,
  profileCatalogItems: [],
  profileCatalogLoaded: false,
  profileCatalogUsername: "",
  category: "Todo",
  statusFilter: "all",
  query: "",
  selectedItem: null,
  offerFiles: [],
  photoPreviewUrls: [],
  inlineEdit: null,
  telegramUser: null,
  myItems: [],
  favoriteEntries: [],
  postsFilter: "active",
  currentView: "explore",
  currentItemId: "",
  currentUserUsername: "",
  historyMaxIndex: 0,
  staticItem: null,
  selectedItemLive: false,
  catalogNeedsRefresh: false,
  catalogRequestVersion: 0,
  catalogVisibleCount: CATALOG_INITIAL_RENDER_COUNT,
  publishAttempt: null,
};

let photoLightboxUrls = [];
let photoLightboxIndex = 0;
let photoLightboxReturnFocus = null;
let photoLightboxTouchStartX = 0;
let photoLightboxTouchStartY = 0;
let lastTrackedViewKey = "";
const trackedInterestTelegramItems = new Set();
const pendingInteractions = new Set();
const pendingFavoriteInteractions = new Map();
const favoriteCountOverrides = new Map();
let routeOpenInFlight = null;
let routeOpenItemId = "";
let reportStartInFlight = null;
let manageStartInFlight = null;
let catalogMatches = [];
let catalogLoadMoreObserver = null;
let catalogPaginationControls = null;
let catalogLoadMoreButton = null;
let catalogLoadMoreSentinel = null;
const refreshCatalogImageUrls = catalogResilience?.createRefreshCoordinator(
  async () => {
    const records = await api.listItems({ fresh: true });
    mergeFreshCatalogImageUrls(records);
    return records;
  },
  { minIntervalMs: IMAGE_REFRESH_INTERVAL_MS },
) ?? (async () => []);
let deleteDialogItem = null;
let deleteDialogTriggerButton = null;
let deleteDialogReason = "";
let contactDialogItem = null;
let contactDialogTriggerButton = null;
let reportDialogTargetItem = null;
let reportDialogTargetUser = null;
let reportDialogTriggerButton = null;
let reserveDialogItem = null;
let reserveDialogTriggerButton = null;
let reserveDialogFeedbackElement = null;
let cameraCaptureTarget = "offer";

const runtimeName = document.querySelector("#runtime-name");
const telegramSdkState = document.querySelector("#telegram-sdk-state");
const telegramStatus = document.querySelector("#telegram-status");
const telegramStatusLabel = document.querySelector("#telegram-status-label");
const n8nStatus = document.querySelector("#n8n-status");
const n8nStatusLabel = document.querySelector("#n8n-status-label");
const identityStatus = document.querySelector("#identity-status");
const identityStatusLabel = document.querySelector("#identity-status-label");
const searchInput = document.querySelector("#search-input");
const searchToggle = document.querySelector("#search-toggle");
const searchPanel = document.querySelector("#search-panel");
const categoryFilterSelect = document.querySelector("#category-filter");
const categoryFilterLabel = document.querySelector("#category-filter-label");
const statusToggle = document.querySelector("#status-toggle");
const itemsCount = document.querySelector("#items-count");
const itemsState = document.querySelector("#items-state");
const itemsGrid = document.querySelector("#items-grid");
const catalogTitle = document.querySelector("#catalog-title");
const catalogIntro = document.querySelector(".catalog-intro");
const catalogTools = document.querySelector(".catalog-tools");
const catalogSection = document.querySelector(".catalog-section");
const offerView = document.querySelector("#offer-view");
const postsView = document.querySelector("#posts-view");
const favoritesView = document.querySelector("#favorites-view");
const detailView = document.querySelector("#detail-view");
const detailShare = document.querySelector("#detail-share");
const shareFeedback = document.querySelector("#share-feedback");
const detailMedia = document.querySelector("#detail-media");
const editImages = document.querySelector("#edit-images");
const photoLightbox = document.querySelector("#photo-lightbox");
const photoLightboxTitle = document.querySelector("#photo-lightbox-title");
const photoLightboxCounter = document.querySelector("#photo-lightbox-counter");
const photoLightboxImage = document.querySelector("#photo-lightbox-image");
const photoLightboxThumbs = document.querySelector("#photo-lightbox-thumbs");
const photoLightboxStage = photoLightbox?.querySelector(".photo-lightbox__stage");
const photoLightboxClose = document.querySelector("#photo-lightbox-close");
const photoLightboxPrevious = document.querySelector("#photo-lightbox-previous");
const photoLightboxNext = document.querySelector("#photo-lightbox-next");
const detailAvailability = document.querySelector("#detail-availability");
const detailAvailabilityLabel = document.querySelector("#detail-availability-label");
const detailAvailabilityIcon = document.querySelector("#detail-availability-icon");
const detailTitle = document.querySelector("#detail-title");
const detailFavorite = document.querySelector("#detail-favorite");
const detailCategory = document.querySelector("#detail-category");
const detailCondition = document.querySelector("#detail-condition");
const detailDescription = document.querySelector("#detail-description");
const detailZone = document.querySelector("#detail-zone");
const detailOwner = document.querySelector("#detail-owner");
const detailOwnerLink = document.querySelector("#detail-owner-link");
const detailCreatedAt = document.querySelector("#detail-created-at");
const detailInterestSignal = document.querySelector("#detail-interest-signal");
const interestButton = document.querySelector("#interest-button");
const reportProblemButton = document.querySelector("#report-problem-button");
const detailActionState = document.querySelector("#detail-action-state");
const detailOwnerActions = document.querySelector("#detail-owner-actions");
const detailOwnerEditRow = document.querySelector("#detail-owner-edit-row");
const editItemButton = document.querySelector("#edit-item-button");
const editSaveButton = document.querySelector("#edit-save-button");
const editCancelButton = document.querySelector("#edit-cancel-button");
const detailInlineEditActions = document.querySelector("#detail-inline-edit-actions");
const manageStatusButton = document.querySelector("#manage-status-button");
const markDeliveredButton = document.querySelector("#mark-delivered-button");
const deleteItemButton = document.querySelector("#delete-item-button");
const relatedItemsSection = document.querySelector("#related-items");
const relatedItemsTitle = document.querySelector("#related-items-title");
const relatedItemsCopy = document.querySelector("#related-items-copy");
const relatedItemsTrack = document.querySelector("#related-items-track");
const relatedItemsEmpty = document.querySelector("#related-items-empty");
const relatedItemsBrowse = document.querySelector("#related-items-browse");
const deleteItemDialog = document.querySelector("#delete-item-dialog");
const deleteItemDialogTitle = document.querySelector("#delete-item-dialog-title");
const deleteItemDialogState = document.querySelector("#delete-item-dialog-state");
const deleteItemDialogClose = document.querySelector("#delete-item-dialog-close");
const deleteItemDialogCancel = document.querySelector("#delete-item-dialog-cancel");
const deleteItemDialogConfirm = document.querySelector("#delete-item-dialog-confirm");
const deleteItemDialogReasonOptions = [...document.querySelectorAll('input[name="delete-item-reason"]')];
const contactDialog = document.querySelector("#contact-dialog");
const contactDialogOwner = document.querySelector("#contact-dialog-owner");
const contactDialogClose = document.querySelector("#contact-dialog-close");
const contactDialogCancel = document.querySelector("#contact-dialog-cancel");
const contactDialogConfirm = document.querySelector("#contact-dialog-confirm");
const reportDialog = document.querySelector("#report-dialog");
const reportDialogTopline = document.querySelector("#report-dialog-topline");
const reportDialogCopy = document.querySelector("#report-dialog-copy");
const reportDialogItemTitle = document.querySelector("#report-dialog-item");
const reportDialogClose = document.querySelector("#report-dialog-close");
const reportDialogCancel = document.querySelector("#report-dialog-cancel");
const reportForm = document.querySelector("#report-form");
const reportReason = document.querySelector("#report-reason");
const reportReasonPicker = document.querySelector("#report-reason-picker");
const reportReasonTrigger = document.querySelector("#report-reason-trigger");
const reportReasonValue = document.querySelector("#report-reason-value");
const reportReasonMenu = document.querySelector("#report-reason-menu");
const reportReasonOptions = [...document.querySelectorAll("[data-report-reason-option]")];
const reportDetails = document.querySelector("#report-details");
const reportAllowAdminContact = document.querySelector("#report-allow-admin-contact");
const reportContactConsentCopy = document.querySelector("#report-contact-consent-copy");
const reportFormState = document.querySelector("#report-form-state");
const reportSubmitButton = document.querySelector("#report-submit-button");
const reportSuccessView = document.querySelector("#report-success-view");
const reportSuccessClose = document.querySelector("#report-success-close");
const reserveItemDialog = document.querySelector("#reserve-item-dialog");
const reserveItemDialogCancel = document.querySelector("#reserve-item-dialog-cancel");
const reserveItemDialogConfirm = document.querySelector("#reserve-item-dialog-confirm");
const reserveItemDurationOptions = [...document.querySelectorAll('input[name="reserve-duration"]')];
const reserveItemCustomDays = document.querySelector("#reserve-item-dialog-days");
const reserveItemCustomDaysField = document.querySelector("#reserve-item-dialog-custom");
const reserveItemDurationCopy = document.querySelector("#reserve-item-dialog-duration-copy");
const reserveItemExpiryCopy = document.querySelector("#reserve-item-dialog-expiry-copy");
const publishSuccessView = document.querySelector("#publish-success-view");
const favoritesCount = document.querySelector("#favorites-count");
const favoritesList = document.querySelector("#favorites-list");
const favoritesEmptyState = document.querySelector("#favorites-empty-state");
const favoritesEmptyTitle = document.querySelector("#favorites-empty-title");
const favoritesEmptyCopy = document.querySelector("#favorites-empty-copy");
const favoritesExploreButton = document.querySelector("#favorites-explore-button");
const successItemTitle = document.querySelector("#success-item-title");
const successItemStatus = document.querySelector("#success-item-status");
const viewPublishedButton = document.querySelector("#view-published-button");
const goPostsButton = document.querySelector("#go-posts-button");
const telegramAuthCard = document.querySelector("#telegram-auth-card");
const brandHomeLink = document.querySelector("#brand-home-link");
const telegramAuthTitle = document.querySelector("#telegram-auth-title");
const telegramAuthMessage = document.querySelector("#telegram-auth-message");
const telegramAuthGuidance = document.querySelector("#telegram-auth-guidance");
const telegramAuthPrivacy = document.querySelector("#telegram-auth-privacy");
const telegramAuthNamePrivacy = document.querySelector("#telegram-auth-name-privacy");
const telegramDownloadLink = document.querySelector("#telegram-download-link");
const telegramOpenLink = document.querySelector("#telegram-open-link");
const telegramUsernameHelp = document.querySelector("#telegram-username-help");
const telegramUsernameDialog = document.querySelector("#telegram-username-dialog");
const telegramUsernameDialogClose = document.querySelector("#telegram-username-dialog-close");
const telegramUsernameRetry = document.querySelector("#telegram-username-retry");
const offerForm = document.querySelector("#offer-form");
const offerSubmitButton = offerForm?.querySelector('button[type="submit"]');
const offerSubmitLabel = offerSubmitButton?.textContent?.trim() || "Publicar";
const offerImages = document.querySelector("#offer-images");
const offerCamera = document.querySelector("#offer-camera");
const offerCameraButton = document.querySelector("#offer-camera-button");
const offerPhotoPicker = document.querySelector("#offer-photo-picker");
const cameraDialog = document.querySelector("#camera-dialog");
const cameraPreview = document.querySelector("#camera-preview");
const cameraCanvas = document.querySelector("#camera-canvas");
const cameraDialogState = document.querySelector("#camera-dialog-state");
const cameraDialogClose = document.querySelector("#camera-dialog-close");
const cameraDialogCancel = document.querySelector("#camera-dialog-cancel");
const cameraCaptureButton = document.querySelector("#camera-capture-button");
const offerPreview = document.querySelector("#offer-preview");
const offerFormState = document.querySelector("#offer-form-state");
const offerPublishRetryButton = document.querySelector("#offer-publish-retry-button");
const offerConsent = document.querySelector("#offer-consent");
const postsContent = document.querySelector("#posts-content");
const postsAuthGate = document.querySelector("#posts-auth-gate");
const postsOpenTelegramLink = document.querySelector("#posts-open-telegram-link");
const postsList = document.querySelector("#posts-list");
const postsEmptyState = document.querySelector("#posts-empty-state");
const postsEmptyTitle = document.querySelector("#posts-empty-title");
const postsEmptyCopy = document.querySelector("#posts-empty-copy");
const postsActionState = document.querySelector("#posts-action-state");
const offerEmptyButton = document.querySelector("#offer-empty-button");
const postsTabs = [...document.querySelectorAll(".posts-tab")];
const postsActiveCount = document.querySelector("#posts-active-count");
const postsCompletedCount = document.querySelector("#posts-completed-count");
const userProfileView = document.querySelector("#user-profile-view");
const userProfileTitle = document.querySelector("#user-profile-title");
const userProfileCopy = document.querySelector("#user-profile-copy");
const userProfileReportButton = document.querySelector("#user-profile-report-button");
const userProfileState = document.querySelector("#user-profile-state");
const userProfileList = document.querySelector("#user-profile-list");
const userProfileEmpty = document.querySelector("#user-profile-empty");
const appBackButton = document.querySelector("#app-back-button");
const appForwardButton = document.querySelector("#app-forward-button");
const themeToggle = document.querySelector("#theme-toggle");
const themeToggleIcon = document.querySelector("#theme-toggle-icon");
const navItems = [...document.querySelectorAll(".nav-item")];

const categoryIcons = {
  Hogar: ["fa-house", "⌂"],
  Muebles: ["fa-couch", "▰"],
  Electrodomésticos: ["fa-blender", "▣"],
  Infantil: ["fa-child", "☺"],
  Ropa: ["fa-shirt", "◌"],
  Libros: ["fa-book-open", "▤"],
  "Música y cine": ["fa-music", "♫"],
  Tecnología: ["fa-laptop", "⌘"],
  "Móviles y telefonía": ["fa-mobile-screen-button", "▯"],
  Informática: ["fa-computer", "▣"],
  "Deportes y ocio": ["fa-futbol", "⚽"],
  Bicicletas: ["fa-bicycle", "♢"],
  "Juegos y videojuegos": ["fa-gamepad", "◉"],
  "Manualidades y coleccionismo": ["fa-palette", "✦"],
  "Jardín y bricolaje": ["fa-seedling", "❧"],
  Otros: ["fa-recycle", "♻"],
};

const themeOptions = ["system", "light", "dark"];
const themeLabels = {
  system: "sistema",
  light: "claro",
  dark: "oscuro",
};
const themeIcons = {
  system: ["fa-circle-half-stroke", "◐"],
  light: ["fa-sun", "☀"],
  dark: ["fa-moon", "☾"],
};

function setServiceState(element, label, stateName, text) {
  if (!element || !label) return;
  element.dataset.state = stateName;
  label.textContent = text;
}

function setSearchOpen(isOpen, focusInput = false) {
  if (!searchPanel || !searchToggle) return;
  searchPanel.hidden = !isOpen;
  searchToggle.setAttribute("aria-expanded", String(isOpen));
  searchToggle.classList.toggle("is-active", isOpen);
  searchToggle.setAttribute("aria-label", isOpen ? "Ocultar búsqueda" : "Mostrar búsqueda");
  searchToggle.setAttribute("title", isOpen ? "Ocultar búsqueda" : "Mostrar búsqueda");
  if (isOpen && focusInput && searchInput) {
    window.requestAnimationFrame(() => searchInput.focus());
  }
}

function createIconElement(iconName, fallback, className = "") {
  const icon = document.createElement("i");
  icon.className = `fa-solid ${iconName} fa-icon${className ? ` ${className}` : ""}`;
  icon.dataset.fallback = fallback;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function createCategoryIcon(category, className = "") {
  const [iconName, fallback] = categoryIcons[category] ?? categoryIcons.Otros;
  return createIconElement(iconName, fallback, className);
}

function readThemePreference() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return themeOptions.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(preference, persist = true) {
  const theme = themeOptions.includes(preference) ? preference : "system";
  const nextTheme = themeOptions[(themeOptions.indexOf(theme) + 1) % themeOptions.length];
  const [iconName, fallback] = themeIcons[theme];

  document.documentElement.dataset.theme = theme;
  if (themeToggle && themeToggleIcon) {
    themeToggleIcon.className = `fa-solid ${iconName} fa-icon`;
    themeToggleIcon.dataset.fallback = fallback;
    themeToggle.title = `Tema ${themeLabels[theme]}. Cambiar a ${themeLabels[nextTheme]}`;
    themeToggle.setAttribute("aria-label", themeToggle.title);
  }

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // El tema sigue aplicado durante esta sesión aunque el almacenamiento esté bloqueado.
    }
  }
}

function getHistoryIndex(historyState = window.history.state) {
  return Number.isInteger(historyState?.svIndex) ? historyState.svIndex : 0;
}

function getHistoryScrollY(historyState = window.history.state) {
  const scrollY = Number(historyState?.svScrollY);
  return Number.isFinite(scrollY) && scrollY >= 0 ? scrollY : 0;
}

function restoreHistoryScroll(historyState = window.history.state) {
  const scrollY = getHistoryScrollY(historyState);
  const restore = () => window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(restore);
    return;
  }
  restore();
}

function updateNavigationControls() {
  const currentIndex = getHistoryIndex();
  const canGoBack = Boolean(window.history.state?.svApp && currentIndex > 0);
  const canGoForward = Boolean(window.history.state?.svApp && currentIndex < state.historyMaxIndex);

  appBackButton.disabled = !canGoBack;
  appForwardButton.disabled = !canGoForward;

  const telegramBackButton = window.Telegram?.WebApp?.BackButton;
  if (telegramBackButton) {
    if (canGoBack && typeof telegramBackButton.show === "function") {
      telegramBackButton.show();
    } else if (!canGoBack && typeof telegramBackButton.hide === "function") {
      telegramBackButton.hide();
    }
  }
}

function normalizeRoutePath(path = window.location.pathname) {
  const normalized = String(path || "").replace(/\/+$/, "");
  return normalized || "/";
}

function getViewRoute(viewName, itemId = "") {
  if (viewName === "detail" && itemId) {
    return `/i/${encodeURIComponent(itemId)}/`;
  }
  if (viewName === USER_PROFILE_VIEW && state.currentUserUsername) {
    return `/u/${encodeURIComponent(state.currentUserUsername)}/`;
  }
  return VIEW_ROUTES[viewName] || "/";
}

function getViewFromPath(path = window.location.pathname) {
  const normalizedPath = normalizeRoutePath(path);
  const routeView = Object.entries(VIEW_ROUTES)
    .find(([, route]) => normalizeRoutePath(route) === normalizedPath)?.[0];
  if (routeView) return routeView;
  return getRouteUserUsername(path) ? USER_PROFILE_VIEW : "";
}

function pushViewHistory(viewName, itemId = "", username = state.currentUserUsername) {
  let currentState = window.history.state ?? {};
  if (currentState.svApp) {
    currentState = {
      ...currentState,
      svScrollY: Math.max(0, window.scrollY),
    };
    window.history.replaceState(currentState, "", window.location.href);
  }
  const nextIndex = getHistoryIndex(currentState) + 1;
  const url = new URL(window.location.href);
  url.search = LOCAL_AUTHOR_DEMO_MODE ? "?demo=author" : "";
  url.hash = "";
  if (viewName === USER_PROFILE_VIEW) {
    url.pathname = getUserProfileUrl(username, { absolute: false });
  } else {
    url.pathname = getViewRoute(viewName, itemId);
  }

  window.history.pushState({
    ...currentState,
    svApp: true,
    svView: viewName,
    svItemId: itemId || null,
    svUserUsername: viewName === USER_PROFILE_VIEW ? username : null,
    svIndex: nextIndex,
    svScrollY: 0,
  }, "", url);
  state.historyMaxIndex = nextIndex;
}

function goBack() {
  if (window.history.state?.svApp && getHistoryIndex() > 0) {
    window.history.back();
    return;
  }

  if (state.currentView !== "explore") {
    setView("explore");
  }
}

function goForward() {
  if (window.history.state?.svApp && getHistoryIndex() < state.historyMaxIndex) {
    window.history.forward();
  }
}

function getRouteItemId() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const modernMatch = path.match(/\/i\/([^/]+)$/);
  if (modernMatch) return decodeRoutePart(modernMatch[1]);

  const legacyPathMatch = path.match(/\/objetos\/([^/]+)$/);
  if (legacyPathMatch) return decodeRoutePart(legacyPathMatch[1]);

  if (window.location.hash.startsWith("#item=")) {
    return decodeRoutePart(window.location.hash.slice("#item=".length));
  }

  return "";
}

function getRouteView() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/favoritos" ? "favorites" : "";
}

function getTelegramStartParam() {
  const query = new URLSearchParams(window.location.search);
  const candidates = [
    window.Telegram?.WebApp?.initDataUnsafe?.start_param,
    telegramRuntime.startParam,
    query.get("tgWebAppStartParam"),
    query.get("startapp"),
  ];
  return candidates.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function getTelegramStartView() {
  // Telegram conserva start_param durante la sesión de la Mini App. Una vez
  // que la aplicación ya tiene una ruta propia, no debemos reaplicar el deep link
  // al recargar después de que el usuario haya navegado a otra vista.
  if (window.history.state?.svApp === true) return "";

  const startParam = getTelegramStartParam().toLowerCase();
  return {
    offer: "offer",
    profile: "posts",
    posts: "posts",
    favorites: "favorites",
  }[startParam] || "";
}

function getReportStartItemId() {
  if (!telegramRuntime.isTelegram) return "";

  const startParam = getTelegramStartParam();
  if (startParam.startsWith("report_user_")) return "";
  const match = startParam.match(/^report_([A-Za-z0-9][A-Za-z0-9_-]{5,79})$/);
  return match ? match[1] : "";
}

function getReportStartUsername() {
  if (!telegramRuntime.isTelegram) return "";

  const startParam = getTelegramStartParam();
  const match = startParam.match(/^report_user_([A-Za-z][A-Za-z0-9_]{4,31})$/i);
  return match ? normalizeTelegramUsername(match[1]) : "";
}

function getManageStartItemId() {
  if (!telegramRuntime.isTelegram) return "";

  const startParam = getTelegramStartParam();
  const match = startParam.match(/^manage_([A-Za-z0-9][A-Za-z0-9_-]{5,79})$/);
  return match ? match[1] : "";
}

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}

function getRouteUserUsername(path = window.location.pathname) {
  const match = normalizeRoutePath(path).match(/^\/u\/([^/]+)$/i);
  if (!match) return "";
  return normalizeTelegramUsername(decodeRoutePart(match[1]));
}

function getUserProfileUrl(username, { absolute = true } = {}) {
  const normalizedUsername = normalizeTelegramUsername(username);
  if (!normalizedUsername) return absolute ? `${PUBLIC_SITE_ORIGIN}/` : "/";

  const path = `/u/${encodeURIComponent(normalizedUsername)}/`;
  if (!absolute) return path;
  return `${window.location.origin}${path}`;
}

function getStaticItem() {
  const dataElement = document.querySelector("#static-item-data");
  if (!dataElement) return null;

  try {
    const parsed = JSON.parse(dataElement.textContent || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function updateRouteMetadata(viewName, itemId = "") {
  if (viewName === USER_PROFILE_VIEW && state.currentUserUsername) {
    document.title = `@${state.currentUserUsername} · Segunda Vida`;
  } else if (VIEW_TITLES[viewName]) {
    document.title = VIEW_TITLES[viewName];
  }

  const isPrivateView = PRIVATE_VIEW_NAMES.has(viewName);
  const isPublicDetail = viewName === "detail" && itemId && !isNotFoundPage;
  const isNotFoundRoute = viewName === "not-found"
    || (viewName === "detail" && isNotFoundPage);
  const robotsDirective = isPrivateView
    ? "noindex, nofollow"
    : isNotFoundRoute
      ? "noindex, follow"
      : "";

  let robots = document.querySelector('meta[name="robots"]');
  if (robotsDirective) {
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = robotsDirective;
  } else if (robots) {
    robots.remove();
  }

  const shouldHaveCanonical = ROUTE_VIEW_NAMES.has(viewName) || isPublicDetail;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!shouldHaveCanonical) {
    canonical?.remove();
    return;
  }

  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = viewName === USER_PROFILE_VIEW
    ? `${PUBLIC_SITE_ORIGIN}${getUserProfileUrl(state.currentUserUsername, { absolute: false })}`
    : `${PUBLIC_SITE_ORIGIN}${getViewRoute(viewName, itemId)}`;
}

function prepareHistoryState() {
  const currentState = window.history.state ?? {};
  const itemId = getRouteItemId();
  const username = getRouteUserUsername();
  const view = itemId
    ? "detail"
    : getTelegramStartView() || getViewFromPath() || (isNotFoundPage ? "not-found" : "explore");
  const index = getHistoryIndex(currentState);

  const canonicalUrl = new URL(window.location.href);
  if (itemId) {
    canonicalUrl.pathname = `/i/${encodeURIComponent(itemId)}/`;
    canonicalUrl.search = "";
    canonicalUrl.hash = "";
  } else if (ROUTE_VIEW_NAMES.has(view)) {
    canonicalUrl.pathname = view === USER_PROFILE_VIEW
      ? getUserProfileUrl(username, { absolute: false })
      : getViewRoute(view);
    canonicalUrl.search = "";
    canonicalUrl.hash = "";
  }

  window.history.replaceState({
    ...currentState,
    svApp: true,
    svView: view,
    svItemId: itemId || null,
    svUserUsername: view === USER_PROFILE_VIEW ? username : null,
    svIndex: index,
    svScrollY: Math.max(0, window.scrollY),
  }, "", canonicalUrl);
  state.currentView = view;
  state.currentItemId = itemId;
  state.currentUserUsername = username;
  state.historyMaxIndex = index;
  updateRouteMetadata(view, itemId);
  updateNavigationControls();
}

function formatDate(value) {
  if (!value) return "";

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
  }).format(date).replace(" de ", " ");
}

function formatCompactDate(value) {
  if (!value) return "";

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function formatDayMonth(value) {
  if (!value) return "";

  const normalized = String(value).includes(" ") ? String(value).replace(" ", "T") : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatPublicationDate(value) {
  if (!value) return "";

  const normalized = String(value).includes(" ") ? String(value).replace(" ", "T") : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatShortDateTime(value) {
  if (!value) return "";

  const rawValue = String(value);
  const normalized = rawValue.includes(" ") ? rawValue.replace(" ", "T") : rawValue;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date).replace(",", "");
}

function formatRelativeAge(value, now = Date.now()) {
  if (!value) return "";

  const rawValue = String(value);
  const normalized = rawValue.includes(" ") ? rawValue.replace(" ", "T") : rawValue;
  const timestamp = new Date(normalized).getTime();
  if (Number.isNaN(timestamp)) return "";

  const elapsedMs = now - timestamp;
  if (elapsedMs < 0) return "ahora mismo";
  if (elapsedMs < 60 * 1000) return "hace menos de 1 minuto";

  const units = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  const [unit, unitMs] = units.find(([, milliseconds]) => elapsedMs >= milliseconds);
  const amount = -Math.floor(elapsedMs / unitMs);

  try {
    return new Intl.RelativeTimeFormat("es-ES", { numeric: "always" }).format(amount, unit);
  } catch {
    const labels = {
      year: ["año", "años"],
      month: ["mes", "meses"],
      week: ["semana", "semanas"],
      day: ["día", "días"],
      hour: ["hora", "horas"],
      minute: ["minuto", "minutos"],
    };
    const label = labels[unit][Math.abs(amount) === 1 ? 0 : 1];
    return `hace ${Math.abs(amount)} ${label}`;
  }
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function configureDeliveryButton(button, status) {
  const completed = status === "completed";
  const actionLabel = completed ? "Volver a publicar" : "Está entregado";
  const actionIcon = completed ? "fa-rotate-left" : "fa-check";
  const fallback = completed ? "↶" : "✓";

  button.classList.toggle("secondary-button--complete", !completed);
  button.classList.toggle("secondary-button--reopen", completed);
  button.setAttribute("aria-label", actionLabel);

  button.replaceChildren(createIconElement(actionIcon, fallback), document.createTextNode(actionLabel));
}

function configureStatusButton(button, status) {
  if (!button) return;

  const reserved = status === "reserved";
  const actionLabel = reserved ? "Liberar reserva" : "Está reservado";
  const actionIcon = reserved ? "fa-rotate-left" : "fa-clock";
  const fallback = reserved ? "↶" : "◷";

  button.hidden = !["available", "reserved"].includes(status);
  button.disabled = button.hidden;
  button.setAttribute("aria-label", actionLabel);
  button.replaceChildren(createIconElement(actionIcon, fallback), document.createTextNode(actionLabel));
}

function configureDeleteButton(button, { labelled = false } = {}) {
  if (!button) return;
  button.setAttribute("aria-label", "Borrar objeto");
  const content = [createIconElement("fa-trash-can", "⌫")];
  if (labelled) content.push(document.createTextNode("Borrar"));
  button.replaceChildren(...content);
}

function normalizeTelegramUsername(value) {
  const username = String(value ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : "";
}

function normalizeTelegramDisplayName(user) {
  return [user?.first_name, user?.last_name]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .trim()
    .slice(0, 120);
}

function readOwnItems() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(OWN_ITEMS_STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((item) => item?.id) : [];
  } catch {
    return [];
  }
}

function saveOwnItems() {
  try {
    window.localStorage.setItem(OWN_ITEMS_STORAGE_KEY, JSON.stringify(state.myItems));
  } catch {
    // La lista sigue disponible durante esta sesión aunque el almacenamiento esté bloqueado.
  }
}

function readRecordedInteractions() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(INTERACTION_STORAGE_KEY) ?? "{}");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
}

function interactionStorageKey(itemId, action) {
  return `${action}:${itemId}`;
}

function hasRecordedInteraction(itemId, action) {
  const key = interactionStorageKey(itemId, action);
  return Boolean(readRecordedInteractions()[key]);
}

function markInteractionRecorded(itemId, action) {
  try {
    const stored = readRecordedInteractions();
    stored[interactionStorageKey(itemId, action)] = new Date().toISOString();
    window.localStorage.setItem(INTERACTION_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // El registro en backend sigue siendo útil aunque el almacenamiento local esté bloqueado.
  }
}

function renderInterestSignal(item) {
  if (!detailInterestSignal) return;

  const count = Number(item?.contactAttemptCount ?? 0);
  if (!Number.isFinite(count) || count < 1) {
    detailInterestSignal.hidden = true;
    detailInterestSignal.textContent = "";
    return;
  }

  detailInterestSignal.hidden = false;
  detailInterestSignal.textContent = count === 1
    ? "1 persona ha contactado"
    : `${count} personas han contactado`;
}

function updateSelectedContactAttemptCount(count) {
  const normalizedCount = Number(count);
  if (!Number.isFinite(normalizedCount) || normalizedCount < 0) return;

  const update = (item) => item?.id === state.selectedItem?.id
    ? { ...item, contactAttemptCount: normalizedCount }
    : item;
  state.selectedItem = update(state.selectedItem);
  state.items = state.items.map(update);
  state.myItems = state.myItems.map(update);
  renderInterestSignal(state.selectedItem);
}

async function recordItemInteraction(item, action) {
  if (!item?.id || !["interest", "contact_attempt"].includes(action)) return null;
  if (!api?.isInteractionConfigured || typeof api.recordInteraction !== "function") return null;
  const storageKey = interactionStorageKey(item.id, action);
  if (hasRecordedInteraction(item.id, action) || pendingInteractions.has(storageKey)) return null;

  pendingInteractions.add(storageKey);

  try {
    const result = await api.recordInteraction({
      item_id: item.id,
      action,
    });
    markInteractionRecorded(item.id, action);
    if (action === "contact_attempt") {
      updateSelectedContactAttemptCount(result.count ?? result.contact_attempt_count);
    }
    return result;
  } catch {
    // El registro nunca debe impedir que la persona contacte con quien ofrece.
    return null;
  } finally {
    pendingInteractions.delete(storageKey);
  }
}

function isUsableFavoriteId(value) {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$/.test(id);
}

function isUsableFavoriteActorId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? "").trim());
}

function createFavoriteActorId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    const next = character === "x" ? value : (value & 0x3) | 0x8;
    return next.toString(16);
  });
}

function getFavoriteActorId() {
  try {
    const stored = window.localStorage.getItem(FAVORITE_ACTOR_STORAGE_KEY);
    if (isUsableFavoriteActorId(stored)) return stored;
    const created = createFavoriteActorId();
    window.localStorage.setItem(FAVORITE_ACTOR_STORAGE_KEY, created);
    return created;
  } catch {
    return createFavoriteActorId();
  }
}

function readFavorites() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];

    const seen = new Set();
    return stored
      .map((entry, index) => {
        const id = typeof entry === "string" ? entry : entry?.id;
        const normalizedId = String(id ?? "").trim();
        if (!isUsableFavoriteId(normalizedId) || seen.has(normalizedId)) return null;
        seen.add(normalizedId);
        const savedAt = typeof entry === "object" && entry?.savedAt
          ? String(entry.savedAt)
          : new Date(Date.now() - index).toISOString();
        return { id: normalizedId, savedAt };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveFavorites(entries) {
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function isFavorite(item) {
  return Boolean(item?.id && state.favoriteEntries.some((entry) => entry.id === item.id));
}

function updateFavoriteButton(button, item) {
  if (!button || !item?.id) return;
  const active = isFavorite(item);
  const baseLabel = active
    ? `Quitar «${item.title}» de favoritos`
    : `Añadir «${item.title}» a favoritos`;
  const count = Math.max(0, Number(item.favoriteCount ?? 0));
  const actionLabel = count > 0 ? `${baseLabel}, ${count} favoritos` : baseLabel;
  const icon = document.createElement("i");
  icon.className = `${active ? "fa-solid" : "fa-regular"} fa-heart fa-icon`;
  icon.dataset.fallback = active ? "♥" : "♡";
  icon.setAttribute("aria-hidden", "true");
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", actionLabel);
  button.setAttribute("title", active ? "Quitar de favoritos" : "Añadir a favoritos");
  button.replaceChildren(icon);
  if (count > 0) {
    const countElement = document.createElement("span");
    countElement.className = "favorite-count";
    countElement.setAttribute("aria-hidden", "true");
    countElement.textContent = String(count);
    button.append(countElement);
  }
}

function refreshFavoriteControls(item) {
  if (!item?.id) return;
  document.querySelectorAll(".favorite-toggle").forEach((button) => {
    if (button.dataset.itemId === item.id) updateFavoriteButton(button, item);
  });
}

function createFavoriteButton(item, className = "") {
  const button = document.createElement("button");
  button.className = `favorite-toggle${className ? ` ${className}` : ""}`;
  button.type = "button";
  button.dataset.itemId = item.id;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(item, button);
  });
  updateFavoriteButton(button, item);
  return button;
}

function toggleFavorite(item, triggerButton = null) {
  if (!item?.id) return;

  const wasFavorite = isFavorite(item);
  const nextEntries = wasFavorite
    ? state.favoriteEntries.filter((entry) => entry.id !== item.id)
    : [
      ...state.favoriteEntries,
      { id: item.id, savedAt: new Date().toISOString() },
  ];
  state.favoriteEntries = nextEntries;
  saveFavorites(nextEntries);
  const action = wasFavorite ? "remove" : "add";

  refreshFavoriteControls(item);
  if (state.currentView === "favorites") renderFavorites();
  if (state.currentView === "detail" && state.selectedItem?.id === item.id) {
    updateFavoriteButton(detailFavorite, item);
  }

  window.SecondaVidaAnalytics?.trackEvent("favorite", action, item.id);
  void recordFavoriteInteraction(item, action);
  if (triggerButton?.isConnected) triggerButton.focus();
}

function updateFavoriteCount(item, count) {
  if (!item?.id) return;
  const normalizedCount = Math.max(0, Number.isFinite(Number(count)) ? Number(count) : 0);
  favoriteCountOverrides.set(item.id, normalizedCount);
  const update = (candidate) => candidate?.id === item.id
    ? { ...candidate, favoriteCount: normalizedCount }
    : candidate;
  state.items = state.items.map(update);
  state.myItems = state.myItems.map(update);
  state.staticItem = update(state.staticItem);
  state.selectedItem = update(state.selectedItem);
  const updatedItem = state.selectedItem?.id === item.id
    ? state.selectedItem
    : { ...item, favoriteCount: normalizedCount };
  refreshFavoriteControls(updatedItem);
  if (state.currentView === "detail" && state.selectedItem?.id === item.id) {
    updateFavoriteButton(detailFavorite, updatedItem);
  }
}

async function recordFavoriteInteraction(item, action) {
  if (!item?.id || !api?.isInteractionConfigured || typeof api.recordInteraction !== "function") return;
  const interactionAction = action === "add" ? "favorite_add" : "favorite_remove";
  const previous = pendingFavoriteInteractions.get(item.id) ?? Promise.resolve();
  const request = previous.catch(() => {}).then(async () => {
    const result = await api.recordInteraction({
      item_id: item.id,
      action: interactionAction,
      actor_id: getFavoriteActorId(),
    });
    if (result?.favorite_count !== undefined) {
      updateFavoriteCount(item, result.favorite_count);
    }
  });
  pendingFavoriteInteractions.set(item.id, request);
  try {
    await request;
  } catch {
    // El contador es una señal secundaria; el favorito local nunca se revierte.
  } finally {
    if (pendingFavoriteInteractions.get(item.id) === request) {
      pendingFavoriteInteractions.delete(item.id);
    }
  }
}

function getFavoriteItems() {
  const itemsById = new Map(state.items.map((item) => [item.id, item]));
  return state.favoriteEntries
    .map((entry) => ({ entry, item: itemsById.get(entry.id) }))
    .filter(({ item }) => item && ["available", "reserved"].includes(item.status) && isNotExpired(item))
    .sort((left, right) => {
      const leftTime = Date.parse(left.entry.savedAt) || 0;
      const rightTime = Date.parse(right.entry.savedAt) || 0;
      return rightTime - leftTime || String(left.item.id).localeCompare(String(right.item.id));
    })
    .map(({ item }) => item);
}

function renderFavorites() {
  if (!favoritesList || !favoritesEmptyState) return;

  const favoriteItems = getFavoriteItems();
  const hasStoredFavorites = state.favoriteEntries.length > 0;
  favoritesList.replaceChildren(...favoriteItems.map(createItemCard));
  favoritesList.hidden = favoriteItems.length === 0;
  favoritesEmptyState.hidden = favoriteItems.length > 0;
  if (favoritesCount) {
    favoritesCount.textContent = `${favoriteItems.length} ${favoriteItems.length === 1 ? "cosa" : "cosas"}`;
  }
  if (favoritesEmptyTitle) {
    favoritesEmptyTitle.textContent = hasStoredFavorites && favoriteItems.length === 0
      ? "Tus favoritos ya no están disponibles"
      : "Aún no tienes favoritos";
  }
  if (favoritesEmptyCopy) {
    favoritesEmptyCopy.textContent = hasStoredFavorites && favoriteItems.length === 0
      ? "Los objetos guardados ya no aparecen en el catálogo. Sigue explorando para encontrar algo nuevo."
      : "Pulsa el corazón de cualquier objeto para guardarlo aquí.";
  }
}

function rememberOwnItem(item) {
  if (!item?.id) return;

  const index = state.myItems.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) {
    state.myItems[index] = { ...state.myItems[index], ...item };
  } else {
    state.myItems.unshift(item);
  }

  saveOwnItems();
  renderMyItems();
}

function isOwnItem(item) {
  if (!item?.id) return false;
  if (LOCAL_AUTHOR_DEMO_MODE) return true;

  const authenticatedTelegramId = String(
    state.telegramUser?.telegram_id ?? state.telegramUser?.id ?? "",
  ).trim();
  const isVerified = Boolean(
    authenticatedTelegramId &&
    state.telegramUser?.valid === true &&
    auth?.hasInitData(),
  );
  if (!isVerified) return false;

  const ownerTelegramId = String(item.ownerTelegramId ?? "").trim();
  if (ownerTelegramId) return ownerTelegramId === authenticatedTelegramId;

  const currentUsername = normalizeTelegramUsername(state.telegramUser?.username);
  return Boolean(currentUsername && currentUsername === normalizeTelegramUsername(item.ownerUsername));
}

function isAdminUser() {
  return Boolean(
    state.telegramUser?.valid === true &&
    state.telegramUser?.is_admin === true &&
    auth?.hasInitData(),
  );
}

function refreshSelectedDetailForIdentity() {
  if (state.currentView !== "detail" || !state.selectedItem) return;
  renderDetail(state.selectedItem, { live: state.selectedItemLive });
}

function getItemStatusLabel(item, { privateView = false } = {}) {
  if (item?.status === "completed") return "Entregado";
  if (item?.status === "reserved") {
    return privateView && item.reservationExpiresAt
      ? `Reservado hasta ${formatShortDateTime(item.reservationExpiresAt)}`
      : "Reservado";
  }
  if (item?.status === "expired") return "Ya no disponible";
  if (item?.expiresAt && !isNotExpired(item)) return "Ya no disponible";
  if (item?.expiresAt) return `Disponible hasta ${formatDate(item.expiresAt)}`;
  return "Disponible ahora";
}

function getItemUrl(item) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.pathname = `/i/${encodeURIComponent(item.id)}/`;
  return url.toString();
}

function getTelegramMiniAppUrl(startParam = "") {
  const url = new URL(telegramRuntime.miniAppUrl || "https://t.me/pucelobot/segundavida");
  const normalizedStartParam = String(startParam).trim();
  if (normalizedStartParam) url.searchParams.set("startapp", normalizedStartParam);
  return url.toString();
}

function getReportMiniAppUrl(item) {
  return getTelegramMiniAppUrl(`report_${encodeURIComponent(item.id)}`);
}

function getHomeUrl() {
  const url = new URL(window.location.href);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getInterestMessage(item) {
  return `Hola, he visto que has publicado «${item.title}» en Segunda Vida de @aldeapucela y estoy interesado/a.\n\n${getItemUrl(item)}`;
}

function createCatalogCardMedia(item, index) {
  const imageUrl = getItemImageUrls(item)[0];
  if (!imageUrl) {
    const placeholder = document.createElement("div");
    placeholder.className = "item-card__placeholder";
    placeholder.append(createCategoryIcon(item.category));
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  const media = document.createElement("div");
  media.className = "item-card__media";
  media.dataset.itemId = item.id;
  media.dataset.imageState = "loading";

  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = item.title;
  image.loading = index < 4 ? "eager" : "lazy";
  image.decoding = "async";
  if (index < 2) image.fetchPriority = "high";
  image.addEventListener("error", () => {
    void recoverCatalogImage(item, image, media, imageUrl);
  }, { once: true });
  image.addEventListener("load", () => {
    media.dataset.imageState = "loaded";
  }, { once: true });
  media.append(image);
  return media;
}

function createItemCard(item, index) {
  const card = document.createElement("article");
  card.className = "item-card";
  card.style.animationDelay = `${Math.min(index * 60, 240)}ms`;
  card.dataset.itemId = item.id;

  card.append(createCatalogCardMedia(item, index));

  const body = document.createElement("div");
  body.className = "item-card__body";
  const titleRow = document.createElement("div");
  titleRow.className = "item-card__title-row";
  const openButton = document.createElement("button");
  openButton.className = "item-card__open";
  openButton.type = "button";
  openButton.setAttribute("aria-label", `Ver ${item.title}`);
  openButton.append(createTextElement("h3", "item-card__title", item.title));
  openButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showDetail(item);
  });
  titleRow.append(openButton);
  body.append(titleRow);

  const meta = document.createElement("div");
  meta.className = "item-card__meta";
  const category = document.createElement("span");
  category.className = "item-card__category";
  category.append(createCategoryIcon(item.category), document.createTextNode(item.category));
  meta.append(category);

  const availability = document.createElement("span");
  availability.className = "availability";
  const availabilityLabel = item.status === "reserved"
    ? "Reservado"
    : item.expiresAt
      ? `Hasta ${formatCompactDate(item.expiresAt)}`
      : "Disponible";
  const availabilityIcon = item.status === "reserved"
    ? createIconElement("fa-lock", "▣")
    : createIconElement("fa-clock", "◷");
  availability.append(
    availabilityIcon,
    document.createTextNode(availabilityLabel),
  );
  meta.append(availability);
  body.append(meta);

  card.append(body, createFavoriteButton(item, "favorite-toggle--card"));
  card.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) return;
    showDetail(item);
  });
  return card;
}

function getRelatedItems(item) {
  if (!item?.id || item.status === "not_found") return [];

  return sortNewestFirst(state.items.filter((candidate) => (
    candidate.id !== item.id &&
    candidate.category === item.category &&
    candidate.status === "available" &&
    isNotExpired(candidate)
  ))).slice(0, 3);
}

function getExplorationItems(item) {
  if (!item?.id || item.status === "not_found") return [];

  const availableItems = state.items.filter((candidate) => (
    candidate.id !== item.id &&
    candidate.status === "available" &&
    isNotExpired(candidate)
  ));

  for (let index = availableItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [availableItems[index], availableItems[swapIndex]] = [availableItems[swapIndex], availableItems[index]];
  }
  return availableItems.slice(0, 3);
}

function createRelatedItemCard(item) {
  const card = document.createElement("article");
  card.className = "related-item-card";
  card.dataset.itemId = item.id;

  const media = document.createElement("div");
  media.className = "related-item-card__media";
  const imageUrls = getItemImageUrls(item);
  if (imageUrls.length) {
    const image = document.createElement("img");
    image.src = imageUrls[0];
    image.alt = item.title;
    image.loading = "lazy";
    media.append(image);
  } else {
    media.classList.add("related-item-card__media--placeholder");
    media.append(createCategoryIcon(item.category));
  }
  card.append(media);

  const body = document.createElement("div");
  body.className = "related-item-card__body";
  const titleRow = document.createElement("div");
  titleRow.className = "related-item-card__title-row";
  const openButton = document.createElement("button");
  openButton.className = "related-item-card__open";
  openButton.type = "button";
  openButton.setAttribute("aria-label", `Ver ${item.title}`);
  openButton.append(createTextElement("h3", "related-item-card__title", item.title));
  openButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    showDetail(item);
  });
  titleRow.append(openButton);
  body.append(titleRow);
  body.append(createTextElement(
    "span",
    "related-item-card__availability",
    item.expiresAt ? `Hasta ${formatCompactDate(item.expiresAt)}` : "Disponible",
  ));
  card.append(body, createFavoriteButton(item, "favorite-toggle--card favorite-toggle--related"));

  card.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) return;
    showDetail(item);
  });
  return card;
}

function showRelatedCategory(category) {
  state.category = category;
  state.statusFilter = "available";
  state.query = "";
  if (searchInput) searchInput.value = "";
  setView("explore");
  renderCategories();
  renderStatusFilters();
  renderItems();
}

function renderRelatedItems(item) {
  if (!relatedItemsSection || !relatedItemsTrack || !relatedItemsEmpty || !relatedItemsBrowse) return;

  const canShowRelated = Boolean(item?.id && item.status !== "not_found");
  relatedItemsSection.hidden = !canShowRelated;
  relatedItemsTrack.replaceChildren();
  relatedItemsTrack.hidden = !canShowRelated;
  relatedItemsEmpty.hidden = true;
  relatedItemsBrowse.hidden = true;
  if (relatedItemsCopy) relatedItemsCopy.textContent = "";

  if (!canShowRelated) return;

  relatedItemsBrowse.hidden = false;
  relatedItemsBrowse.href = getHomeUrl();
  const relatedItems = getRelatedItems(item);
  const fallbackItems = relatedItems.length ? [] : getExplorationItems(item);
  const itemsToRender = relatedItems.length ? relatedItems : fallbackItems;
  const isFallback = relatedItems.length === 0;
  if (relatedItemsTitle) relatedItemsTitle.textContent = isFallback ? "Sigue explorando" : "Relacionados";
  relatedItemsBrowse.dataset.category = isFallback ? "Todo" : item.category;
  relatedItemsBrowse.setAttribute(
    "aria-label",
    isFallback ? "Ver más objetos disponibles" : `Ver más objetos de ${item.category}`,
  );

  if (itemsToRender.length) {
    if (relatedItemsCopy) {
      relatedItemsCopy.textContent = isFallback
        ? "Otros objetos disponibles que también podrían interesarte."
        : `Más objetos disponibles de ${item.category}.`;
    }
    relatedItemsTrack.replaceChildren(...itemsToRender.map(createRelatedItemCard));
    relatedItemsTrack.hidden = false;
    return;
  }

  relatedItemsTrack.hidden = true;
  relatedItemsEmpty.hidden = false;
}

function renderCompletedActionState(item) {
  if (!detailActionState) return;

  detailActionState.replaceChildren();
  detailActionState.className = "action-state action-state--completed";
  detailActionState.dataset.state = "success";

  const icon = document.createElement("span");
  icon.className = "action-state__icon";
  icon.append(createIconElement("fa-heart", "♥"));

  const content = document.createElement("div");
  content.className = "action-state__content";

  const title = document.createElement("strong");
  title.textContent = "Este objeto ya tiene una segunda vida";

  const copy = document.createElement("p");
  copy.textContent = "Sigue explorando otros objetos parecidos que aún buscan una segunda casa.";

  const action = document.createElement("button");
  action.className = "secondary-button secondary-button--compact action-state__action";
  action.type = "button";
  action.textContent = "Seguir explorando";
  action.addEventListener("click", () => {
    const hasRelatedItems = getRelatedItems(item).length > 0;
    if (hasRelatedItems && relatedItemsSection) {
      relatedItemsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setView("explore");
  });

  content.append(title, copy, action);
  detailActionState.append(icon, content);
}

function renderReservedActionState() {
  if (!detailActionState) return;

  detailActionState.replaceChildren();
  detailActionState.className = "action-state action-state--reserved";
  detailActionState.dataset.state = "info";

  const icon = document.createElement("span");
  icon.className = "action-state__icon";
  icon.append(createIconElement("fa-lock", "▣"));

  const content = document.createElement("div");
  content.className = "action-state__content";
  content.append(createTextElement("strong", "", "Este objeto ya está reservado."));
  content.append(createTextElement(
    "p",
    "",
    "Si no se entregara, el autor podría volver a publicarlo.",
  ));
  detailActionState.append(icon, content);
}

function createPhotoCarousel(item, { className = "", openLightbox = true } = {}) {
  const urls = getItemImageUrls(item);
  const carousel = document.createElement("div");
  carousel.className = `photo-carousel${className ? ` ${className}` : ""}`;
  carousel.setAttribute("role", "group");
  carousel.setAttribute("aria-label", urls.length > 1 ? `${urls.length} fotos` : "Foto");

  const viewport = document.createElement("div");
  viewport.className = "photo-carousel__viewport";
  const track = document.createElement("div");
  track.className = "photo-carousel__track";

  let currentIndex = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let swipeHappened = false;
  let swipeResetTimer = null;

  const indicators = document.createElement("div");
  indicators.className = "photo-carousel__indicators";
  indicators.setAttribute("aria-label", "Seleccionar foto");

  const indicatorButtons = urls.map((url, index) => {
    const indicator = document.createElement("button");
    indicator.className = "photo-carousel__indicator";
    indicator.type = "button";
    indicator.setAttribute("aria-label", `Ver foto ${index + 1}`);
    indicator.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setIndex(index);
    });
    indicators.append(indicator);
    return indicator;
  });

  const setIndex = (nextIndex) => {
    currentIndex = (nextIndex + urls.length) % urls.length;
    track.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;
    indicatorButtons.forEach((indicator, index) => {
      const active = index === currentIndex;
      indicator.classList.toggle("is-active", active);
      indicator.setAttribute("aria-current", active ? "true" : "false");
    });
  };

  urls.forEach((url, index) => {
    const slide = document.createElement("button");
    slide.className = "photo-carousel__slide";
    slide.type = "button";
    slide.setAttribute(
      "aria-label",
      openLightbox ? `Abrir foto ${index + 1} en grande` : `Ver ficha, foto ${index + 1}`,
    );
    slide.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (swipeHappened) return;
      if (openLightbox) {
        openPhotoLightbox(item, index, slide);
      } else {
        showDetail(item);
      }
    });

    const image = document.createElement("img");
    image.className = "photo-carousel__image";
    image.src = url;
    image.alt = item.title;
    image.loading = index === 0 ? "eager" : "lazy";
    image.draggable = false;
    slide.append(image);
    track.append(slide);
  });

  viewport.append(track);
  carousel.append(viewport);

  if (urls.length > 1) {
    carousel.append(indicators);

    viewport.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      swipeHappened = false;
    }, { passive: true });

    viewport.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

      swipeHappened = true;
      setIndex(currentIndex + (deltaX < 0 ? 1 : -1));
      window.clearTimeout(swipeResetTimer);
      swipeResetTimer = window.setTimeout(() => {
        swipeHappened = false;
      }, 350);
    }, { passive: true });
  }

  setIndex(0);
  return carousel;
}

function createOwnedItemCard(item) {
  const card = document.createElement("article");
  card.className = "owned-item-card";

  const itemLink = document.createElement("button");
  itemLink.className = "owned-item-card__link";
  itemLink.type = "button";
  itemLink.setAttribute("aria-label", `Ver publicación: ${item.title}`);
  itemLink.addEventListener("click", () => showDetail(item));

  const thumbnail = document.createElement("span");
  thumbnail.className = "owned-item-card__thumb";
  const imageUrls = getItemImageUrls(item);
  if (imageUrls.length) {
    const image = document.createElement("img");
    image.src = imageUrls[0];
    image.alt = "";
    image.loading = "lazy";
    thumbnail.append(image);
  } else {
    thumbnail.classList.add("owned-item-card__thumb--placeholder");
    thumbnail.append(createCategoryIcon(item.category));
  }
  itemLink.append(thumbnail);

  const content = document.createElement("span");
  content.className = "owned-item-card__content";
  const heading = document.createElement("span");
  heading.className = "owned-item-card__heading";
  const title = createTextElement("span", "owned-item-card__title", item.title);
  title.setAttribute("role", "heading");
  title.setAttribute("aria-level", "2");
  heading.append(title);
  heading.append(createTextElement(
    "span",
    `owned-item-card__status ${item.status === "completed" ? "is-completed" : item.status === "reserved" ? "is-reserved" : ""}`,
    getItemStatusLabel(item, { privateView: true }),
  ));
  content.append(heading);
  content.append(createTextElement("span", "owned-item-card__meta", `${item.category} · ${item.zone}`));
  itemLink.append(content);
  card.append(itemLink);

  const actions = document.createElement("div");
  actions.className = "owned-item-card__actions";

  const deliveredButton = document.createElement("button");
  deliveredButton.className = "secondary-button secondary-button--compact delivery-action-button";
  deliveredButton.type = "button";
  configureDeliveryButton(deliveredButton, item.status);
  const statusButton = document.createElement("button");
  statusButton.className = "secondary-button secondary-button--compact delivery-action-button status-action-button";
  statusButton.type = "button";
  configureStatusButton(statusButton, item.status);
  const deleteButton = document.createElement("button");
  deleteButton.className = "quiet-action quiet-action--delete owned-item-card__delete";
  deleteButton.type = "button";
  configureDeleteButton(deleteButton);
  const actionState = createTextElement("p", "owned-item-card__state", "");
  deliveredButton.addEventListener("click", () => completeItem(item, deliveredButton, actionState));
  statusButton.addEventListener("click", () => {
    const action = item.status === "reserved" ? "release" : "reserve";
    if (action === "reserve") {
      openReserveItemDialog(item, statusButton, actionState);
      return;
    }
    void manageItemAction(item, action, statusButton, actionState);
  });
  deleteButton.addEventListener("click", () => openDeleteItemDialog(item, deleteButton));
  actions.append(statusButton);
  actions.append(deliveredButton);
  actions.append(deleteButton);
  card.append(actions);
  card.append(actionState);

  return card;
}

function createLocalAuthorDemoItems(items) {
  const activeItems = items
    .filter((item) => ["available", "reserved"].includes(item.status))
    .slice(0, 3)
    .map((item) => ({
      ...item,
      ownerDisplayName: LOCAL_AUTHOR_DEMO_DISPLAY_NAME,
      ownerUsername: LOCAL_AUTHOR_DEMO_USERNAME,
      ownerTelegramId: "demo-author",
    }));
  const completedSource = activeItems[0];

  if (!completedSource) return activeItems;

  return [
    ...activeItems,
    {
      ...completedSource,
      id: `${completedSource.id}-completed-demo`,
      title: `${completedSource.title} · entregado`,
      ownerDisplayName: LOCAL_AUTHOR_DEMO_DISPLAY_NAME,
      ownerUsername: LOCAL_AUTHOR_DEMO_USERNAME,
      ownerTelegramId: "demo-author",
      status: "completed",
      expiresAt: null,
      completedAt: new Date().toISOString(),
    },
  ];
}

function renderMyItems() {
  const catalogOwnedItems = state.items.filter(isOwnItem);
  let changed = false;
  catalogOwnedItems.forEach((item) => {
    const index = state.myItems.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) {
      const currentItem = state.myItems[index];
      const currentImageUrls = getItemImageUrls(currentItem);
      const catalogImageUrls = getItemImageUrls(item);
      const imageUrls = catalogImageUrls.length ? catalogImageUrls : currentImageUrls;
      state.myItems[index] = {
        ...currentItem,
        ...item,
        imageUrl: item.imageUrl || imageUrls[0] || null,
        imageUrls,
      };
      changed = true;
    }
  });
  if (changed) saveOwnItems();

  const items = state.myItems.filter(isOwnItem);
  const activeItems = items.filter((item) => item.status !== "completed");
  const completedItems = items.filter((item) => item.status === "completed");
  const visibleItems = state.postsFilter === "completed" ? completedItems : activeItems;

  postsActiveCount.textContent = String(activeItems.length);
  postsCompletedCount.textContent = String(completedItems.length);
  postsTabs.forEach((tab) => {
    const selected = tab.dataset.postsFilter === state.postsFilter;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });

  postsList.replaceChildren(...visibleItems.map(createOwnedItemCard));
  postsEmptyState.hidden = visibleItems.length > 0;
  offerEmptyButton.hidden = state.postsFilter !== "active" || visibleItems.length > 0;
  postsEmptyTitle.textContent = state.postsFilter === "completed"
    ? "Aún no tienes publicaciones finalizadas"
    : "Aún no tienes publicaciones activas";
  postsEmptyCopy.textContent = state.postsFilter === "completed"
    ? "Cuando marques una publicación como entregada, aparecerá aquí."
    : "Cuando ofrezcas algo, aparecerá en esta sección.";
}

function getItemImageUrls(item) {
  const imageUrls = Array.isArray(item?.imageUrls)
    ? item.imageUrls.filter((url) => typeof url === "string" && url.trim())
    : [];

  if (item?.imageUrl && !imageUrls.includes(item.imageUrl)) {
    imageUrls.unshift(item.imageUrl);
  }

  return [...new Set(imageUrls)];
}

function mergeFreshCatalogImageUrls(records) {
  const freshById = new Map((Array.isArray(records) ? records : []).map((item) => [item.id, item]));
  const mergeItem = (item) => {
    const freshItem = freshById.get(item?.id);
    if (!freshItem) return item;
    return {
      ...item,
      imageUrl: freshItem.imageUrl ?? null,
      imageUrls: Array.isArray(freshItem.imageUrls) ? freshItem.imageUrls : [],
    };
  };

  state.catalogItems = state.catalogItems.map(mergeItem);
  state.items = state.items.map(mergeItem);
  state.myItems = state.myItems.map(mergeItem);
  state.selectedItem = mergeItem(state.selectedItem);
  state.staticItem = mergeItem(state.staticItem);
  return freshById;
}

function getCurrentCatalogItem(itemId) {
  return state.items.find((item) => item.id === itemId)
    ?? state.catalogItems.find((item) => item.id === itemId)
    ?? null;
}

function loadCatalogImageUrl(image, url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => finish(false), IMAGE_LOAD_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (loaded) {
        resolve();
      } else {
        reject(new Error("catalog_image_unavailable"));
      }
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    image.src = url;
    if (image.complete) {
      window.queueMicrotask(() => finish(image.naturalWidth > 0));
    }
  });
}

function showCatalogImagePlaceholder(item, image, media) {
  media.dataset.imageState = "placeholder";
  media.replaceChildren(createCategoryIcon(item.category));
  image.remove();
}

async function recoverCatalogImage(item, image, media, originalUrl) {
  if (!image.isConnected) return;

  media.dataset.imageState = "retrying";
  image.hidden = true;

  await catalogResilience?.wait?.(IMAGE_RETRY_DELAY_MS);
  if (!image.isConnected) return;

  try {
    await loadCatalogImageUrl(image, originalUrl);
    media.dataset.imageState = "loaded";
    image.hidden = false;
    return;
  } catch {
    // The URL may have expired while it was waiting in the lazy-loading queue.
  }

  let freshById;
  try {
    freshById = await refreshCatalogImageUrls();
  } catch {
    freshById = null;
  }

  if (!image.isConnected) return;
  const freshItem = freshById?.get(item.id) ?? getCurrentCatalogItem(item.id) ?? item;
  const freshUrls = getItemImageUrls(freshItem);
  if (!freshUrls.length) {
    showCatalogImagePlaceholder(freshItem, image, media);
    return;
  }

  try {
    await loadCatalogImageUrl(image, freshUrls[0]);
    media.dataset.imageState = "loaded";
    image.hidden = false;
    return;
  } catch {
    media.dataset.imageState = "retrying";
    image.hidden = true;
  }

  window.setTimeout(() => {
    if (image.isConnected) void recoverCatalogImage(freshItem, image, media, freshUrls[0]);
  }, IMAGE_REFRESH_INTERVAL_MS);
}

function updatePhotoLightbox() {
  if (!photoLightbox || !photoLightboxImage || !photoLightboxUrls.length) return;

  const total = photoLightboxUrls.length;
  const url = photoLightboxUrls[photoLightboxIndex];
  photoLightboxImage.src = url;
  photoLightboxImage.alt = `${photoLightboxTitle.textContent} · foto ${photoLightboxIndex + 1}`;
  photoLightboxCounter.textContent = total > 1
    ? `${photoLightboxIndex + 1} / ${total}`
    : "";
  photoLightboxPrevious.hidden = total < 2;
  photoLightboxNext.hidden = total < 2;

  photoLightboxThumbs.replaceChildren(...photoLightboxUrls.map((thumbUrl, index) => {
    const button = document.createElement("button");
    button.className = "photo-lightbox__thumb";
    button.type = "button";
    button.setAttribute("aria-label", `Ver foto ${index + 1}`);
    button.setAttribute("aria-pressed", String(index === photoLightboxIndex));
    button.classList.toggle("is-active", index === photoLightboxIndex);
    button.addEventListener("click", () => {
      photoLightboxIndex = index;
      updatePhotoLightbox();
    });

    const image = document.createElement("img");
    image.src = thumbUrl;
    image.alt = "";
    image.loading = "lazy";
    button.append(image);
    return button;
  }));
}

function openPhotoLightbox(item, index = 0, trigger = null) {
  if (!photoLightbox) return;

  photoLightboxUrls = getItemImageUrls(item);
  if (!photoLightboxUrls.length) return;

  photoLightboxIndex = Math.min(Math.max(index, 0), photoLightboxUrls.length - 1);
  photoLightboxTitle.textContent = item.title || "Foto";
  photoLightboxReturnFocus = trigger || document.activeElement;
  updatePhotoLightbox();

  if (typeof photoLightbox.showModal === "function") {
    photoLightbox.showModal();
  } else {
    photoLightbox.setAttribute("open", "");
  }
  document.body.classList.add("photo-lightbox-open");
}

function closePhotoLightbox() {
  if (!photoLightbox) return;

  if (photoLightbox.open && typeof photoLightbox.close === "function") {
    photoLightbox.close();
  } else {
    photoLightbox.removeAttribute("open");
  }

  document.body.classList.remove("photo-lightbox-open");
  if (photoLightboxReturnFocus?.isConnected) photoLightboxReturnFocus.focus();
  photoLightboxReturnFocus = null;
}

function movePhotoLightbox(step) {
  if (photoLightboxUrls.length < 2) return;
  photoLightboxIndex = (photoLightboxIndex + step + photoLightboxUrls.length) % photoLightboxUrls.length;
  updatePhotoLightbox();
}

function handlePhotoLightboxTouchStart(event) {
  if (photoLightboxUrls.length < 2) return;
  const touch = event.changedTouches[0];
  if (!touch) return;
  photoLightboxTouchStartX = touch.clientX;
  photoLightboxTouchStartY = touch.clientY;
}

function handlePhotoLightboxTouchEnd(event) {
  if (photoLightboxUrls.length < 2) return;
  const touch = event.changedTouches[0];
  if (!touch) return;
  const deltaX = touch.clientX - photoLightboxTouchStartX;
  const deltaY = touch.clientY - photoLightboxTouchStartY;
  if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
  movePhotoLightbox(deltaX < 0 ? 1 : -1);
}

function getEditPhotoEntries(item) {
  const urls = getItemImageUrls(item);
  const keys = Array.isArray(item?.photoKeys) ? item.photoKeys : [];
  return urls.map((url, index) => ({
    url,
    key: String(keys[index] ?? `index:${index}`),
  }));
}

function revokeInlineEditPreviewUrls() {
  state.inlineEdit?.previewUrls?.forEach((url) => URL.revokeObjectURL(url));
  if (state.inlineEdit) state.inlineEdit.previewUrls = [];
}

function setInlineEditMessage(message = "", stateName = "") {
  if (!detailActionState) return;
  detailActionState.textContent = message;
  detailActionState.dataset.state = stateName;
}

function setInlineEditSaveButtonState(isSaving) {
  if (!editSaveButton) return;

  editSaveButton.disabled = isSaving;
  if (editCancelButton) editCancelButton.disabled = isSaving;
  editSaveButton.classList.toggle("is-loading", isSaving);
  editSaveButton.setAttribute("aria-busy", String(isSaving));

  if (isSaving) {
    const spinner = document.createElement("span");
    spinner.className = "button-loading";
    spinner.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = "Guardando…";
    editSaveButton.replaceChildren(spinner, label);
    return;
  }

  editSaveButton.replaceChildren(
    createIconElement("fa-check", "✓"),
    document.createTextNode("Guardar cambios"),
  );
}

function resetInlineEditButtons() {
  setInlineEditSaveButtonState(false);
  if (editCancelButton) editCancelButton.disabled = false;
}

function getInlineEditSelectOptions(selectId, { includeEmpty = false } = {}) {
  const source = document.querySelector(`#${selectId}`);
  return source
    ? [...source.options].filter((option) => includeEmpty || option.value).map((option) => ({
        value: option.value,
        label: option.textContent,
      }))
    : [];
}

function createInlineEditSelect(options, value, label) {
  const select = document.createElement("select");
  select.className = "detail-inline-edit__control";
  select.setAttribute("aria-label", label);
  options.forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    option.selected = optionData.value === value;
    select.append(option);
  });
  return select;
}

function renderInlineEditMedia() {
  const edit = state.inlineEdit;
  if (!edit || !detailMedia) return;

  revokeInlineEditPreviewUrls();
  detailMedia.replaceChildren();
  detailMedia.classList.add("detail-media--editing");

  const editor = document.createElement("div");
  editor.className = "detail-inline-edit__media-editor";
  const grid = document.createElement("div");
  grid.className = "detail-inline-edit__photos";

  edit.existingPhotos.forEach((photo, index) => {
    const tile = document.createElement("div");
    tile.className = "detail-inline-edit__photo";
    const image = document.createElement("img");
    image.src = photo.url;
    image.alt = `Foto ${index + 1}`;
    tile.append(image);
    const remove = document.createElement("button");
    remove.className = "detail-inline-edit__photo-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Quitar foto ${index + 1}`);
    remove.title = "Quitar foto";
    remove.innerHTML = '<i class="fa-solid fa-xmark fa-icon" data-fallback="×" aria-hidden="true"></i>';
    remove.addEventListener("click", () => {
      edit.existingPhotos.splice(index, 1);
      renderInlineEditMedia();
    });
    tile.append(remove);
    grid.append(tile);
  });

  edit.newFiles.forEach((file, index) => {
    const tile = document.createElement("div");
    tile.className = "detail-inline-edit__photo";
    const image = document.createElement("img");
    const previewUrl = URL.createObjectURL(file);
    edit.previewUrls.push(previewUrl);
    image.src = previewUrl;
    image.alt = file.name;
    tile.append(image);
    const remove = document.createElement("button");
    remove.className = "detail-inline-edit__photo-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Quitar foto ${edit.existingPhotos.length + index + 1}`);
    remove.title = "Quitar foto";
    remove.innerHTML = '<i class="fa-solid fa-xmark fa-icon" data-fallback="×" aria-hidden="true"></i>';
    remove.addEventListener("click", () => {
      edit.newFiles.splice(index, 1);
      renderInlineEditMedia();
    });
    tile.append(remove);
    grid.append(tile);
  });

  if (!grid.children.length) {
    const empty = document.createElement("p");
    empty.className = "detail-inline-edit__photos-empty";
    empty.textContent = "Añade al menos una foto.";
    grid.append(empty);
  }

  const actions = document.createElement("div");
  actions.className = "detail-inline-edit__photo-actions";
  const galleryButton = document.createElement("button");
  galleryButton.className = "secondary-button secondary-button--compact";
  galleryButton.type = "button";
  galleryButton.innerHTML = '<i class="fa-solid fa-images fa-icon" data-fallback="▧" aria-hidden="true"></i><span>Añadir foto</span>';
  galleryButton.addEventListener("click", () => editImages?.click());
  actions.append(galleryButton);

  const cameraButton = document.createElement("button");
  cameraButton.className = "secondary-button secondary-button--compact";
  cameraButton.type = "button";
  cameraButton.innerHTML = '<i class="fa-solid fa-camera fa-icon" data-fallback="◎" aria-hidden="true"></i><span>Hacer foto</span>';
  cameraButton.addEventListener("click", () => {
    cameraCaptureTarget = "edit";
    void handleCameraRequest();
  });
  actions.append(cameraButton);

  const note = document.createElement("p");
  note.className = "detail-inline-edit__photo-note";
  note.textContent = "Entre 1 y 2 fotos. Se optimizan en el navegador y n8n las normaliza si hiciera falta.";
  editor.append(grid, actions, note);
  detailMedia.append(editor);
}

function openInlineEdit(item = state.selectedItem) {
  const source = state.myItems.find((candidate) => candidate.id === item?.id) ?? item;
  const adminUser = isAdminUser();
  const adminEditable = adminUser && ["available", "reserved", "completed", "expired"].includes(source?.status);
  const ownerEditable = isOwnItem(source) && source?.status === "available" && isNotExpired(source);
  if (!source?.id || (!adminEditable && !ownerEditable)) return;

  resetInlineEditButtons();
  state.inlineEdit = {
    itemId: source.id,
    baseUpdatedAt: source.updatedAt ?? null,
    item: source,
    title: String(source.title ?? ""),
    description: String(source.description ?? ""),
    category: String(source.category ?? "Otros"),
    zone: String(source.zone ?? "Valladolid"),
    condition: itemCondition?.normalize(source.condition) ?? "",
    existingPhotos: getEditPhotoEntries(source),
    newFiles: [],
    previewUrls: [],
  };

  detailTitle.replaceChildren();
  const titleInput = document.createElement("input");
  titleInput.className = "detail-inline-edit__control detail-inline-edit__title";
  titleInput.type = "text";
  titleInput.maxLength = 80;
  titleInput.value = state.inlineEdit.title;
  titleInput.setAttribute("aria-label", "Título");
  titleInput.addEventListener("input", () => { state.inlineEdit.title = titleInput.value; });
  detailTitle.append(titleInput);

  detailCategory.replaceChildren(createInlineEditSelect(
    getInlineEditSelectOptions("offer-category"),
    state.inlineEdit.category,
    "Categoría",
  ));
  detailCategory.firstElementChild.addEventListener("change", (event) => {
    state.inlineEdit.category = event.target.value;
  });

  const conditionSelect = createInlineEditSelect(
    getInlineEditSelectOptions("offer-condition", { includeEmpty: true }),
    state.inlineEdit.condition,
    "Estado",
  );
  detailCondition.replaceChildren(conditionSelect);
  conditionSelect.addEventListener("change", (event) => {
    state.inlineEdit.condition = event.target.value;
  });

  detailDescription.hidden = false;
  detailDescription.replaceChildren();
  const descriptionInput = document.createElement("textarea");
  descriptionInput.className = "detail-inline-edit__control detail-inline-edit__description";
  descriptionInput.maxLength = 600;
  descriptionInput.rows = 4;
  descriptionInput.value = state.inlineEdit.description;
  descriptionInput.setAttribute("aria-label", "Descripción");
  descriptionInput.addEventListener("input", () => { state.inlineEdit.description = descriptionInput.value; });
  detailDescription.append(descriptionInput);

  const zoneSelect = createInlineEditSelect(
    getInlineEditSelectOptions("offer-zone"),
    state.inlineEdit.zone,
    "Zona aproximada",
  );
  detailZone.replaceChildren(zoneSelect);
  zoneSelect.addEventListener("change", (event) => { state.inlineEdit.zone = event.target.value; });

  renderInlineEditMedia();
  editItemButton.hidden = true;
  if (detailOwnerEditRow) detailOwnerEditRow.hidden = true;
  detailInlineEditActions.hidden = false;
  interestButton.hidden = true;
  reportProblemButton.hidden = true;
  manageStatusButton.disabled = true;
  markDeliveredButton.disabled = true;
  deleteItemButton.hidden = true;
  deleteItemButton.disabled = true;
  setInlineEditMessage("Puedes cambiar el título, el texto, la categoría, el estado, la zona y las fotos.");
  titleInput.focus();
}

function cancelInlineEdit() {
  const item = state.inlineEdit?.item ?? state.selectedItem;
  revokeInlineEditPreviewUrls();
  state.inlineEdit = null;
  if (editImages) editImages.value = "";
  if (item) renderDetail(item, { live: state.selectedItemLive });
}

function handleEditPhotoSelection(event, selectedFiles = null) {
  const edit = state.inlineEdit;
  if (!edit) return;
  const files = selectedFiles ?? [...event.target.files];
  event.target.value = "";
  const invalidFiles = files.filter((file) => !ALLOWED_PHOTO_TYPES.has(file.type));
  const existingKeys = new Set(edit.newFiles.map(photoKey));
  const newFiles = files.filter((file) => ALLOWED_PHOTO_TYPES.has(file.type) && !existingKeys.has(photoKey(file)));
  const availableSlots = Math.max(0, MAX_OFFER_PHOTOS - edit.existingPhotos.length - edit.newFiles.length);
  const filesToAdd = newFiles.slice(0, availableSlots);
  edit.newFiles.push(...filesToAdd);
  renderInlineEditMedia();

  if (filesToAdd.length < newFiles.length) {
    setInlineEditMessage(`Puedes guardar hasta ${MAX_OFFER_PHOTOS} fotos.`, "error");
  } else if (invalidFiles.length) {
    setInlineEditMessage("Cada foto debe ser JPG, PNG o WebP.", "error");
  } else {
    setInlineEditMessage("");
  }
}

async function saveInlineEdit() {
  const edit = state.inlineEdit;
  if (!edit || editSaveButton?.disabled) return;

  const title = edit.title.trim();
  const description = edit.description.trim();
  const finalPhotoCount = edit.existingPhotos.length + edit.newFiles.length;
  if (title.length < 3 || title.length > 80) {
    setInlineEditMessage("El título debe tener entre 3 y 80 caracteres.", "error");
    return;
  }
  if (!edit.category || !edit.zone || !itemCondition?.isValid(edit.condition) || description.length > 600) {
    setInlineEditMessage("Revisa la categoría, el estado, la zona y la descripción.", "error");
    return;
  }
  if (finalPhotoCount < 1 || finalPhotoCount > MAX_OFFER_PHOTOS) {
    setInlineEditMessage(`La publicación debe conservar entre 1 y ${MAX_OFFER_PHOTOS} fotos.`, "error");
    return;
  }
  if (!requireTelegramSession(detailActionState, "Abre la Mini App desde Telegram para guardar cambios.")) return;
  if (!api?.isEditConfigured || typeof api.editItem !== "function") {
    setInlineEditMessage("La edición todavía no está conectada en n8n.", "error");
    return;
  }

  setInlineEditSaveButtonState(true);
  setInlineEditMessage("Comprobando contenido y guardando…", "pending");

  try {
    const optimizedFiles = await Promise.all(edit.newFiles.map(preparePhotoForUpload));
    const result = await api.editItem({
      initData: auth.getInitData(),
      item_id: edit.itemId,
      expected_updated_at: edit.baseUpdatedAt,
      item: {
        title,
        description,
        category: edit.category,
        zone: edit.zone,
        condition: edit.condition,
      },
      keep_photo_keys: edit.existingPhotos.map((photo) => photo.key),
    }, optimizedFiles);

    const returnedImageUrls = Array.isArray(result.image_urls)
      ? result.image_urls.filter((url) => typeof url === "string" && url.trim())
      : [];
    const fallbackImages = [
      ...edit.existingPhotos.map((photo) => photo.url),
      ...optimizedFiles.map((file) => URL.createObjectURL(file)),
    ];
    const updatedItem = {
      ...edit.item,
      title: result.title || title,
      description,
      category: result.category || edit.category,
      zone: result.zone || edit.zone,
      condition: result.condition || edit.condition,
      updatedAt: result.updated_at ?? new Date().toISOString(),
      imageUrls: returnedImageUrls.length ? returnedImageUrls : fallbackImages,
      imageUrl: result.image_url || (returnedImageUrls[0] ?? fallbackImages[0] ?? null),
      photoKeys: Array.isArray(result.photo_keys) ? result.photo_keys : edit.existingPhotos.map((photo) => photo.key),
    };
    state.items = state.items.map((candidate) => candidate.id === updatedItem.id ? updatedItem : candidate);
    state.myItems = state.myItems.map((candidate) => candidate.id === updatedItem.id ? updatedItem : candidate);
    rememberOwnItem(updatedItem);
    api.invalidateCatalog?.();
    api.invalidateMine?.();
    state.catalogNeedsRefresh = true;
    revokeInlineEditPreviewUrls();
    state.inlineEdit = null;
    if (editImages) editImages.value = "";
    renderItems();
    renderMyItems();
    renderDetail(updatedItem);
    setInlineEditMessage("Publicación actualizada.", "success");
  } catch (error) {
    editSaveButton.disabled = false;
    editCancelButton.disabled = false;
    if (isTelegramInitDataExpired(error)) {
      showTelegramSessionExpired(detailActionState);
      return;
    }
    setInlineEditMessage(error.message || "No se han podido guardar los cambios.", "error");
  } finally {
    resetInlineEditButtons();
  }
}

function renderDetail(item, { live = true, error = "" } = {}) {
  const favoriteCountOverride = item?.id ? favoriteCountOverrides.get(item.id) : undefined;
  if (favoriteCountOverride !== undefined) {
    item = { ...item, favoriteCount: favoriteCountOverride };
  }
  if (state.inlineEdit && state.inlineEdit.itemId !== item?.id) {
    revokeInlineEditPreviewUrls();
    state.inlineEdit = null;
  }
  state.selectedItem = item;
  state.selectedItemLive = live;
  if (isNotFoundPage) {
    document.body.classList.toggle("not-found-page", item?.status === "not_found");
  }
  detailMedia.replaceChildren();

  const imageUrls = getItemImageUrls(item);

  if (imageUrls.length) {
    detailMedia.append(createPhotoCarousel(item, {
      className: "photo-carousel--detail",
      openLightbox: true,
    }));
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "detail-media__placeholder";
    placeholder.append(createCategoryIcon(item.category));
    placeholder.setAttribute("aria-hidden", "true");
    detailMedia.append(placeholder);
  }

  const availabilityLabel = item.status === "completed"
    ? "Entregado"
    : item.status === "reserved"
      ? "Reservado"
    : item.status === "expired"
      ? "Ya no disponible"
      : item.status === "not_found"
        ? "No encontrada"
        : item.expiresAt
      ? `Disponible hasta ${formatDate(item.expiresAt)}`
      : "Disponible";
  if (detailAvailabilityLabel) {
    detailAvailabilityLabel.textContent = availabilityLabel;
  } else {
    detailAvailability.textContent = availabilityLabel;
  }
  if (detailAvailabilityIcon) {
    detailAvailabilityIcon.className = item.status === "reserved"
      ? "fa-solid fa-lock fa-icon"
      : "fa-regular fa-calendar-days fa-icon";
  }
  detailTitle.textContent = item.title;
  updateFavoriteButton(detailFavorite, item);
  const categoryLink = document.createElement("a");
  categoryLink.href = getHomeUrl();
  categoryLink.dataset.category = item.category;
  categoryLink.setAttribute("aria-label", `Ver más objetos de ${item.category}`);
  categoryLink.append(createCategoryIcon(item.category), document.createTextNode(` ${item.category}`));
  detailCategory.replaceChildren(categoryLink);
  if (detailCondition) {
    const conditionLabel = itemCondition?.format(item.condition) ?? "Estado no indicado";
    const label = document.createElement("span");
    label.textContent = conditionLabel;
    detailCondition.replaceChildren(createIconElement("fa-tag", "◆"), label);
  }
  detailDescription.textContent = item.description || "";
  detailDescription.hidden = !item.description;
  detailZone.textContent = item.zone || "Valladolid";
  detailOwner.textContent = item.ownerDisplayName || "Vecindad";
  const ownerUsername = normalizeTelegramUsername(item.ownerUsername);
  if (detailOwnerLink) {
    detailOwnerLink.hidden = !ownerUsername;
    detailOwnerLink.href = ownerUsername ? getUserProfileUrl(ownerUsername, { absolute: false }) : "/";
  }
  if (detailCreatedAt) detailCreatedAt.textContent = formatRelativeAge(item.createdAt) || "—";
  renderInterestSignal(item);
  const ownItem = LOCAL_AUTHOR_DEMO_MODE || isOwnItem(item);
  const adminUser = isAdminUser();
  const canManageItem = ownItem || adminUser;
  const isAvailable = item.status === "available" && isNotExpired(item);
  const canEditItem = live && (
    (adminUser && ["available", "reserved", "completed", "expired"].includes(item.status))
    || (ownItem && isAvailable)
  );
  detailView.classList.toggle("detail-view--owner", canManageItem && live);
  interestButton.hidden = ownItem || !live || !isAvailable;
  interestButton.disabled = ownItem || !live || !isAvailable || !ownerUsername;
  interestButton.replaceChildren(
    createIconElement("fa-message", "✉"),
    document.createTextNode("Me interesa"),
  );
  interestButton.setAttribute(
    "aria-label",
    ownerUsername
      ? `Contactar con ${item.ownerDisplayName || "el vecino o la vecina"} por Telegram`
      : "Mostrar interés por este objeto",
  );
  const canReport = Boolean(live && item.id && item.status !== "not_found" && !ownItem);
  if (reportProblemButton) {
    reportProblemButton.hidden = !canReport;
    reportProblemButton.disabled = !canReport;
  }
  if (live && item.status === "completed") {
    renderCompletedActionState(item);
  } else if (live && item.status === "reserved" && !ownItem) {
    renderReservedActionState();
  } else {
    detailActionState.className = "action-state";
    detailActionState.textContent = !live
      ? error === "not_found"
        ? "Esta publicación ya no está disponible."
        : "No se puede verificar ahora la disponibilidad ni las acciones."
      : ownItem
        ? ""
        : item.status === "reserved"
          ? "La recogida está en proceso. No se aceptan nuevos contactos para esta publicación."
        : item.status === "expired"
          ? "Esta publicación ha caducado."
          : ownerUsername
            ? ""
            : "Este vecino o vecina no tiene un nombre de usuario público para recibir contactos.";
    detailActionState.dataset.state = !live || (!ownItem && !ownerUsername && isAvailable) ? "error" : "";
  }

  if (detailOwnerActions) detailOwnerActions.hidden = !canManageItem || !live;
  if (detailOwnerEditRow) detailOwnerEditRow.hidden = Boolean(state.inlineEdit);
  if (editItemButton) {
    editItemButton.hidden = !canEditItem || Boolean(state.inlineEdit);
    editItemButton.disabled = !canEditItem;
  }
  if (detailInlineEditActions) detailInlineEditActions.hidden = !state.inlineEdit;
  if (markDeliveredButton) {
    markDeliveredButton.disabled = false;
    configureDeliveryButton(markDeliveredButton, item.status);
  }
  configureStatusButton(manageStatusButton, item.status);
  if (deleteItemButton) {
    deleteItemButton.hidden = !canManageItem || !live || Boolean(state.inlineEdit);
    deleteItemButton.disabled = false;
    configureDeleteButton(deleteItemButton, { labelled: true });
  }
  renderRelatedItems(item);
}

function showDetail(item, { syncHistory = true, live = true, error = "" } = {}) {
  renderDetail(item, { live, error });
  setView("detail", { syncHistory, itemId: item.id });
  if (syncHistory && api?.isItemConfigured && typeof api.getItem === "function") {
    void openItemFromRoute();
  }
}

function configurePostsView() {
  if (!postsContent || !postsAuthGate || !postsOpenTelegramLink) return;

  const verified = LOCAL_AUTHOR_DEMO_MODE || Boolean(auth?.hasInitData() && state.telegramUser?.valid);
  postsOpenTelegramLink.href = getTelegramMiniAppUrl("profile");
  postsContent.hidden = !verified;
  postsAuthGate.hidden = verified;

  if (verified) {
    if (LOCAL_AUTHOR_DEMO_MODE && state.items.length) {
      state.myItems = createLocalAuthorDemoItems(state.items);
    }
    renderMyItems();
  }
}

function setUserProfileState(message = "", stateName = "") {
  if (!userProfileState) return;
  userProfileState.textContent = message;
  userProfileState.dataset.state = stateName;
}

function getUserProfileItems(username) {
  const normalizedUsername = normalizeTelegramUsername(username);
  if (!normalizedUsername || state.profileCatalogUsername !== normalizedUsername) return [];
  const lookupUsername = normalizedUsername.toLowerCase();
  return sortNewestFirst(state.profileCatalogItems.filter((item) => (
    normalizeTelegramUsername(item.ownerUsername).toLowerCase() === lookupUsername
  )));
}

function createUserProfileItem(item, index) {
  const article = document.createElement("article");
  article.className = "user-profile-item";
  article.setAttribute("role", "listitem");
  article.style.animationDelay = `${Math.min(index * 45, 240)}ms`;

  const link = document.createElement("a");
  link.className = "user-profile-item__link";
  link.href = `/i/${encodeURIComponent(item.id)}/`;
  link.setAttribute("aria-label", `Ver publicación: ${item.title}`);
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showDetail(item);
  });

  const thumbnail = document.createElement("span");
  thumbnail.className = "user-profile-item__thumb";
  const imageUrl = getItemImageUrls(item)[0];
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = "";
    image.loading = index < 2 ? "eager" : "lazy";
    thumbnail.append(image);
  } else {
    thumbnail.classList.add("user-profile-item__thumb--placeholder");
    thumbnail.append(createCategoryIcon(item.category));
  }

  const content = document.createElement("span");
  content.className = "user-profile-item__content";
  content.append(
    createTextElement("strong", "user-profile-item__title", item.title),
    createTextElement("span", "user-profile-item__meta", `${item.category} · ${item.zone}`),
    createTextElement(
      "span",
      "user-profile-item__published",
      `Publicado ${formatPublicationDate(item.createdAt) || "—"}`,
    ),
  );

  const statusLabel = item.status === "reserved"
    ? "Reservado"
    : item.status === "completed"
      ? "Entregado"
      : item.status === "expired" || (item.expiresAt && !isNotExpired(item))
        ? "Caducado"
        : item.expiresAt
          ? `Hasta ${formatDate(item.expiresAt)}`
          : "Disponible";
  const status = createTextElement(
    "span",
    `user-profile-item__status ${item.status === "completed" || item.status === "expired" ? "is-muted" : ""}`,
    statusLabel,
  );
  content.append(status);
  link.append(thumbnail, content);
  article.append(link);
  return article;
}

function renderUserProfile(username = state.currentUserUsername) {
  const normalizedUsername = normalizeTelegramUsername(username);
  if (!userProfileView || !userProfileList || !normalizedUsername) return;

  state.currentUserUsername = normalizedUsername;
  const items = getUserProfileItems(normalizedUsername);
  const profileCatalogReady = state.profileCatalogLoaded
    && state.profileCatalogUsername === normalizedUsername;
  const displayName = items.find((item) => item.ownerDisplayName)?.ownerDisplayName || "";
  if (userProfileTitle) userProfileTitle.textContent = displayName || `@${normalizedUsername}`;
  if (userProfileCopy) {
    const usernameLabel = `@${normalizedUsername}`;
    const publicationCount = `${items.length} ${items.length === 1 ? "publicación" : "publicaciones"}`;
    userProfileCopy.textContent = displayName
      ? `${usernameLabel} · ${publicationCount}`
      : usernameLabel;
  }
  userProfileList.replaceChildren(...items.map(createUserProfileItem));
  userProfileList.hidden = !profileCatalogReady || items.length === 0;
  if (userProfileEmpty) userProfileEmpty.hidden = !profileCatalogReady || items.length > 0;
  const canReportUser = items.some((item) => !isOwnItem(item));
  if (userProfileReportButton) {
    userProfileReportButton.hidden = !canReportUser;
    userProfileReportButton.disabled = !canReportUser;
  }
  setUserProfileState(
    profileCatalogReady ? "" : "Cargando publicaciones…",
    profileCatalogReady ? "" : "pending",
  );
}

function openUserProfile(username, { syncHistory = true } = {}) {
  const normalizedUsername = normalizeTelegramUsername(username);
  if (!normalizedUsername) return;
  state.currentUserUsername = normalizedUsername;
  renderUserProfile(normalizedUsername);
  setView(USER_PROFILE_VIEW, { syncHistory, username: normalizedUsername });
}

function getUserProfileReportItem(username = state.currentUserUsername) {
  return getUserProfileItems(username).find((item) => !isOwnItem(item))
    ?? getUserProfileItems(username)[0]
    ?? null;
}

function setView(viewName, {
  syncHistory = true,
  itemId = "",
  username = "",
  scrollBehavior = "top",
} = {}) {
  if (![...ROUTE_VIEW_NAMES, "detail", "publish-success"].includes(viewName)) return;

  const normalizedUsername = viewName === USER_PROFILE_VIEW
    ? normalizeTelegramUsername(username || state.currentUserUsername || getRouteUserUsername())
    : "";
  if (viewName === USER_PROFILE_VIEW && !normalizedUsername) return;

  const shouldPushHistory = syncHistory && (
    state.currentView !== viewName ||
    (viewName === "detail" && state.currentItemId !== itemId) ||
    (viewName === USER_PROFILE_VIEW && state.currentUserUsername !== normalizedUsername)
  );
  if (shouldPushHistory) pushViewHistory(viewName, itemId, normalizedUsername);

  state.currentView = viewName;
  state.currentItemId = itemId || "";
  state.currentUserUsername = normalizedUsername;
  const isExplore = viewName === "explore";
  const isFavorites = viewName === "favorites";
  const isOffer = viewName === "offer";
  const isPosts = viewName === "posts";
  const isUserProfile = viewName === USER_PROFILE_VIEW;
  const isDetail = viewName === "detail";
  const isSuccess = viewName === "publish-success";

  if (isNotFoundPage) {
    document.body.classList.toggle(
      "not-found-page",
      viewName === "not-found" || (isDetail && state.selectedItem?.status === "not_found"),
    );
  }

  if (!isDetail) closePhotoLightbox();

  if (catalogIntro) catalogIntro.hidden = !isExplore;
  if (catalogTools) catalogTools.hidden = !isExplore;
  if (!isExplore) setSearchOpen(false);
  if (catalogSection) catalogSection.hidden = !isExplore;
  if (favoritesView) favoritesView.hidden = !isFavorites;
  if (offerView) offerView.hidden = !isOffer;
  if (postsView) postsView.hidden = !isPosts;
  if (userProfileView) userProfileView.hidden = !isUserProfile;
  if (detailView) detailView.hidden = !isDetail;
  if (publishSuccessView) publishSuccessView.hidden = !isSuccess;
  if (detailShare) {
    detailShare.hidden = false;
    detailShare.setAttribute("aria-label", isDetail ? "Compartir publicación" : "Compartir Segunda Vida");
    detailShare.setAttribute("title", isDetail ? "Compartir publicación" : "Compartir Segunda Vida");
  }

  if (isOffer) configureOfferAuth();
  if (isFavorites) renderFavorites();
  if (isPosts) configurePostsView();
  if (isUserProfile) {
    renderUserProfile(normalizedUsername);
    if (!state.profileCatalogLoaded || state.profileCatalogUsername !== normalizedUsername) {
      void loadProfileCatalog(normalizedUsername);
    }
  }
  if ((isExplore || isFavorites) && state.catalogNeedsRefresh && !getRouteItemId()) {
    void loadCatalog();
  }

  if (!isDetail && getRouteItemId()) {
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    window.history.replaceState({
      ...window.history.state,
      svView: viewName,
      svItemId: null,
    }, "", url);
  }

  const activeNavigationView = viewName === "detail" ? "explore" : viewName;
  navItems.forEach((button) => {
    const selected = button.dataset.view === activeNavigationView;
    if (selected) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  const viewKey = `${viewName}:${itemId || ""}:${normalizedUsername}`;
  if (lastTrackedViewKey !== viewKey) {
    const pagePath = viewName === USER_PROFILE_VIEW
      ? getUserProfileUrl(normalizedUsername, { absolute: false })
      : getViewRoute(viewName, itemId);
    window.SecondaVidaAnalytics?.trackPageView(pagePath);
    lastTrackedViewKey = viewKey;
  }
  updateRouteMetadata(viewName, itemId);
  if (scrollBehavior === "restore") {
    restoreHistoryScroll(window.history.state);
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  updateNavigationControls();
}

function renderCategories() {
  if (!categoryFilterSelect) return;
  const categories = ["Todo", ...new Set(state.items.map((item) => item.category))];

  categoryFilterSelect.replaceChildren(...categories.map((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    return option;
  }));
  if (!categories.includes(state.category)) state.category = "Todo";
  categoryFilterSelect.value = state.category;
  if (categoryFilterLabel) categoryFilterLabel.textContent = state.category === "Todo" ? "Categorías" : state.category;
}

function renderStatusFilters() {
  if (!statusToggle) return;
  const active = state.statusFilter === "available";
  statusToggle.setAttribute("aria-checked", String(active));
  statusToggle.classList.toggle("is-active", active);
  statusToggle.setAttribute(
    "title",
    active ? "Mostrar publicaciones reservadas" : "Mostrar solo publicaciones no reservadas",
  );
}

function sortNewestFirst(items) {
  return [...items].sort((left, right) => {
    const leftDate = Date.parse(String(left.createdAt ?? "").replace(" ", "T"));
    const rightDate = Date.parse(String(right.createdAt ?? "").replace(" ", "T"));
    const leftTimestamp = Number.isFinite(leftDate) ? leftDate : 0;
    const rightTimestamp = Number.isFinite(rightDate) ? rightDate : 0;

    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
    return String(right.id ?? "").localeCompare(String(left.id ?? ""));
  });
}

function ensureCatalogPaginationControls() {
  if (!itemsGrid) return null;
  if (catalogPaginationControls) return catalogPaginationControls;

  catalogPaginationControls = document.createElement("div");
  catalogPaginationControls.className = "catalog-pagination";
  catalogPaginationControls.hidden = true;

  catalogLoadMoreButton = document.createElement("button");
  catalogLoadMoreButton.className = "catalog-pagination__button";
  catalogLoadMoreButton.type = "button";
  catalogLoadMoreButton.textContent = "Cargar más";
  catalogLoadMoreButton.addEventListener("click", () => appendCatalogBatch());

  catalogLoadMoreSentinel = document.createElement("span");
  catalogLoadMoreSentinel.className = "catalog-pagination__sentinel";
  catalogLoadMoreSentinel.setAttribute("aria-hidden", "true");

  catalogPaginationControls.append(catalogLoadMoreButton, catalogLoadMoreSentinel);
  itemsGrid.insertAdjacentElement("afterend", catalogPaginationControls);
  return catalogPaginationControls;
}

function disconnectCatalogLoadMoreObserver() {
  catalogLoadMoreObserver?.disconnect();
  catalogLoadMoreObserver = null;
}

function formatCatalogCount(count) {
  return Number(count).toLocaleString("es-ES");
}

function updateCatalogPagination() {
  const controls = ensureCatalogPaginationControls();
  if (!controls || !itemsCount) return;

  const totalCount = catalogMatches.length;
  const visibleCount = Math.min(state.catalogVisibleCount, totalCount);
  const hasMore = visibleCount < totalCount;
  const totalLabel = `${formatCatalogCount(totalCount)} ${totalCount === 1 ? "cosa" : "cosas"}`;

  itemsCount.textContent = hasMore
    ? `Mostrando ${formatCatalogCount(visibleCount)} de ${totalLabel}`
    : totalLabel;
  controls.hidden = !hasMore;
  catalogLoadMoreSentinel.hidden = !hasMore;

  if (!hasMore) {
    disconnectCatalogLoadMoreObserver();
    return;
  }

  const supportsIntersectionObserver = typeof window.IntersectionObserver === "function";
  catalogLoadMoreButton.hidden = supportsIntersectionObserver;
  if (!supportsIntersectionObserver || catalogLoadMoreObserver || !catalogLoadMoreSentinel) return;

  catalogLoadMoreObserver = new window.IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) appendCatalogBatch();
  }, { rootMargin: `${CATALOG_LOAD_AHEAD_PX}px 0px` });
  catalogLoadMoreObserver.observe(catalogLoadMoreSentinel);
}

function appendCatalogBatch() {
  if (!itemsGrid || !catalogMatches.length) return;

  const previousCount = Math.min(state.catalogVisibleCount, catalogMatches.length);
  const nextCount = Math.min(previousCount + CATALOG_RENDER_BATCH_SIZE, catalogMatches.length);
  if (nextCount <= previousCount) return;

  const fragment = document.createDocumentFragment();
  catalogMatches.slice(previousCount, nextCount).forEach((item, index) => {
    fragment.append(createItemCard(item, previousCount + index));
  });
  itemsGrid.append(fragment);
  state.catalogVisibleCount = nextCount;
  updateCatalogPagination();
}

function renderItems() {
  const query = state.query.trim().toLocaleLowerCase("es");
  const matchingItems = sortNewestFirst(state.items.filter((item) => {
    const matchesCategory = state.category === "Todo" || item.category === state.category;
    const matchesStatus = state.statusFilter === "all" || item.status === state.statusFilter;
    const searchableText = `${item.title} ${item.description} ${item.category} ${item.zone}`
      .toLocaleLowerCase("es");
    return matchesCategory && matchesStatus && (!query || searchableText.includes(query));
  }));
  catalogMatches = isNotFoundPage && !query ? matchingItems.slice(0, 4) : matchingItems;
  state.catalogVisibleCount = Math.min(CATALOG_INITIAL_RENDER_COUNT, catalogMatches.length);
  disconnectCatalogLoadMoreObserver();

  if (catalogTitle && isNotFoundPage) {
    catalogTitle.textContent = query ? "Resultados de búsqueda" : "Objetos recién añadidos";
  }
  itemsGrid.replaceChildren(
    ...catalogMatches
      .slice(0, state.catalogVisibleCount)
      .map((item, index) => createItemCard(item, index)),
  );
  updateCatalogPagination();

  if (catalogMatches.length > 0) {
    itemsState.textContent = "";
    itemsState.dataset.state = "";
    return;
  }

  itemsState.textContent = state.items.length > 0
    ? "No encontramos publicaciones con esos filtros."
    : "Todavía no hay publicaciones activas. Cuando alguien publique algo, aparecerá aquí.";
}

function isNotExpired(item) {
  if (!item.expiresAt) return true;

  const normalized = item.expiresAt.includes(" ")
    ? item.expiresAt.replace(" ", "T")
    : item.expiresAt;
  const expiresAt = new Date(normalized);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() >= Date.now();
}

async function loadCatalog() {
  if (!api?.isDataConfigured) {
    setServiceState(n8nStatus, n8nStatusLabel, "error", "No configurado");
    itemsState.textContent = "El catálogo todavía no está configurado.";
    itemsState.dataset.state = "error";
    void openItemFromRoute();
    void openReportFromStartParam();
    void openManageFromStartParam();
    void openReportDemo();
    return;
  }

  if (n8nStatusLabel) n8nStatusLabel.textContent = "Comprobando...";
  const requestVersion = state.catalogRequestVersion;
  const records = await catalogResilience.retryUntilSuccess({
    load: (attempt) => api.listItems({
      fresh: state.catalogNeedsRefresh && attempt === 0,
    }),
    shouldStop: () => requestVersion !== state.catalogRequestVersion,
    onFailure: () => {
      itemsState.textContent = "Cargando objetos…";
      itemsState.dataset.state = "";
    },
    delays: CATALOG_RETRY_DELAYS_MS,
  });

  if (!records) {
    if (requestVersion !== state.catalogRequestVersion) return;
    return;
  }

  if (requestVersion !== state.catalogRequestVersion) return;
  setServiceState(n8nStatus, n8nStatusLabel, "connected", "Conectado ✓");
  state.catalogNeedsRefresh = false;
  state.catalogLoaded = true;
  state.catalogItems = records;
  state.items = records.filter((item) => ["available", "reserved"].includes(item.status) && isNotExpired(item));
  if (LOCAL_AUTHOR_DEMO_MODE) {
    state.myItems = createLocalAuthorDemoItems(state.items);
  }
  renderCategories();
  renderStatusFilters();
  renderItems();
  renderFavorites();
  renderMyItems();
  renderUserProfile();
  renderRelatedItems(state.selectedItem);
  void openItemFromRoute();
  void openReportFromStartParam();
  void openManageFromStartParam();
  void openReportDemo();
}

async function loadProfileCatalog(username = state.currentUserUsername) {
  const normalizedUsername = normalizeTelegramUsername(username);
  if (!normalizedUsername) return [];
  if (state.profileCatalogLoaded && state.profileCatalogUsername === normalizedUsername) {
    return state.profileCatalogItems;
  }
  if (state.profileCatalogUsername !== normalizedUsername) {
    state.profileCatalogItems = [];
    state.profileCatalogLoaded = false;
    state.profileCatalogUsername = normalizedUsername;
  }
  if (!api?.isDataConfigured || typeof api.listItems !== "function") {
    setUserProfileState("El catálogo todavía no está configurado.", "error");
    return [];
  }

  try {
    const records = await api.listItems({ scope: "all", ownerUsername: normalizedUsername });
    if (state.profileCatalogUsername !== normalizedUsername) return records;
    state.profileCatalogItems = records;
    state.profileCatalogLoaded = true;
    renderUserProfile();
    return records;
  } catch {
    if (state.profileCatalogUsername === normalizedUsername) {
      setUserProfileState(
        "No hemos podido cargar las publicaciones. Inténtalo de nuevo en unos instantes.",
        "error",
      );
    }
    return [];
  }
}

async function loadMineItems() {
  if (!auth?.hasInitData() || !api?.isMineConfigured || typeof api.listMineItems !== "function") {
    return null;
  }

  try {
    const records = await api.listMineItems(auth.getInitData());
    const catalogById = new Map(state.items.map((item) => [item.id, item]));
    const mergedRecords = records.map((item) => {
      const catalogItem = catalogById.get(item.id);
      const localItem = state.myItems.find((candidate) => candidate.id === item.id);
      const itemImageUrls = Array.isArray(item.imageUrls) && item.imageUrls.length
        ? item.imageUrls
        : item.imageUrl
          ? [item.imageUrl]
          : [];
      const catalogImageUrls = Array.isArray(catalogItem?.imageUrls)
        ? catalogItem.imageUrls
        : catalogItem?.imageUrl
          ? [catalogItem.imageUrl]
          : [];
      const localImageUrls = getItemImageUrls(localItem);
      const imageUrls = itemImageUrls.length
        ? itemImageUrls
        : catalogImageUrls.length
          ? catalogImageUrls
          : localImageUrls;

      return {
        ...catalogItem,
        ...item,
        imageUrl: item.imageUrl || imageUrls[0] || null,
        imageUrls,
      };
    });
    const mineById = new Map(mergedRecords.map((item) => [item.id, item]));

    state.items = [
      ...state.items.filter((item) => !mineById.has(item.id)),
      ...mergedRecords.filter((item) => ["available", "reserved"].includes(item.status) && isNotExpired(item)),
    ];
    state.myItems = mergedRecords.filter(isOwnItem);
    saveOwnItems();
    renderCategories();
    renderStatusFilters();
    renderItems();
    renderFavorites();
    renderMyItems();
    return records;
  } catch {
    // Conservamos la copia local si el endpoint privado aún no está disponible.
    return null;
  }
}

async function openItemFromRoute() {
  const itemId = getRouteItemId();
  if (!itemId) return;

  if (routeOpenInFlight && routeOpenItemId === itemId) {
    return routeOpenInFlight;
  }

  const request = (async () => {
    const staticItem = state.staticItem?.id === itemId ? state.staticItem : null;
    const demoCompletedItem = LOCAL_AUTHOR_DEMO_MODE && itemId === "demo-completed"
      ? {
          id: itemId,
          title: "Sillón de lectura",
          description: "Cómodo y en buen estado.",
          category: "Muebles",
          zone: "Pajarillos Bajos",
          ownerDisplayName: "Vecindad",
          ownerUsername: "vecindad_demo",
          status: "completed",
          expiresAt: null,
          imageUrl: null,
          imageUrls: [],
        }
      : null;
    const catalogItem = state.items.find((candidate) => candidate.id === itemId)
      ?? state.myItems.find((candidate) => candidate.id === itemId && isOwnItem(candidate));
    const initialItem = demoCompletedItem ?? staticItem ?? catalogItem ?? {
      id: itemId,
      title: "Cargando publicación…",
      description: "",
      category: "Otros",
      zone: "Valladolid",
      ownerDisplayName: "Vecindad",
      ownerUsername: "",
      status: "available",
      expiresAt: null,
      reservedAt: null,
      reservationExpiresAt: null,
      imageUrl: null,
      favoriteCount: 0,
      interestCount: 0,
      contactAttemptCount: 0,
    };

    if (demoCompletedItem) {
      showDetail(demoCompletedItem, { syncHistory: false, live: true });
      return;
    }

    showDetail(initialItem, { syncHistory: false, live: Boolean(catalogItem && !staticItem) });

    if (!api?.isItemConfigured || typeof api.getItem !== "function") {
      showDetail(initialItem, { syncHistory: false, live: false, error: "api_unavailable" });
      return;
    }

    try {
      const liveItem = await api.getItem(itemId);
      showDetail(liveItem, { syncHistory: false, live: true });
    } catch (error) {
      if (error?.code === "not_found") {
        showDetail({
          ...initialItem,
          title: "Publicación no encontrada",
          description: "",
          status: "not_found",
          ownerDisplayName: "Vecindad",
          ownerUsername: "",
          imageUrl: null,
        }, { syncHistory: false, live: false, error: "not_found" });
        return;
      }

      showDetail(initialItem, { syncHistory: false, live: false, error: "api_unavailable" });
    }
  })();

  routeOpenInFlight = request;
  routeOpenItemId = itemId;
  try {
    return await request;
  } finally {
    if (routeOpenInFlight === request) {
      routeOpenInFlight = null;
      routeOpenItemId = "";
    }
  }
}

async function openReportFromStartParam() {
  const itemId = getReportStartItemId();
  const userUsername = getReportStartUsername();
  if (!itemId && !userUsername) return;
  if (reportStartInFlight) return reportStartInFlight;

  const request = (async () => {
    if (userUsername && (
      !state.profileCatalogLoaded
      || state.profileCatalogUsername !== userUsername
    )) {
      await loadProfileCatalog(userUsername);
    }
    const catalogItem = itemId
      ? state.items.find((candidate) => candidate.id === itemId)
        ?? state.myItems.find((candidate) => candidate.id === itemId && isOwnItem(candidate))
        ?? state.catalogItems.find((candidate) => candidate.id === itemId)
      : getUserProfileReportItem(userUsername);
    const initialItem = catalogItem ?? {
      id: itemId || "report-user",
      title: "Cargando publicación…",
      description: "",
      category: "Otros",
      zone: "Valladolid",
      ownerDisplayName: "Vecindad",
      ownerUsername: "",
      status: "available",
      expiresAt: null,
      imageUrl: null,
      imageUrls: [],
    };

    if (!catalogItem && userUsername) {
      detailActionState.textContent = "No se ha encontrado una publicación pública de este usuario.";
      detailActionState.dataset.state = "error";
      return;
    }

    showDetail(initialItem, { syncHistory: false, live: Boolean(catalogItem) });

    if (!api?.isItemConfigured || typeof api.getItem !== "function") {
      detailActionState.textContent = "No se puede cargar esta publicación ahora.";
      detailActionState.dataset.state = "error";
      return;
    }

    try {
      const item = catalogItem?.id && !itemId
        ? await api.getItem(catalogItem.id)
        : await api.getItem(itemId);
      showDetail(item, { syncHistory: false, live: true });
      openReportDialog(item, reportProblemButton, { userUsername });
    } catch (error) {
      const message = error?.code === "not_found"
        ? "Esta publicación ya no está disponible."
        : "No se ha podido cargar la publicación. Inténtalo de nuevo.";
      detailActionState.textContent = message;
      detailActionState.dataset.state = "error";
    }
  })();

  reportStartInFlight = request;
  try {
    return await request;
  } finally {
    if (reportStartInFlight === request) reportStartInFlight = null;
  }
}

async function openManageFromStartParam() {
  const itemId = getManageStartItemId();
  if (!itemId) return;
  if (manageStartInFlight) return manageStartInFlight;

  const request = (async () => {
    const catalogItem = state.items.find((candidate) => candidate.id === itemId)
      ?? state.myItems.find((candidate) => candidate.id === itemId && isOwnItem(candidate));
    const initialItem = catalogItem ?? {
      id: itemId,
      title: "Cargando publicación…",
      description: "",
      category: "Otros",
      zone: "Valladolid",
      ownerDisplayName: "Vecindad",
      ownerUsername: "",
      status: "available",
      expiresAt: null,
      imageUrl: null,
      imageUrls: [],
    };

    showDetail(initialItem, { syncHistory: false, live: Boolean(catalogItem) });

    if (!api?.isItemConfigured || typeof api.getItem !== "function") {
      detailActionState.textContent = "No se puede cargar esta publicación ahora.";
      detailActionState.dataset.state = "error";
      return;
    }

    try {
      const item = await api.getItem(itemId);
      showDetail(item, { syncHistory: false, live: true });
    } catch (error) {
      const message = error?.code === "not_found"
        ? "Esta publicación ya no está disponible."
        : "No se ha podido cargar la publicación. Inténtalo de nuevo.";
      detailActionState.textContent = message;
      detailActionState.dataset.state = "error";
    }
  })();

  manageStartInFlight = request;
  try {
    return await request;
  } finally {
    if (manageStartInFlight === request) manageStartInFlight = null;
  }
}

function openReportDemo() {
  if (!LOCAL_REPORT_DEMO_MODE || reportDialog?.open) return;

  const item = state.items.find((candidate) => candidate.id === LOCAL_REPORT_DEMO_ITEM_ID)
    ?? state.items[0];
  if (!item) return;

  showDetail(item, { syncHistory: false, live: true });
  openReportDialog(item);
}

function handleHistoryChange(event) {
  const nextState = event.state;
  const routeItemId = getRouteItemId();
  const routeView = routeItemId ? "detail" : getViewFromPath() || (isNotFoundPage ? "not-found" : "explore");
  const nextView = nextState?.svApp ? nextState.svView : routeView;
  const nextItemId = nextState?.svApp ? nextState.svItemId : routeItemId;
  const nextUsername = nextState?.svApp
    ? nextState.svUserUsername || getRouteUserUsername()
    : getRouteUserUsername();

  if (![...ROUTE_VIEW_NAMES, "detail", "publish-success"].includes(nextView)) {
    return;
  }

  if (nextView === "detail" && nextItemId) {
    const item = state.items.find((candidate) => candidate.id === nextItemId)
      ?? state.myItems.find((candidate) => candidate.id === nextItemId && isOwnItem(candidate));
    if (item) {
      showDetail(item, { syncHistory: false, live: true });
    }
    void openItemFromRoute();
    return;
  }

  setView(nextView, {
    syncHistory: false,
    itemId: nextItemId,
    username: nextUsername,
    scrollBehavior: "restore",
  });
}

async function checkIdentity() {
  if (!auth?.hasInitData()) {
    return;
  }

  setServiceState(identityStatus, identityStatusLabel, "checking", "Comprobando...");

  try {
    const result = await auth.whoAmI();

    if (result.valid) {
      state.telegramUser = result;
      updateReportContactConsentCopy();
      configureOfferAuth(result);
      configurePostsView();
      await loadMineItems();
      refreshSelectedDetailForIdentity();
      if (state.currentView === USER_PROFILE_VIEW) renderUserProfile();
      if (state.publishAttempt?.phase === "checking") {
        void reconcilePendingPublish();
      } else if (state.publishAttempt?.phase === "retryable") {
        setFormState("Error de conexión. Comprueba tus datos móviles o Wi‑Fi. Puedes reintentar sin duplicar la publicación.", "error");
        showPublishRetryButton("Reintentar publicación");
      }
      const firstName = result.first_name ? `Hola ${result.first_name}` : "Telegram";
      const identityName = identityStatus?.querySelector("span:nth-child(2)");
      if (identityName) identityName.textContent = firstName;
      setServiceState(identityStatus, identityStatusLabel, "connected", "Verificada ✓");
      return;
    }

    state.telegramUser = null;
    updateReportContactConsentCopy();
    configureOfferAuth();
    configurePostsView();
    refreshSelectedDetailForIdentity();
    if (state.currentView === USER_PROFILE_VIEW) renderUserProfile();
    setServiceState(identityStatus, identityStatusLabel, "error", "No verificada");
  } catch {
    state.telegramUser = null;
    updateReportContactConsentCopy();
    configureOfferAuth();
    configurePostsView();
    refreshSelectedDetailForIdentity();
    if (state.currentView === USER_PROFILE_VIEW) renderUserProfile();
    setServiceState(identityStatus, identityStatusLabel, "error", "No disponible");
  }
}

function setOfferFormEnabled(enabled) {
  offerForm.hidden = !enabled;
  offerForm.dataset.auth = enabled ? "connected" : "locked";
  offerForm.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = !enabled;
  });
}

function configureOfferAuth(user = state.telegramUser) {
  if (!telegramAuthCard || !offerForm) return;

  telegramOpenLink.href = getTelegramMiniAppUrl("offer");
  const verified = LOCAL_AUTHOR_DEMO_MODE || Boolean(auth?.hasInitData() && user?.valid);
  const username = LOCAL_AUTHOR_DEMO_MODE ? LOCAL_AUTHOR_DEMO_USERNAME : normalizeTelegramUsername(user?.username);
  const displayName = LOCAL_AUTHOR_DEMO_MODE ? LOCAL_AUTHOR_DEMO_DISPLAY_NAME : normalizeTelegramDisplayName(user);

  telegramAuthCard.dataset.state = verified && username ? "connected" : verified ? "warning" : "error";
  telegramAuthTitle.textContent = verified && username
    ? displayName ? `Publicar como ${displayName} (@${username})` : `Publicar como @${username}`
    : verified
      ? "Necesitas un nombre de usuario público"
      : "Publica desde Telegram";
  telegramAuthGuidance.hidden = verified;
  telegramDownloadLink.hidden = verified;
  telegramOpenLink.hidden = verified;
  telegramAuthPrivacy.hidden = !verified || !username;
  if (telegramAuthNamePrivacy) {
    telegramAuthNamePrivacy.textContent = displayName
      ? "Se compartirá tu nombre público y tu nombre de usuario para que puedan contactar contigo."
      : "Se compartirá tu nombre de usuario para que puedan contactar contigo.";
  }
  telegramUsernameHelp.hidden = !verified || Boolean(username);

  if (verified) {
    if (username) {
      telegramAuthMessage.textContent = "";
      telegramAuthMessage.hidden = true;
      setOfferFormEnabled(true);
    } else {
      telegramAuthMessage.textContent = "Configúralo en Telegram para publicar y recibir contactos.";
      telegramAuthMessage.hidden = false;
      setOfferFormEnabled(false);
    }
    return;
  }

  telegramAuthMessage.textContent = "";
  telegramAuthMessage.hidden = true;
  setOfferFormEnabled(false);
}

function openTelegramUsernameDialog() {
  if (typeof telegramUsernameDialog.showModal === "function") {
    telegramUsernameDialog.showModal();
    return;
  }

  telegramUsernameDialog.setAttribute("open", "");
}

function closeTelegramUsernameDialog() {
  if (typeof telegramUsernameDialog.close === "function") {
    telegramUsernameDialog.close();
    return;
  }

  telegramUsernameDialog.removeAttribute("open");
}

function retryTelegramUsername() {
  closeTelegramUsernameDialog();
  window.location.reload();
}

function setFormState(message, stateName = "") {
  offerFormState.textContent = message;
  offerFormState.dataset.state = stateName;
}

function readPublishAttempt() {
  try {
    const stored = JSON.parse(readSessionStorage(PUBLISH_ATTEMPT_STORAGE_KEY) || "null");
    if (!stored?.publicId || !stored?.fingerprint || !stored?.createdAt) return null;
    if (Date.now() - Number(stored.createdAt) > PUBLISH_ATTEMPT_MAX_AGE_MS) {
      removeSessionStorage(PUBLISH_ATTEMPT_STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    removeSessionStorage(PUBLISH_ATTEMPT_STORAGE_KEY);
    return null;
  }
}

function persistPublishAttempt(attempt) {
  state.publishAttempt = attempt;
  writeSessionStorage(PUBLISH_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
}

function clearPublishAttempt() {
  state.publishAttempt = null;
  removeSessionStorage(PUBLISH_ATTEMPT_STORAGE_KEY);
}

function getOrCreatePublishAttempt(draftItem) {
  const currentFingerprint = publishResilience?.fingerprint(draftItem);
  const stored = state.publishAttempt ?? readPublishAttempt();
  if (
    stored &&
    stored.fingerprint === currentFingerprint &&
    publishResilience?.PUBLISH_ID_PATTERN.test(stored.publicId)
  ) {
    persistPublishAttempt({ ...stored, phase: "submitting" });
    return stored.publicId;
  }

  const publicId = publishResilience?.createPublicId?.();
  if (!publicId) throw new Error("secure_random_unavailable");
  persistPublishAttempt({
    publicId,
    fingerprint: currentFingerprint,
    createdAt: Date.now(),
    phase: "submitting",
  });
  return publicId;
}

function showPublishRetryButton(label = "Comprobar de nuevo") {
  if (!offerPublishRetryButton) return;
  offerPublishRetryButton.textContent = label;
  offerPublishRetryButton.hidden = false;
}

function hidePublishRetryButton() {
  if (offerPublishRetryButton) offerPublishRetryButton.hidden = true;
}

function resetPublishedForm() {
  removeSessionStorage(PUBLISH_DRAFT_STORAGE_KEY);
  removeSessionStorage(PUBLISH_DRAFT_VALUES_KEY);
  clearPublishAttempt();
  void clearPublishDraftDatabase();
  offerForm.reset();
  resetOfferPhotos();
  hidePublishRetryButton();
}

async function reconcilePendingPublish() {
  const attempt = state.publishAttempt ?? readPublishAttempt();
  if (!attempt?.publicId || !auth?.hasInitData() || !api?.listMineItems) return null;

  await savePublishDraft();
  persistPublishAttempt({ ...attempt, phase: "checking" });
  if (offerSubmitButton) offerSubmitButton.disabled = true;
  setOfferSubmitLoading("Comprobando…");
  setFormState("No hemos podido confirmar la publicación. Estamos comprobando si se ha creado…", "pending");
  hidePublishRetryButton();

  const found = await publishResilience.reconcile({
    publicId: attempt.publicId,
    load: async () => (await loadMineItems()) ?? [],
    isComplete: (item) => ["available", "reserved", "completed", "expired"].includes(String(item?.status ?? "").toLowerCase()),
  });

  if (found) {
    const publishedItem = state.myItems.find((item) => item.id === attempt.publicId) ?? found;
    rememberOwnItem(publishedItem);
    resetPublishedForm();
    showPublishSuccess(publishedItem);
    return publishedItem;
  }

  persistPublishAttempt({ ...attempt, phase: "retryable" });
  setFormState("Error de conexión. Comprueba tus datos móviles o Wi‑Fi. No hemos podido confirmar si la publicación terminó.", "error");
  showPublishRetryButton("Reintentar publicación");
  return null;
}

function setOfferSubmitLoading(label) {
  if (!offerSubmitButton) return;

  const spinner = document.createElement("span");
  spinner.className = "button-loading";
  spinner.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.textContent = label;
  offerSubmitButton.replaceChildren(spinner, text);
  offerSubmitButton.classList.add("is-loading");
}

function resetOfferSubmitButton() {
  if (!offerSubmitButton) return;
  offerSubmitButton.classList.remove("is-loading");
  offerSubmitButton.textContent = offerSubmitLabel;
}

function setPhotoFieldError(hasError) {
  if (!offerPhotoPicker || !offerImages) return;
  offerPhotoPicker.dataset.state = hasError ? "error" : "";
  if (hasError) {
    offerImages.setAttribute("aria-invalid", "true");
  } else {
    offerImages.removeAttribute("aria-invalid");
  }
}

function readSessionStorage(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorage(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // El borrador sigue funcionando mientras la página permanezca abierta.
  }
}

function removeSessionStorage(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // El almacenamiento puede estar bloqueado en algunos WebViews.
  }
}

function getPublishDraftValues() {
  const formData = new FormData(offerForm);
  return {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    zone: String(formData.get("zone") ?? ""),
    condition: String(formData.get("condition") ?? ""),
    description: String(formData.get("description") ?? ""),
    duration: String(formData.get("duration") ?? "14"),
    consent: offerConsent.checked,
    public_id: state.publishAttempt?.publicId ?? "",
  };
}

function openPublishDraftDatabase() {
  if (!window.indexedDB) {
    return Promise.reject(new Error("indexeddb_unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PUBLISH_DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUBLISH_DRAFT_STORE_NAME)) {
        request.result.createObjectStore(PUBLISH_DRAFT_STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function clearPublishDraftDatabase() {
  try {
    const db = await openPublishDraftDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(PUBLISH_DRAFT_STORE_NAME, "readwrite");
      transaction.objectStore(PUBLISH_DRAFT_STORE_NAME).delete("publish");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_delete_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_delete_aborted"));
    });
    db.close();
  } catch {
    // El borrador solo es una red de seguridad; no bloquea una publicación confirmada.
  }
}

async function savePublishDraft() {
  const values = getPublishDraftValues();
  writeSessionStorage(PUBLISH_DRAFT_STORAGE_KEY, "pending");
  writeSessionStorage(PUBLISH_DRAFT_VALUES_KEY, JSON.stringify(values));

  try {
    const db = await openPublishDraftDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(PUBLISH_DRAFT_STORE_NAME, "readwrite");
      const draft = {
        values,
        publicId: state.publishAttempt?.publicId ?? values.public_id ?? "",
        files: state.offerFiles.map((file) => ({
          blob: file,
          name: file.name,
          type: file.type,
          lastModified: file.lastModified,
        })),
      };
      transaction.objectStore(PUBLISH_DRAFT_STORE_NAME).put(draft, "publish");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_write_aborted"));
    });
    db.close();
  } catch {
    // Los campos de texto quedan en sessionStorage como respaldo. Si el
    // navegador no permite IndexedDB, se pedirá volver a elegir las fotos.
  }
}

async function consumePublishDraft() {
  if (readSessionStorage(PUBLISH_DRAFT_STORAGE_KEY) !== "pending") return null;

  removeSessionStorage(PUBLISH_DRAFT_STORAGE_KEY);
  let fallbackValues = null;
  try {
    fallbackValues = JSON.parse(readSessionStorage(PUBLISH_DRAFT_VALUES_KEY) || "null");
  } catch {
    fallbackValues = null;
  }
  removeSessionStorage(PUBLISH_DRAFT_VALUES_KEY);

  try {
    const db = await openPublishDraftDatabase();
    const draft = await new Promise((resolve, reject) => {
      const transaction = db.transaction(PUBLISH_DRAFT_STORE_NAME, "readonly");
      const request = transaction.objectStore(PUBLISH_DRAFT_STORE_NAME).get("publish");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error || new Error("indexeddb_read_failed"));
    });
    db.close();

    const clearDb = await openPublishDraftDatabase();
    await new Promise((resolve, reject) => {
      const transaction = clearDb.transaction(PUBLISH_DRAFT_STORE_NAME, "readwrite");
      transaction.objectStore(PUBLISH_DRAFT_STORE_NAME).delete("publish");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_delete_failed"));
    });
    clearDb.close();
    return draft ?? { values: fallbackValues, files: [] };
  } catch {
    return fallbackValues ? { values: fallbackValues, files: [] } : null;
  }
}

function restoreDraftFile(entry) {
  const blob = entry?.blob;
  if (!(blob instanceof Blob)) return null;

  return new File([blob], entry.name || "foto.jpg", {
    type: entry.type || blob.type || "image/jpeg",
    lastModified: Number(entry.lastModified) || Date.now(),
  });
}

async function restorePublishDraft() {
  const draft = await consumePublishDraft();
  if (!draft?.values) return;

  const values = draft.values;
  const title = offerForm.elements.namedItem("title");
  const category = offerForm.elements.namedItem("category");
  const zone = offerForm.elements.namedItem("zone");
  const condition = offerForm.elements.namedItem("condition");
  const description = offerForm.elements.namedItem("description");
  const duration = offerForm.elements.namedItem("duration");

  if (title) title.value = values.title ?? "";
  if (category) category.value = values.category ?? "";
  if (zone) zone.value = values.zone ?? "";
  if (condition) condition.value = itemCondition?.normalize(values.condition) ?? "";
  if (description) description.value = values.description ?? "";
  if (duration) {
    [...offerForm.querySelectorAll('input[name="duration"]')].forEach((input) => {
      input.checked = input.value === String(values.duration ?? "14");
    });
  }
  offerConsent.checked = values.consent === true;

  const restoredFiles = (Array.isArray(draft.files) ? draft.files : [])
    .map(restoreDraftFile)
    .filter(Boolean)
    .slice(0, MAX_OFFER_PHOTOS);
  state.offerFiles = restoredFiles;
  renderPhotoPreview(state.offerFiles);

  const restoredPublicId = String(draft.publicId ?? values.public_id ?? "").trim();
  const storedAttempt = readPublishAttempt();
  const restoredFingerprint = publishResilience?.fingerprint({
    title: values.title,
    category: values.category,
    zone: values.zone,
    condition: values.condition,
    description: values.description,
    duration_days: values.duration,
  });
  if (
    restoredPublicId &&
    publishResilience?.PUBLISH_ID_PATTERN.test(restoredPublicId) &&
    (!storedAttempt || storedAttempt.publicId === restoredPublicId) &&
    (!storedAttempt || storedAttempt.fingerprint === restoredFingerprint)
  ) {
    state.publishAttempt = storedAttempt ?? {
      publicId: restoredPublicId,
      fingerprint: restoredFingerprint,
      createdAt: Date.now(),
      phase: "retryable",
    };
  }

  if (restoredFiles.length > 0) {
    setFormState("Hemos recuperado el borrador de tu publicación.", "connected");
  }
}

function isTelegramInitDataExpired(value) {
  const candidates = [
    typeof value === "string" ? value : "",
    value?.error_code,
    value?.error,
    value?.code,
  ];
  return candidates.includes("telegram_init_data_expired");
}

function showTelegramSessionExpired(target) {
  if (!target) return;

  target.replaceChildren(document.createTextNode("La sesión de Telegram ha caducado. "));
  const reopenLink = document.createElement("a");
  reopenLink.className = "inline-action-link";
  reopenLink.href = telegramRuntime.miniAppUrl;
  reopenLink.target = "_blank";
  reopenLink.rel = "noopener noreferrer";
  reopenLink.textContent = "Vuelve a abrir la Mini App";
  reopenLink.addEventListener("click", (event) => {
    if (openTelegramChat(telegramRuntime.miniAppUrl)) event.preventDefault();
  });
  target.append(reopenLink);
  target.dataset.state = "error";
}

function requireTelegramSession(target, missingMessage) {
  if (!auth?.hasInitData()) {
    if (target) {
      target.textContent = missingMessage;
      target.dataset.state = "error";
    }
    return false;
  }

  if (auth?.isInitDataExpired?.()) {
    showTelegramSessionExpired(target);
    return false;
  }

  return true;
}

function isPhotoRequiredError(value) {
  const candidates = [
    typeof value === "string" ? value : "",
    value?.error_code,
    value?.error,
    value?.code,
  ];
  return candidates.some((candidate) => String(candidate).trim().toLowerCase().replace(/[\s-]+/g, "_") === "photo_required");
}

function revokePhotoPreviewUrls() {
  state.photoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.photoPreviewUrls = [];
}

function renderPhotoPreview(files) {
  offerPreview.replaceChildren();
  revokePhotoPreviewUrls();

  files.forEach((file, index) => {
    const preview = document.createElement("div");
    preview.className = "photo-preview__item";
    const image = document.createElement("img");
    const previewUrl = URL.createObjectURL(file);
    state.photoPreviewUrls.push(previewUrl);
    image.src = previewUrl;
    image.alt = file.name;
    preview.append(image);

    const removeButton = document.createElement("button");
    removeButton.className = "photo-preview__remove";
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `Quitar foto ${index + 1}`);
    removeButton.title = "Quitar foto";
    removeButton.innerHTML = '<i class="fa-solid fa-xmark fa-icon" data-fallback="×" aria-hidden="true"></i>';
    removeButton.addEventListener("click", () => removePhoto(index));
    preview.append(removeButton);
    offerPreview.append(preview);
  });
}

function photoKey(file) {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

function removePhoto(index) {
  state.offerFiles.splice(index, 1);
  renderPhotoPreview(state.offerFiles);
  setPhotoFieldError(false);
  setFormState("");
}

function resetOfferPhotos() {
  state.offerFiles = [];
  offerImages.value = "";
  if (offerCamera) offerCamera.value = "";
  offerPreview.replaceChildren();
  revokePhotoPreviewUrls();
  setPhotoFieldError(false);
}

let cameraStream = null;

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  if (cameraPreview) cameraPreview.srcObject = null;
}

function setCameraDialogState(message = "", stateName = "") {
  if (!cameraDialogState) return;
  cameraDialogState.textContent = message;
  cameraDialogState.dataset.state = stateName;
}

function closeCameraDialog() {
  stopCameraStream();
  if (cameraCaptureButton) cameraCaptureButton.disabled = true;
  setCameraDialogState();

  if (cameraDialog?.open && typeof cameraDialog.close === "function") {
    cameraDialog.close();
  } else {
    cameraDialog?.removeAttribute("open");
  }
}

function addCapturedPhoto(blob) {
  const capturedAt = Date.now();
  const capturedFile = new File([blob], `camara-${capturedAt}.jpg`, {
    type: "image/jpeg",
    lastModified: capturedAt,
  });
  if (cameraCaptureTarget === "edit" && state.inlineEdit) {
    const edit = state.inlineEdit;
    if (edit.existingPhotos.length + edit.newFiles.length >= MAX_OFFER_PHOTOS) {
      setInlineEditMessage(`Puedes guardar hasta ${MAX_OFFER_PHOTOS} fotos.`, "error");
      return false;
    }
    edit.newFiles.push(capturedFile);
    renderInlineEditMedia();
    setInlineEditMessage("");
    return true;
  }
  if (state.offerFiles.length >= MAX_OFFER_PHOTOS) {
    setPhotoFieldError(true);
    setFormState(`Puedes añadir hasta ${MAX_OFFER_PHOTOS} fotos.`, "error");
    return false;
  }
  state.offerFiles = [...state.offerFiles, capturedFile];
  renderPhotoPreview(state.offerFiles);
  setPhotoFieldError(false);
  setFormState("");
  return true;
}

async function captureCameraPhoto() {
  if (!cameraPreview?.videoWidth || !cameraPreview.videoHeight || !cameraCanvas) {
    setCameraDialogState("La cámara todavía no está lista.", "error");
    return;
  }

  const sourceWidth = cameraPreview.videoWidth;
  const sourceHeight = cameraPreview.videoHeight;
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  cameraCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
  cameraCanvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = cameraCanvas.getContext("2d", { alpha: false });
  if (!context) {
    setCameraDialogState("No se ha podido capturar la foto.", "error");
    return;
  }

  context.drawImage(cameraPreview, 0, 0, cameraCanvas.width, cameraCanvas.height);
  const blob = await new Promise((resolve) => {
    cameraCanvas.toBlob(resolve, "image/jpeg", PHOTO_JPEG_QUALITY);
  });
  if (!blob || !addCapturedPhoto(blob)) return;
  closeCameraDialog();
}

async function handleCameraRequest() {
  const currentPhotoCount = cameraCaptureTarget === "edit" && state.inlineEdit
    ? state.inlineEdit.existingPhotos.length + state.inlineEdit.newFiles.length
    : state.offerFiles.length;
  if (currentPhotoCount >= MAX_OFFER_PHOTOS) {
    if (cameraCaptureTarget === "edit") {
      setInlineEditMessage(`Puedes guardar hasta ${MAX_OFFER_PHOTOS} fotos.`, "error");
    } else {
      setPhotoFieldError(true);
      setFormState(`Puedes añadir hasta ${MAX_OFFER_PHOTOS} fotos.`, "error");
    }
    return;
  }

  if (!cameraDialog || !cameraPreview || !navigator.mediaDevices?.getUserMedia) {
    const message = "La cámara no está disponible en este dispositivo. Elige una foto existente.";
    if (cameraCaptureTarget === "edit") setInlineEditMessage(message, "error");
    else setFormState(message, "error");
    return;
  }

  if (cameraCaptureTarget === "edit") setInlineEditMessage("");
  else setFormState("");
  setCameraDialogState("Preparando cámara…", "pending");
  if (typeof cameraDialog.showModal === "function") {
    cameraDialog.showModal();
  } else {
    cameraDialog.setAttribute("open", "");
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    cameraPreview.srcObject = cameraStream;
    await cameraPreview.play();
    if (cameraCaptureButton) cameraCaptureButton.disabled = false;
    setCameraDialogState();
  } catch (error) {
    closeCameraDialog();
    const permissionDenied = ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error?.name);
    const message = permissionDenied
      ? "No se ha concedido permiso para usar la cámara. Puedes elegir una foto existente."
      : "No se ha podido abrir la cámara. Puedes elegir una foto existente.";
    if (cameraCaptureTarget === "edit") setInlineEditMessage(message, "error");
    else setFormState(message, "error");
  }
}

function handleGalleryRequest() {
  offerImages.click();
}

function handlePhotoSelection(event) {
  const files = [...event.target.files];

  // El límite efectivo de 20 MB se comprueba después de optimizar la imagen al enviar.
  // En la selección solo rechazamos formatos que el navegador no puede tratar.
  if (cameraCaptureTarget === "edit") {
    handleEditPhotoSelection(event, files);
    return;
  }
  // Permite volver a seleccionar el mismo archivo en una selección posterior.
  event.target.value = "";

  const invalidFiles = files.filter((file) => !ALLOWED_PHOTO_TYPES.has(file.type));
  const existingKeys = new Set(state.offerFiles.map(photoKey));
  const newFiles = files.filter((file) => (
    ALLOWED_PHOTO_TYPES.has(file.type) &&
    !existingKeys.has(photoKey(file))
  ));
  const availableSlots = Math.max(0, MAX_OFFER_PHOTOS - state.offerFiles.length);
  const filesToAdd = newFiles.slice(0, availableSlots);

  state.offerFiles = [...state.offerFiles, ...filesToAdd];
  renderPhotoPreview(state.offerFiles);
  setPhotoFieldError(state.offerFiles.length < 1);

  if (filesToAdd.length < newFiles.length) {
    setPhotoFieldError(true);
    setFormState(`Puedes añadir hasta ${MAX_OFFER_PHOTOS} fotos.`, "error");
    return;
  }

  if (invalidFiles.length > 0) {
    setPhotoFieldError(true);
    setFormState("Cada foto debe ser JPG, PNG o WebP.", "error");
    return;
  }

  setPhotoFieldError(false);
  setFormState("");
}

async function loadPhoto(file) {
  if (typeof window.createImageBitmap === "function") {
    try {
      return await window.createImageBitmap(file);
    } catch {
      // Algunos WebViews no aceptan todos los formatos con createImageBitmap.
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`No se ha podido leer ${file.name}.`));
    };
    image.src = objectUrl;
  });
}

async function optimizePhoto(file) {
  // Las fotos que ya son ligeras no necesitan pasar por canvas. Esto evita
  // trabajo innecesario con las fotos pequeñas de la cámara o de WhatsApp.
  if (file.size <= PHOTO_OPTIMIZE_THRESHOLD) return file;

  const image = await loadPhoto(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    if (typeof image.close === "function") image.close();
    if (file.size <= MAX_PHOTO_BYTES) return file;
    throw new Error(`No se ha podido optimizar ${file.name}.`);
  }

  async function render(maxEdge, quality) {
    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
  }

  // Una pasada normal y solo dos planes de emergencia. En la mayoría de los
  // móviles la primera pasada ya deja la imagen por debajo de 20 MB.
  let blob = await render(PHOTO_MAX_EDGE, PHOTO_JPEG_QUALITY);
  if (blob && blob.size > MAX_PHOTO_BYTES) {
    blob = await render(960, 0.58);
  }
  if (blob && blob.size > MAX_PHOTO_BYTES) {
    blob = await render(720, 0.45);
  }

  if (typeof image.close === "function") image.close();
  if (!blob) return file;
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error(`La foto ${file.name} no se puede reducir por debajo de 20 MB.`);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function preparePhotoForUpload(file) {
  try {
    return await optimizePhoto(file);
  } catch {
    // Si el WebView no puede decodificar la foto, dejamos que n8n la
    // normalice en servidor antes de guardarla. No se almacena el original.
    return file;
  }
}

async function handleOfferSubmit(event) {
  event.preventDefault();

  if (offerSubmitButton?.disabled) return;

  if (!offerForm.reportValidity()) {
    setFormState("Revisa los campos obligatorios.", "error");
    return;
  }

  if (state.offerFiles.length < 1) {
    setPhotoFieldError(true);
    setFormState("Añade al menos una foto para publicar.", "error");
    offerPhotoPicker?.focus({ preventScroll: false });
    return;
  }

  if (!auth?.hasInitData()) {
    setFormState("Abre la mini app desde Telegram para poder publicar.", "error");
    return;
  }

  if (!offerConsent.checked) {
    setFormState("Debes aceptar las condiciones para publicar.", "error");
    return;
  }

  if (!api?.isPublishConfigured || typeof api.publishItem !== "function") {
    setFormState("El endpoint seguro de publicación todavía no está configurado.", "error");
    return;
  }

  if (auth?.isInitDataExpired?.()) {
    showTelegramSessionExpired(offerFormState);
    return;
  }

  const formData = new FormData(offerForm);
  const draftItem = {
    title: String(formData.get("title") ?? "").trim(),
    category: String(formData.get("category") ?? ""),
    zone: String(formData.get("zone") ?? ""),
    condition: itemCondition?.normalize(formData.get("condition")) ?? "",
    description: String(formData.get("description") ?? "").trim(),
    duration_days: Number(formData.get("duration") ?? 14),
  };
  if (!draftItem.condition) {
    setFormState("Selecciona un estado válido para el objeto.", "error");
    return;
  }

  if (offerSubmitButton) {
    offerSubmitButton.disabled = true;
    setOfferSubmitLoading(state.offerFiles.length ? "Optimizando…" : "Publicando…");
  }
  offerForm.setAttribute("aria-busy", "true");

  let publicId;
  try {
    publicId = getOrCreatePublishAttempt(draftItem);
  } catch (error) {
    setFormState(
      error?.message === "secure_random_unavailable"
        ? "No se puede generar un identificador seguro en este navegador. Actualiza Telegram e inténtalo de nuevo."
        : "No se puede preparar la publicación. Inténtalo de nuevo.",
      "error",
    );
    return;
  }
  const payload = {
    initData: auth.getInitData(),
    item: { ...draftItem, public_id: publicId },
    consent: {
      accepted: offerConsent.checked,
      version: CONSENT_VERSION,
    },
  };

  setFormState("");
  hidePublishRetryButton();

  try {
    const optimizedFiles = await Promise.all(state.offerFiles.map(preparePhotoForUpload));
    setOfferSubmitLoading("Publicando…");
    setFormState("");
    await savePublishDraft();
    const result = await api.publishItem(payload, optimizedFiles);

    if (isPhotoRequiredError(result)) {
      setPhotoFieldError(true);
      setFormState("Añade al menos una foto para publicar.", "error");
      offerPhotoPicker?.focus({ preventScroll: false });
      return;
    }

    if (isTelegramInitDataExpired(result)) {
      showTelegramSessionExpired(offerFormState);
      return;
    }

    if (result?.error_code === "publication_pending" || result?.error === "publication_pending") {
      await reconcilePendingPublish();
      return;
    }

    if (!result?.ok || !result?.item_id) {
      clearPublishAttempt();
      setFormState(result?.error ?? "No se ha podido publicar.", "error");
      return;
    }

    const expiresAt = new Date(Date.now() + draftItem.duration_days * 24 * 60 * 60 * 1000).toISOString();
    const returnedImageUrls = Array.isArray(result.image_urls)
      ? result.image_urls.filter((url) => typeof url === "string" && url.trim())
      : [];
    const localImageUrls = result.image_url || returnedImageUrls.length
      ? []
      : optimizedFiles.map((file) => URL.createObjectURL(file));
    const publishedImageUrls = returnedImageUrls.length ? returnedImageUrls : localImageUrls;
    const publishedItem = {
      id: result.item_id,
      title: result.title || draftItem.title,
      description: draftItem.description,
      category: draftItem.category,
      zone: draftItem.zone,
      condition: draftItem.condition,
      status: result.status || "available",
      createdAt: result.created_at ?? new Date().toISOString(),
      expiresAt,
      reservedAt: result.reserved_at ?? null,
      reservationExpiresAt: result.reservation_expires_at ?? null,
      ownerDisplayName: state.telegramUser?.first_name || "Tú",
      ownerUsername: state.telegramUser?.username || "",
      ownerTelegramId: String(state.telegramUser?.telegram_id ?? state.telegramUser?.id ?? ""),
      imageUrl: result.image_url ?? publishedImageUrls[0] ?? null,
      imageUrls: publishedImageUrls,
      favoriteCount: 0,
      interestCount: 0,
      contactAttemptCount: 0,
    };

    rememberOwnItem(publishedItem);
    resetPublishedForm();
    api.invalidateCatalog?.();
    state.catalogRequestVersion += 1;
    state.catalogNeedsRefresh = true;
    state.items = [
      ...state.items.filter((item) => item.id !== publishedItem.id),
      publishedItem,
    ];
    renderCategories();
    renderItems();
    renderMyItems();
    showPublishSuccess(publishedItem);
  } catch (error) {
    if (isPhotoRequiredError(error)) {
      setPhotoFieldError(true);
      setFormState("Añade al menos una foto para publicar.", "error");
      offerPhotoPicker?.focus({ preventScroll: false });
      return;
    }
    if (isTelegramInitDataExpired(error)) {
      showTelegramSessionExpired(offerFormState);
      return;
    }
    if (publishResilience?.isTransportError(error)) {
      await reconcilePendingPublish();
      return;
    }
    clearPublishAttempt();
    setFormState(error.message || "No se ha podido publicar.", "error");
  } finally {
    if (offerSubmitButton && state.publishAttempt?.phase === "checking") {
      offerSubmitButton.disabled = true;
      setOfferSubmitLoading("Comprobando…");
    } else if (offerSubmitButton) {
      offerSubmitButton.disabled = false;
      resetOfferSubmitButton();
    }
    offerForm.removeAttribute("aria-busy");
  }
}

function showPublishSuccess(item) {
  successItemTitle.textContent = item.title;
  successItemStatus.textContent = getItemStatusLabel(item);
  setView("publish-success");
}

function openDeleteItemDialog(item, triggerButton = deleteItemButton) {
  if (!item?.id || !deleteItemDialog) return;

  deleteDialogItem = item;
  deleteDialogTriggerButton = triggerButton;
  deleteItemDialogTitle.textContent = item.title || "esta publicación";
  deleteDialogReason = "";
  deleteItemDialogReasonOptions.forEach((option) => {
    option.checked = false;
    option.closest(".delete-item-dialog__reason")?.classList.remove("is-selected");
  });
  const deliveredReason = deleteItemDialog?.querySelector('[data-delete-reason-option="delivered"]');
  if (deliveredReason) deliveredReason.hidden = item.status === "completed";
  deleteItemDialogState.textContent = "";
  deleteItemDialogState.dataset.state = "";
  updateDeleteItemDialogSelection();

  if (typeof deleteItemDialog.showModal === "function") {
    deleteItemDialog.showModal();
  } else {
    deleteItemDialog.setAttribute("open", "");
  }
  deleteItemDialogCancel?.focus();
}

function updateDeleteItemDialogSelection() {
  deleteDialogReason = deleteItemDialogReasonOptions.find((option) => option.checked)?.value || "";
  deleteItemDialogReasonOptions.forEach((option) => {
    option.closest(".delete-item-dialog__reason")?.classList.toggle("is-selected", option.checked);
  });
  if (!deleteItemDialogConfirm) return;
  deleteItemDialogConfirm.disabled = !deleteDialogReason;
  deleteItemDialogConfirm.textContent = deleteDialogReason === "delivered"
    ? "Marcar como entregado"
    : deleteDialogReason === "delete"
      ? "Borrar publicación"
      : "Continuar";
}

function getReservationDurationDays() {
  const selectedValue = reserveItemDurationOptions.find((option) => option.checked)?.value ?? "1";
  if (selectedValue !== "custom") return Number(selectedValue);
  return Number(reserveItemCustomDays?.value ?? 0);
}

function formatReservationDuration(days, custom = false) {
  if (!custom && days === 1) return "24 horas";
  if (!custom && days === 2) return "48 horas";
  return `${days} ${days === 1 ? "día" : "días"}`;
}

function formatReservationDurationPhrase(days, custom = false) {
  if (!custom && days === 1) return "las próximas 24 horas";
  if (!custom && days === 2) return "las próximas 48 horas";
  return days === 1 ? "el próximo día" : `los próximos ${days} días`;
}

function updateReservationDurationCopy() {
  const selectedValue = reserveItemDurationOptions.find((option) => option.checked)?.value ?? "1";
  const custom = selectedValue === "custom";
  if (reserveItemCustomDaysField) reserveItemCustomDaysField.hidden = !custom;

  const days = getReservationDurationDays();
  if (reserveItemExpiryCopy && Number.isInteger(days) && days >= 1 && days <= 30) {
    if (reserveItemDurationCopy) {
      reserveItemDurationCopy.textContent = `Al hacer clic en Aceptar, este objeto quedará reservado durante ${formatReservationDurationPhrase(days, custom)}.`;
    }
    reserveItemExpiryCopy.textContent = `Al pasar ${formatReservationDuration(days, custom)}, volverá a estar disponible.`;
  }
}

function openReserveItemDialog(item, triggerButton, feedbackElement) {
  if (!item?.id || !reserveItemDialog || !reserveItemDialogConfirm) return;

  reserveDialogItem = item;
  reserveDialogTriggerButton = triggerButton;
  reserveDialogFeedbackElement = feedbackElement;
  reserveItemDurationOptions.forEach((option) => {
    option.checked = option.value === "1";
  });
  if (reserveItemCustomDays) reserveItemCustomDays.value = "1";
  updateReservationDurationCopy();
  reserveItemDialogConfirm.disabled = false;

  if (typeof reserveItemDialog.showModal === "function") {
    reserveItemDialog.showModal();
  } else {
    reserveItemDialog.setAttribute("open", "");
  }
  reserveItemDialogCancel?.focus();
}

function closeReserveItemDialog({ restoreFocus = true } = {}) {
  if (!reserveItemDialog) return;

  if (typeof reserveItemDialog.close === "function" && reserveItemDialog.open) {
    reserveItemDialog.close();
  } else {
    reserveItemDialog.removeAttribute("open");
  }

  const triggerButton = reserveDialogTriggerButton;
  reserveDialogItem = null;
  reserveDialogTriggerButton = null;
  reserveDialogFeedbackElement = null;
  if (restoreFocus && triggerButton?.isConnected) triggerButton.focus();
}

function confirmReserveItemDialog() {
  const item = reserveDialogItem;
  const triggerButton = reserveDialogTriggerButton;
  const feedbackElement = reserveDialogFeedbackElement;
  if (!item || !triggerButton) return;

  const reservationDays = getReservationDurationDays();
  if (!Number.isInteger(reservationDays) || reservationDays < 1 || reservationDays > 30) {
    reserveItemCustomDays?.reportValidity();
    return;
  }

  closeReserveItemDialog({ restoreFocus: false });
  void manageItemAction(item, "reserve", triggerButton, feedbackElement, { reservationDays });
}

function closeDeleteItemDialog({ restoreFocus = true } = {}) {
  if (!deleteItemDialog) return;

  if (typeof deleteItemDialog.close === "function" && deleteItemDialog.open) {
    deleteItemDialog.close();
  } else {
    deleteItemDialog.removeAttribute("open");
  }

  const triggerButton = deleteDialogTriggerButton;
  deleteDialogItem = null;
  deleteDialogTriggerButton = null;
  if (restoreFocus && triggerButton?.isConnected) triggerButton.focus();
}

async function hideItem() {
  const item = deleteDialogItem;
  if (!item?.id || !deleteItemDialogConfirm) return;

  if (!requireTelegramSession(deleteItemDialogState, "Abre la Mini App desde Telegram para gestionar esta publicación.")) return;

  if (!api?.isCompleteConfigured || typeof api.completeItem !== "function") {
    deleteItemDialogState.textContent = "La opción de borrar todavía no está conectada en n8n.";
    deleteItemDialogState.dataset.state = "error";
    return;
  }

  deleteItemDialogConfirm.disabled = true;
  deleteItemDialogCancel.disabled = true;
  deleteItemDialogConfirm.textContent = "Borrando…";
  deleteItemDialogState.textContent = "";
  deleteItemDialogState.dataset.state = "pending";

  try {
    const result = await api.completeItem({
      initData: auth.getInitData(),
      item_id: item.id,
      action: "hide",
    });

    if (!result.ok) {
      const error = new Error(result.error || "No se ha podido borrar la publicación.");
      error.code = result.error_code || result.error;
      throw error;
    }

    api.invalidateMine?.();
    api.invalidateCatalog?.();
    state.catalogRequestVersion += 1;
    state.catalogNeedsRefresh = true;
    state.items = state.items.filter((candidate) => candidate.id !== item.id);
    state.myItems = state.myItems.filter((candidate) => candidate.id !== item.id);
    saveOwnItems();
    renderItems();
    renderMyItems();
    closeDeleteItemDialog({ restoreFocus: false });
    setView("posts");
    if (postsActionState) {
      postsActionState.textContent = "Publicación borrada. Ya no aparece en Segunda Vida.";
      postsActionState.dataset.state = "success";
    }
  } catch (error) {
    deleteItemDialogConfirm.disabled = false;
    deleteItemDialogCancel.disabled = false;
    deleteItemDialogConfirm.textContent = "Borrar publicación";
    if (isTelegramInitDataExpired(error)) {
      showTelegramSessionExpired(deleteItemDialogState);
      return;
    }
    deleteItemDialogState.textContent = error.message || "No se ha podido borrar la publicación.";
    deleteItemDialogState.dataset.state = "error";
  }
}

async function confirmDeleteItemDialog() {
  const item = deleteDialogItem;
  const reason = deleteDialogReason;
  if (!item || !reason) {
    updateDeleteItemDialogSelection();
    return;
  }

  if (reason === "delivered") {
    await completeItem(item, deleteItemDialogConfirm, deleteItemDialogState);
    if (state.selectedItem?.id === item.id && state.selectedItem.status === "completed") {
      closeDeleteItemDialog({ restoreFocus: false });
    } else {
      updateDeleteItemDialogSelection();
    }
    return;
  }

  await hideItem();
}

async function manageItemAction(
  item,
  action,
  triggerButton,
  feedbackElement = detailActionState,
  { reservationDays = 1 } = {},
) {
  if (!item?.id) return;

  if (!requireTelegramSession(feedbackElement, "Abre la Mini App desde Telegram para gestionar esta publicación.")) return;

  if (!api?.isCompleteConfigured || typeof api.completeItem !== "function") {
    feedbackElement.textContent = "La gestión de estados todavía no está conectada en n8n.";
    feedbackElement.dataset.state = "error";
    return;
  }

  triggerButton.disabled = true;
  triggerButton.textContent = "Guardando…";

  try {
    const normalizedReservationDays = Number.isInteger(Number(reservationDays))
      && Number(reservationDays) >= 1
      && Number(reservationDays) <= 30
      ? Number(reservationDays)
      : 1;
    const result = await api.completeItem({
      initData: auth.getInitData(),
      item_id: item.id,
      action,
      ...(action === "reserve" ? { reservation_days: normalizedReservationDays } : {}),
    });

    if (!result.ok) {
      const error = new Error(result.error || "No se ha podido actualizar la publicación.");
      error.code = result.error_code || result.error;
      throw error;
    }

    api.invalidateMine?.();
    api.invalidateCatalog?.();
    state.catalogRequestVersion += 1;
    state.catalogNeedsRefresh = true;
    const fallbackStatus = action === "reserve"
      ? "reserved"
      : action === "release" || action === "reopen"
        ? "available"
        : "completed";
    const nextStatus = result.status || fallbackStatus;
    const updatedItem = {
      ...item,
      status: nextStatus,
      expiresAt: result.expires_at ?? item.expiresAt ?? null,
      reservedAt: nextStatus === "reserved"
        ? result.reserved_at ?? item.reservedAt ?? new Date().toISOString()
        : null,
      reservationExpiresAt: nextStatus === "reserved"
        ? result.reservation_expires_at ?? item.reservationExpiresAt ?? null
        : null,
      completedAt: nextStatus === "completed"
        ? result.completed_at || new Date().toISOString()
        : null,
    };
    state.items = ["available", "reserved"].includes(nextStatus)
      ? [...state.items.filter((candidate) => candidate.id !== item.id), updatedItem]
      : state.items.filter((candidate) => candidate.id !== item.id);
    rememberOwnItem(updatedItem);
    renderItems();
    renderMyItems();
    renderDetail(updatedItem);
  } catch (error) {
    triggerButton.disabled = false;
    if (action === "reserve" || action === "release") {
      configureStatusButton(triggerButton, item.status);
    } else {
      configureDeliveryButton(triggerButton, item.status);
    }
    if (isTelegramInitDataExpired(error)) {
      showTelegramSessionExpired(feedbackElement);
      return;
    }
    feedbackElement.textContent = error.message || "No se ha podido actualizar la publicación.";
    feedbackElement.dataset.state = "error";
  }
}

async function completeItem(item, triggerButton = markDeliveredButton, feedbackElement = detailActionState) {
  const action = item?.status === "completed" ? "reopen" : "complete";
  return manageItemAction(item, action, triggerButton, feedbackElement);
}

function openTelegramChat(url) {
  const webApp = window.Telegram?.WebApp;

  if (typeof webApp?.openTelegramLink === "function") {
    try {
      webApp.openTelegramLink(url);
      return true;
    } catch {
      // Continuamos con el enlace normal como fallback.
    }
  }

  try {
    return Boolean(window.open(url, "_blank", "noopener,noreferrer"));
  } catch {
    return false;
  }
}

function showInterestFeedback(item, url) {
  detailActionState.replaceChildren();
  detailActionState.append(document.createTextNode("Si no aparece el chat, "));

  const link = document.createElement("a");
  link.className = "inline-action-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "pulsa aquí para abrirlo";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openInterestTelegram(item);
  });
  detailActionState.append(link);
  detailActionState.dataset.state = "connected";
}

function trackInterestTelegramOpen(item) {
  if (!item?.id || trackedInterestTelegramItems.has(item.id)) return;
  trackedInterestTelegramItems.add(item.id);
  window.SecondaVidaAnalytics?.trackEvent("interest", "telegram-open", item.id);
}

function openInterestTelegram(item) {
  if (!item || isOwnItem(item)) return;

  const username = normalizeTelegramUsername(item.ownerUsername);
  if (!username) {
    detailActionState.textContent = "Este vecino o vecina no tiene un nombre de usuario público para recibir contactos.";
    detailActionState.dataset.state = "error";
    return false;
  }

  const telegramUrl = `https://t.me/${username}?text=${encodeURIComponent(getInterestMessage(item))}`;
  const opened = openTelegramChat(telegramUrl);
  if (opened) {
    trackInterestTelegramOpen(item);
    void recordItemInteraction(item, "contact_attempt");
  }
  showInterestFeedback(item, telegramUrl);
  return opened;
}

function handleInterest() {
  openInterestTelegram(state.selectedItem);
}

function openContactDialog(item = state.selectedItem, triggerButton = interestButton) {
  if (!item || isOwnItem(item) || !contactDialog) return;

  const username = normalizeTelegramUsername(item.ownerUsername);
  if (!username) {
    handleInterest();
    return;
  }

  contactDialogItem = item;
  contactDialogTriggerButton = triggerButton;
  contactDialogOwner.textContent = item.ownerDisplayName || "este vecino o vecina";

  if (typeof contactDialog.showModal === "function") {
    contactDialog.showModal();
  } else {
    contactDialog.setAttribute("open", "");
  }
  contactDialogCancel?.focus();
}

function closeContactDialog({ restoreFocus = true } = {}) {
  if (!contactDialog) return;

  if (typeof contactDialog.close === "function" && contactDialog.open) {
    contactDialog.close();
  } else {
    contactDialog.removeAttribute("open");
  }

  const triggerButton = contactDialogTriggerButton;
  contactDialogItem = null;
  contactDialogTriggerButton = null;
  if (restoreFocus && triggerButton?.isConnected) triggerButton.focus();
}

function confirmContactDialog() {
  const item = contactDialogItem;
  if (!item) return;

  const username = normalizeTelegramUsername(item.ownerUsername);
  if (!username) {
    closeContactDialog();
    handleInterest();
    return;
  }

  closeContactDialog({ restoreFocus: false });
  void recordItemInteraction(item, "interest");
  openInterestTelegram(item);
}

function setReportFormState(message, stateName = "") {
  if (!reportFormState) return;
  reportFormState.textContent = message;
  reportFormState.dataset.state = stateName;
}

function closeReportReasonPicker({ restoreFocus = false } = {}) {
  if (reportReasonMenu) reportReasonMenu.hidden = true;
  reportReasonTrigger?.setAttribute("aria-expanded", "false");
  if (restoreFocus) reportReasonTrigger?.focus();
}

function openReportReasonPicker({ focusOption = true } = {}) {
  if (!reportReasonMenu || reportReasonTrigger?.disabled) return;

  reportReasonMenu.hidden = false;
  reportReasonTrigger?.setAttribute("aria-expanded", "true");
  if (focusOption) {
    const selectedOption = reportReasonOptions.find(
      (option) => option.dataset.reportReasonValue === reportReason?.value,
    );
    (selectedOption || reportReasonOptions[0])?.focus();
  }
}

function updateReportReasonPicker(value = "") {
  const selectedOption = reportReasonOptions.find(
    (option) => option.dataset.reportReasonValue === value,
  );
  const selectedLabel = selectedOption?.querySelector("strong")?.textContent?.trim() || "Selecciona un motivo";

  if (reportReasonValue) {
    reportReasonValue.textContent = selectedLabel;
    reportReasonValue.dataset.placeholder = selectedOption ? "false" : "true";
  }
  reportReasonOptions.forEach((option) => {
    option.setAttribute(
      "aria-selected",
      String(option === selectedOption),
    );
  });
}

function setReportReasonValue(value = "", { restoreFocus = false } = {}) {
  if (reportReason) reportReason.value = value;
  updateReportReasonPicker(value);
  closeReportReasonPicker({ restoreFocus });
}

function getDetectedReportUsername() {
  if (LOCAL_REPORT_DEMO_MODE) return LOCAL_REPORT_DEMO_USERNAME;

  const webAppUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return normalizeTelegramUsername(
    state.telegramUser?.username ?? webAppUser?.username ?? "",
  );
}

function updateReportContactConsentCopy() {
  if (!reportContactConsentCopy) return;

  const username = getDetectedReportUsername();
  reportContactConsentCopy.textContent = username
    ? `Acepto que el equipo de Aldea Pucela me contacte por Telegram a @${username} para aclarar el problema.`
    : "Acepto que el equipo de Aldea Pucela me contacte por Telegram a la cuenta con la que he abierto esta Mini App para aclarar el problema.";
}

function resetReportForm() {
  reportForm?.reset();
  setReportReasonValue();
  if (reportDialogTopline) reportDialogTopline.hidden = false;
  if (reportDialogItemTitle) reportDialogItemTitle.hidden = false;
  if (reportDialogCopy) reportDialogCopy.hidden = false;
  if (reportDialogClose) reportDialogClose.hidden = false;
  if (reportForm) reportForm.hidden = false;
  if (reportSuccessView) reportSuccessView.hidden = true;
  reportForm?.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = false;
  });
  if (reportSubmitButton) {
    reportSubmitButton.textContent = "Enviar problema";
    reportSubmitButton.disabled = false;
  }
  if (reportDialogCancel) reportDialogCancel.textContent = "Ahora no";
  updateReportContactConsentCopy();
  setReportFormState();
}

function showReportSuccessView() {
  if (reportDialogTopline) reportDialogTopline.hidden = true;
  if (reportDialogItemTitle) reportDialogItemTitle.hidden = true;
  if (reportDialogCopy) reportDialogCopy.hidden = true;
  if (reportDialogClose) reportDialogClose.hidden = true;
  if (reportForm) reportForm.hidden = true;
  if (reportSuccessView) reportSuccessView.hidden = false;
  reportSuccessClose?.focus();
}

function openReportDialog(
  item = state.selectedItem,
  triggerButton = reportProblemButton,
  { userUsername = "" } = {},
) {
  if (!item || !reportDialog || !reportForm) return;

  reportDialogTargetItem = item;
  reportDialogTargetUser = normalizeTelegramUsername(userUsername);
  reportDialogTriggerButton = triggerButton;
  resetReportForm();
  if (reportDialogCopy) {
    reportDialogCopy.textContent = reportDialogTargetUser
      ? `Cuéntanos qué ha ocurrido con @${reportDialogTargetUser}. El equipo de Aldea Pucela revisará el caso.`
      : "Cuéntanos qué ha ocurrido con esta publicación. El equipo de Aldea Pucela revisará el caso.";
  }
  if (reportDialogItemTitle) {
    reportDialogItemTitle.textContent = reportDialogTargetUser
      ? `Perfil de @${reportDialogTargetUser}`
      : item.title || "Publicación seleccionada";
  }

  if (typeof reportDialog.showModal === "function") {
    reportDialog.showModal();
  } else {
    reportDialog.setAttribute("open", "");
  }
  reportReasonTrigger?.focus();
}

function closeReportDialog({ restoreFocus = true } = {}) {
  if (!reportDialog) return;

  closeReportReasonPicker();

  if (typeof reportDialog.close === "function" && reportDialog.open) {
    reportDialog.close();
  } else {
    reportDialog.removeAttribute("open");
  }

  const triggerButton = reportDialogTriggerButton;
  reportDialogTargetItem = null;
  reportDialogTargetUser = null;
  reportDialogTriggerButton = null;
  if (restoreFocus && triggerButton?.isConnected && !triggerButton.hidden) triggerButton.focus();
}

function reportErrorMessage(error) {
  const messages = {
    telegram_init_data_missing: "Abre la Mini App desde Telegram para enviar el problema.",
    telegram_init_data_expired: "La sesión de Telegram ha caducado. Cierra y vuelve a abrir la Mini App.",
    telegram_identity_invalid: "No hemos podido validar tu sesión. Cierra y vuelve a abrir la Mini App.",
    telegram_user_invalid: "No hemos podido leer tu identidad de Telegram.",
    item_not_found: "Esta publicación ya no está disponible.",
    owner_cannot_report_own_item: "No puedes reportar tu propia publicación.",
    reason_invalid: "Selecciona un motivo para el problema.",
    details_required: "Describe brevemente qué ha ocurrido.",
    details_too_long: "La descripción no puede superar los 1500 caracteres.",
  };
  return messages[error?.code] || "No hemos podido enviar el problema. Inténtalo de nuevo.";
}

function openReportFlow(
  item = state.selectedItem,
  triggerButton = reportProblemButton,
  options = {},
) {
  if (!item) return;

  if (LOCAL_REPORT_DEMO_MODE || (telegramRuntime.isTelegram && auth?.hasInitData())) {
    openReportDialog(item, triggerButton, options);
    return;
  }

  const miniAppUrl = getReportMiniAppUrl(item);
  const opened = openTelegramChat(miniAppUrl);
  if (detailActionState) {
    detailActionState.textContent = opened
      ? "Abre la Mini App desde Telegram para completar el formulario."
      : "No hemos podido abrir Telegram. Usa el enlace de nuevo para intentarlo.";
    detailActionState.dataset.state = opened ? "connected" : "error";
  }
}

function openUserProfileReportFlow(triggerButton = userProfileReportButton) {
  const username = normalizeTelegramUsername(state.currentUserUsername);
  const item = getUserProfileReportItem(username);
  if (!username || !item) return;

  if (!LOCAL_REPORT_DEMO_MODE && !(telegramRuntime.isTelegram && auth?.hasInitData())) {
    const opened = openTelegramChat(getTelegramMiniAppUrl(`report_user_${username}`));
    setUserProfileState(
      opened
        ? "Abre la Mini App desde Telegram para completar el reporte."
        : "No hemos podido abrir Telegram. Inténtalo de nuevo.",
      opened ? "connected" : "error",
    );
    return;
  }

  openReportFlow(item, triggerButton, { userUsername: username });
}

async function handleReportSubmit(event) {
  event.preventDefault();
  const item = reportDialogTargetItem;
  if (!item || !reportReason || !reportDetails || !reportAllowAdminContact || !reportSubmitButton) return;

  const reason = reportReason.value.trim();
  const details = reportDetails.value.trim();
  if (!reason) {
    setReportFormState("Selecciona un motivo.", "error");
    reportReasonTrigger?.focus();
    return;
  }
  if (reason === "otro" && details.length < 10) {
    setReportFormState("Describe brevemente qué ha ocurrido.", "error");
    reportDetails.focus();
    return;
  }
  if (!reportAllowAdminContact.checked) {
    setReportFormState("Necesitamos tu autorización para que el equipo pueda aclarar el problema contigo.", "error");
    reportAllowAdminContact.focus();
    return;
  }

  const initData = auth?.getInitData?.() ?? "";
  if (LOCAL_REPORT_DEMO_MODE && !telegramRuntime.isTelegram) {
    setReportFormState("Modo demo local: no se ha enviado nada.", "success");
    return;
  }
  if (!initData) {
    closeReportDialog({ restoreFocus: false });
    openReportFlow(item, reportDialogTriggerButton);
    return;
  }
  if (auth?.isInitDataExpired?.()) {
    showTelegramSessionExpired(reportFormState);
    return;
  }
  if (!api?.isReportConfigured || typeof api.reportProblem !== "function") {
    setReportFormState("El envío de problemas todavía no está configurado.", "error");
    return;
  }

  reportForm?.querySelectorAll("input, select, textarea").forEach((control) => {
    control.disabled = true;
  });
  reportSubmitButton.disabled = true;
  reportSubmitButton.textContent = "Enviando…";
  setReportFormState("Estamos enviando el problema de forma segura.", "pending");

  try {
    const result = await api.reportProblem({
      initData,
      item_id: item.id,
      reason,
      details,
      allow_admin_contact: reportAllowAdminContact.checked,
    });
    setReportFormState(
      result.message || "Hemos recibido el problema y el equipo lo revisará.",
      "success",
    );
    showReportSuccessView();
    window.SecondaVidaAnalytics?.trackEvent("report", "submit", item.id);
  } catch (error) {
    reportForm?.querySelectorAll("input, select, textarea").forEach((control) => {
      control.disabled = false;
    });
    reportSubmitButton.disabled = false;
    reportSubmitButton.textContent = "Enviar problema";
    if (isTelegramInitDataExpired(error)) {
      showTelegramSessionExpired(reportFormState);
      return;
    }
    setReportFormState(reportErrorMessage(error), "error");
  }
}

function setShareFeedback(message, stateName = "") {
  const feedbackElement = state.currentView === "detail" ? detailActionState : shareFeedback;
  if (!feedbackElement) return;
  feedbackElement.textContent = message;
  feedbackElement.dataset.state = stateName;
}

async function copyTextToClipboard(text) {
  try {
    if (typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Some browsers expose the Clipboard API but reject it outside a secure context.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = typeof document.execCommand === "function" && document.execCommand("copy");
  } finally {
    textarea.remove();
  }

  if (!copied) throw new Error("clipboard_unavailable");
}

async function shareCurrentView() {
  const sharingItem = state.currentView === "detail" && state.selectedItem;
  const analyticsShareName = sharingItem?.id || "home";
  const shareUrl = sharingItem ? getItemUrl(state.selectedItem) : getHomeUrl();
  const shareData = sharingItem
    ? {
      title: state.selectedItem.title,
      text: `${state.selectedItem.title} · Segunda Vida`,
      url: shareUrl,
    }
    : {
      title: "Segunda Vida · Aldea Pucela",
      text: "¿Tienes cosas por casa que ya no usas? Dales una segunda vida en Segunda Vida.",
      url: shareUrl,
    };

  try {
    const webApp = window.Telegram?.WebApp;
    if (typeof navigator.share === "function") {
      await navigator.share(shareData);
      window.SecondaVidaAnalytics?.trackEvent("share", "success", analyticsShareName);
      return;
    }

    if (telegramRuntime.isTelegram && typeof webApp?.openTelegramLink === "function") {
      const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareData.text)}`;
      webApp.openTelegramLink(telegramShareUrl);
      window.SecondaVidaAnalytics?.trackEvent("share", "success", analyticsShareName);
      setShareFeedback(sharingItem ? "Elige dónde compartir la publicación." : "Elige dónde compartir Segunda Vida.", "connected");
      return;
    }

    await copyTextToClipboard(`${shareData.text}\n\n${shareUrl}`);
    window.SecondaVidaAnalytics?.trackEvent("share", "success", analyticsShareName);
    setShareFeedback("URL copiada al portapapeles", "connected");
  } catch (error) {
    if (error?.name === "AbortError") return;
    setShareFeedback("No se ha podido compartir ahora.", "error");
  }
}

if (telegramRuntime.isTelegram) {
  runtimeName.textContent = "Telegram";
  telegramSdkState.textContent = telegramRuntime.sdkAvailable
    ? " · SDK disponible ✓"
    : " · SDK no disponible";
  telegramSdkState.hidden = false;
  setServiceState(telegramStatus, telegramStatusLabel, "connected", "Conectado ✓");
}

searchToggle?.addEventListener("click", () => {
  const isOpen = Boolean(searchPanel && !searchPanel.hidden);
  setSearchOpen(!isOpen, !isOpen);
});

searchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setSearchOpen(false);
  searchToggle?.focus();
});

searchInput?.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderItems();
});

statusToggle?.addEventListener("click", () => {
  state.statusFilter = state.statusFilter === "available" ? "all" : "available";
  renderStatusFilters();
  renderItems();
});

categoryFilterSelect?.addEventListener("change", (event) => {
  state.category = event.target.value;
  renderCategories();
  renderItems();
});

navItems.forEach((button) => {
  if (!button.dataset.view) return;
  button.addEventListener("click", (event) => {
    if (isNotFoundPage && getViewFromPath() === "" && button.dataset.view === "explore") {
      return;
    }
    event.preventDefault();
    setView(button.dataset.view);
  });
});

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme = readThemePreference();
    const nextTheme = themeOptions[(themeOptions.indexOf(currentTheme) + 1) % themeOptions.length];
    applyTheme(nextTheme);
  });
}

applyTheme(readThemePreference(), false);

offerEmptyButton?.addEventListener("click", () => setView("offer"));
detailShare?.addEventListener("click", shareCurrentView);
relatedItemsBrowse?.addEventListener("click", (event) => {
  event.preventDefault();
  showRelatedCategory(relatedItemsBrowse.dataset.category || state.selectedItem?.category || "Todo");
});
detailCategory?.addEventListener("click", (event) => {
  const categoryLink = event.target.closest("a");
  if (!categoryLink) return;
  event.preventDefault();
  showRelatedCategory(categoryLink.dataset.category || state.selectedItem?.category || "Todo");
});
interestButton?.addEventListener("click", () => {
  const item = state.selectedItem;
  if (item?.id) window.SecondaVidaAnalytics?.trackEvent("interest", "click", item.id);
  openContactDialog(item);
});
detailOwnerLink?.addEventListener("click", (event) => {
  const username = normalizeTelegramUsername(state.selectedItem?.ownerUsername);
  if (!username) return;
  event.preventDefault();
  openUserProfile(username);
});
detailFavorite?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleFavorite(state.selectedItem, detailFavorite);
});
favoritesExploreButton?.addEventListener("click", () => setView("explore"));
telegramOpenLink?.addEventListener("click", () => {
  window.SecondaVidaAnalytics?.trackEvent("telegram", "open-mini-app", "offer");
});
postsOpenTelegramLink?.addEventListener("click", () => {
  window.SecondaVidaAnalytics?.trackEvent("telegram", "open-mini-app", "posts");
});
reportProblemButton?.addEventListener("click", () => openReportFlow(state.selectedItem, reportProblemButton));
userProfileReportButton?.addEventListener("click", () => openUserProfileReportFlow(userProfileReportButton));
contactDialogClose?.addEventListener("click", () => closeContactDialog());
contactDialogCancel?.addEventListener("click", () => closeContactDialog());
contactDialogConfirm?.addEventListener("click", confirmContactDialog);
contactDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeContactDialog();
});
contactDialog?.addEventListener("click", (event) => {
  if (event.target === contactDialog) closeContactDialog();
});
reportDialogClose?.addEventListener("click", () => closeReportDialog());
reportDialogCancel?.addEventListener("click", () => closeReportDialog());
reportSuccessClose?.addEventListener("click", () => closeReportDialog());
reportForm?.addEventListener("submit", handleReportSubmit);
reportReasonTrigger?.addEventListener("click", () => {
  const isOpen = reportReasonMenu && !reportReasonMenu.hidden;
  if (isOpen) {
    closeReportReasonPicker({ restoreFocus: true });
  } else {
    openReportReasonPicker();
  }
});
reportReasonTrigger?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === " ") {
    event.preventDefault();
    openReportReasonPicker();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeReportReasonPicker();
  }
});
reportReasonOptions.forEach((option, index) => {
  option.addEventListener("click", () => {
    setReportReasonValue(option.dataset.reportReasonValue || "", { restoreFocus: true });
  });
  option.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (index + direction + reportReasonOptions.length) % reportReasonOptions.length;
      reportReasonOptions[nextIndex]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextOption = event.key === "Home"
        ? reportReasonOptions[0]
        : reportReasonOptions[reportReasonOptions.length - 1];
      nextOption?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      closeReportReasonPicker({ restoreFocus: event.key === "Escape" });
    }
  });
});
document.addEventListener("click", (event) => {
  if (reportReasonPicker && !reportReasonPicker.contains(event.target)) {
    closeReportReasonPicker();
  }
});
reportDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeReportDialog();
});
reportDialog?.addEventListener("click", (event) => {
  if (event.target === reportDialog) closeReportDialog();
});
reserveItemDialogCancel?.addEventListener("click", () => closeReserveItemDialog());
reserveItemDialogConfirm?.addEventListener("click", confirmReserveItemDialog);
reserveItemDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeReserveItemDialog();
});
reserveItemDialog?.addEventListener("click", (event) => {
  if (event.target === reserveItemDialog) closeReserveItemDialog();
});
reserveItemDurationOptions.forEach((option) => {
  option.addEventListener("change", updateReservationDurationCopy);
});
reserveItemCustomDays?.addEventListener("input", updateReservationDurationCopy);
deleteItemDialogReasonOptions.forEach((option) => {
  option.addEventListener("change", updateDeleteItemDialogSelection);
});
manageStatusButton?.addEventListener("click", () => {
  const item = state.selectedItem;
  if (!item) return;
  const action = item.status === "reserved" ? "release" : "reserve";
  if (action === "reserve") {
    openReserveItemDialog(item, manageStatusButton, detailActionState);
    return;
  }
  void manageItemAction(item, action, manageStatusButton);
});
markDeliveredButton?.addEventListener("click", () => completeItem(state.selectedItem));
deleteItemButton?.addEventListener("click", () => openDeleteItemDialog(state.selectedItem));
deleteItemDialogClose?.addEventListener("click", () => closeDeleteItemDialog());
deleteItemDialogCancel?.addEventListener("click", () => closeDeleteItemDialog());
deleteItemDialogConfirm?.addEventListener("click", () => void confirmDeleteItemDialog());
deleteItemDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDeleteItemDialog();
});
deleteItemDialog?.addEventListener("click", (event) => {
  if (event.target === deleteItemDialog) closeDeleteItemDialog();
});
offerImages?.addEventListener("change", handlePhotoSelection);
offerPhotoPicker?.addEventListener("click", handleGalleryRequest);
offerCamera?.addEventListener("change", (event) => {
  cameraCaptureTarget = "offer";
  handlePhotoSelection(event);
});
offerCameraButton?.addEventListener("click", () => {
  cameraCaptureTarget = "offer";
  void handleCameraRequest();
});
editImages?.addEventListener("change", handleEditPhotoSelection);
editItemButton?.addEventListener("click", () => openInlineEdit(state.selectedItem));
editSaveButton?.addEventListener("click", () => void saveInlineEdit());
editCancelButton?.addEventListener("click", cancelInlineEdit);
cameraDialogClose?.addEventListener("click", closeCameraDialog);
cameraDialogCancel?.addEventListener("click", closeCameraDialog);
cameraCaptureButton?.addEventListener("click", () => {
  void captureCameraPhoto();
});
cameraDialog?.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCameraDialog();
});
offerForm?.addEventListener("submit", handleOfferSubmit);
offerPublishRetryButton?.addEventListener("click", () => {
  if (state.publishAttempt?.phase === "checking") return;
  void handleOfferSubmit({ preventDefault() {} });
});
telegramUsernameHelp?.addEventListener("click", openTelegramUsernameDialog);
telegramUsernameDialogClose?.addEventListener("click", closeTelegramUsernameDialog);
telegramUsernameRetry?.addEventListener("click", retryTelegramUsername);
viewPublishedButton?.addEventListener("click", () => {
  const item = state.myItems[0];
  if (item) showDetail(item);
});
goPostsButton?.addEventListener("click", () => setView("posts"));
postsTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.postsFilter = tab.dataset.postsFilter;
    renderMyItems();
  });
});
appBackButton?.addEventListener("click", goBack);
appForwardButton?.addEventListener("click", goForward);

if (photoLightbox) {
  photoLightboxClose.addEventListener("click", closePhotoLightbox);
  photoLightboxPrevious.addEventListener("click", () => movePhotoLightbox(-1));
  photoLightboxNext.addEventListener("click", () => movePhotoLightbox(1));
  photoLightboxStage?.addEventListener("touchstart", handlePhotoLightboxTouchStart, { passive: true });
  photoLightboxStage?.addEventListener("touchend", handlePhotoLightboxTouchEnd, { passive: true });
  photoLightbox.addEventListener("click", (event) => {
    if (event.target === photoLightbox) closePhotoLightbox();
  });
  photoLightbox.addEventListener("cancel", (event) => {
    event.preventDefault();
    closePhotoLightbox();
  });
}

document.addEventListener("keydown", (event) => {
  if (!photoLightbox?.open) return;
  if (event.key === "ArrowLeft") movePhotoLightbox(-1);
  if (event.key === "ArrowRight") movePhotoLightbox(1);
});

brandHomeLink?.addEventListener("click", (event) => {
  if (isNotFoundPage && getViewFromPath() === "") return;
  event.preventDefault();
  setView("explore");
});
window.addEventListener("popstate", handleHistoryChange);

const telegramBackButton = window.Telegram?.WebApp?.BackButton;
if (telegramBackButton && typeof telegramBackButton.onClick === "function") {
  telegramBackButton.onClick(goBack);
}

state.myItems = readOwnItems();
state.favoriteEntries = readFavorites();
state.staticItem = getStaticItem();
prepareHistoryState();
if (ROUTE_VIEW_NAMES.has(state.currentView) || state.currentView === "detail") {
  lastTrackedViewKey = `${state.currentView}:${state.currentItemId}:${state.currentUserUsername}`;
  setView(state.currentView, {
    syncHistory: false,
    itemId: state.currentItemId,
    username: state.currentUserUsername,
  });
}
lastTrackedViewKey = `${state.currentView}:${state.currentItemId}:${state.currentUserUsername}`;
window.SecondaVidaAnalytics?.trackPageView();
configureOfferAuth();
void restorePublishDraft();
checkIdentity();
loadCatalog();
