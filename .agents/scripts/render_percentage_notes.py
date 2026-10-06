from hashlib import sha256
from pathlib import Path

import fitz


PDF_PATH = Path("attached_assets/Percentage_N.._261004084817_1791084814275.pdf")
OUTPUT_DIR = Path(".agents/outputs/percentage-notes")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

pdf_bytes = PDF_PATH.read_bytes()
document = fitz.open(stream=pdf_bytes, filetype="pdf")

text_path = OUTPUT_DIR / "page-text.txt"
with text_path.open("w", encoding="utf-8") as text_file:
    text_file.write(f"Pages: {document.page_count}\n")
    text_file.write(f"SHA-256: {sha256(pdf_bytes).hexdigest()}\n")
    for page_index, page in enumerate(document, start=1):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        image_path = OUTPUT_DIR / f"page-{page_index:02}.png"
        pixmap.save(image_path)
        text_file.write(f"\n\n===== PAGE {page_index} =====\n")
        text_file.write(page.get_text("text", sort=True))

print(f"Rendered {document.page_count} pages to {OUTPUT_DIR}")
print(f"Extracted positioned page text to {text_path}")