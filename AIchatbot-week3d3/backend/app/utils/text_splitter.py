# backend/app/utils/text_splitter.py
"""
Compatibility wrapper for text splitters used across different langchain versions.

Provides:
 - RecursiveCharacterTextSplitter (imported from possible locations)
 - MarkdownHeaderTextSplitter (imported or fallback)
 - Document class import from likely locations

Exports a single async-friendly function `process_text(content, file_name, file_type)`
that matches the signature your project expects.
"""

from typing import List, Dict, Union, Iterable, Any
import re

# ---------- Import Document (try common locations) ----------
Document = None
_TRY_DOC_IMPORTS = [
    "from langchain_core.documents import Document",
    "from langchain.schema import Document",
    "from langchain.docstore.document import Document",
]

for stmt in _TRY_DOC_IMPORTS:
    try:
        ns = {}
        exec(stmt, ns)
        Document = ns.get("Document")
        if Document:
            break
    except Exception:
        Document = None

# If still None, create a tiny Document dataclass-like fallback
if Document is None:
    class Document:
        def __init__(self, page_content: str, metadata: dict = None):
            self.page_content = page_content
            self.metadata = metadata or {}

# ---------- Import RecursiveCharacterTextSplitter ----------
RecursiveCharacterTextSplitter = None
_TRY_RECURSIVE_IMPORTS = [
    "from langchain.text_splitter import RecursiveCharacterTextSplitter",
    "from langchain.textsplitters import RecursiveCharacterTextSplitter",
    "from langchain.text_splitters import RecursiveCharacterTextSplitter",
]

for stmt in _TRY_RECURSIVE_IMPORTS:
    try:
        ns = {}
        exec(stmt, ns)
        RecursiveCharacterTextSplitter = ns.get("RecursiveCharacterTextSplitter")
        if RecursiveCharacterTextSplitter:
            break
    except Exception:
        RecursiveCharacterTextSplitter = None

# If not available, provide a very small fallback splitter that implements split_documents
if RecursiveCharacterTextSplitter is None:
    class RecursiveCharacterTextSplitter:
        def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
            self.chunk_size = chunk_size
            self.chunk_overlap = chunk_overlap

        def split_documents(self, docs: Iterable[Any]) -> List[Any]:
            out = []
            for d in docs:
                text = getattr(d, "page_content", str(d))
                meta = getattr(d, "metadata", {})
                # simple fixed-window splitting
                i = 0
                L = len(text)
                while i < L:
                    end = min(i + self.chunk_size, L)
                    piece = text[i:end].strip()
                    out.append(Document(page_content=piece, metadata=meta))
                    i = end - self.chunk_overlap if end - self.chunk_overlap > i else end
                    if i == end:  # avoid infinite loop
                        i = end
            return out

# ---------- Import MarkdownHeaderTextSplitter (try real implementations) ----------
MarkdownHeaderTextSplitter = None
_TRY_MD_IMPORTS = [
    "from langchain_experimental.text_splitter import MarkdownHeaderTextSplitter",
    "from langchain.text_splitter import MarkdownHeaderTextSplitter",
    "from langchain.textsplitters import MarkdownHeaderTextSplitter",
    "from langchain.text_splitters import MarkdownHeaderTextSplitter",
    "from langchain.experimental.text_splitter import MarkdownHeaderTextSplitter",
]

for stmt in _TRY_MD_IMPORTS:
    try:
        ns = {}
        exec(stmt, ns)
        MarkdownHeaderTextSplitter = ns.get("MarkdownHeaderTextSplitter")
        if MarkdownHeaderTextSplitter:
            break
    except Exception:
        MarkdownHeaderTextSplitter = None

# If not available, provide a fallback implementation that supports `headers_to_split_on`
if MarkdownHeaderTextSplitter is None:
    class MarkdownHeaderTextSplitter:
        """
        Lightweight fallback splitter that splits markdown by header lines.
        Supports headers_to_split_on parameter like:
          headers_to_split_on=[('#', 'Header 1'), ('##', 'Header 2')]
        """

        def __init__(self, headers_to_split_on: List = None, keep_headers: bool = True, min_section_length: int = 20):
            # headers_to_split_on: list of tuples (marker, label) or list of markers
            self.keep_headers = keep_headers
            self.min_section_length = min_section_length
            if headers_to_split_on:
                # Normalize headers into list of header markers like ["#", "##", "###"]
                if all(isinstance(h, (list, tuple)) and len(h) >= 1 for h in headers_to_split_on):
                    self.header_markers = [h[0] for h in headers_to_split_on]
                else:
                    self.header_markers = list(headers_to_split_on)
            else:
                # default: split on top 3 header levels
                self.header_markers = ["#", "##", "###"]
            # regex to find headers (match any of the markers at line start)
            marker_pattern = "|".join(re.escape(m) for m in sorted(self.header_markers, key=len, reverse=True))
            self._header_re = re.compile(rf"^({marker_pattern})\s+(.*)$", flags=re.MULTILINE)

        def split_text(self, text: str) -> List[str]:
            if not text:
                return []
            headers = [(m.start(), m.group(0)) for m in self._header_re.finditer(text)]
            if not headers:
                return [text.strip()]
            sections = []
            for idx, (pos, header_line) in enumerate(headers):
                start = pos
                end = headers[idx + 1][0] if idx + 1 < len(headers) else len(text)
                sec = text[start:end].strip()
                if not self.keep_headers:
                    parts = sec.split("\n", 1)
                    sec = parts[1].strip() if len(parts) > 1 else ""
                sections.append(sec)
            # merge tiny sections
            merged = []
            for s in sections:
                if not merged:
                    merged.append(s)
                    continue
                if len(s) < self.min_section_length:
                    merged[-1] = (merged[-1] + "\n\n" + s).strip()
                else:
                    merged.append(s)
            return merged

        def split_documents(self, docs: Iterable[Any]) -> List[Any]:
            out = []
            for d in docs:
                if isinstance(d, str):
                    text = d
                    meta = {}
                else:
                    text = getattr(d, "page_content", str(d))
                    meta = getattr(d, "metadata", {})
                parts = self.split_text(text)
                for p in parts:
                    out.append(Document(page_content=p, metadata=meta))
            return out

# ---------- Main exported function ----------
from app.config import settings
from app.logger import logger  # keep these imports as your original file expects

async def process_text(content: str, file_name: str, file_type: str) -> List[Dict[str, Union[str, dict]]]:
    """
    Process `content` and return a list of chunks:
      [{"content": "<text>", "metadata": {...}}, ...]
    Behavior:
      - For markdown (.md) input: use MarkdownHeaderTextSplitter to break into logical docs,
        then use RecursiveCharacterTextSplitter to chunk each doc.
      - For other types: wrap content in a single Document and chunk.
    """
    chunks: List[Dict[str, Union[str, dict]]] = []
    docs_for_splitting: List[Any] = []

    try:
        if file_type.lower() == ".md":
            # allow user-specified header markers as in original code
            headers = [("#", "Header 1"), ("##", "Header 2"), ("###", "Header 3")]
            try:
                md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers)
            except TypeError:
                # some versions expect different arg name or signature; try simple init
                md_splitter = MarkdownHeaderTextSplitter()
            md_docs = md_splitter.split_text(content)
            # md_docs may be list[str] or list[Document] depending on implementation
            for item in md_docs:
                if isinstance(item, str):
                    docs_for_splitting.append(Document(page_content=item, metadata={}))
                else:
                    # assume it's a Document-like object
                    docs_for_splitting.append(item)
        else:
            docs_for_splitting = [Document(page_content=content, metadata={})]

        # Ensure we have a splitter (init with config values)
        try:
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=settings.TEXT_CHUNK_SIZE,
                chunk_overlap=settings.TEXT_OVERLAP
            )
        except Exception:
            # fallback to default sizes if settings are missing or importer differs
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=getattr(settings, "TEXT_CHUNK_SIZE", 1000),
                chunk_overlap=getattr(settings, "TEXT_OVERLAP", 200)
            )

        split_docs = text_splitter.split_documents(docs_for_splitting)

        # Normalize split_docs into objects having page_content and metadata
        for doc in split_docs:
            content_text = getattr(doc, "page_content", str(doc))
            meta = getattr(doc, "metadata", {}) or {}
            meta = {"file_name": file_name, "file_type": file_type, **meta}
            chunks.append({"content": content_text, "metadata": meta})

    except Exception as e:
        # log and re-raise so caller can handle if necessary
        logger.exception("Error in process_text: %s", e)
        raise

    return chunks
