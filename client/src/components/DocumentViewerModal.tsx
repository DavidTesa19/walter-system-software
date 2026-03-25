import React, { useEffect, useState, useCallback } from 'react';
import { apiGetBlob, apiGet, apiDownload, API_BASE } from '../utils/api';
import ThemeToggleButton from './ThemeToggleButton';
import './DocumentViewerModal.css';

interface DocumentViewerModalProps {
  documentId: number;
  filename: string;
  onClose: () => void;
}

type ViewerType = 'pdf' | 'image' | 'text' | 'video' | 'office' | 'unsupported';

const getExt = (filename: string): string =>
  filename.split('.').pop()?.toLowerCase() || '';

const getViewerType = (filename: string): ViewerType => {
  const ext = getExt(filename);
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif'].includes(ext)) return 'image';
  if ([
    'txt', 'csv', 'json', 'xml', 'md', 'log', 'yml', 'yaml',
    'ini', 'cfg', 'html', 'css', 'js', 'ts', 'jsx', 'tsx',
    'py', 'sql', 'sh', 'bat', 'ps1', 'env',
  ].includes(ext)) return 'text';
  if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
  // All Office formats — rendered via Google Docs Viewer / Microsoft Office Online
  if (['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext)) return 'office';
  return 'unsupported';
};

const fileIcon = (vt: ViewerType, ext: string): string => {
  if (vt === 'pdf') return '📄';
  if (vt === 'image') return '🖼️';
  if (vt === 'text') return '📋';
  if (vt === 'video') return '🎬';
  if (vt === 'office') {
    if (['xlsx', 'xls'].includes(ext)) return '📊';
    if (['pptx', 'ppt'].includes(ext)) return '📊';
    if (['docx', 'doc'].includes(ext)) return '📝';
    return '📝';
  }
  return '📁';
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ documentId, filename, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [officeViewerUrl, setOfficeViewerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewerType = getViewerType(filename);
  const ext = getExt(filename);

  /* ---- fetch & render ---- */
  const fetchAndRender = useCallback(async () => {
    try {
      setLoading(true);

      if (viewerType === 'office') {
        // Get a temporary public token, then build a Google Docs Viewer / MS Office Online URL
        const { token } = await apiGet<{ token: string }>(`/documents/${documentId}/public-token`);
        const publicUrl = `${API_BASE}/documents/public/${token}`;

        // Try Microsoft Office Online first (best for docx/xlsx/pptx),
        // fall back to Google Docs Viewer for .doc/.xls/.ppt
        const msFormats = ['docx', 'xlsx', 'pptx'];
        if (msFormats.includes(ext)) {
          setOfficeViewerUrl(
            `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`
          );
        } else {
          setOfficeViewerUrl(
            `https://docs.google.com/gview?url=${encodeURIComponent(publicUrl)}&embedded=true`
          );
        }
      } else if (viewerType === 'unsupported') {
        // nothing to fetch
      } else {
        const blob = await apiGetBlob(`/documents/${documentId}/download`);

        if (viewerType === 'text') {
          setTextContent(await blob.text());
        } else {
          setBlobUrl(URL.createObjectURL(blob));
        }
      }
    } catch (err) {
      console.error('Document viewer – load failed:', err);
      setError('Nepodařilo se načíst dokument.');
    } finally {
      setLoading(false);
    }
  }, [documentId, viewerType, ext]);

  useEffect(() => {
    fetchAndRender();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [fetchAndRender]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- keyboard ---- */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  /* ---- actions ---- */
  const handleDownload = () => apiDownload(`/documents/${documentId}/download`, filename);

  const handleOpenNewTab = async () => {
    if (officeViewerUrl) {
      // Open the embedded viewer URL but non-embedded
      const newTabUrl = officeViewerUrl
        .replace('embed.aspx', 'view.aspx')
        .replace('&embedded=true', '');
      window.open(newTabUrl, '_blank');
      return;
    }
    if (blobUrl) { window.open(blobUrl, '_blank'); return; }
    try {
      const blob = await apiGetBlob(`/documents/${documentId}/download`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setError('Nepodařilo se otevřít dokument.'); }
  };

  /* ---- content renderer ---- */
  const renderContent = () => {
    if (loading) {
      return (
        <div className="dv-loading">
          <div className="dv-spinner" />
          <span>Načítám dokument…</span>
        </div>
      );
    }
    if (error) return <div className="dv-error">{error}</div>;

    switch (viewerType) {
      case 'pdf':
        return blobUrl ? <iframe src={blobUrl} title={filename} className="dv-pdf-frame" /> : null;

      case 'image':
        return blobUrl ? (
          <div className="dv-image-wrap">
            <img src={blobUrl} alt={filename} className="dv-image" />
          </div>
        ) : null;

      case 'video':
        return blobUrl ? (
          <div className="dv-video-wrap">
            <video src={blobUrl} controls className="dv-video" />
          </div>
        ) : null;

      case 'text':
        return textContent !== null ? (
          <div className="dv-text-wrap">
            <pre className="dv-text">{textContent}</pre>
          </div>
        ) : null;

      case 'office':
        return officeViewerUrl ? (
          <iframe
            src={officeViewerUrl}
            title={filename}
            className="dv-office-frame"
            allowFullScreen
          />
        ) : (
          <div className="dv-fallback-wrap">
            <div className="dv-fallback-card">
              <span className="dv-fallback-icon">{fileIcon(viewerType, ext)}</span>
              <h3 className="dv-fallback-name">{filename}</h3>
              <p className="dv-fallback-hint">Online zobrazení není dostupné.</p>
              <div className="dv-fallback-actions">
                <button className="dv-btn dv-btn--primary" onClick={handleDownload}>
                  Stáhnout soubor
                </button>
              </div>
            </div>
          </div>
        );

      case 'unsupported':
        return (
          <div className="dv-fallback-wrap">
            <div className="dv-fallback-card">
              <span className="dv-fallback-icon">📁</span>
              <h3 className="dv-fallback-name">{filename}</h3>
              <p className="dv-fallback-hint">Tento typ souboru nelze zobrazit.</p>
              <div className="dv-fallback-actions">
                <button className="dv-btn dv-btn--primary" onClick={handleDownload}>
                  Stáhnout soubor
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  /* ---- render ---- */
  return (
    <div className="dv-overlay" onClick={onClose}>
      <div className="dv-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="dv-header">
          <div className="dv-header-left">
            <span className="dv-header-icon">{fileIcon(viewerType, ext)}</span>
            <span className="dv-header-filename">{filename}</span>
          </div>

          <div className="dv-header-right">
            <ThemeToggleButton variant="icon" />
            {viewerType !== 'unsupported' && (
              <button className="dv-hdr-btn" onClick={handleOpenNewTab} title="Otevřít v novém panelu">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M10 2h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
            <button className="dv-hdr-btn" onClick={handleDownload} title="Stáhnout">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8m0 0l-3-3m3 3l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button className="dv-hdr-btn dv-hdr-btn--close" onClick={onClose} title="Zavřít">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="dv-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal;
