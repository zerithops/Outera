import { supabase } from './supabase';

export const R2_BUCKET_NAME = 'outera-media';

export const ALLOWED_R2_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_R2_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export const MAX_R2_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per photo
export const MAX_POST_IMAGES = 2; // Maximum 2 photos per post/suggestion

export type R2UploadScope = 'posts' | 'suggestions' | 'avatars' | 'places' | 'reviews';

export interface R2PresignedUrlResponse {
  uploadUrl: string;
  objectKey: string;
  publicUrl?: string;
  contentType: string;
  bucket?: string;
  expiresIn?: number;
}

export interface R2UploadProgress {
  fileIndex: number;
  totalFiles: number;
  fileName: string;
  loadedBytes: number;
  totalBytes: number;
  filePercent: number;
  overallPercent: number;
  status: 'requesting_url' | 'uploading' | 'completed' | 'retrying' | 'error';
  attempt?: number;
  errorMessage?: string;
}

export interface R2UploadedMediaResult {
  objectKey: string;
  publicUrl: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
  fileName: string;
}

export interface R2UploadOptions {
  scope?: R2UploadScope;
  entityId?: string;
  maxRetries?: number;
  onProgress?: (progress: R2UploadProgress) => void;
}

/**
 * Resolve the configured Cloudflare R2 public base URL from Vite / Node environment variables.
 */
export function getR2PublicBaseUrl(overrideUrl?: string): string {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
  const raw =
    overrideUrl ||
    metaEnv?.VITE_R2_PUBLIC_URL ||
    (typeof process !== 'undefined' ? process.env?.VITE_R2_PUBLIC_URL || process.env?.R2_PUBLIC_URL : '') ||
    '';
  return String(raw).trim().replace(/\/+$/, '');
}

/**
 * Normalize image MIME type (e.g. image/jpg -> image/jpeg) and infer from extension when browser omits type.
 */
export function normalizeImageMimeType(file: { name?: string; type?: string }): string {
  const rawType = String(file.type || '').trim().toLowerCase();
  if (rawType === 'image/jpg') return 'image/jpeg';
  if (rawType === 'image/jpeg' || rawType === 'image/png' || rawType === 'image/webp') {
    return rawType;
  }

  const ext = String(file.name || '')
    .split('.')
    .pop()
    ?.trim()
    .toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return rawType;
}

/**
 * Validate a single image File against OUTERA's strict R2 upload rules:
 * - Allowed formats: JPG, JPEG, PNG, WEBP only
 * - Maximum size: 5MB per image
 */
export function validateImageFile(file: File | null | undefined): {
  valid: boolean;
  error?: string;
  normalizedMimeType: string;
  extension: string;
} {
  if (!file) {
    return {
      valid: false,
      error: 'No image file selected.',
      normalizedMimeType: '',
      extension: '',
    };
  }

  const fileName = String(file.name || '').trim();
  const ext = (fileName.includes('.') ? fileName.split('.').pop() : '')?.trim().toLowerCase() || '';
  const normalizedMime = normalizeImageMimeType(file);

  const hasValidMime = (ALLOWED_R2_MIME_TYPES as readonly string[]).includes(normalizedMime);
  const hasValidExt = !ext || (ALLOWED_R2_EXTENSIONS as readonly string[]).includes(ext);

  if (!hasValidMime || !hasValidExt) {
    return {
      valid: false,
      error: `"${fileName || 'Selected file'}" is not supported. Only JPG, JPEG, PNG, and WEBP images are allowed.`,
      normalizedMimeType: normalizedMime,
      extension: ext,
    };
  }

  if (typeof file.size !== 'number' || file.size <= 0) {
    return {
      valid: false,
      error: `"${fileName || 'Selected image'}" is empty (0 bytes). Please choose a valid photo.`,
      normalizedMimeType: normalizedMime,
      extension: ext,
    };
  }

  if (file.size > MAX_R2_IMAGE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `"${fileName || 'Selected image'}" is ${sizeMb}MB. Maximum allowed file size is 5MB per photo.`,
      normalizedMimeType: normalizedMime,
      extension: ext,
    };
  }

  const resolvedExt =
    ext && (ALLOWED_R2_EXTENSIONS as readonly string[]).includes(ext)
      ? ext === 'jpeg'
        ? 'jpg'
        : ext
      : normalizedMime === 'image/png'
      ? 'png'
      : normalizedMime === 'image/webp'
      ? 'webp'
      : 'jpg';

  return {
    valid: true,
    normalizedMimeType: normalizedMime,
    extension: resolvedExt,
  };
}

/**
 * Validate a batch of image files (defaults to max 2 photos per post/suggestion).
 */
export function validateImageBatch(
  files: File[],
  maxCount: number = MAX_POST_IMAGES
): { valid: boolean; error?: string } {
  if (!Array.isArray(files)) {
    return { valid: false, error: 'Invalid file list.' };
  }

  if (files.length > maxCount) {
    return {
      valid: false,
      error: `You can upload a maximum of ${maxCount} photo${maxCount === 1 ? '' : 's'} per post.`,
    };
  }

  for (let i = 0; i < files.length; i++) {
    const check = validateImageFile(files[i]);
    if (!check.valid) {
      return { valid: false, error: check.error };
    }
  }

  return { valid: true };
}

/**
 * Construct a public Cloudflare R2 URL from `VITE_R2_PUBLIC_URL` and an R2 object key.
 * If the Edge Function already returned a full `https://` public URL and `VITE_R2_PUBLIC_URL` is not set,
 * falls back to the Edge Function's returned public URL.
 */
export function buildR2PublicUrl(
  objectKeyOrUrl: string,
  edgeReturnedPublicUrl?: string,
  overrideBaseUrl?: string
): string {
  const cleanedKey = String(objectKeyOrUrl || '')
    .trim()
    .replace(/^r2:\/\//i, '')
    .replace(/^r2:/i, '')
    .replace(/^\/+/, '');

  const configuredBaseUrl = getR2PublicBaseUrl(overrideBaseUrl);

  if (configuredBaseUrl && cleanedKey && !/^https?:\/\//i.test(cleanedKey)) {
    return `${configuredBaseUrl}/${cleanedKey}`;
  }

  if (/^https?:\/\//i.test(cleanedKey)) {
    return cleanedKey;
  }

  if (edgeReturnedPublicUrl && /^https?:\/\//i.test(edgeReturnedPublicUrl.trim())) {
    return edgeReturnedPublicUrl.trim();
  }

  return cleanedKey;
}

/**
 * Detect whether a stored path/URL is an R2 object key or R2 public URL vs a legacy Supabase path.
 */
export function isR2ObjectKeyOrUrl(rawPath: string): boolean {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) return false;
  if (/^r2:/i.test(trimmed)) return true;

  const r2Base = getR2PublicBaseUrl();
  if (r2Base && trimmed.startsWith(r2Base)) return true;
  if (/\.r2\.dev\//i.test(trimmed) || /\.r2\.cloudflarestorage\.com\//i.test(trimmed)) return true;

  if (trimmed.includes('/storage/v1/object/') || trimmed.includes('community-review-media')) {
    return false;
  }

  // Standard R2 object key prefixes generated by r2-upload-url
  if (/^(posts|suggestions|avatars|places|reviews)\/[0-9a-f-]{8,}\//i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Request a presigned PUT URL from the existing Supabase Edge Function "r2-upload-url".
 */
export async function requestR2PresignedUploadUrl(
  file: File,
  options: { scope?: R2UploadScope; entityId?: string } = {}
): Promise<R2PresignedUrlResponse> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  if (!supabase) {
    throw new Error('Authentication service is not initialized.');
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token || !session?.user?.id) {
    throw new Error('Please sign in again before uploading photos.');
  }

  const scope: R2UploadScope = options.scope || 'posts';
  const safeFileName =
    String(file.name || `photo.${validation.extension}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-90) || `photo.${validation.extension}`;

  const payload = {
    fileName: safeFileName,
    filename: safeFileName,
    contentType: validation.normalizedMimeType,
    fileType: validation.normalizedMimeType,
    mimeType: validation.normalizedMimeType,
    fileSize: file.size,
    size: file.size,
    folder: scope,
    scope,
    bucket: R2_BUCKET_NAME,
    entityId: options.entityId || undefined,
  };

  const { data, error } = await supabase.functions.invoke('r2-upload-url', {
    body: payload,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    let detailedMessage = error.message || 'Failed to request upload URL from r2-upload-url.';
    try {
      const ctx = (error as unknown as { context?: Response })?.context;
      if (ctx && typeof ctx.json === 'function') {
        const errBody = await ctx.clone().json();
        if (errBody?.error || errBody?.message) {
          detailedMessage = String(errBody.error || errBody.message);
        }
      }
    } catch {
      // ignore parse error
    }
    throw new Error(detailedMessage);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response from r2-upload-url Edge Function.');
  }

  const record = data as Record<string, unknown>;
  if (record.error) {
    throw new Error(String(record.error));
  }

  const uploadUrl = String(
    record.uploadUrl ||
      record.presignedUrl ||
      record.signedUrl ||
      record.putUrl ||
      record.url ||
      ''
  ).trim();

  const objectKey = String(
    record.objectKey ||
      record.key ||
      record.fileKey ||
      record.path ||
      record.storagePath ||
      ''
  ).trim();

  const publicUrl = String(
    record.publicUrl || record.fileUrl || record.imageUrl || record.cdnUrl || ''
  ).trim();

  if (!uploadUrl) {
    throw new Error('The r2-upload-url Edge Function did not return a valid presigned uploadUrl.');
  }

  // If the Edge Function returned uploadUrl without an explicit objectKey field, derive the objectKey from the URL pathname
  let resolvedObjectKey = objectKey;
  if (!resolvedObjectKey) {
    try {
      const parsed = new URL(uploadUrl);
      resolvedObjectKey = decodeURIComponent(parsed.pathname)
        .replace(/^\/+/, '')
        .replace(new RegExp(`^${R2_BUCKET_NAME}/`, 'i'), '');
    } catch {
      resolvedObjectKey = `${scope}/${session.user.id}/${Date.now()}-${safeFileName}`;
    }
  }

  return {
    uploadUrl,
    objectKey: resolvedObjectKey,
    publicUrl: publicUrl || undefined,
    contentType: validation.normalizedMimeType,
    bucket: String(record.bucket || R2_BUCKET_NAME),
  };
}

/**
 * Upload a File directly to Cloudflare R2 using HTTP PUT and the exact Content-Type.
 * Uses XMLHttpRequest in the browser to provide real upload progress events, and fetch in Node/SSR environments.
 */
export async function putFileToR2PresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onByteProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<void> {
  if (typeof XMLHttpRequest !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);

      if (xhr.upload && onByteProgress) {
        xhr.upload.onprogress = (event: ProgressEvent) => {
          const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
          onByteProgress(Math.min(event.loaded, total), total);
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onByteProgress?.(file.size, file.size);
          resolve();
        } else {
          reject(
            new Error(
              `Cloudflare R2 upload failed with HTTP ${xhr.status}${
                xhr.statusText ? ` (${xhr.statusText})` : ''
              }.`
            )
          );
        }
      };

      xhr.onerror = () => {
        reject(
          new Error(
            'Network or CORS error while uploading image directly to Cloudflare R2. Please check your connection and try again.'
          )
        );
      };

      xhr.ontimeout = () => {
        reject(new Error('Image upload to Cloudflare R2 timed out. Please try again.'));
      };

      xhr.timeout = 90_000; // 90 seconds per photo max
      xhr.send(file);
    });
    return;
  }

  // Fallback for Node/test environments without XMLHttpRequest
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Cloudflare R2 upload failed with HTTP ${response.status}.`);
  }
  onByteProgress?.(file.size, file.size);
}

/**
 * Complete end-to-end single image upload to Cloudflare R2 with automatic retry handling:
 * 1. Validates file type (JPG/JPEG/PNG/WEBP) & max size (5MB)
 * 2. Requests presigned PUT URL from "r2-upload-url" Edge Function
 * 3. Uploads directly to Cloudflare R2 via HTTP PUT with Content-Type
 * 4. Builds public URL using VITE_R2_PUBLIC_URL + objectKey
 */
export async function uploadImageToR2(
  file: File,
  options: R2UploadOptions & { fileIndex?: number; totalFiles?: number } = {}
): Promise<R2UploadedMediaResult> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  const fileIndex = options.fileIndex ?? 0;
  const totalFiles = options.totalFiles ?? 1;
  const maxRetries = options.maxRetries ?? 2;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      options.onProgress?.({
        fileIndex,
        totalFiles,
        fileName: file.name,
        loadedBytes: 0,
        totalBytes: file.size,
        filePercent: attempt > 0 ? 5 : 10,
        overallPercent: Math.round(((fileIndex + 0.1) / totalFiles) * 100),
        status: attempt > 0 ? 'retrying' : 'requesting_url',
        attempt: attempt + 1,
      });

      const presigned = await requestR2PresignedUploadUrl(file, {
        scope: options.scope,
        entityId: options.entityId,
      });

      options.onProgress?.({
        fileIndex,
        totalFiles,
        fileName: file.name,
        loadedBytes: 0,
        totalBytes: file.size,
        filePercent: 20,
        overallPercent: Math.round(((fileIndex + 0.2) / totalFiles) * 100),
        status: 'uploading',
        attempt: attempt + 1,
      });

      await putFileToR2PresignedUrl(
        presigned.uploadUrl,
        file,
        presigned.contentType,
        (loadedBytes, totalBytes) => {
          const ratio = totalBytes > 0 ? Math.min(1, loadedBytes / totalBytes) : 0;
          const filePercent = Math.min(99, Math.round(20 + ratio * 79));
          const overallPercent = Math.min(
            99,
            Math.round(((fileIndex + 0.2 + ratio * 0.79) / totalFiles) * 100)
          );
          options.onProgress?.({
            fileIndex,
            totalFiles,
            fileName: file.name,
            loadedBytes,
            totalBytes,
            filePercent,
            overallPercent,
            status: 'uploading',
            attempt: attempt + 1,
          });
        }
      );

      const publicUrl = buildR2PublicUrl(presigned.objectKey, presigned.publicUrl);
      if (!publicUrl) {
        throw new Error(
          'Image uploaded to R2, but VITE_R2_PUBLIC_URL is not configured and no public URL was returned.'
        );
      }

      // Store the full public R2 URL when VITE_R2_PUBLIC_URL (or Edge publicUrl) is available,
      // or the clean objectKey so resolveStorageUrl can build it dynamically.
      const storagePath = /^https?:\/\//i.test(publicUrl) ? publicUrl : presigned.objectKey;

      options.onProgress?.({
        fileIndex,
        totalFiles,
        fileName: file.name,
        loadedBytes: file.size,
        totalBytes: file.size,
        filePercent: 100,
        overallPercent: Math.round(((fileIndex + 1) / totalFiles) * 100),
        status: 'completed',
        attempt: attempt + 1,
      });

      return {
        objectKey: presigned.objectKey,
        publicUrl,
        storagePath,
        contentType: presigned.contentType,
        fileSize: file.size,
        fileName: file.name,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err || 'Upload failed'));
      const msg = lastError.message.toLowerCase();
      // Do not retry validation or auth errors
      const isNonRetryable =
        msg.includes('not supported') ||
        msg.includes('maximum allowed') ||
        msg.includes('sign in') ||
        msg.includes('unauthorized') ||
        msg.includes('invalid user session');

      if (isNonRetryable || attempt >= maxRetries) {
        options.onProgress?.({
          fileIndex,
          totalFiles,
          fileName: file.name,
          loadedBytes: 0,
          totalBytes: file.size,
          filePercent: 0,
          overallPercent: Math.round((fileIndex / totalFiles) * 100),
          status: 'error',
          attempt: attempt + 1,
          errorMessage: lastError.message,
        });
        throw lastError;
      }

      // Exponential backoff before retry (600ms, 1200ms)
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }

  throw lastError || new Error('Failed to upload image to Cloudflare R2.');
}

/**
 * Upload multiple images (up to 2 photos per post/suggestion) sequentially to Cloudflare R2.
 * Fails atomically if any image fails so incomplete posts or broken image records are never created.
 */
export async function uploadMultipleImagesToR2(
  files: File[],
  options: R2UploadOptions & { maxCount?: number } = {}
): Promise<R2UploadedMediaResult[]> {
  const maxCount = options.maxCount ?? MAX_POST_IMAGES;
  const batchValidation = validateImageBatch(files, maxCount);
  if (!batchValidation.valid) {
    throw new Error(batchValidation.error || 'Invalid image batch.');
  }

  const results: R2UploadedMediaResult[] = [];
  for (let i = 0; i < files.length; i++) {
    const uploaded = await uploadImageToR2(files[i], {
      ...options,
      fileIndex: i,
      totalFiles: files.length,
    });
    results.push(uploaded);
  }

  return results;
}
