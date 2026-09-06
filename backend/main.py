import io
import zipfile
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import pypdf

app = FastAPI(
    title="iLovePDF Clone API",
    description="High-performance backend for PDF merging, splitting, and processing.",
    version="1.0.0"
)

# Configure CORS so frontend clients (local, web, or remote) can communicate seamlessly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify backend service availability."""
    return {"status": "ok", "service": "iLovePDF Clone Backend", "version": "1.0.0"}


@app.post("/api/merge")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    """
    Merge multiple PDF files sequentially into a single downloadable PDF.
    - Accepts: Multiple PDF files via multipart/form-data
    - Returns: Single merged PDF file stream with attachment disposition
    """
    if not files or len(files) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 PDF files are required to perform a merge."
        )

    writer = pypdf.PdfWriter()

    try:
        for file in files:
            content = await file.read()
            if not content.startswith(b"%PDF"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Uploaded file '{file.filename}' is not a valid PDF."
                )
            
            pdf_reader = pypdf.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                writer.add_page(page)

        output_stream = io.BytesIO()
        writer.write(output_stream)
        output_stream.seek(0)

        filename = "ilovepdf_merged.pdf"
        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to merge PDF files: {str(e)}"
        )


@app.post("/api/split")
async def split_pdf(
    file: UploadFile = File(...),
    page_range: Optional[str] = Form(None)
):
    """
    Split a PDF document into individual pages or extract a custom range.
    - Accepts: Single PDF file and optional page_range (e.g. '1-3, 5')
    - Returns: A ZIP archive containing the extracted/split single-page PDF files
    """
    content = await file.read()
    if not content.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File '{file.filename}' is not a valid PDF."
        )

    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        total_pages = len(reader.pages)

        if total_pages == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The provided PDF contains no pages."
            )

        # Parse requested pages or default to all pages
        target_indices = []
        if page_range and page_range.strip():
            parts = page_range.split(",")
            for part in parts:
                part = part.strip()
                if "-" in part:
                    start, end = part.split("-")
                    start_idx = max(0, int(start.strip()) - 1)
                    end_idx = min(total_pages, int(end.strip()))
                    target_indices.extend(range(start_idx, end_idx))
                else:
                    idx = int(part) - 1
                    if 0 <= idx < total_pages:
                        target_indices.append(idx)
        else:
            target_indices = list(range(total_pages))

        # Remove duplicates while preserving page order
        target_indices = sorted(list(set(target_indices)))

        # Create in-memory ZIP archive
        zip_buffer = io.BytesIO()
        base_name = file.filename.rsplit(".", 1)[0] if file.filename else "document"

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for page_idx in target_indices:
                single_writer = pypdf.PdfWriter()
                single_writer.add_page(reader.pages[page_idx])

                page_stream = io.BytesIO()
                single_writer.write(page_stream)
                page_stream.seek(0)

                entry_name = f"{base_name}_page_{page_idx + 1}.pdf"
                zip_file.writestr(entry_name, page_stream.getvalue())

        zip_buffer.seek(0)
        zip_filename = f"{base_name}_split_pages.zip"

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{zip_filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to split PDF: {str(e)}"
        )


@app.post("/api/compress")
async def compress_pdf(file: UploadFile = File(...)):
    """
    Compress a PDF document by compressing content streams and removing metadata duplication.
    """
    content = await file.read()
    if not content.startswith(b"%PDF"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid PDF."
        )

    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        writer = pypdf.PdfWriter()

        for page in reader.pages:
            page.compress_content_streams()
            writer.add_page(page)

        output_stream = io.BytesIO()
        writer.write(output_stream)
        output_stream.seek(0)

        compressed_filename = f"compressed_{file.filename or 'document.pdf'}"
        return StreamingResponse(
            output_stream,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{compressed_filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Compression failed: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    # Run the server on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
