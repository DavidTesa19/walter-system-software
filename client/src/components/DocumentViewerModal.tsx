import React, { useEffect, useState, useRef, useCallback } from 'react';
import { renderAsync } from 'docx-preview';
import { apiGetBlob } from '../utils/api';
import './DocumentViewerModal.css';

interface DocumentViewerModalProps {
  documentId: number;
  filename: string;
  onClose: () => void;
}

type FileType = 'pdf' | 'image' | 'docx' | 'text' | 'video' | 'unsupported';

const getFileType = (filename: string): FileType => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['docx'].includes(ext)) return 'docx';
  if (['txt', 'csv', 'json', 'xml', 'md', 'log'].includes(ext)) return 'text';
  if (['mp4', 'webm'].includes(ext)) return 'video';
  return 'unsupported';
};

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ documentId, filename, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);
  const fileType = getFileType(filename);

  const fetchAndRender = useCallback(async () => {
    try {
      setLoading(true);
      const blob = await apiGetBlob(`/documents/${documentId}/download`);

      if (fileType === 'docx') {
        // Render .docx entirely client-side using docx-preview
        if (docxContainerRef.current) {
          docxContainerRef.current.innerHTML = '';
          await renderAsync(blob, docxContainerRef.current, undefined, {
            className: 'docx-preview-wrapper',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: false,
            trimXmlDeclaration: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
          });
        }
      } else if (fileType === 'text') {
        const text = await blob.text();
        setTextContent(text);
      } else {
        // PDF, images, video — use blob URL
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      }
    } catch (err) {
      console.error('Failed to load document:', err);
      setError('Nepodařilo se načíst dokument pro zobrazení.');
    } finally {
      setLoading(false);
    }
  }, [documentId, fileType]);

  useEffect(() => {
    fetchAndRender();
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fetchAndRender]);

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const renderContent = () => {
    if (loading) return <div className="doc-viewer-loading">Načítám dokument...</div>;
    if (error) return <div className="doc-viewer-error">{error}</div>;

    switch (fileType) {
      case 'docx':
        return (
          <div
            ref={docxContainerRef}
            className="docx-container"
            style={{ width: '100%', height: '100%', overflow: 'auto', backgroundColor: '#f5f5f5' }}
          />
        );
      case 'pdf':
        return blobUrl ? (
          <iframe
            src={blobUrl}
            title={filename}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : null;
      case 'image':
        return blobUrl ? (
          <img
            src={blobUrl}
            alt={filename}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        ) : null;
      case 'video':
        return blobUrl ? (
          <video
            src={blobUrl}
            controls
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
        ) : null;
      case 'text':
        return textContent !== null ? (
          <pre className="doc-viewer-text">{textContent}</pre>
        ) : null;
      default:
        return <div className="doc-viewer-error">Tento typ souboru nelze zobrazit.</div>;
    }
  };

  return (
    <div className="doc-viewer-overlay" onClick={onClose}>
      <div className="doc-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="doc-viewer-header">
          <h3 className="doc-viewer-title">{filename}</h3>
          <button className="doc-viewer-close" onClick={onClose}>×</button>
        </div>
        <div className="doc-viewer-content">
          {/* For docx, render the container even while loading so the ref is available */}
          {fileType === 'docx' ? (
            <>
              {loading && <div className="doc-viewer-loading">Načítám dokument...</div>}
              {error && <div className="doc-viewer-error">{error}</div>}
              <div
                ref={docxContainerRef}
                className="docx-container"
                style={{
                  width: '100%',
                  height: '100%',
                  overflow: 'auto',
                  backgroundColor: '#f5f5f5',
                  display: loading || error ? 'none' : 'block',
                }}
              />
            </>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal;
