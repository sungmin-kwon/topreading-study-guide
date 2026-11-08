import html
import json
import os
import posixpath
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import PurePosixPath
from urllib.parse import unquote, urldefrag
from xml.etree import ElementTree

import pymupdf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


class TextExtractor(HTMLParser):
    block_tags = {
        "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt",
        "figcaption", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
        "li", "main", "nav", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0
        self.anchors = {}

    def handle_starttag(self, tag, attrs):
        lowered = tag.lower()
        if lowered in {"script", "style", "svg"}:
            self.skip_depth += 1
            return
        if lowered in self.block_tags:
            self.parts.append("\n")
        anchor = dict(attrs).get("id")
        if anchor:
            self.anchors[anchor] = len(normalize_text("".join(self.parts)))

    def handle_endtag(self, tag):
        lowered = tag.lower()
        if lowered in {"script", "style", "svg"} and self.skip_depth:
            self.skip_depth -= 1
            return
        if lowered in self.block_tags:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip_depth:
            self.parts.append(data)

    def text(self):
        return normalize_text("".join(self.parts))


def normalize_text(value: str) -> str:
    text = html.unescape(str(value or ""))
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\u000c", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def count_words(text: str) -> int:
    return len([word for word in re.split(r"\s+", text.strip()) if word])


def decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp949", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def parse_html_text(data: bytes) -> str:
    parser = TextExtractor()
    parser.feed(decode_text(data))
    return parser.text()


def extract_pdf(source_path: str) -> dict:
    document = pymupdf.open(source_path)
    metadata = document.metadata or {}
    pages = []

    for index, page in enumerate(document, start=1):
        text = normalize_text(page.get_text("text"))
        pages.append({"page_number": index, "text": text})

    return {
        "parser": "pymupdf",
        "parser_version": getattr(pymupdf, "version", ("unknown",))[0],
        "page_count": len(document),
        "metadata": {
            "title": metadata.get("title") or "",
            "author": metadata.get("author") or "",
            "subject": metadata.get("subject") or "",
            "creator": metadata.get("creator") or "",
            "producer": metadata.get("producer") or "",
            "source_format": "pdf",
            "empty_text_pages": [p["page_number"] for p in pages if not p["text"]],
            "outline": [{"page": e[2], "offset": 0, "title": e[1]} for e in document.get_toc() if 1 <= e[2] <= len(document)],
        },
        "pages": pages,
        "text": "\n\n".join(page["text"] for page in pages).strip(),
    }


def extract_txt(source_path: str) -> dict:
    with open(source_path, "rb") as file:
        text = normalize_text(decode_text(file.read()))

    return {
        "parser": "plain-text",
        "parser_version": "1",
        "page_count": 1 if text else 0,
        "metadata": {"source_format": "txt"},
        "pages": [{"page_number": 1, "text": text}] if text else [],
        "text": text,
    }


def find_container_opf(epub: zipfile.ZipFile) -> str:
    container = ElementTree.fromstring(epub.read("META-INF/container.xml"))
    rootfile = container.find(".//{urn:oasis:names:tc:opendocument:xmlns:container}rootfile")
    if rootfile is None:
        raise ValueError("EPUB container is missing the OPF rootfile.")
    path = rootfile.attrib.get("full-path", "")
    if not path:
        raise ValueError("EPUB OPF rootfile path is empty.")
    return path


def xml_text(element: ElementTree.Element | None) -> str:
    if element is None:
        return ""
    return normalize_text("".join(element.itertext()))


def extract_epub(source_path: str) -> dict:
    with zipfile.ZipFile(source_path) as epub:
        opf_path = find_container_opf(epub)
        opf_dir = posixpath.dirname(opf_path)
        opf = ElementTree.fromstring(epub.read(opf_path))
        namespace = {"opf": "http://www.idpf.org/2007/opf", "dc": "http://purl.org/dc/elements/1.1/"}

        manifest = {}
        for item in opf.findall(".//opf:manifest/opf:item", namespace):
            item_id = item.attrib.get("id")
            href = item.attrib.get("href")
            media_type = item.attrib.get("media-type", "")
            if item_id and href:
                manifest[item_id] = {
                    "href": href,
                    "media_type": media_type,
                    "properties": item.attrib.get("properties", ""),
                }

        pages = []
        locations = {}
        for itemref in opf.findall(".//opf:spine/opf:itemref", namespace):
            item_id = itemref.attrib.get("idref")
            item = manifest.get(item_id or "")
            if not item or item["media_type"] not in {"application/xhtml+xml", "text/html"}:
                continue

            href = item["href"]
            normalized_path = str(PurePosixPath(posixpath.join(opf_dir, href)))
            if normalized_path not in epub.namelist():
                continue

            parser = TextExtractor()
            parser.feed(decode_text(epub.read(normalized_path)))
            text = parser.text()
            if text:
                page_number = len(pages) + 1
                pages.append({"page_number": page_number, "text": text})
                anchors = {}
                for anchor, offset in parser.anchors.items():
                    while offset < len(text) and text[offset].isspace():
                        offset += 1
                    anchors[anchor] = len(text[:offset].encode("utf-16-le")) // 2
                locations[posixpath.normpath(normalized_path)] = (page_number, anchors)

        outline = []
        def add_link(href, title, base):
            target, fragment = urldefrag(unquote(href))
            location = locations.get(posixpath.normpath(posixpath.join(base, target)))
            if location and (not fragment or fragment in location[1]) and title:
                outline.append({"page": location[0], "offset": location[1].get(fragment, 0), "title": title})
        for item in manifest.values():
            nav_path = posixpath.normpath(posixpath.join(opf_dir, item["href"]))
            if nav_path not in epub.namelist():
                continue
            if "nav" in item["properties"].split():
                tree = ElementTree.fromstring(epub.read(nav_path))
                for nav in tree.iter():
                    if nav.tag.split("}")[-1] != "nav" or "toc" not in nav.attrib.get("{http://www.idpf.org/2007/ops}type", "").split():
                        continue
                    for link in nav.iter():
                        if link.tag.split("}")[-1] == "a":
                            add_link(link.attrib.get("href", ""), xml_text(link), posixpath.dirname(nav_path))
        if not outline:
            for item in manifest.values():
                if item["media_type"] != "application/x-dtbncx+xml":
                    continue
                nav_path = posixpath.normpath(posixpath.join(opf_dir, item["href"]))
                if nav_path not in epub.namelist():
                    continue
                tree = ElementTree.fromstring(epub.read(nav_path))
                for point in tree.iter():
                    if point.tag.split("}")[-1] != "navPoint":
                        continue
                    label = point.find("{*}navLabel")
                    content = point.find("{*}content")
                    if content is not None:
                        add_link(content.attrib.get("src", ""), xml_text(label), posixpath.dirname(nav_path))

        metadata = {
            "title": xml_text(opf.find(".//dc:title", namespace)),
            "author": xml_text(opf.find(".//dc:creator", namespace)),
            "source_format": "epub",
            "outline": outline[:1000],
        }

    return {
        "parser": "epub-zip-html",
        "parser_version": "1",
        "page_count": len(pages),
        "metadata": metadata,
        "pages": pages,
        "text": "\n\n".join(page["text"] for page in pages).strip(),
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: extract_source_text.py <source_path>"}))
        return 1

    source_path = sys.argv[1]
    extension = os.path.splitext(source_path)[1].lower()

    try:
        if extension == ".pdf":
            payload = extract_pdf(source_path)
        elif extension == ".txt":
            payload = extract_txt(source_path)
        elif extension == ".epub":
            payload = extract_epub(source_path)
        else:
            payload = {"error": "Unsupported source file type."}
    except Exception as exc:
        payload = {"error": f"Failed to extract text: {exc}"}

    print(json.dumps(payload, ensure_ascii=False))
    return 0 if "error" not in payload else 1


if __name__ == "__main__":
    raise SystemExit(main())
