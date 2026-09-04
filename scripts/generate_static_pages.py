#!/usr/bin/env python3
"""Generate deterministic, public-only HTML pages for Segunda Vida."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


SENSITIVE_KEYS = {
    "telegram_id",
    "owner_telegram_id",
    "chat_id",
    "telegram_chat_id",
    "thread_id",
    "telegram_thread_id",
    "telegram_message_id",
    "initdata",
    "init_data",
    "secret",
    "token",
}
PUBLIC_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{6,80}$")
TELEGRAM_DERIVED_ID_PATTERN = re.compile(r"^(?:\d{6,80}|\d+(?:[-_]\d+)+)$")
ITEM_CONDITIONS = frozenset({"Como nuevo", "Bueno", "Aceptable", "Roto"})
STATIC_ITEM_DATA_PATTERN = re.compile(
    r'<script[^>]+id="static-item-data"[^>]*>(.*?)</script>',
    re.DOTALL,
)
STATIC_PAGE_SCHEMA_VERSION = "2"
STATIC_PAGE_SCHEMA_MARKER = f"STATIC_PAGE_SCHEMA_VERSION:{STATIC_PAGE_SCHEMA_VERSION}"


class ContractError(ValueError):
    """Raised when input cannot safely become public HTML."""


def fail(message: str) -> ContractError:
    return ContractError(message)


def has_sensitive_key(value: object) -> str | None:
    if isinstance(value, dict):
        for key, nested in value.items():
            normalized = str(key).lower().replace("-", "_")
            if normalized in SENSITIVE_KEYS:
                return str(key)
            found = has_sensitive_key(nested)
            if found:
                return found
    elif isinstance(value, list):
        for nested in value:
            found = has_sensitive_key(nested)
            if found:
                return found
    return None


def safe_public_id(value: object) -> str:
    public_id = str(value or "").strip()
    if not PUBLIC_ID_PATTERN.fullmatch(public_id):
        raise fail("public_id must be an opaque 6-80 character token")
    if TELEGRAM_DERIVED_ID_PATTERN.fullmatch(public_id):
        raise fail("public_id looks derived from a numeric Telegram identifier")
    return public_id


def safe_image_url(value: object, fallback: str) -> str:
    candidate = str(value or "").strip()
    parsed = urlparse(candidate)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return candidate
    return fallback


def first_safe_image_url(*values: object) -> str | None:
    for value in values:
        candidates = value if isinstance(value, list) else [value]
        for candidate in candidates:
            if isinstance(candidate, dict):
                candidate = (
                    candidate.get("url")
                    or candidate.get("signedUrl")
                    or candidate.get("signed_url")
                )
            image_url = safe_image_url(candidate, "")
            if image_url:
                return image_url
    return None


def normalize_item(raw: dict[str, object]) -> dict[str, object]:
    if not isinstance(raw, dict):
        raise fail("each item must be an object")
    sensitive_key = has_sensitive_key(raw)
    if sensitive_key:
        raise fail(f"sensitive field is not allowed in public input: {sensitive_key}")

    public_id = raw.get("public_id") or raw.get("item-id") or raw.get("item_id") or raw.get("id")
    public_id = safe_public_id(public_id)
    status = str(raw.get("status") or "available").strip().lower()
    if status not in {"available", "reserved", "completed", "expired"}:
        raise fail(f"unsupported public status for {public_id}: {status}")
    condition = str(raw.get("condition") or "").strip()
    if condition not in ITEM_CONDITIONS:
        condition = ""

    return {
        "id": public_id,
        "title": str(raw.get("title") or "Objeto de Segunda Vida").strip()[:160],
        "description": str(raw.get("description") or "").strip()[:1000],
        "category": str(raw.get("category") or "Otros").strip()[:80],
        "zone": str(raw.get("zone") or "Valladolid").strip()[:120],
        "condition": condition,
        "status": status,
        "created_at": raw.get("created_at") or raw.get("CreatedAt") or None,
        "expires_at": raw.get("expires_at") or None,
        "image_url": first_safe_image_url(raw.get("image_url"), raw.get("image_urls")),
        "owner_display_name": str(raw.get("owner_display_name") or "Vecindad").strip()[:120],
        "owner_username": str(raw.get("owner_username") or "").strip()[:40],
        "interest_count": max(0, int(raw.get("interest_count") or 0)),
        "favorite_count": max(0, int(raw.get("favorite_count") or 0)),
    }


def load_items(input_path: str | None, source_url: str | None) -> list[dict[str, object]]:
    if bool(input_path) == bool(source_url):
        raise fail("provide exactly one of --input or --source-url")

    if source_url:
        request = Request(source_url, headers={"Accept": "application/json"})
        with urlopen(request, timeout=30) as response:  # noqa: S310 - URL is an explicit operator input.
            payload = json.load(response)
    elif input_path == "-":
        payload = json.load(sys.stdin)
    else:
        payload = json.loads(Path(input_path).read_text(encoding="utf-8"))

    raw_items = payload if isinstance(payload, list) else payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(raw_items, list):
        raise fail("input must be an array or an object with items")

    normalized = [normalize_item(item) for item in raw_items]
    return sorted(normalized, key=lambda item: str(item["id"]))


def json_for_script(item: dict[str, object], site_url: str) -> str:
    safe_item = dict(item)
    safe_item["image_url"] = safe_image_url(
        item.get("image_url"),
        f"{site_url.rstrip('/')}/assets/segundavida-mark.png",
    )
    value = json.dumps(safe_item, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return value.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def stable_image_identity(value: object) -> str:
    """Return a comparable identity for public image URLs.

    NocoDB's public download URLs can rotate their token and expiry prefix while
    still referring to the same attachment. Those rotating values must not make
    an otherwise unchanged static page regenerate on every reconciliation.
    """

    candidate = safe_image_url(value, "")
    if not candidate:
        return ""

    parsed = urlparse(candidate)
    path = parsed.path
    dltemp_marker = "/dltemp/"
    if dltemp_marker in path:
        prefix, suffix = path.split(dltemp_marker, 1)
        segments = suffix.split("/", 2)
        if len(segments) == 3:
            path = f"{prefix}{dltemp_marker}{segments[2]}"

    return f"{parsed.scheme}://{parsed.netloc}{path}"


def static_projection(item: dict[str, object]) -> dict[str, object]:
    """Fields that affect social metadata or the initial no-JS snapshot."""

    return {
        "id": item["id"],
        "title": item["title"],
        "description": item["description"],
        "category": item["category"],
        "zone": item["zone"],
        "condition": item["condition"],
        "owner_display_name": item["owner_display_name"],
        "owner_username": item["owner_username"],
        "image_identity": stable_image_identity(item.get("image_url")),
    }


def static_fingerprint(item: dict[str, object]) -> str:
    value = json.dumps(
        static_projection(item),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def extract_static_item(page_path: Path, site_url: str) -> dict[str, object] | None:
    """Read the public snapshot embedded in an existing generated page."""

    try:
        page = page_path.read_text(encoding="utf-8")
        if STATIC_PAGE_SCHEMA_MARKER not in page:
            return None
        match = STATIC_ITEM_DATA_PATTERN.search(page)
        if not match:
            return None
        raw = json.loads(match.group(1))
        if not isinstance(raw, dict):
            return None
        item = normalize_item(raw)
        fallback = f"{site_url.rstrip('/')}/assets/segundavida-mark.png"
        if item.get("image_url") == fallback:
            item["image_url"] = None
        return item
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def existing_static_pages(output_dir: Path, site_url: str) -> dict[str, tuple[Path, dict[str, object]]]:
    pages: dict[str, tuple[Path, dict[str, object]]] = {}
    item_root = output_dir / "i"
    if not item_root.exists():
        return pages

    for item_dir in item_root.iterdir():
        if not item_dir.is_dir():
            continue
        page_path = item_dir / "index.html"
        if not page_path.is_file():
            continue
        item = extract_static_item(page_path, site_url)
        if item:
            pages[str(item["id"])] = (page_path, item)
    return pages


def canonical_url(site_url: str, public_id: str) -> str:
    return f"{site_url.rstrip('/')}/i/{quote(public_id, safe='')}/"


def parse_rss_datetime(value: object) -> datetime | None:
    candidate = str(value or "").strip()
    if not candidate:
        return None
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def render_rss_feed(items: list[dict[str, object]], site_url: str) -> str:
    base_url = site_url.rstrip("/")
    feed_url = f"{base_url}/feed.xml"
    homepage_url = f"{base_url}/"
    fallback_image = f"{base_url}/assets/segundavida-mark.png"

    dated_items = [
        (item, parse_rss_datetime(item.get("created_at")))
        for item in items
    ]
    dated_items.sort(
        key=lambda entry: (
            entry[1] is not None,
            entry[1] or datetime.min.replace(tzinfo=timezone.utc),
            str(entry[0]["id"]),
        ),
        reverse=True,
    )
    dates = [date for _, date in dated_items if date is not None]

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
        "  <channel>",
        "    <title>Segunda Vida · Aldea Pucela</title>",
        f'    <link>{html.escape(homepage_url, quote=False)}</link>',
        "    <description>Últimas publicaciones públicas de Segunda Vida en Aldea Pucela.</description>",
        "    <language>es</language>",
        f'    <atom:link href="{html.escape(feed_url, quote=True)}" rel="self" type="application/rss+xml" />',
        "    <image>",
        f'      <url>{html.escape(fallback_image, quote=False)}</url>',
        "      <title>Segunda Vida · Aldea Pucela</title>",
        f'      <link>{html.escape(homepage_url, quote=False)}</link>',
        "    </image>",
    ]
    if dates:
        lines.append(f"    <lastBuildDate>{format_datetime(max(dates), usegmt=True)}</lastBuildDate>")

    for item, published_at in dated_items:
        item_url = canonical_url(site_url, str(item["id"]))
        description = item["description"] or "Consulta la disponibilidad actual en Segunda Vida."
        image_url = safe_image_url(item.get("image_url"), "")
        lines.extend([
            "    <item>",
            f'      <title>{html.escape(str(item["title"]), quote=False)}</title>',
            f'      <link>{html.escape(item_url, quote=False)}</link>',
            f'      <guid isPermaLink="true">{html.escape(item_url, quote=False)}</guid>',
            f'      <description>{html.escape(str(description), quote=False)}</description>',
            f'      <category>{html.escape(str(item["category"]), quote=False)}</category>',
            f'      <category>{html.escape(str(item["zone"]), quote=False)}</category>',
        ])
        if published_at is not None:
            lines.append(f"      <pubDate>{format_datetime(published_at, usegmt=True)}</pubDate>")
        if image_url:
            lines.append(
                f'      <media:content url="{html.escape(image_url, quote=True)}" medium="image" />'
            )
        lines.extend(["    </item>", ""])

    lines.extend(["  </channel>", "</rss>", ""])
    return "\n".join(lines)


def render_metadata(item: dict[str, object], site_url: str) -> str:
    title = f"{item['title']} · Segunda Vida"
    description = (item["description"] or f"{item['title']} disponible en Segunda Vida, Aldea Pucela.")[:200]
    canonical = canonical_url(site_url, str(item["id"]))
    fallback_image = f"{site_url.rstrip('/')}/assets/segundavida-mark.png"
    image = safe_image_url(item.get("image_url"), fallback_image)
    fields = [
        f'<meta name="description" content="{html.escape(description, quote=True)}" />',
        f'<link id="page-canonical" rel="canonical" href="{html.escape(canonical, quote=True)}" />',
        f'<meta property="og:type" content="website" />',
        f'<meta property="og:locale" content="es_ES" />',
        f'<meta property="og:site_name" content="Segunda Vida · Aldea Pucela" />',
        f'<meta property="og:title" content="{html.escape(title, quote=True)}" />',
        f'<meta property="og:description" content="{html.escape(description, quote=True)}" />',
        f'<meta property="og:url" content="{html.escape(canonical, quote=True)}" />',
        f'<meta property="og:image" content="{html.escape(image, quote=True)}" />',
        f'<meta property="og:image:alt" content="{html.escape(str(item["title"]), quote=True)}" />',
        f'<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{html.escape(title, quote=True)}" />',
        f'<meta name="twitter:description" content="{html.escape(description, quote=True)}" />',
        f'<meta name="twitter:image" content="{html.escape(image, quote=True)}" />',
        f'<meta name="twitter:image:alt" content="{html.escape(str(item["title"]), quote=True)}" />',
    ]
    return "\n    ".join(fields)


def render_fallback(item: dict[str, object], site_url: str) -> str:
    image = safe_image_url(item.get("image_url"), f"{site_url.rstrip('/')}/assets/segundavida-mark.png")
    description = item["description"] or "Consulta la disponibilidad actual en Segunda Vida."
    condition = f'Estado: {item["condition"]}' if item["condition"] else "Estado no indicado"
    return (
        "<noscript>\n"
        '  <article class="static-item-fallback" itemscope itemtype="https://schema.org/Product">\n'
        f'    <img src="{html.escape(image, quote=True)}" alt="" itemprop="image" />\n'
        f'    <h1 itemprop="name">{html.escape(str(item["title"]))}</h1>\n'
        f'    <p itemprop="description">{html.escape(description)}</p>\n'
        f'    <p>{html.escape(str(item["category"]))} · {html.escape(str(item["zone"]))}</p>\n'
        f'    <p>{html.escape(condition)}</p>\n'
        '    <p>La disponibilidad se comprueba al abrir la publicación.</p>\n'
        "  </article>\n"
        "</noscript>"
    )


def render_page(template: str, item: dict[str, object], site_url: str) -> str:
    title = html.escape(f"{item['title']} · Segunda Vida")
    page = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", template, count=1, flags=re.DOTALL)
    page = re.sub(r"\s*<meta\s+name=\"description\"[^>]*?/>", "", page, count=1)
    page = re.sub(
        r"\s*<!-- STATIC_HOME_METADATA -->.*?<!-- END_STATIC_HOME_METADATA -->",
        "",
        page,
        count=1,
        flags=re.DOTALL,
    )
    page = page.replace("<!-- STATIC_ITEM_METADATA -->", render_metadata(item, site_url))
    page = page.replace(
        "<!-- STATIC_ITEM_DATA -->",
        f'<!-- {STATIC_PAGE_SCHEMA_MARKER} -->\n'
        f'<script type="application/json" id="static-item-data">{json_for_script(item, site_url)}</script>',
    )
    page = page.replace("<!-- STATIC_ITEM_FALLBACK -->", render_fallback(item, site_url))
    return page


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.replace("\r\n", "\n"), encoding="utf-8")


def write_catalog_files(
    items: list[dict[str, object]],
    output_dir: Path,
    site_url: str,
    fallback_template: str,
) -> None:
    urls = [f"{site_url.rstrip('/')}/"] + [canonical_url(site_url, str(item["id"])) for item in items]
    sitemap = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
    sitemap += "".join(f"  <url><loc>{html.escape(url)}</loc></url>\n" for url in urls)
    sitemap += "</urlset>\n"
    write_text(output_dir / "sitemap.xml", sitemap)
    write_text(output_dir / "feed.xml", render_rss_feed(items, site_url))
    write_text(
        output_dir / "robots.txt",
        "User-agent: *\nAllow: /\nSitemap: " + site_url.rstrip("/") + "/sitemap.xml\n",
    )
    write_text(output_dir / "404.html", fallback_template)


def reconcile(
    items: list[dict[str, object]],
    output_dir: Path,
    template_path: Path,
    site_url: str,
    *,
    force_full: bool = False,
) -> dict[str, int]:
    """Reconcile generated pages while preserving unchanged snapshots.

    The source inventory is authoritative for which public IDs exist, but live
    operational fields such as status and counters are deliberately excluded
    from the static fingerprint. The app hydrates those fields from /item/<id>.
    """

    template = template_path.read_text(encoding="utf-8")
    output_dir.mkdir(parents=True, exist_ok=True)
    current_items = {str(item["id"]): item for item in items}
    current_ids = set(current_items)
    existing = existing_static_pages(output_dir, site_url)
    item_root = output_dir / "i"
    removed = 0

    if item_root.exists():
        for item_dir in list(item_root.iterdir()):
            if item_dir.is_dir() and item_dir.name not in current_ids:
                shutil.rmtree(item_dir)
                removed += 1

    created = 0
    updated = 0
    preserved = 0
    snapshots: list[dict[str, object]] = []
    for item_id in sorted(current_items):
        item = current_items[item_id]
        page_path = output_dir / "i" / str(item["id"]) / "index.html"
        previous = existing.get(item_id)
        previous_item = previous[1] if previous else None
        page_existed = page_path.is_file()
        can_preserve = (
            not force_full
            and previous_item is not None
            and page_existed
            and static_fingerprint(previous_item) == static_fingerprint(item)
        )
        if can_preserve:
            snapshots.append(previous_item)
            preserved += 1
            continue

        write_text(page_path, render_page(template, item, site_url))
        snapshots.append(item)
        if previous_item is None or not page_existed:
            created += 1
        else:
            updated += 1

    fallback_template_path = template_path.parent / "404.html"
    fallback_template = fallback_template_path.read_text(encoding="utf-8") if fallback_template_path.exists() else template
    write_catalog_files(snapshots, output_dir, site_url, fallback_template)
    return {
        "created": created,
        "updated": updated,
        "preserved": preserved,
        "removed": removed,
        "total": len(items),
    }


def generate(items: list[dict[str, object]], output_dir: Path, template_path: Path, site_url: str) -> int:
    return reconcile(items, output_dir, template_path, site_url, force_full=True)["total"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", help="JSON file, or - for stdin")
    source.add_argument("--source-url", help="Public JSON endpoint returning items")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--template", type=Path, default=Path("index.html"))
    parser.add_argument("--site-url", default="https://segundavida.aldeapucela.org")
    parser.add_argument(
        "--mode",
        choices=("full", "incremental"),
        default="full",
        help="Rebuild all pages or preserve unchanged pages in the output directory",
    )
    parser.add_argument(
        "--stats-file",
        type=Path,
        help="Write reconciliation counters as JSON for CI decisions",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        items = load_items(args.input, args.source_url)
        stats = reconcile(
            items,
            args.output_dir,
            args.template,
            args.site_url,
            force_full=args.mode == "full",
        )
    except (ContractError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"generate_static_pages: {error}", file=sys.stderr)
        return 2
    print(
        "Generated/reconciled "
        f"{stats['total']} public item page(s) in {args.output_dir} "
        f"(created={stats['created']}, updated={stats['updated']}, "
        f"preserved={stats['preserved']}, removed={stats['removed']})"
    )
    if args.stats_file:
        write_text(args.stats_file, json.dumps(stats, ensure_ascii=False, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
