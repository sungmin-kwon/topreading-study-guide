import json
import sys

import pymupdf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: extract_pdf_text.py <pdf_path>"}))
        return 1

    pdf_path = sys.argv[1]

    try:
        document = pymupdf.open(pdf_path)
    except Exception as exc:
        print(json.dumps({"error": f"Failed to open PDF: {exc}"}))
        return 1

    metadata = document.metadata or {}
    pages = []

    for index, page in enumerate(document, start=1):
        text = page.get_text("text")
        cleaned = text.replace("\r\n", "\n").strip()
        if cleaned:
            pages.append({
                "page_number": index,
                "text": cleaned,
            })

    payload = {
        "parser": "pymupdf",
        "parser_version": getattr(pymupdf, "version", ("unknown",))[0],
        "page_count": len(document),
        "metadata": {
            "title": metadata.get("title") or "",
            "author": metadata.get("author") or "",
            "subject": metadata.get("subject") or "",
            "creator": metadata.get("creator") or "",
            "producer": metadata.get("producer") or "",
        },
        "pages": pages,
        "text": "\n\n".join(page["text"] for page in pages).strip(),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
