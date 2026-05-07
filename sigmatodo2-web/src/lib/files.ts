const API_FILES_PREFIX = '/api/files/';

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function toStoragePath(value: string): string | null {
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

function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function fileUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('blob:') || value.startsWith('data:')) return value;

  const storagePath = toStoragePath(value);
  if (!storagePath) return undefined;

  return `${API_FILES_PREFIX}${encodeStoragePath(storagePath)}`;
}
