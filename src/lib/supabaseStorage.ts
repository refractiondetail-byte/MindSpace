import { supabase } from './supabase';

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;

const BUCKET = 'mindspace-files';

export interface StoredFileResult {
  path: string | null;
  publicUrl: string | null;
  base64: string | null;
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (typeof document === 'undefined') return file;

  let image: HTMLImageElement;
  try {
    image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = URL.createObjectURL(file);
    });
  } catch {
    return file;
  }

  const { width, height } = image;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  if (scale === 1 && file.size < 1_500_000) {
    URL.revokeObjectURL(image.src);
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    URL.revokeObjectURL(image.src);
    return file;
  }
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  URL.revokeObjectURL(image.src);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY);
  });
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

export async function uploadFile(file: File, userId?: string | null): Promise<StoredFileResult> {
  const prepared = await compressImageForUpload(file);
  if (!supabase) {
    return { path: null, publicUrl: null, base64: await fileToBase64(prepared) };
  }

  const safeName = prepared.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const prefix = userId ? `${userId}/` : '';
  const path = `${prefix}${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.warn('Supabase storage upload failed, falling back to base64:', error.message);
    return { path: null, publicUrl: null, base64: await fileToBase64(file) };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl, base64: null };
}