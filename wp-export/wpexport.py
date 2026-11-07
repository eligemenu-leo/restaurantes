import json, os, re, sys, time, urllib.request, urllib.error, urllib.parse
from xml.etree import ElementTree as ET

UA = {"User-Agent": "Mozilla/5.0 (wp-export migration; read-only)"}
LIMIT = 300 * 1024 * 1024


def get(url, timeout=60):
    url = urllib.parse.quote(url, safe=":/?&=%#@+,;~")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.read()


def run(domain, outroot):
    base = f"https://{domain}"
    out = os.path.join(outroot, domain)
    for d in ("api", "sitemaps", "html", "media"):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    errors, data = [], {}

    # REST API
    for ep in ("pages", "posts", "media", "categories", "tags"):
        items, page = [], 1
        try:
            while True:
                st, h, body = get(f"{base}/wp-json/wp/v2/{ep}?per_page=100&page={page}")
                items += json.loads(body)
                total = int(h.get("X-WP-TotalPages") or h.get("x-wp-totalpages") or 1)
                if page >= total:
                    break
                page += 1
        except Exception as e:
            errors.append(f"API /wp-json/wp/v2/{ep} (page {page}): {e}")
        data[ep] = items
        json.dump(items, open(os.path.join(out, "api", f"{ep}.json"), "w"), ensure_ascii=False, indent=2)
    try:
        st, h, body = get(f"{base}/wp-json/wp/v2/types")
        json.dump(json.loads(body), open(os.path.join(out, "api", "types.json"), "w"), ensure_ascii=False, indent=2)
    except Exception as e:
        errors.append(f"API /wp-json/wp/v2/types: {e}")

    # Sitemaps
    urls = set()
    queue = [f"{base}/wp-sitemap.xml", f"{base}/sitemap_index.xml", f"{base}/sitemap.xml"]
    seen = set()
    while queue:
        sm = queue.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        try:
            st, h, body = get(sm)
        except Exception as e:
            if sm in (f"{base}/wp-sitemap.xml", f"{base}/sitemap_index.xml", f"{base}/sitemap.xml"):
                errors.append(f"Sitemap {sm}: {e}")
            continue
        try:
            root = ET.fromstring(body)
        except Exception:
            errors.append(f"Sitemap {sm}: no es XML válido")
            continue
        name = urllib.parse.urlparse(sm).path.strip("/").replace("/", "_") or "sitemap.xml"
        open(os.path.join(out, "sitemaps", name), "wb").write(body)
        tag = root.tag.split("}")[-1]
        for loc in root.iter():
            if loc.tag.endswith("loc") and loc.text:
                u = loc.text.strip()
                if tag == "sitemapindex":
                    queue.append(u)
                elif not re.search(r"\.(jpe?g|png|gif|webp|svg|pdf)$", u, re.I):
                    urls.add(u)
    for ep in ("pages", "posts"):
        for it in data.get(ep, []):
            if it.get("link"):
                urls.add(it["link"])
    urls.add(base + "/")
    urls = sorted(u for u in urls if urllib.parse.urlparse(u).netloc.endswith(domain))
    open(os.path.join(out, "urls.txt"), "w").write("\n".join(urls) + "\n")

    # HTML
    html_all, used = {}, set()
    for u in urls:
        path = urllib.parse.urlparse(u).path.strip("/")
        slug = path.replace("/", "_") or "index"
        while slug in used:
            slug += "_"
        used.add(slug)
        try:
            st, h, body = get(u)
            open(os.path.join(out, "html", f"{slug}.html"), "wb").write(body)
            html_all[u] = body.decode("utf-8", "replace")
        except Exception as e:
            errors.append(f"HTML {u}: {e}")
        time.sleep(0.2)

    # Media
    media_urls = []
    for m in data.get("media", []):
        if m.get("source_url"):
            media_urls.append(m["source_url"])
    up_re = re.compile(r"https?://[^\s\"'()<>]*?/wp-content/uploads/[^\s\"'()<>?#]+\.(?:jpe?g|png|gif|webp|svg|avif)", re.I)
    for text in html_all.values():
        for mu in up_re.findall(text.replace("\\/", "/")):
            media_urls.append(mu)
    total, got, stopped, names = 0, 0, False, set()
    for mu in dict.fromkeys(media_urls):
        fname = urllib.parse.unquote(os.path.basename(urllib.parse.urlparse(mu).path))
        if fname in names:
            continue
        names.add(fname)
        try:
            st, h, body = get(mu, timeout=120)
        except Exception as e:
            errors.append(f"Media {mu}: {e}")
            continue
        if total + len(body) > LIMIT:
            stopped = True
            errors.append(f"Límite de 300 MB alcanzado: descarga de medios detenida en {mu}")
            break
        open(os.path.join(out, "media", fname), "wb").write(body)
        total += len(body)
        got += 1

    # Report
    plugins = set()
    forms = []
    for u, text in html_all.items():
        plugins.update(re.findall(r"wp-content/plugins/([A-Za-z0-9_.-]+)/", text))
        for f in re.findall(r"<form\b[^>]*>", text, re.I):
            cls = re.search(r'class="([^"]*)"', f)
            act = re.search(r'action="([^"]*)"', f)
            fid = re.search(r'id="([^"]*)"', f)
            forms.append((u, fid.group(1) if fid else "", cls.group(1) if cls else "", act.group(1) if act else ""))
        for sc in re.findall(r"(wpcf7|contact-form-7|wpforms|gform_|elementor-form|ninja-forms|fluentform|formidable)", text):
            pass
    lines = [f"# Exportación WordPress: {domain}", "",
             f"Fecha: {time.strftime('%Y-%m-%d %H:%M')}", "",
             "## Recuento", "",
             f"- Páginas (API): {len(data.get('pages', []))}",
             f"- Entradas (API): {len(data.get('posts', []))}",
             f"- Medios (API): {len(data.get('media', []))}",
             f"- Categorías: {len(data.get('categories', []))} · Etiquetas: {len(data.get('tags', []))}",
             f"- URLs públicas (urls.txt): {len(urls)} · HTML guardados: {len(html_all)}",
             f"- Archivos de medios descargados: {got} ({total/1024/1024:.1f} MB)" + (" — DETENIDO por límite de 300 MB" if stopped else ""),
             "", "## Plugins detectados (rutas wp-content/plugins)", ""]
    lines += [f"- {p}" for p in sorted(plugins)] or ["- (ninguno)"]
    lines += ["", "## Formularios encontrados", ""]
    if forms:
        lines += ["| URL | id | class | action |", "|---|---|---|---|"]
        seenf = set()
        for f in forms:
            key = f[1:]
            if key in seenf:
                continue
            seenf.add(key)
            lines.append("| " + " | ".join(x.replace("|", "\\|") for x in f) + " |")
        lines.append("")
        lines.append("(Formularios únicos por id/class/action; la primera URL donde aparecen.)")
    else:
        lines.append("- (ninguno)")
    lines += ["", "## Errores", ""]
    lines += [f"- {e}" for e in errors] or ["- (ninguno)"]
    open(os.path.join(out, "INFORME.md"), "w").write("\n".join(lines) + "\n")
    print(domain, "pages", len(data.get("pages", [])), "posts", len(data.get("posts", [])),
          "media", len(data.get("media", [])), "urls", len(urls), "files", got, f"{total/1e6:.1f}MB", "errors", len(errors))


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
