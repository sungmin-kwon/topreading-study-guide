import json
import os
import sys

import pymupdf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# A4 portrait in PDF points.
PAGE_WIDTH = 595
PAGE_HEIGHT = 842
MARGINS = {
    "top": 66,
    "bottom": 48,
    "left": 54,
    "right": 54,
}
CONTENT_WIDTH = PAGE_WIDTH - MARGINS["left"] - MARGINS["right"]


def get_font_path() -> str | None:
    candidates = [
        r"C:\Windows\Fonts\malgun.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def text_needs_custom_font(value: str) -> bool:
    return any(ord(char) > 255 for char in str(value or ""))


def payload_needs_custom_font(payload: dict) -> bool:
    values = [
        payload.get("header", ""),
        payload.get("title", ""),
        payload.get("subtitle", ""),
    ]

    for section in payload.get("sections", []):
        values.append(section.get("heading", ""))
        for item in section.get("items", []):
            values.append(item.get("text", ""))

    return any(text_needs_custom_font(value) for value in values)


def estimate_width_units(text: str) -> float:
    units = 0.0
    for char in text:
        units += 1.8 if ord(char) > 127 else 1.0
    return units


def wrap_line(text: str, size: int, indent: int = 0) -> list[str]:
    text = " ".join(str(text or "").split())
    if not text:
        return [""]

    max_units = max(20, (CONTENT_WIDTH - indent) / (size * 0.52))
    words = text.split(" ")
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        if current and estimate_width_units(candidate) > max_units:
            lines.append(current)
            current = word
        else:
            current = candidate

    if current:
        lines.append(current)

    return lines


class PdfWriter:
    def __init__(self, title: str, use_custom_font: bool):
        self.doc = pymupdf.open()
        self.title = title
        self.font_path = get_font_path() if use_custom_font else None
        # PyMuPDF bundles this CJK font on Linux too. Embed its bytes so the
        # exported file renders independently of fonts on the reader's device.
        self.font_buffer = (
            pymupdf.Font("korea").buffer
            if use_custom_font and not self.font_path else None
        )
        self.font_name = "body" if self.font_path or self.font_buffer else "helv"
        self.bold_font_name = self.font_name if use_custom_font else "hebo"
        self.page = None
        self.y = 0
        self.add_page()

    def add_page(self):
        self.page = self.doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        if self.font_path or self.font_buffer:
            self.page.insert_font(
                fontname=self.font_name,
                fontfile=self.font_path,
                fontbuffer=self.font_buffer,
            )
        self.y = MARGINS["top"]
        self.draw_header()

    def draw_header(self):
        self.page.insert_text(
            (MARGINS["left"], 34),
            self.title[:90],
            fontsize=9,
            fontname=self.font_name,
            color=(0.35, 0.42, 0.52),
        )
        self.page.draw_line(
            (MARGINS["left"], 43),
            (PAGE_WIDTH - MARGINS["right"], 43),
            color=(0.82, 0.87, 0.93),
            width=0.8,
        )

    def ensure_space(self, height: float):
        if self.y + height > PAGE_HEIGHT - MARGINS["bottom"]:
            self.add_page()

    def estimate_item_height(self, item: dict) -> float:
        kind = item.get("kind", "text")
        if kind == "blank":
            return int(item.get("gap", 20))

        size = int(item.get("size", 10))
        indent = int(item.get("indent", 0))
        gap = int(item.get("gap", 5))
        lines = wrap_line(item.get("text", ""), size=size, indent=indent)
        return len(lines) * (size + 4) + gap

    def ensure_block_space(self, block: list[dict]):
        height = sum(self.estimate_item_height(item) for item in block)
        self.ensure_space(height)

    def add_text(self, text: str, size: int = 10, bold: bool = False, indent: int = 0, gap: int = 5):
        lines = wrap_line(text, size=size, indent=indent)
        height = len(lines) * (size + 5) + gap
        self.ensure_space(height)

        for line in lines:
            self.page.insert_text(
                (MARGINS["left"] + indent, self.y),
                line,
                fontsize=size,
                fontname=self.bold_font_name if bold else self.font_name,
                color=(0.1, 0.1, 0.1),
            )
            self.y += size + 4
        self.y += gap

    def add_blank_line(self, indent: int = 16, gap: int = 20):
        self.ensure_space(34)
        y = self.y + 4
        self.page.draw_line(
            (MARGINS["left"] + indent, y),
            (PAGE_WIDTH - MARGINS["right"], y),
            color=(0.15, 0.15, 0.15),
            width=0.7,
        )
        self.y += gap

    def save(self, output_path: str):
        for index, page in enumerate(self.doc, start=1):
            label = f"Page {index} of {len(self.doc)}"
            page.insert_text(
                (PAGE_WIDTH - MARGINS["right"] - 72, PAGE_HEIGHT - 24),
                label,
                fontsize=9,
                fontname=self.font_name,
                color=(0.45, 0.5, 0.58),
            )
        if hasattr(self.doc, "subset_fonts"):
            self.doc.subset_fonts()
        self.doc.save(
            output_path,
            garbage=4,
            deflate=True,
            deflate_fonts=True,
            deflate_images=True,
            use_objstms=1,
        )


def render(payload: dict, output_path: str):
    writer = PdfWriter(
        payload.get("header", payload.get("title", "Study Guide Export")),
        use_custom_font=payload_needs_custom_font(payload),
    )
    if payload.get("show_title", False):
        writer.add_text(payload.get("title", "Study Guide Export"), size=15, bold=True, gap=12)
        subtitle = payload.get("subtitle", "")
        if subtitle:
            writer.add_text(subtitle, size=9, gap=16)

    for section in payload.get("sections", []):
        heading = section.get("heading", "")
        if heading:
            writer.add_text(heading, size=12, bold=True, gap=8)

        pending_block = []

        def flush_block():
            nonlocal pending_block
            if not pending_block:
                return

            writer.ensure_block_space(pending_block)
            for block_item in pending_block:
                block_kind = block_item.get("kind", "text")
                if block_kind == "blank":
                    writer.add_blank_line(
                        indent=int(block_item.get("indent", 16)),
                        gap=int(block_item.get("gap", 20)),
                    )
                else:
                    writer.add_text(
                        block_item.get("text", ""),
                        size=int(block_item.get("size", 10)),
                        bold=bool(block_item.get("bold", False)),
                        indent=int(block_item.get("indent", 0)),
                        gap=int(block_item.get("gap", 5)),
                    )
            pending_block = []

        for item in section.get("items", []):
            if item.get("block_start"):
                flush_block()

            pending_block.append(item)

            if item.get("block_end"):
                flush_block()

        flush_block()

        writer.y += 8

    writer.save(output_path)


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: render_study_set_pdf.py <input.json> <output.pdf>"}))
        return 1

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    render(payload, output_path)
    print(json.dumps({"output_path": output_path}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
