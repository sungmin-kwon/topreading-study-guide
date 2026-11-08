"""Render one original PDF page; no extracted-text edits or OCR are performed."""
import base64,json,sys
import pymupdf
with pymupdf.open(sys.argv[1]) as doc:
    number=int(sys.argv[2])
    if not 1<=number<=len(doc):
        raise ValueError('Page outside document')
    page=doc[number-1]
    scale=min(1.5,1800/max(page.rect.width,page.rect.height))
    pix=page.get_pixmap(matrix=pymupdf.Matrix(scale,scale),alpha=False)
    print(json.dumps({'image':base64.b64encode(pix.tobytes('png')).decode('ascii'),'label':page.get_label(),'pageCount':len(doc),'bookmarks':[{'page':entry[2],'offset':0,'title':entry[1]} for entry in doc.get_toc() if 1<=entry[2]<=len(doc)][:1000]}))
