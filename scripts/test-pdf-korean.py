"""Check exported Unicode text and embedded glyphs without OS font installs."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pymupdf

spec = importlib.util.spec_from_file_location("pdf_export", Path(__file__).with_name("render_study_set_pdf.py"))
pdf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pdf)


class KoreanPdfTests(unittest.TestCase):
    def test_korean_vocabulary_survives_linux_export_and_new_pages(self):
        payload = {
            "header": "학습지 — Vocabulary",
            "sections": [{"heading": "Vocabulary", "items": [
                {"text": f"{n}. gate: an entrance | 문, 출입구", "gap": 10}
                for n in range(1, 90)
            ]}],
        }
        with tempfile.TemporaryDirectory() as directory, patch.object(pdf, "get_font_path", return_value=None):
            output = Path(directory) / "guide.pdf"
            pdf.render(payload, str(output))
            with pymupdf.open(output) as doc:
                self.assertGreater(len(doc), 1)
                text = "".join(page.get_text() for page in doc)
                self.assertEqual(text.count("문, 출입구"), 89)
                self.assertEqual(text.count("학습지"), len(doc))
                for page in doc:
                    fonts = page.get_fonts(full=True)
                    self.assertTrue(fonts)
                    self.assertTrue(any(len(doc.extract_font(font[0])[3]) > 0 for font in fonts))
                pix = doc[0].get_pixmap()
                self.assertGreater(pix.width, 0)

    def test_korean_only_in_header_also_selects_unicode_font(self):
        self.assertTrue(pdf.payload_needs_custom_font({"header": "한글", "sections": []}))
        self.assertFalse(pdf.payload_needs_custom_font({"title": "English", "sections": []}))


if __name__ == "__main__":
    unittest.main()
