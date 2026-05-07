export const API_FILES_PREFIX = '/api/files/';

export const PUBLIC_FILE_PREFIXES = ['avatars/', 'projects/', 'files/'];

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function toStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;

  let path = value.trim();
  if (!path) return null;

  if (path.startsWith(API_FILES_PREFIX)) {
    path = path.slice(API_FILES_PREFIX.length);
  }

  path = decodePath(path).replace(/\\/g, '/').replace(/^\/+/, '');

  const parts = path.split('/');
  if (!path || parts.some(part => !part || part === '.' || part === '..')) return null;

  return path;
}

export function requireStoragePath(value: string): string {
  const path = toStoragePath(value);
  if (!path) throw new Error('Invalid storage path');
  return path;
}

export function isPublicFilePath(value: string): boolean {
  const path = toStoragePath(value);
  return !!path && PUBLIC_FILE_PREFIXES.some(prefix => path.startsWith(prefix));
}

export function encodeStoragePath(path: string): string {
  return requireStoragePath(path).split('/').map(encodeURIComponent).join('/');
}

export function safeStorageFilename(filename: string): string {
  const name = filename.replace(/\\/g, '/').split('/').pop()?.trim() || 'file';
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '') || 'file';
}

export function extensionFromMimeType(mimeType: string, fallback = 'bin'): string {
  const known: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim();
  if (normalized && known[normalized]) return known[normalized];
  const subtype = normalized?.split('/')[1];
  return subtype?.replace(/[^a-zA-Z0-9]+/g, '') || fallback;
}
