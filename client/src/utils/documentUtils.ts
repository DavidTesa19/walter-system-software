const VIEWABLE_EXTENSIONS = new Set([
  // Documents (PDF = native iframe, DOCX = docx-preview client-side)
  'pdf', 'docx',
  // Text-based
  'txt', 'csv', 'json', 'xml', 'md', 'log',
  // Images (native browser rendering)
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
  // Video (native browser rendering)
  'mp4', 'webm'
]);

export const isDocumentViewable = (filename: string): boolean => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? VIEWABLE_EXTENSIONS.has(ext) : false;
};
