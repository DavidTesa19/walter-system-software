const VIEWABLE_EXTENSIONS = new Set([
  // Documents
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'json', 'xml',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff',
  // Media
  'mp4', 'webm', 'mp3', 'wav'
]);

export const isDocumentViewable = (filename: string): boolean => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? VIEWABLE_EXTENSIONS.has(ext) : false;
};
