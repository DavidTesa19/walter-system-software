// Getting a file ready to attach to a Jarvis message.

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const ATTACHMENT_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.tsv,.md,.json,.xml,.html,.htm,.eml';

// Claude looks at images up to about this size anyway; a phone photo is often
// 4000 px and several MB, which is slower to upload and costs more to read.
const MAX_IMAGE_SIDE = 2000;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

/**
 * A large photo, scaled down to MAX_IMAGE_SIDE as a JPEG. Small images, GIFs
 * and anything the browser cannot decode are returned unchanged.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_IMAGE_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  // JPEG has no transparency: a transparent screenshot would turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

// A pasted screenshot arrives as "image.png"; give it a name worth showing.
export function namePastedImage(file: File): File {
  if (file.name && file.name !== 'image.png') return file;
  const now = new Date();
  const stamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const extension = file.type.split('/')[1] || 'png';
  return new File([file], `snimek-${stamp}.${extension}`, { type: file.type });
}

export const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
