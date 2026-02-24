const VIEWABLE_EXTENSIONS = new Set([
  // PDF (native iframe)
  'pdf',
  // Images (native browser rendering)
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif',
  // Text-based (rendered as <pre>)
  'txt', 'csv', 'json', 'xml', 'md', 'log', 'yml', 'yaml',
  'ini', 'cfg', 'html', 'css', 'js', 'ts', 'jsx', 'tsx',
  'py', 'sql', 'sh', 'bat', 'ps1', 'env',
  // Video (native HTML5)
  'mp4', 'webm', 'ogg', 'mov',
  // Documents – DOCX rendered client-side via docx-preview
  'docx',
  // Office formats – opened via Google Docs Viewer online
  'doc', 'xlsx', 'xls', 'pptx', 'ppt',
]);

export const isDocumentViewable = (filename: string): boolean => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? VIEWABLE_EXTENSIONS.has(ext) : false;
};
