'use client'

import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { AlertTriangle } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  pageNumber: number;
  bbox: number[]; // [x0, y0, x1, y1] in PDF points
  filename?: string;
  onClose: () => void;
}

export default function PdfViewer({ url, pageNumber, bbox, filename, onClose }: PdfViewerProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [scale, setScale] = useState(1.2);

  // pdf.js maps 1 PDF point to 1 CSS pixel at scale 1, so PyMuPDF's point-based
  // bounding box only needs to be multiplied by the on-screen render scale.
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = bbox ?? [];
  const hasBbox = Number.isFinite(x0) && Number.isFinite(y1) && x1 > x0 && y1 > y0;
  const highlightStyle = {
    position: 'absolute' as const,
    left: `${x0 * scale}px`,
    top: `${y0 * scale}px`,
    width: `${(x1 - x0) * scale}px`,
    height: `${(y1 - y0) * scale}px`,
    backgroundColor: 'rgba(255, 226, 143, 0.5)', // yellow transparent
    border: '2px solid rgba(255, 193, 7, 0.8)',
    borderRadius: '4px',
    pointerEvents: 'none' as const,
    zIndex: 10
  };

  const zoom = (delta: number) => setScale(prev => Math.min(2.5, Math.max(0.6, +(prev + delta).toFixed(2))));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Source citation preview"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
    >
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col w-full max-w-4xl h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800 truncate">
              {filename || 'Source document'} — Page {pageNumber}
            </h3>
            <p className="text-[11px] text-gray-500 font-medium">Highlighted region is the exact cited text block.</p>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => zoom(-0.2)}
              className="w-8 h-8 text-gray-600 hover:bg-gray-100 rounded-full transition font-bold"
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="text-[11px] font-bold text-gray-500 w-10 text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => zoom(0.2)}
              className="w-8 h-8 text-gray-600 hover:bg-gray-100 rounded-full transition font-bold"
              aria-label="Zoom in"
            >
              +
            </button>
            <button 
              onClick={onClose}
              className="text-gray-500 hover:text-gray-800 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-full transition text-sm font-semibold ml-1"
            >
              Close
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 overflow-auto bg-gray-100 flex justify-center p-8 relative">
          {loadFailed ? (
            <div className="flex flex-col items-center justify-center text-center space-y-3 px-6">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="text-sm font-semibold text-gray-700">This source PDF could not be loaded.</p>
              <p className="text-xs text-gray-500 max-w-sm">
                The signed link may have expired or the document may have been deleted. Try opening the citation again.
              </p>
            </div>
          ) : (
            <Document 
              file={url} 
              onLoadError={() => setLoadFailed(true)}
              className="shadow-lg relative"
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale} 
                renderTextLayer={false} 
                renderAnnotationLayer={false}
                className="relative"
              >
                 {/* Highlight Overlay */}
                 {hasBbox && (
                   <div style={highlightStyle} />
                 )}
              </Page>
            </Document>
          )}
        </div>
        
      </div>
    </div>
  );
}
