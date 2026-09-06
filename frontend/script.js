/**
 * iLovePDF Clone - Frontend Integration Script
 * Handles PDF file selection, FormData multipart uploads to FastAPI backend,
 * and automatic download dispatching.
 */

// Configuration: Backend API URL (FastAPI default port 8000)
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : '';

document.addEventListener('DOMContentLoaded', () => {
  initMergeTool();
  initSplitTool();
});

/**
 * Phase 4: Initialize Merge PDF Tool Card Event Listener & File Picker
 */
function initMergeTool() {
  const mergeCard = document.getElementById('card-merge');
  if (!mergeCard) return;

  // Create a hidden file input element for selecting multiple PDFs
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'merge-file-input';
  fileInput.accept = '.pdf,application/pdf';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  // Click on "Merge PDF" card triggers file picker
  mergeCard.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });

  // Handle selected files
  fileInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (files.length < 2) {
      alert('Please select at least 2 PDF files to merge.');
      fileInput.value = '';
      return;
    }

    await handleMergeFiles(files);
    fileInput.value = ''; // Reset for subsequent selections
  });
}

/**
 * Sends selected files to FastAPI backend endpoint `/api/merge` using FormData
 * and triggers automatic browser download of the returned merged PDF.
 * @param {FileList|File[]} files
 */
async function handleMergeFiles(files) {
  showStatusOverlay(`Merging ${files.length} PDF files... Please wait.`);

  try {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    // Call Python FastAPI /api/merge endpoint
    const response = await fetch(`${API_BASE_URL}/api/merge`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    // Extract filename from Content-Disposition header if available
    const disposition = response.headers.get('Content-Disposition');
    let filename = 'ilovepdf_merged.pdf';
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    // Receive the binary PDF blob
    const blob = await response.blob();

    // Trigger automatic browser download
    triggerFileDownload(blob, filename);

    showStatusOverlay('Merge completed! Download started.', 2500);
  } catch (error) {
    console.error('Merge PDF Error:', error);
    showStatusOverlay(`Failed to merge: ${error.message}`, 4000, true);
  }
}

/**
 * Initialize Split PDF Tool Card & File Picker
 */
function initSplitTool() {
  const splitCard = document.getElementById('card-split');
  if (!splitCard) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'split-file-input';
  fileInput.accept = '.pdf,application/pdf';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  splitCard.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await handleSplitFile(file);
    fileInput.value = '';
  });
}

/**
 * Sends a PDF file to `/api/split` and downloads the generated ZIP archive.
 * @param {File} file
 */
async function handleSplitFile(file) {
  showStatusOverlay(`Splitting "${file.name}" into individual pages...`);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/split`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errorText}`);
    }

    const blob = await response.blob();
    const filename = `${file.name.replace(/\.pdf$/i, '')}_split_pages.zip`;

    triggerFileDownload(blob, filename);
    showStatusOverlay('Split completed! Downloading pages ZIP.', 2500);
  } catch (error) {
    console.error('Split PDF Error:', error);
    showStatusOverlay(`Failed to split: ${error.message}`, 4000, true);
  }
}

/**
 * Helper: Automatically triggers a file download in the browser.
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerFileDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = objectUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup memory
  setTimeout(() => {
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(objectUrl);
  }, 150);
}

/**
 * Helper: Minimalist toast overlay for upload and processing state feedback.
 */
let statusTimeout = null;
function showStatusOverlay(message, autoDismissMs = 0, isError = false) {
  let overlay = document.getElementById('ilovepdf-toast');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ilovepdf-toast';
    overlay.style.position = 'fixed';
    overlay.style.bottom = '24px';
    overlay.style.right = '24px';
    overlay.style.padding = '14px 22px';
    overlay.style.borderRadius = '10px';
    overlay.style.fontSize = '14px';
    overlay.style.fontWeight = '600';
    overlay.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
    overlay.style.zIndex = '9999';
    overlay.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    overlay.style.transform = 'translateY(100px)';
    overlay.style.opacity = '0';
    document.body.appendChild(overlay);
  }

  overlay.textContent = message;
  overlay.style.backgroundColor = isError ? '#feebe9' : '#191b1f';
  overlay.style.color = isError ? '#e5322d' : '#ffffff';
  overlay.style.border = isError ? '1px solid #e5322d' : 'none';
  overlay.style.transform = 'translateY(0)';
  overlay.style.opacity = '1';

  if (statusTimeout) clearTimeout(statusTimeout);
  if (autoDismissMs > 0) {
    statusTimeout = setTimeout(() => {
      overlay.style.transform = 'translateY(100px)';
      overlay.style.opacity = '0';
    }, autoDismissMs);
  }
}
