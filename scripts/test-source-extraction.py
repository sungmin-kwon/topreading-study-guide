import importlib.util,tempfile,zipfile
from pathlib import Path
import pymupdf
spec=importlib.util.spec_from_file_location('extract',Path(__file__).with_name('extract_source_text.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 pdf=Path(d)/'blank.pdf';doc=pymupdf.open();doc.new_page();doc.new_page().insert_text((60,60),'Readable text');doc.save(pdf);doc.close()
 result=m.extract_pdf(str(pdf));assert len(result['pages'])==2;assert result['pages'][0]['text']=='';assert result['metadata']['empty_text_pages']==[1]
 epub=Path(d)/'book.epub'
 with zipfile.ZipFile(epub,'w') as z:
  z.writestr('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
  z.writestr('OPS/book.opf','<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="body" href="body.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="body"/></spine></package>')
  z.writestr('OPS/body.xhtml','<html><body><p>😀 Introduction</p><h1 id="first">First</h1><p>First section.</p><h1 id="second">Second</h1><p>Second section.</p></body></html>')
  z.writestr('OPS/nav.xhtml','<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><a href="body.xhtml#first">Chapter One</a><a href="body.xhtml#second">Chapter Two</a></nav></body></html>')
 result=m.extract_epub(str(epub));assert len(result['pages'])==1;outline=result['metadata']['outline'];assert len(outline)==2
 encoded=result['pages'][0]['text'].encode('utf-16-le')
 for mark in outline:
  text=encoded[mark['offset']*2:].decode('utf-16-le');assert text.startswith('First' if mark['title']=='Chapter One' else 'Second')
 print('PASS: blank PDF page preservation, EPUB navigation anchors and UTF-16 positions.')
