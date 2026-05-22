import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limits

export interface ParsedPDFPage {
  image: HTMLImageElement;
  width: number;
  height: number;
  pageNumber: number;
}

/**
 * Validates a file for type, extension, size, and integrity.
 * Returns null if valid, otherwise returns a descriptive error message.
 */
export const validateFile = async (file: File): Promise<string | null> => {
  if (!file) return 'No file provided.';

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size is 50MB.`;
  }

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  // Validate PDF
  if (name.endsWith('.pdf') || type === 'application/pdf') {
    return null; // Valid PDF
  }

  // Validate Image
  const validImageExts = ['.png', '.jpg', '.jpeg', '.webp'];
  const validImageMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

  if (validImageMimeTypes.includes(type) || validImageExts.some(ext => name.endsWith(ext))) {
    return null; // Valid Image
  }

  return 'Unsupported file format. Please upload a PDF or an Image (.png, .jpg, .jpeg, .webp).';
};

/**
 * Helper to wrap image preloading in a clean Promise.
 */
export const preloadImageElement = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image. File might be corrupted.'));
    img.src = dataUrl;
  });
};

/**
 * Reads a standard image file and preloads it as an HTMLImageElement.
 */
export const parseImageFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) {
          throw new Error('FileReader returned empty result.');
        }
        const img = await preloadImageElement(dataUrl);
        resolve(img);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
};

/**
 * PDF import pipeline utilizing pdfjs-dist.
 * Converts pages into high-resolution canvas dataURLs and preloads them as HTMLImageElements.
 */
export const parsePDFFile = async (
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<ParsedPDFPage[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pagesData: ParsedPDFPage[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      
      // Render page at 300 DPI high-resolution (300 / 72 = 4.1667)
      const viewport = page.getViewport({ scale: 4.1667 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not create 2D canvas context.');
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render PDF page to canvas context
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      
      // Convert to image element for React-Konva compatibility
      const dataUrl = canvas.toDataURL('image/png');
      const img = await preloadImageElement(dataUrl);
      
      pagesData.push({
        image: img,
        width: viewport.width,
        height: viewport.height,
        pageNumber: i,
      });

      if (onProgress) {
        onProgress(i, pdf.numPages);
      }
    }

    return pagesData;
  } catch (err) {
    console.error('PDF parsing failure:', err);
    throw new Error('Corrupted or invalid PDF file. Parsing failed.');
  }
};
