import json
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from generate_static_pages import (  # noqa: E402
    ContractError,
    generate,
    normalize_item,
    reconcile,
    stable_image_identity,
)
from serve_static import resolve_request_path  # noqa: E402
from sync_static_asset_urls import sync_asset_urls  # noqa: E402
from verify_static_item import page_is_ready, validate_item_id  # noqa: E402


class StaticContractTests(unittest.TestCase):
    def setUp(self):
        self.template = ROOT / "index.html"
        self.site_url = "https://segundavida.aldeapucela.org"

    def item(self, status="available"):
        return {
            "public_id": "safe-001",
            "title": '<Silla> "azul"',
            "description": "Descripción con <script>alert(1)</script> & comillas.",
            "category": "Hogar",
            "zone": "Delicias",
            "condition": "Bueno",
            "status": status,
            "image_url": "javascript:alert(1)",
            "owner_display_name": "Vecindad",
            "owner_username": "vecino",
            "interest_count": 0,
            "favorite_count": 0,
        }

    def test_public_id_is_stable_and_legacy_alias_is_accepted(self):
        self.assertEqual(normalize_item({**self.item(), "item-id": "legacy-002"})["id"], "safe-001")
        legacy = {key: value for key, value in self.item().items() if key != "public_id"}
        legacy["item-id"] = "legacy-001"
        self.assertEqual(normalize_item(legacy)["id"], "legacy-001")
        self.assertEqual(normalize_item(self.item())["condition"], "Bueno")
        self.assertEqual(normalize_item({**self.item(), "condition": "manipulado"})["condition"], "")

    def test_local_server_falls_back_for_profile_and_item_routes(self):
        self.assertEqual(resolve_request_path("/u/Xenopose/"), "/u/index.html")
        self.assertEqual(resolve_request_path("/u/Xenopose?from=detail"), "/u/index.html")
        self.assertEqual(resolve_request_path("/i/not-generated/"), "/index.html")
        self.assertEqual(resolve_request_path("/css/app.css"), "/css/app.css")

    def test_numeric_telegram_style_id_and_sensitive_data_are_rejected(self):
        with self.assertRaises(ContractError):
            normalize_item({**self.item(), "public_id": "2191395-1786900112374"})
        with self.assertRaises(ContractError):
            normalize_item({**self.item(), "public_id": "1786900112374"})
        with self.assertRaises(ContractError):
            normalize_item({**self.item(), "owner_telegram_id": "123456789"})

    def test_base64url_public_id_may_start_with_urlsafe_punctuation(self):
        for public_id in ("_pfpxAnq", "-pfpxAnq"):
            self.assertEqual(normalize_item({**self.item(), "public_id": public_id})["id"], public_id)

    def test_static_item_verifier_requires_matching_item_and_metadata(self):
        item_id = "_pfpxAnq"
        page = '<script id="static-item-data">{"id":"_pfpxAnq"}</script><meta property="og:image">'
        self.assertEqual(validate_item_id(item_id), item_id)
        self.assertTrue(page_is_ready(item_id, page, 200))
        self.assertFalse(page_is_ready("other-id", page, 200))
        self.assertFalse(page_is_ready(item_id, page, 404))

    def test_static_item_verifier_rejects_invalid_ids(self):
        with self.assertRaises(ValueError):
            validate_item_id("not valid")

    def test_generates_pages_metadata_fallback_sitemap_and_safe_html(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            count = generate([normalize_item(self.item())], output, self.template, self.site_url)
            self.assertEqual(count, 1)
            page = (output / "i" / "safe-001" / "index.html").read_text(encoding="utf-8")
            self.assertIn('rel="canonical" href="https://segundavida.aldeapucela.org/i/safe-001/"', page)
            self.assertIn('property="og:image"', page)
            self.assertIn('property="og:image:alt"', page)
            self.assertIn('name="twitter:image:alt"', page)
            self.assertIn("summary_large_image", page)
            self.assertNotIn("segundavida-social-preview.jpg", page)
            self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", page)
            self.assertNotIn("javascript:alert", page)
            self.assertNotIn("owner_telegram_id", page)
            self.assertNotIn("telegram_chat_id", page)
            self.assertNotIn("STATIC_HOME_METADATA", page)
            self.assertNotIn('property="og:title" content="Segunda Vida · Aldea Pucela"', page)
            self.assertIn("Estado: Bueno", page)
            self.assertTrue((output / "sitemap.xml").exists())
            self.assertTrue((output / "feed.xml").exists())
            self.assertTrue((output / "robots.txt").exists())
            self.assertTrue((output / "404.html").exists())
            fallback = (output / "404.html").read_text(encoding="utf-8")
            self.assertIn('data-page="not-found"', fallback)
            self.assertIn("Lo sentimos, no se ha encontrado lo que estabas buscando", fallback)

            embedded = page.split('id="static-item-data">', 1)[1].split("</script>", 1)[0]
            self.assertEqual(json.loads(embedded)["id"], "safe-001")
            self.assertEqual(json.loads(embedded)["condition"], "Bueno")
            self.assertEqual(json.loads(embedded)["favorite_count"], 0)

    def test_favorite_count_is_normalized_and_never_negative(self):
        self.assertEqual(normalize_item({**self.item(), "favorite_count": 7})["favorite_count"], 7)
        self.assertEqual(normalize_item({**self.item(), "favorite_count": -4})["favorite_count"], 0)

    def test_shared_asset_sync_updates_existing_generated_pages_without_data_regeneration(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            template = output / "index.html"
            page = output / "i" / "safe-001" / "index.html"
            page.parent.mkdir(parents=True)
            template.write_text(
                '<script src="/js/app.js?v=current"></script><link href="/css/app.css?v=current" rel="stylesheet" />',
                encoding="utf-8",
            )
            page.write_text(
                '<script src="/js/app.js?v=old"></script><link href="/css/app.css?v=old" rel="stylesheet" />',
                encoding="utf-8",
            )

            self.assertEqual(sync_asset_urls(output, template, "sv-test"), 2)
            updated_page = page.read_text(encoding="utf-8")
            self.assertIn('/js/app.js?v=sv-test', updated_page)
            self.assertIn('/css/app.css?v=sv-test', updated_page)

    def test_interaction_workflow_contract_updates_both_counters(self):
        workflow = json.loads((ROOT / "docs" / "sv_record_interaction.workflow.json").read_text(encoding="utf-8"))
        webhook = next(node for node in workflow["nodes"] if node["name"] == "Webhook")
        self.assertEqual(webhook["parameters"]["httpMethod"], "POST")
        self.assertEqual(webhook["parameters"]["path"], "segundavida/interaction")

        workflow_source = json.dumps(workflow, ensure_ascii=False)
        self.assertIn("interest", workflow_source)
        self.assertIn("contact_attempt", workflow_source)
        self.assertIn("interest_count", workflow_source)
        self.assertIn("contact_attempt_count", workflow_source)

    def test_edit_workflow_contract_is_owner_scoped_moderated_and_normalized(self):
        workflow = json.loads((ROOT / "docs" / "sv_edit_item.workflow.json").read_text(encoding="utf-8"))
        webhook = next(node for node in workflow["nodes"] if node["name"] == "Edit Webhook")
        self.assertEqual(webhook["parameters"]["httpMethod"], "POST")
        self.assertEqual(webhook["parameters"]["path"], "segundavida/edit")

        workflow_source = json.dumps(workflow, ensure_ascii=False)
        for marker in (
            "owner_telegram_id",
            "is_admin",
            "expected_updated_at",
            "keep_photo_keys",
            "changed_fields",
            "text_moderation_required",
            "moderation_text",
            "Edit verification passed?",
            "Has edited text?",
            "Skip moderation for unchanged content",
            "index:' + photo.index",
            "current_status",
            "['available', 'reserved', 'completed', 'expired']",
            "Moderate edited text",
            "Moderate edited text and photos",
            "20 * 1024 * 1024",
            "Normalize edited photo",
            "publication_not_allowed",
            "Regenerate static pages",
            "condition_invalid",
            "condition: base.condition",
        ):
            self.assertIn(marker, workflow_source)

        for node_name in (
            "Update item fields and kept photos",
            "Update item before photo uploads",
        ):
            node = next(node for node in workflow["nodes"] if node["name"] == node_name)
            self.assertEqual(
                node["parameters"]["fieldsMapper"]["value"]["condition"],
                "={{ $json.condition }}",
            )

    def test_interest_signal_contract_is_live_and_discreet(self):
        index_source = self.template.read_text(encoding="utf-8")
        app_source = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
        api_source = (ROOT / "js" / "api.js").read_text(encoding="utf-8")
        app_css = (ROOT / "css" / "app.css").read_text(encoding="utf-8")

        self.assertIn('id="detail-interest-signal"', index_source)
        self.assertIn("detail-meta__item--zone", index_source)
        self.assertIn("INTERACTION_STORAGE_KEY", app_source)
        self.assertIn("recordItemInteraction(item, \"interest\")", app_source)
        self.assertIn("recordItemInteraction(item, \"contact_attempt\")", app_source)
        self.assertIn('document.body.classList.toggle("not-found-page", item?.status === "not_found")', app_source)
        self.assertIn("1 persona ha contactado", app_source)
        self.assertIn("personas han contactado", app_source)
        self.assertIn("/interaction", api_source)
        self.assertIn("keepalive: true", api_source)
        self.assertIn(".detail-interest-signal", app_css)
        self.assertIn("grid-template-columns: minmax(0, 0.85fr) auto minmax(0, 1.15fr) auto minmax(0, 0.9fr)", app_css)
        self.assertIn("text-overflow: ellipsis", app_css)

    def test_rss_feed_is_public_escaped_and_newest_first(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            items = [
                normalize_item({
                    **self.item(),
                    "public_id": "safe-old",
                    "title": "Antiguo & útil",
                    "created_at": "2026-08-15T10:00:00+02:00",
                    "image_url": None,
                }),
                normalize_item({
                    **self.item(),
                    "public_id": "safe-new",
                    "title": "Nuevo <objeto>",
                    "created_at": "2026-08-16T10:00:00+02:00",
                    "image_url": "https://images.example.test/new.jpg?a=1&b=2",
                }),
            ]
            generate(items, output, self.template, self.site_url)

            feed_source = (output / "feed.xml").read_text(encoding="utf-8")
            root = ET.fromstring(feed_source)
            feed_items = root.findall("./channel/item")
            self.assertEqual([item.findtext("title") for item in feed_items], ["Nuevo <objeto>", "Antiguo & útil"])
            self.assertEqual(
                feed_items[0].findtext("link"),
                "https://segundavida.aldeapucela.org/i/safe-new/",
            )
            self.assertEqual(feed_items[0].findtext("pubDate"), "Sun, 16 Aug 2026 08:00:00 GMT")
            self.assertIn("media:content", feed_source)
            self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", feed_source)
            self.assertNotIn("owner_telegram_id", feed_source)

            self.assertIn('type="application/rss+xml"', (output / "i" / "safe-new" / "index.html").read_text(encoding="utf-8"))

    def test_homepage_has_social_metadata_and_image_urls_feed_item_preview(self):
        homepage = self.template.read_text(encoding="utf-8")
        self.assertIn('property="og:title"', homepage)
        self.assertIn('property="og:image"', homepage)
        self.assertIn("https://segundavida.aldeapucela.org/assets/segundavida-social-preview.jpg", homepage)
        self.assertIn('type="application/rss+xml"', homepage)
        fallback = (ROOT / "404.html").read_text(encoding="utf-8")
        self.assertIn("https://segundavida.aldeapucela.org/assets/segundavida-social-preview.jpg", fallback)
        self.assertIn('type="application/rss+xml"', fallback)

        item = normalize_item({
            **self.item(),
            "image_url": None,
            "image_urls": ["https://images.example.test/first.jpg"],
        })
        self.assertEqual(item["image_url"], "https://images.example.test/first.jpg")

    def test_supported_operational_statuses_are_renderable_but_hidden_is_not_public(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            items = [normalize_item({**self.item(), "public_id": f"safe-{index:03d}", "status": status})
                     for index, status in enumerate(("available", "reserved", "completed", "expired"), 1)]
            generate(items, output, self.template, self.site_url)
            for item in items:
                self.assertTrue((output / "i" / item["id"] / "index.html").exists())
            with self.assertRaises(ContractError):
                normalize_item({**self.item(), "status": "hidden"})

    def test_incremental_reconcile_preserves_pages_when_only_status_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            initial = [
                normalize_item({**self.item(), "public_id": "safe-001", "status": "available"}),
                normalize_item({**self.item(), "public_id": "safe-002", "status": "completed"}),
            ]
            first = reconcile(initial, output, self.template, self.site_url, force_full=True)
            self.assertEqual(first["created"], 2)

            original_page = (output / "i" / "safe-001" / "index.html").read_bytes()
            changed_status = [
                normalize_item({
                    **self.item(),
                    "public_id": "safe-001",
                    "status": "completed",
                    "favorite_count": 99,
                    "interest_count": 42,
                }),
                normalize_item({**self.item(), "public_id": "safe-002", "status": "reserved"}),
            ]
            second = reconcile(changed_status, output, self.template, self.site_url)

            self.assertEqual(second["created"], 0)
            self.assertEqual(second["updated"], 0)
            self.assertEqual(second["preserved"], 2)
            self.assertEqual(second["removed"], 0)
            self.assertEqual(original_page, (output / "i" / "safe-001" / "index.html").read_bytes())

    def test_incremental_reconcile_adds_edits_and_removes_only_affected_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            initial = [
                normalize_item({**self.item(), "public_id": "safe-001"}),
                normalize_item({**self.item(), "public_id": "safe-002"}),
            ]
            reconcile(initial, output, self.template, self.site_url, force_full=True)
            original_page = (output / "i" / "safe-002" / "index.html").read_bytes()

            added = [
                normalize_item({**self.item(), "public_id": "safe-001", "title": "Título editado"}),
                normalize_item({**self.item(), "public_id": "safe-002"}),
                normalize_item({**self.item(), "public_id": "safe-003"}),
            ]
            changed = reconcile(added, output, self.template, self.site_url)
            self.assertEqual(changed["created"], 1)
            self.assertEqual(changed["updated"], 1)
            self.assertEqual(changed["preserved"], 1)
            self.assertTrue((output / "i" / "safe-003" / "index.html").exists())
            self.assertEqual(original_page, (output / "i" / "safe-002" / "index.html").read_bytes())

            removed = reconcile(added[1:], output, self.template, self.site_url)
            self.assertEqual(removed["removed"], 1)
            self.assertFalse((output / "i" / "safe-001").exists())
            self.assertNotIn("safe-001", (output / "sitemap.xml").read_text(encoding="utf-8"))

    def test_rotating_dltemp_signature_does_not_change_static_identity(self):
        first = "https://proyectos.example/dltemp/token-one/1234/wfrogvq8/folder/photo.jpg"
        second = "https://proyectos.example/dltemp/token-two/5678/wfrogvq8/folder/photo.jpg"
        self.assertEqual(stable_image_identity(first), stable_image_identity(second))

    def test_client_contract_keeps_old_endpoints_and_uses_clean_routes(self):
        api_source = (ROOT / "js" / "api.js").read_text(encoding="utf-8")
        auth_source = (ROOT / "js" / "auth.js").read_text(encoding="utf-8")
        app_source = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
        index_source = self.template.read_text(encoding="utf-8")
        self.assertIn('const API_BASE_URL = "https://api.aldeapucela.org/segundavida";', api_source)
        self.assertNotIn("tasks.nukeador.com", api_source + auth_source)
        self.assertIn('headers["Cache-Control"] = "no-cache"', api_source)
        self.assertIn('cache: fresh ? "no-store" : "default"', api_source)
        self.assertIn("fresh: state.catalogNeedsRefresh", app_source)
        for endpoint in ("/data", "/publish", "/edit", "/complete", "/mine"):
            self.assertIn(endpoint, api_source)
        self.assertIn("N8N_ITEM_URL", api_source)
        self.assertIn("NOCODB_BASE_URL", api_source)
        self.assertIn("N8N_INTERACTION_URL", api_source)
        self.assertIn("isInteractionConfigured", api_source)
        self.assertIn("recordInteraction", api_source)
        self.assertIn("favoriteCount", api_source)
        self.assertIn("function asAttachmentList", api_source)
        self.assertIn("signedPath", api_source)
        self.assertIn("dltemp/", api_source)
        self.assertIn('error.code = "not_found"', api_source)
        self.assertIn('live: false, error: "api_unavailable"', app_source)
        self.assertIn("/i/${encodeURIComponent(item.id)}/", app_source)
        self.assertNotIn('url.hash = `item=', app_source)
        self.assertIn('body.append("payload"', api_source)
        self.assertIn('body.append(`photo_${index}`', api_source)
        self.assertIn("N8N_EDIT_URL", api_source)
        self.assertIn("keep_photo_keys", app_source)
        self.assertIn('id="edit-item-button"', index_source)
        self.assertIn('id="detail-owner-edit-row"', index_source)
        self.assertIn("detail-owner-actions__status-row", index_source)
        self.assertIn("detail-inline-edit-actions", index_source)
        self.assertIn("detailOwnerEditRow", app_source)
        self.assertIn("MAX_PHOTO_BYTES = 20 * 1024 * 1024", app_source)
        self.assertIn("sv_edit_item.workflow.json", (ROOT / "README.md").read_text(encoding="utf-8"))
        self.assertIn("function handleCameraRequest", app_source)
        self.assertIn("navigator.mediaDevices.getUserMedia", app_source)
        self.assertIn("function captureCameraPhoto", app_source)
        self.assertIn("PHOTO_MAX_EDGE = 1280", app_source)
        self.assertIn("function createPhotoCarousel", app_source)
        self.assertIn("function handlePhotoLightboxTouchStart", app_source)
        self.assertIn("function handlePhotoLightboxTouchEnd", app_source)
        self.assertIn('photoLightboxStage?.addEventListener("touchstart"', app_source)
        self.assertIn('photoLightboxStage?.addEventListener("touchend"', app_source)
        self.assertIn("function renderReservedActionState", app_source)
        self.assertIn("Este objeto ya está reservado.", app_source)
        self.assertIn("Si no se entregara, el autor podría volver a publicarlo.", app_source)
        self.assertIn("function getRelatedItems", app_source)
        self.assertIn("function getReservationDurationDays", app_source)
        self.assertIn("reservation_days: normalizedReservationDays", app_source)
        self.assertIn("function getExplorationItems", app_source)
        self.assertIn("function createRelatedItemCard", app_source)
        self.assertIn("function recordFavoriteInteraction", app_source)
        self.assertIn("favorite-actor:v1", app_source)
        self.assertIn('action: interactionAction', app_source)
        self.assertIn('actor_id: getFavoriteActorId()', app_source)
        self.assertIn("function renderRelatedItems", app_source)
        self.assertIn("function showRelatedCategory", app_source)
        self.assertIn('relatedItemsTitle.textContent = isFallback ? "Sigue explorando" : "Relacionados"', app_source)
        self.assertIn('state.statusFilter = "available"', app_source)
        self.assertIn('candidate.status === "available"', app_source)
        self.assertIn("renderRelatedItems(item)", app_source)
        self.assertIn("function sortNewestFirst", app_source)
        self.assertIn("function formatShortDateTime", app_source)
        self.assertIn("function formatRelativeAge", app_source)
        self.assertIn('new Intl.RelativeTimeFormat("es-ES"', app_source)
        self.assertIn("function isAdminUser", app_source)
        self.assertIn("function refreshSelectedDetailForIdentity", app_source)
        self.assertIn("const canManageItem = ownItem || adminUser", app_source)
        self.assertIn("adminUser && [\"available\", \"reserved\", \"completed\", \"expired\"]", app_source)
        self.assertIn("const adminEditable = adminUser &&", app_source)
        self.assertIn('const actionLabel = reserved ? "Liberar reserva" : "Está reservado";', app_source)
        self.assertIn('const actionLabel = completed ? "Volver a publicar" : "Está entregado";', app_source)
        self.assertIn('createIconElement("fa-trash-can", "⌫")', app_source)
        self.assertNotIn('document.createTextNode("Borrar objeto")', app_source)
        self.assertIn("createdAt: result.created_at ?? new Date().toISOString()", app_source)
        self.assertIn("const localImageUrls", app_source)
        self.assertIn("const catalogImageUrls = getItemImageUrls(item)", app_source)
        self.assertIn("function openTelegramChat", app_source)
        self.assertIn("function getTelegramMiniAppUrl", app_source)
        self.assertIn("function getTelegramStartView", app_source)
        self.assertIn('if (window.history.state?.svApp === true) return "";', app_source)
        self.assertIn(': getTelegramStartView() || getViewFromPath() || (isNotFoundPage ? "not-found" : "explore");', app_source)
        self.assertIn('getTelegramMiniAppUrl("offer")', app_source)
        self.assertIn('getTelegramMiniAppUrl("profile")', app_source)
        self.assertIn("function getHomeUrl", app_source)
        self.assertIn('offer: "/ofrecer/"', app_source)
        self.assertIn('posts: "/perfil/"', app_source)
        self.assertIn('favorites: "/favoritos/"', app_source)
        self.assertIn("CATALOG_INITIAL_RENDER_COUNT = 24", app_source)
        self.assertIn("CATALOG_RENDER_BATCH_SIZE = 24", app_source)
        self.assertIn("CATALOG_LOAD_AHEAD_PX = 720", app_source)
        self.assertIn("CATALOG_RETRY_DELAYS_MS = catalogResilience?.CATALOG_RETRY_DELAYS_MS", app_source)
        self.assertIn("fresh: state.catalogNeedsRefresh && attempt === 0", app_source)
        self.assertIn('itemsState.textContent = "Cargando objetos…"', app_source)
        self.assertIn("retryUntilSuccess", app_source)
        self.assertIn("createRefreshCoordinator", app_source)
        self.assertIn("function createCatalogCardMedia", app_source)
        self.assertIn("function appendCatalogBatch", app_source)
        self.assertIn("new window.IntersectionObserver", app_source)
        self.assertIn('catalogLoadMoreButton.textContent = "Cargar más"', app_source)
        self.assertIn('image.loading = index < 4 ? "eager" : "lazy"', app_source)
        self.assertIn('image.decoding = "async"', app_source)
        self.assertIn('if (index < 2) image.fetchPriority = "high"', app_source)
        self.assertIn("function recoverCatalogImage", app_source)
        self.assertIn("refreshCatalogImageUrls", app_source)
        self.assertNotIn('itemsCount.textContent = "Sin datos"', app_source)
        self.assertNotIn('className: "photo-carousel--card"', app_source)
        css_source = (ROOT / "css" / "app.css").read_text(encoding="utf-8")
        self.assertIn(".catalog-pagination", css_source)
        self.assertIn(".catalog-pagination__sentinel", css_source)
        self.assertIn(".item-card > .item-card__media", css_source)
        self.assertIn('[data-image-state="retrying"]', css_source)
        self.assertIn("touch-action: pan-y", css_source)
        self.assertIn(":root.is-telegram-mini-app .photo-lightbox", css_source)
        self.assertIn("--sv-telegram-top-space", css_source)
        self.assertIn("function updateRouteMetadata", app_source)
        self.assertIn('trackPageView(pagePath)', app_source)
        self.assertIn("function shareCurrentView", app_source)
        self.assertIn("function copyTextToClipboard", app_source)
        self.assertIn('`${shareData.text}\\n\\n${shareUrl}`', app_source)
        self.assertIn('URL copiada al portapapeles', app_source)
        self.assertIn("Dales una segunda vida en Segunda Vida.", app_source)
        self.assertIn("https://t.me/share/url?url=", app_source)
        self.assertIn('pulsa aquí para abrirlo', app_source)
        self.assertIn('action: "hide"', app_source)
        self.assertIn('action = item.status === "reserved" ? "release" : "reserve"', app_source)
        self.assertIn('item.status === "reserved"', app_source)
        self.assertIn("function openDeleteItemDialog", app_source)
        self.assertIn("function hideItem", app_source)
        self.assertIn("createdAt", app_source)
        self.assertIn('"Optimizando…"', app_source)
        self.assertIn("state.offerFiles = [...state.offerFiles, ...filesToAdd]", app_source)
        index_source = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('class="brand-subtitle">Aldea Pucela</span>', index_source)
        self.assertIn('aria-label="Ir a la portada de Segunda Vida Aldea Pucela"', index_source)
        self.assertIn('class="share-feedback" id="share-feedback"', index_source)
        self.assertIn('id="detail-share"', index_source)
        self.assertIn('id="favorites-view"', index_source)
        self.assertIn('id="favorites-explore-button"', index_source)
        self.assertIn('id="detail-favorite"', index_source)
        self.assertIn('class="favorite-count"', index_source)
        self.assertIn('class="detail-contact-actions"', index_source)
        self.assertIn('class="detail-contact-actions__meta"', index_source)
        self.assertNotIn("favorite-feedback", index_source)
        self.assertIn('data-view="favorites"', index_source)
        self.assertIn('id="related-items"', index_source)
        self.assertIn('href="/ofrecer/" data-view="offer"', index_source)
        self.assertIn('href="/perfil/" data-view="posts"', index_source)
        self.assertIn('href="/favoritos/" data-view="favorites"', index_source)
        self.assertIn('id="related-items-track"', index_source)
        self.assertIn("Ábreme desde Telegram", index_source)
        self.assertIn('class="filter-controls"', index_source)
        self.assertIn('id="status-filter"', index_source)
        self.assertIn('id="category-filter"', index_source)
        self.assertIn('id="status-filter-label"', index_source)
        self.assertIn('id="category-filter-label"', index_source)
        self.assertIn('id="status-filters"', index_source)
        self.assertIn('id="manage-status-button"', index_source)
        self.assertIn('id="offer-camera-button"', index_source)
        self.assertIn('id="camera-dialog"', index_source)
        self.assertIn('id="camera-preview"', index_source)
        self.assertIn('id="delete-item-button"', index_source)
        self.assertIn('id="delete-item-dialog"', index_source)
        self.assertIn('id="reserve-item-dialog"', index_source)
        self.assertIn('id="reserve-item-dialog-title"', index_source)
        self.assertIn('name="reserve-duration"', index_source)
        self.assertIn('value="custom"', index_source)
        self.assertIn('id="reserve-item-dialog-days"', index_source)
        self.assertIn('id="reserve-item-dialog-duration-copy"', index_source)
        self.assertIn('id="reserve-item-dialog-cancel"', index_source)
        self.assertIn('id="reserve-item-dialog-confirm"', index_source)
        self.assertIn('>Confirmar reserva</h2>', index_source)
        self.assertIn('Al hacer clic en Aceptar, este objeto quedará reservado durante las próximas 24 horas.', index_source)
        self.assertIn('Los usuarios no podrán contactarte mientras tanto.', index_source)
        self.assertIn('Al pasar 24 horas, volverá a estar disponible.', index_source)
        self.assertIn('quiet-action--delete', index_source)
        self.assertIn('id="detail-created-at"', index_source)
        self.assertIn('class="detail-meta"', index_source)
        self.assertNotIn('class="detail-facts"', index_source)
        self.assertLess(index_source.index('class="detail-subline"'), index_source.index('class="detail-meta"'))
        self.assertLess(index_source.index('id="detail-description"'), index_source.index('class="detail-meta"'))
        self.assertLess(index_source.index('class="detail-meta"'), index_source.index('id="interest-button"'))
        self.assertIn('fa-regular fa-message fa-icon', index_source)
        self.assertIn('fa-regular fa-user detail-meta__icon fa-icon', index_source)
        self.assertIn('fa-solid fa-location-dot detail-meta__icon fa-icon', index_source)
        self.assertNotIn('community-promo__link" href="https://aldeapucela.org/" target="_blank" rel="noopener noreferrer"><i', index_source)
        self.assertIn('id="contact-dialog"', index_source)
        self.assertIn('id="contact-dialog-confirm"', index_source)
        self.assertIn("nadie debe pedirte dinero", index_source)
        self.assertIn("function openContactDialog", app_source)
        self.assertIn("function confirmContactDialog", app_source)
        self.assertIn("function openReserveItemDialog", app_source)
        self.assertIn("function confirmReserveItemDialog", app_source)
        self.assertIn('openReserveItemDialog(item, manageStatusButton, detailActionState)', app_source)
        self.assertIn('interestButton?.addEventListener("click", () => {', app_source)
        self.assertIn('trackEvent("share", "success", analyticsShareName)', app_source)
        self.assertIn('trackEvent("interest", "click", item.id)', app_source)
        self.assertIn('trackEvent("interest", "telegram-open", item.id)', app_source)
        self.assertIn('trackEvent("favorite", action, item.id)', app_source)
        self.assertIn('trackEvent("telegram", "open-mini-app", "offer")', app_source)
        self.assertIn('trackEvent("telegram", "open-mini-app", "posts")', app_source)
        self.assertNotIn('trackEvent("catalog", "open-item"', app_source)
        self.assertIn('window.history.scrollRestoration = "manual"', app_source)
        self.assertIn("svScrollY", app_source)
        self.assertIn('scrollBehavior: "restore"', app_source)
        self.assertIn('restoreHistoryScroll(window.history.state)', app_source)
        self.assertIn('capture="environment"', index_source)
        self.assertIn('class="catalog-intro catalog-hero"', index_source)
        self.assertIn("Si ya no lo usas", index_source)
        self.assertIn("¡Dale una segunda vida!", index_source)
        self.assertNotIn("Enlazando la web.", index_source)
        self.assertIn("segundavida-hero-bg.jpg", (ROOT / "css" / "app.css").read_text(encoding="utf-8"))
        app_css = (ROOT / "css" / "app.css").read_text(encoding="utf-8")
        self.assertIn(".detail-meta", app_css)
        self.assertIn("margin-top: 1.4rem", app_css)
        self.assertIn("padding-top: 1.15rem", app_css)
        self.assertIn(".detail-contact-actions", app_css)
        self.assertIn(".detail-contact-actions__meta", app_css)
        self.assertIn(".related-items__track", app_css)
        self.assertIn(".related-item-card", app_css)
        self.assertIn(".favorite-count", app_css)
        self.assertIn("border: 0", app_css)
        self.assertIn(".reserve-item-dialog", app_css)
        self.assertIn(".reserve-item-dialog__panel ul", app_css)
        self.assertIn(".reserve-item-dialog__options", app_css)
        self.assertIn(".action-state--reserved", app_css)
        self.assertIn(".detail-description:not([hidden]) + .detail-meta", app_css)
        self.assertIn("background: var(--bg-card-hover)", app_css)
        self.assertIn("justify-content: center", app_css)
        self.assertIn(".filter-control select option", app_css)
        self.assertIn("community-promo", index_source)
        self.assertIn("https://aldeapucela.org/", index_source)
        self.assertIn('href="https://t.me/pucelobot/segundavida?startapp=offer"', index_source)
        self.assertIn('href="https://t.me/pucelobot/segundavida?startapp=profile"', index_source)
        self.assertIn('/js/catalog-resilience.js?v=sv-20260821-resilience-v1', index_source)
        self.assertTrue((ROOT / "assets" / "aldea-pucela-mark.jpg").exists())
        fallback_source = (ROOT / "404.html").read_text(encoding="utf-8")
        self.assertIn('/js/catalog-resilience.js?v=sv-20260821-resilience-v1', fallback_source)
        self.assertIn('content="noindex, nofollow"', fallback_source)
        self.assertIn('href="/ofrecer/" data-view="offer"', fallback_source)
        self.assertIn('href="/perfil/" data-view="posts"', fallback_source)
        self.assertIn('id="favorites-view"', fallback_source)
        self.assertIn('id="detail-favorite"', fallback_source)
        self.assertIn('href="/favoritos/" data-view="favorites"', fallback_source)
        self.assertIn('class="favorite-count"', fallback_source)
        self.assertIn('class="detail-contact-actions"', fallback_source)
        self.assertIn('class="detail-contact-actions__meta"', fallback_source)
        self.assertNotIn("favorite-feedback", fallback_source)
        self.assertIn("Ábreme desde Telegram", fallback_source)
        self.assertIn('id="delete-item-button"', fallback_source)
        self.assertIn('id="delete-item-dialog"', fallback_source)
        self.assertIn('id="reserve-item-dialog"', fallback_source)
        self.assertIn('id="related-items"', fallback_source)
        self.assertIn('id="contact-dialog"', fallback_source)
        self.assertTrue((ROOT / "favoritos" / "index.html").exists())
        self.assertTrue((ROOT / "ofrecer" / "index.html").exists())
        self.assertTrue((ROOT / "perfil" / "index.html").exists())
        workflow_source = (ROOT / ".github" / "workflows" / "generate-static-pages.yml").read_text(encoding="utf-8")
        self.assertIn("favoritos ofrecer perfil generated-site/", workflow_source)
        self.assertIn("scope=all", workflow_source)
        self.assertIn("force_full", workflow_source)
        self.assertIn("actions/download-artifact@v5", workflow_source)
        self.assertIn("--mode \"$mode\"", workflow_source)
        self.assertIn("--stats-file", workflow_source)
        self.assertIn("steps.changes.outputs.deploy", workflow_source)
        self.assertIn('  push:\n    branches:\n      - main', workflow_source)
        self.assertNotIn('      - "js/**"', workflow_source)
        shared_workflow_source = (ROOT / ".github" / "workflows" / "deploy-shared-assets.yml").read_text(encoding="utf-8")
        self.assertIn("segundavida-static-site", shared_workflow_source)
        self.assertIn("actions/runs/$candidate/artifacts", shared_workflow_source)
        self.assertIn("sync_static_asset_urls.py", shared_workflow_source)
        self.assertTrue((ROOT / "scripts" / "sync_static_asset_urls.py").exists())
        for source in (
            index_source,
            fallback_source,
            app_source,
            (ROOT / "scripts" / "generate_static_pages.py").read_text(encoding="utf-8"),
        ):
            self.assertNotIn("SegundaVida", source)

    def test_api_nginx_contract_caches_reads_and_never_writes(self):
        nginx_source = (ROOT / "deploy" / "nginx" / "api.example.org.conf.template").read_text(encoding="utf-8")
        maps_source = (ROOT / "deploy" / "nginx" / "segundavida-api-maps.conf").read_text(encoding="utf-8")
        cors_source = (ROOT / "deploy" / "nginx" / "segundavida-cors.conf").read_text(encoding="utf-8")
        hardening_source = (ROOT / "deploy" / "nginx" / "segundavida-hardening.conf").read_text(encoding="utf-8")
        docs_source = (ROOT / "docs" / "nginx-api-cache.md").read_text(encoding="utf-8")
        self.assertIn("api.example.org", nginx_source + docs_source)
        self.assertIn("__ITEM_WEBHOOK_UUID__", nginx_source)
        self.assertNotIn("api.aldeapucela.org", nginx_source + docs_source)
        self.assertNotIn("tasks.nukeador.com", nginx_source + docs_source)
        self.assertNotIn("c2b5eab6-9f26-48e9-9561-81dc6d3347ec", nginx_source + docs_source)
        self.assertIn("segundavida-cors.conf", nginx_source + docs_source)
        self.assertIn("segundavida_cors_origin", maps_source + cors_source)
        self.assertIn("Access-Control-Allow-Origin", cors_source)
        self.assertIn("Access-Control-Allow-Methods", cors_source)
        self.assertIn("OPTIONS", cors_source)
        self.assertNotIn('Access-Control-Allow-Origin "*"', cors_source)
        self.assertIn("proxy_cache_methods GET HEAD", nginx_source)
        self.assertIn("proxy_cache_valid 200 10s", nginx_source)
        self.assertIn("proxy_cache_valid 200 15s", nginx_source)
        self.assertIn("proxy_cache_lock on", nginx_source)
        self.assertIn("proxy_cache_lock_timeout 30s", nginx_source)
        self.assertIn("proxy_cache_lock_age 30s", nginx_source)
        self.assertNotIn("proxy_cache_background_update", nginx_source)
        self.assertNotIn("proxy_cache_use_stale", nginx_source)
        self.assertIn("proxy_cache off", nginx_source)
        self.assertNotIn("location ^~ /segundavida/", nginx_source)
        self.assertIn("segundavida_data_args_allowed", maps_source)
        self.assertIn("limit_req_zone $binary_remote_addr zone=segundavida_api_read", hardening_source)
        self.assertIn("limit_req_zone $binary_remote_addr zone=segundavida_api_write", hardening_source)

    def test_favorite_counter_workflows_validate_and_update_aggregate(self):
        workflow_path = ROOT / "docs" / "sv_record_interaction.workflow.json"
        workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        workflow_text = json.dumps(workflow)
        code = "\n".join(
            node.get("parameters", {}).get("jsCode", "") for node in workflow["nodes"]
        )
        self.assertIn("favorite_add", code)
        self.assertIn("favorite_remove", code)
        self.assertIn("actorIdPattern", code)
        self.assertIn("favoriteRateBuckets", code)
        self.assertIn("rate_limited", code)
        self.assertIn("Math.max(0, favoriteCount + favoriteDelta)", code)
        self.assertIn('"favorite_count"', workflow_text)
        self.assertIn("favorite_count: input.favorite_count", code)

        for path in (
            ROOT / "docs" / "sv_publish_item.workflow.json",
            ROOT / "docs" / "sv_publish_item_photos.workflow.json",
        ):
            source = path.read_text(encoding="utf-8")
            self.assertIn("favorite_count", source)

        get_item_source = (ROOT / "docs" / "sv_get_item.workflow.json").read_text(encoding="utf-8")
        self.assertIn("favorite_count", get_item_source)

    def test_publish_workflow_writes_opaque_public_id_and_keeps_legacy_alias(self):
        workflow = json.loads((ROOT / "docs" / "sv_publish_item.workflow.json").read_text(encoding="utf-8"))
        code = "\n".join(
            node.get("parameters", {}).get("jsCode", "") for node in workflow["nodes"]
        )
        self.assertIn("public_id: publicItemId", code)
        self.assertIn('"fieldName": "public_id"', json.dumps(workflow))
        self.assertIn("crypto.randomBytes(6)", code)

    def test_item_condition_contract_covers_publish_detail_and_edit(self):
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "js" / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="offer-condition" name="condition" required', index)
        self.assertIn('id="detail-condition"', index)
        self.assertIn('condition: String(formData.get("condition") ?? "")', app)
        self.assertIn('condition: edit.condition', app)
        self.assertIn('Estado no indicado', app)
        self.assertIn('condition.value = itemCondition?.normalize(values.condition) ?? ""', app)
        self.assertIn('getInlineEditSelectOptions("offer-condition", { includeEmpty: true })', app)
        self.assertIn("itemCondition?.format(item.condition)", app)
        self.assertLess(index.index("/js/item-condition.js"), index.index("/js/api.js"))
        self.assertLess(index.index("/js/item-condition.js"), index.index("/js/app.js"))
        for condition in ("Como nuevo", "Bueno", "Aceptable", "Roto"):
            self.assertIn(f"<option>{condition}</option>", index)

        for path in (
            ROOT / "docs" / "sv_publish_item.workflow.json",
            ROOT / "docs" / "sv_publish_item_photos.workflow.json",
        ):
            workflow = json.loads(path.read_text(encoding="utf-8"))
            code = "\n".join(
                node.get("parameters", {}).get("jsCode", "") for node in workflow["nodes"]
            )
            workflow_text = json.dumps(workflow, ensure_ascii=False)
            self.assertIn("condition_invalid", code)
            self.assertIn('"condition"', workflow_text)

    def test_photo_publish_workflow_is_importable_and_has_binary_branch(self):
        workflow_path = ROOT / "docs" / "sv_publish_item_photos.workflow.json"
        workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        node_names = {node["name"] for node in workflow["nodes"]}
        self.assertIn("Webhook", node_names)
        self.assertIn("Has photos?", node_names)
        self.assertIn("Upload photo to NocoDB", node_names)
        workflow_text = json.dumps(workflow)
        self.assertIn("photo_[01]", workflow_text)
        self.assertNotIn("NOCODB_API_TOKEN", workflow_text)
        self.assertNotIn('"type": "n8n-nodes-base.httpRequest"', workflow_text)
        upload = next(node for node in workflow["nodes"] if node["name"] == "Upload photo to NocoDB")
        self.assertEqual(upload["type"], "n8n-nodes-base.nocoDb")
        self.assertEqual(upload["parameters"]["operation"], "upload")
        self.assertEqual(upload["parameters"]["uploadMode"], "base64")
        self.assertEqual(upload["parameters"]["uploadFieldName"]["value"], "photos")
        self.assertEqual(upload["credentials"]["nocoDbApiToken"]["name"], "NocoDB Token account")

    def test_publish_workflow_reuses_client_id_before_creating_or_dispatching(self):
        workflow_path = ROOT / "docs" / "sv_publish_item_photos.workflow.json"
        workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        node_names = {node["name"] for node in workflow["nodes"]}
        self.assertTrue({
            "Reuse client publish id",
            "Find existing publish id",
            "Resolve publish idempotency",
            "Create new publication?",
        }.issubset(node_names))

        resolve_code = next(
            node["parameters"]["jsCode"]
            for node in workflow["nodes"]
            if node["name"] == "Resolve publish idempotency"
        )
        self.assertIn("publish_id_conflict", resolve_code)
        self.assertIn("publication_pending", resolve_code)
        self.assertIn("owner_telegram_id", resolve_code)
        self.assertIn("create_new: true", resolve_code)

        connections = workflow["connections"]
        self.assertEqual(connections["Valid request?"]["main"][0][0]["node"], "Reuse client publish id")
        self.assertEqual(connections["Resolve publish idempotency"]["main"][0][0]["node"], "Create new publication?")
        self.assertEqual(connections["Create new publication?"]["main"][0][0]["node"], "Prepare photo uploads")
        self.assertEqual(connections["Create new publication?"]["main"][1][0]["node"], "Respond to Webhook")

    def test_frontend_publish_resilience_is_loaded_and_does_not_use_raw_fetch_error(self):
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        api = (ROOT / "js/api.js").read_text(encoding="utf-8")
        app = (ROOT / "js/app.js").read_text(encoding="utf-8")
        resilience = (ROOT / "js/publish-resilience.js").read_text(encoding="utf-8")
        self.assertIn("publish-resilience.js", index)
        self.assertIn("network_error", api)
        self.assertIn("getOrCreatePublishAttempt", app)
        self.assertIn("reconcilePendingPublish", app)
        self.assertIn("Error de conexión", app)
        self.assertIn("crypto.getRandomValues", resilience)

    def test_complete_workflow_supports_owner_only_hide_without_deleting_rows(self):
        workflow_path = ROOT / "docs" / "sv_complete_item.workflow.json"
        workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        node_names = {node["name"] for node in workflow["nodes"]}
        workflow_text = json.dumps(workflow)
        code = "\n".join(
            node.get("parameters", {}).get("jsCode", "") for node in workflow["nodes"]
        )
        self.assertIn("'hide'", code)
        self.assertIn("'reserve'", code)
        self.assertIn("'release'", code)
        self.assertIn("reservation_expires_at", code)
        self.assertIn("reservation_days", code)
        self.assertIn("reservationDays", code)
        self.assertIn("status:nextStatus", code)
        self.assertIn("item_already_hidden", code)
        self.assertIn("owner_telegram_id", code)
        self.assertIn("Publicación borrada", code)
        self.assertIn("Dispatch static page regeneration", node_names)
        self.assertIn('"type": "n8n-nodes-base.github"', workflow_text)
        self.assertNotIn('"operation": "delete"', workflow_text)

    def test_reservation_expiry_workflow_is_hourly_and_clears_dates(self):
        workflow_path = ROOT / "docs" / "sv_expire_reservations.workflow.json"
        workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
        self.assertIn("n8n-nodes-base.scheduleTrigger", {node["type"] for node in workflow["nodes"]})
        code = "\n".join(node.get("parameters", {}).get("jsCode", "") for node in workflow["nodes"])
        self.assertIn("reservation_expires_at", code)
        self.assertIn("status:'available'", code)
        self.assertIn("reserved_at:null", code)

    def test_private_contract_includes_reservation_dates(self):
        api_source = (ROOT / "js" / "api.js").read_text(encoding="utf-8")
        mine_workflow = json.loads((ROOT / "docs" / "sv_mine_items.workflow.json").read_text(encoding="utf-8"))
        mine_code = "\n".join(node.get("parameters", {}).get("jsCode", "") for node in mine_workflow["nodes"])
        self.assertIn("reservedAt", api_source)
        self.assertIn("reservationExpiresAt", api_source)
        self.assertIn("signed_path", mine_code)
        self.assertIn("dltemp/", mine_code)
        self.assertIn("reserved_at", mine_code)
        self.assertIn("reservation_expires_at", mine_code)

    def test_admin_permissions_contract_uses_n8n_data_table(self):
        docs = (ROOT / "docs" / "admin-permissions.md").read_text(encoding="utf-8")
        self.assertIn("Segunda Vida - Permisos", docs)
        self.assertIn("Data Table de n8n", docs)
        self.assertIn("2191395", docs)
        self.assertNotIn("tabla de NocoDB", docs)


if __name__ == "__main__":
    unittest.main()
