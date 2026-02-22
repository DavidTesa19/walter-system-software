import React, { useEffect, useState } from 'react';
import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import { apiGetBlob } from '../utils/api';
import './DocumentViewerModal.css';

interface DocumentViewerModalProps {
  documentId: number;
  filename: string;
  onClose: () => void;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ documentId, filename, onClose }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    const fetchDocument = async () => {
      try {
        setLoading(true);
        const blob = await apiGetBlob(`/documents/${documentId}/download`);
        objectUrl = URL.createObjectURL(blob);
        setFileUrl(objectUrl);
      } catch (err) {
        console.error("Failed to load document:", err);
        setError("Nepodařilo se načíst dokument pro zobrazení.");
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [documentId]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="doc-viewer-overlay" onClick={onClose}>
      <div className="doc-viewer-modal" onClick={e => e.stopPropagation()}>
        <div className="doc-viewer-header">
          <h3 className="doc-viewer-title">{filename}</h3>
          <button className="doc-viewer-close" onClick={onClose}>×</button>
        </div>
        <div className="doc-viewer-content">
          {loading && <div className="doc-viewer-loading">Načítám dokument...</div>}
          {error && <div className="doc-viewer-error">{error}</div>}
          {fileUrl && !loading && !error && (
            <DocViewer 
              documents={[{ uri: fileUrl, fileName: filename }]} 
              pluginRenderers={DocViewerRenderers}
              style={{ height: '100%', width: '100%' }}
              config={{
                header: {
                  disableHeader: true,
                  disableFileName: true,
                  retainURLParams: false
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal;
