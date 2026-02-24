import React, { useEffect, useState, useRef, useCallback } from 'react';
import { renderAsync } from 'docx-preview';
import { apiGetBlob, apiGet, apiDownload, API_BASE } from '../utils/api';
import './DocumentViewerModal.css';

interface DocumentViewerModalProps {
  documentId: number;
  filename: string;
  onClose: () => void;
}

type ViewerType = 'pdf' | 'image' | 'docx' | 'text' | 'video' | 'office' | 'unsupported';

const getExt = (filename: string): string =>
  filename.split('.').pop()?.toLowerCase() || '';

const getViewerType = (filename: string): ViewerType => {
  const ext = getExt(filename);
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif'].includes(ext)) return 'image';
  if (ext === 'docx') return 'docx';
  if ([
    'txt', 'csv', 'json', 'xml', 'md', 'log', 'yml', 'yaml',
    'ini', 'cfg', 'html', 'css', 'js', 'ts', 'jsx', 'tsx',
    'py', 'sql', 'sh', 'bat', 'ps1', 'env',
  ].includes(ext)) return 'text';
  if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
  if (['xlsx', 'xls', 'pptx', 'ppt', 'doc'].includes(ext)) return 'office';
  return 'unsupported';
};

const fileIcon = (vt: ViewerType, ext: string): string => {
  if (vt === 'pdf') return '📄';
  if (vt === 'image') return '🖼️';
  if (vt === 'docx') return '📝';
  if (vt === 'text') return '📋';
  if (vt === 'video') return '🎬';
  if (vt === 'office') {
    if (['xlsx', 'xls'].includes(ext)) return '📊';
    if (['pptx', 'ppt'].includes(ext)) return '📊';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingOnline, setOpeningOnline] = useState(false);
  const docxRef = useRef<HTMLDivElement>(null);

  const viewerType = getViewerType(filename);
  const ext = getExt(filename);

  /* ---- fetch & render ---- */
  const fetchAndRender = useCallback(async () => {
    // Office / unsupported — nothing to fetch for in-modal rendering
    if (viewerType === 'office' || viewerType === 'unsupported') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const blob = await apiGetBlob(`/documents/${documentId}/download`);

      if (viewerType === 'docx') {
        if (docxRef.current) {
          docxRef.current.innerHTML = '';
          await renderAsync(blob, docxRef.current, undefined, {
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
      } else if (viewerType === 'text') {
        setTextContent(await blob.text());
      } else {
        setBlobUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      console.error('Document viewer – load failed:', err);
      setError('Nepodařilo se načíst dokument.');
    } finally {
      setLoading(false);
    }
  }, [documentId, viewerType]);

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
    if (blobUrl) { window.open(blobUrl, '_blank'); return; }
    try {
      const blob = await apiGetBlob(`/documents/${documentId}/download`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setError('Nepodařilo se otevřít dokument.'); }
  };

  const handleOpenOnline = async () => {
    try {
      setOpeningOnline(true);
      const { token } = await apiGet<{ token: string }>(`/documents/${documentId}/public-token`);
      const publicUrl = `${API_BASE}/documents/public/${token}`;
      const viewer = `https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}&embedded=false`;
      window.open(viewer, '_blank');
    } catch {
      setError('Online zobrazení není dostupné. Zkuste soubor stáhnout.');
    } finally {
      setOpeningOnline(false);
    }
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

      case 'docx':
        return null; // rendered via ref

      case 'office':
        return (
          <div className="dv-fallback-wrap">
            <div className="dv-fallback-card">
              <span className="dv-fallback-icon">{fileIcon(viewerType, ext)}</span>
              <h3 className="dv-fallback-name">{filename}</h3>
              <p className="dv-fallback-hint">Tento typ souboru nelze zobrazit přímo v aplikaci.</p>
              <div className="dv-fallback-actions">
                <button className="dv-btn dv-btn--primary" onClick={handleOpenOnline} disabled={openingOnline}>
                  {openingOnline ? 'Otevírám…' : 'Otevřít online (Google Docs)'}
                </button>
                <button className="dv-btn dv-btn--secondary" onClick={handleDownload}>
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
            {viewerType !== 'office' && viewerType !== 'unsupported' && (
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
          {viewerType === 'docx' ? (
            <>
              {loading && (
                <div className="dv-loading"><div className="dv-spinner" /><span>Načítám dokument…</span></div>
              )}
              {error && <div className="dv-error">{error}</div>}
              <div
                ref={docxRef}
                className="dv-docx-container"
                style={{ display: loading || error ? 'none' : 'block' }}
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
