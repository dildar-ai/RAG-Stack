"""
PDF text extraction with reading-order block merging.

Raw PyMuPDF blocks are frequently tiny fragments ("Triage Logic", "Jane Doe",
"CEO"), which hurts semantic retrieval and produces one highlight box per
fragment. We therefore merge vertically adjacent blocks on each page into
~700-char chunks (union bbox keeps the highlight honest) and collapse running
headers/footers that repeat on 3+ pages down to their first occurrence, so a
word like "HIPAA" printed on every page no longer floods the results.
"""
import os
import re
from collections import Counter
from typing import Any, Dict, List

import fitz  # PyMuPDF

MERGE_CHARS = int(os.getenv("PDF_CHUNK_MERGE_CHARS", "700"))


class PdfParseError(Exception):
    """Raised when the PDF is corrupt, encrypted or otherwise unreadable."""


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _union_bbox(a: List[float] | None, b: List[float]) -> List[float]:
    if a is None:
        return list(b)
    return [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]


def parse_pdf(file_path: str) -> List[Dict[str, Any]]:
    """
    Parses a PDF and returns merged text chunks with page + bounding boxes.
    """
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise PdfParseError(f"The PDF could not be opened: {e}")

    pages: List[tuple] = []
    try:
        if doc.needs_pass:
            raise PdfParseError("The PDF is password-protected.")

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            blocks = []
            for b in page.get_text("blocks"):
                # b is a tuple: (x0, y0, x1, y1, "text", block_no, block_type)
                if b[6] != 0:  # block_type 0 means text
                    continue
                text = _normalize(b[4])
                if text:
                    blocks.append((text, [b[0], b[1], b[2], b[3]]))
            # Approximate reading order: top-to-bottom, then left-to-right
            blocks.sort(key=lambda t: (round(t[1][1]), round(t[1][0])))
            pages.append((page_num + 1, blocks))
    except PdfParseError:
        raise
    except Exception as e:
        raise PdfParseError(f"Text extraction failed: {e}")
    finally:
        # fitz keeps the file handle open otherwise (matters on Windows too)
        doc.close()

    # Detect running headers/footers: the same short line on 3+ distinct pages
    counter: Counter = Counter()
    for _, blocks in pages:
        for t in {text for text, _ in blocks if len(text) <= 100}:
            counter[t] += 1
    repeated = {t for t, c in counter.items() if c >= 3}

    chunks: List[Dict[str, Any]] = []
    kept_repeats: set = set()

    for page_num, blocks in pages:
        cur_texts: List[str] = []
        cur_len = 0
        cur_bbox: List[float] | None = None

        def flush() -> None:
            nonlocal cur_texts, cur_len, cur_bbox
            if cur_texts and cur_bbox:
                chunks.append({
                    "page": page_num,
                    "bbox": cur_bbox,
                    "text": "\n".join(cur_texts),
                })
            cur_texts, cur_len, cur_bbox = [], 0, None

        for text, bbox in blocks:
            if text in repeated:
                # Keep the first occurrence (cover/header info stays searchable)
                # as its own chunk, drop every later repeat.
                if text in kept_repeats:
                    continue
                kept_repeats.add(text)
                flush()
                chunks.append({"page": page_num, "bbox": bbox, "text": text})
                continue

            if cur_len and cur_len + len(text) + 1 > MERGE_CHARS:
                flush()
            cur_texts.append(text)
            cur_len += len(text) + 1
            cur_bbox = _union_bbox(cur_bbox, bbox)
            if cur_len >= MERGE_CHARS:
                flush()

        flush()

    return chunks
