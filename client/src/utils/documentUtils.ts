const VIEWABLE_EXTENSIONS = new Set([
  // Documents (PDFs are native, Office files use Microsoft Viewer via public token)
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff',
  // Media
  'mp4', 'webm'
]);

export const isDocumentViewable = (filename: string): boolean => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? VIEWABLE_EXTENSIONS.has(ext) : false;
};
