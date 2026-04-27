import html
import json
import os
import sys
import zipfile

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""

DOCUMENT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>
"""

STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="80" w:line="260" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Malgun Gothic"/><w:sz w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="260" w:after="120"/><w:keepNext/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Question">
    <w:name w:val="Question"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="80" w:after="70"/><w:keepNext/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Choice">
    <w:name w:val="Choice"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="360"/><w:spacing w:after="20"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="AnswerLine">
    <w:name w:val="Answer Line"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="360"/><w:spacing w:after="140"/></w:pPr>
  </w:style>
</w:styles>
"""


def text_run(text: str, bold: bool = False) -> str:
    bold_xml = "<w:b/>" if bold else ""
    return (
        "<w:r>"
        f"<w:rPr>{bold_xml}<w:rFonts w:ascii=\"Arial\" w:hAnsi=\"Arial\" w:eastAsia=\"Malgun Gothic\"/></w:rPr>"
        f"<w:t xml:space=\"preserve\">{html.escape(str(text or ''))}</w:t>"
        "</w:r>"
    )


def paragraph(text: str = "", bold: bool = False, style: str | None = None, indent: int = 0, after: int | None = None, keep_next: bool = False) -> str:
    style_xml = f"<w:pStyle w:val=\"{style}\"/>" if style else ""
    indent_xml = f"<w:ind w:left=\"{indent}\"/>" if indent else ""
    spacing_xml = f"<w:spacing w:after=\"{after}\"/>" if after is not None else ""
    keep_xml = "<w:keepNext/>" if keep_next else ""
    ppr = f"<w:pPr>{style_xml}{indent_xml}{spacing_xml}{keep_xml}</w:pPr>"
    return f"<w:p>{ppr}{text_run(text, bold=bold)}</w:p>"


def blank_line(indent: int = 360) -> str:
    return paragraph("________________________________________", style="AnswerLine", indent=indent, after=160)


def header_xml(text: str) -> str:
    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:hdr xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
        f"{paragraph(text, after=60)}"
        "<w:p><w:pPr><w:pBdr><w:bottom w:val=\"single\" w:sz=\"6\" w:space=\"1\" w:color=\"D7DDE6\"/></w:pBdr></w:pPr></w:p>"
        "</w:hdr>"
    )


def render_document_xml(payload: dict) -> str:
    body = []

    for section in payload.get("sections", []):
      heading = section.get("heading", "")
      if heading:
          body.append(paragraph(heading, bold=True, style="Heading1"))

      for item in section.get("items", []):
          kind = item.get("kind", "text")
          indent = int(item.get("indent", 0)) * 18
          if kind == "blank":
              body.append(blank_line(indent=max(indent, 360)))
          else:
              style = "Question" if item.get("block_start") else "Choice" if indent else None
              body.append(paragraph(
                  item.get("text", ""),
                  bold=bool(item.get("bold", False)),
                  indent=indent,
                  style=style,
                  keep_next=bool(item.get("block_start") and not item.get("block_end")),
              ))

    sect_pr = (
        "<w:sectPr>"
        "<w:headerReference w:type=\"default\" r:id=\"rIdHeader1\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"/>"
        "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>"
        "<w:pgMar w:top=\"1134\" w:right=\"1134\" w:bottom=\"1134\" w:left=\"1134\" w:header=\"720\" w:footer=\"720\" w:gutter=\"0\"/>"
        "</w:sectPr>"
    )
    return (
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
        "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
        f"<w:body>{''.join(body)}{sect_pr}</w:body>"
        "</w:document>"
    )


def render(payload: dict, output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    header = payload.get("header") or payload.get("title") or "Study Guide Export"
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", CONTENT_TYPES)
        docx.writestr("_rels/.rels", ROOT_RELS)
        docx.writestr("word/_rels/document.xml.rels", DOCUMENT_RELS)
        docx.writestr("word/styles.xml", STYLES)
        docx.writestr("word/header1.xml", header_xml(header))
        docx.writestr("word/document.xml", render_document_xml(payload))


def main() -> int:
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: render_study_set_docx.py <input.json> <output.docx>"}))
        return 1

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    with open(input_path, "r", encoding="utf-8") as file:
        payload = json.load(file)

    render(payload, output_path)
    print(json.dumps({"output_path": output_path}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
