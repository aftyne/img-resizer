/**
 * Client-side image processing utilities:
 *  - decoding (createImageBitmap → <img> fallback)
 *  - high-quality resizing + WebP encoding (OffscreenCanvas → <canvas> fallback)
 *  - byte formatting / naming helpers
 *  - a small promise concurrency limiter
 *  - ZIP packaging + download helpers
 */
import type { EncodeSettings } from '../types/image';

/* -------------------------------------------------------------------------- */
/*                               Format support                               */
/* -------------------------------------------------------------------------- */

export const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_MIME_TYPES.join(',');

const ACCEPTED_EXTENSION_RE = /\.(png|jpe?g|webp|avif)$/i;

/** True if the file looks like a supported input (by MIME type, or by extension when MIME is missing). */
export function isSupportedImage(file: File): boolean {
  if ((ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) return true;
  return file.type === '' && ACCEPTED_EXTENSION_RE.test(file.name);
}

/* -------------------------------------------------------------------------- */
/*                                   Errors                                   */
/* -------------------------------------------------------------------------- */

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof ImageProcessingError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Unexpected error while processing this image.';
}

/* -------------------------------------------------------------------------- */
/*                                 Dimensions                                 */
/* -------------------------------------------------------------------------- */

export const MIN_SCALE = 1;
export const MAX_SCALE = 200;
export const MIN_QUALITY = 10;
export const MAX_QUALITY = 100;

/** Conservative canvas limits that hold across Chromium, Firefox and Safari. */
const MAX_CANVAS_SIDE = 16_384;
const MAX_CANVAS_AREA = 16_384 * 16_384;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeTargetDimensions(
  originalWidth: number,
  originalHeight: number,
  percentage: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(originalWidth * (percentage / 100))),
    height: Math.max(1, Math.round(originalHeight * (percentage / 100))),
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Decoding                                  */
/* -------------------------------------------------------------------------- */

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees decoded pixel memory / object URLs. Always call when done. */
  release: () => void;
}

const DECODE_ERROR_MESSAGE = 'Could not decode image — the file may be corrupt or in an unsupported format.';

function decodeWithImageElement(file: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new ImageProcessingError(DECODE_ERROR_MESSAGE));
        return;
      }
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => {
          URL.revokeObjectURL(url);
          img.removeAttribute('src');
        },
      });
    };
    img.onerror = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new ImageProcessingError(DECODE_ERROR_MESSAGE));
    };

    img.src = url;
  });
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Some browsers can't decode certain formats (e.g. AVIF) via createImageBitmap
      // but can through <img>. Fall through to the element-based decoder.
    }
  }
  return decodeWithImageElement(file);
}

/* -------------------------------------------------------------------------- */
/*                             Resize + WebP encode                           */
/* -------------------------------------------------------------------------- */

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CanvasSurface {
  canvas: AnyCanvas;
  ctx: Context2D;
}

export type SurfaceFactory = (width: number, height: number) => CanvasSurface | null;

function releaseCanvas(canvas: AnyCanvas | null | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function drawHighQuality(
  ctx: Context2D,
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, srcWidth, srcHeight, 0, 0, dstWidth, dstHeight);
}

/**
 * Renders `source` (`originalWidth × originalHeight`) onto `targetCtx` sized at
 * `targetWidth × targetHeight`.
 *
 * When downscaling below 50% on either dimension, iteratively halves the image
 * using at most two ping-pong intermediate canvases before drawing the final pass,
 * avoiding single-pass 2×2 bilinear aliasing/moiré artifacts.
 * All intermediate canvases have their dimensions zeroed out before returning.
 */
export function renderWithStepDown(
  source: CanvasImageSource,
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
  targetCtx: Context2D,
  createSurface: SurfaceFactory,
): void {
  const needsStepDown = targetWidth < originalWidth * 0.5 || targetHeight < originalHeight * 0.5;

  if (!needsStepDown) {
    drawHighQuality(targetCtx, source, originalWidth, originalHeight, targetWidth, targetHeight);
    return;
  }

  const pingPong: [CanvasSurface | null, CanvasSurface | null] = [null, null];

  try {
    let currentSource: CanvasImageSource = source;
    let currentWidth = originalWidth;
    let currentHeight = originalHeight;
    let writeIndex: 0 | 1 = 0;

    while (currentWidth * 0.5 > targetWidth && currentHeight * 0.5 > targetHeight) {
      const nextWidth = Math.max(targetWidth, Math.floor(currentWidth * 0.5));
      const nextHeight = Math.max(targetHeight, Math.floor(currentHeight * 0.5));

      let writeSurface = pingPong[writeIndex];
      if (!writeSurface) {
        writeSurface = createSurface(nextWidth, nextHeight);
        if (!writeSurface) {
          throw new ImageProcessingError('Could not allocate intermediate canvas for step-down resize.');
        }
        pingPong[writeIndex] = writeSurface;
      } else {
        writeSurface.canvas.width = nextWidth;
        writeSurface.canvas.height = nextHeight;
      }

      drawHighQuality(writeSurface.ctx, currentSource, currentWidth, currentHeight, nextWidth, nextHeight);

      currentSource = writeSurface.canvas;
      currentWidth = nextWidth;
      currentHeight = nextHeight;
      writeIndex = writeIndex === 0 ? 1 : 0;
    }

    // Final pass: draw from the last intermediate buffer onto the final output canvas.
    drawHighQuality(targetCtx, currentSource, currentWidth, currentHeight, targetWidth, targetHeight);
  } finally {
    // Zero out temporary canvas dimensions so the browser releases GPU textures immediately.
    releaseCanvas(pingPong[0]?.canvas);
    releaseCanvas(pingPong[1]?.canvas);
  }
}

function createOffscreenSurface(width: number, height: number): CanvasSurface | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    releaseCanvas(canvas);
    return null;
  }
  return { canvas, ctx };
}

function createHtmlSurface(width: number, height: number): CanvasSurface | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    releaseCanvas(canvas);
    return null;
  }
  return { canvas, ctx };
}

async function encodeWithOffscreenCanvas(
  source: CanvasImageSource,
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
  quality: number,
): Promise<Blob | null> {
  const target = createOffscreenSurface(targetWidth, targetHeight);
  if (!target) return null;
  const canvas = target.canvas as OffscreenCanvas;
  if (typeof canvas.convertToBlob !== 'function') {
    releaseCanvas(canvas);
    return null;
  }

  try {
    renderWithStepDown(
      source,
      originalWidth,
      originalHeight,
      targetWidth,
      targetHeight,
      target.ctx,
      createOffscreenSurface,
    );
    return await canvas.convertToBlob({ type: 'image/webp', quality });
  } finally {
    // Release the backing store eagerly instead of waiting for GC.
    releaseCanvas(canvas);
  }
}

async function encodeWithHtmlCanvas(
  source: CanvasImageSource,
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number,
  quality: number,
): Promise<Blob | null> {
  const target = createHtmlSurface(targetWidth, targetHeight);
  if (!target) {
    throw new ImageProcessingError('Canvas 2D context is not available in this browser.');
  }
  const canvas = target.canvas as HTMLCanvasElement;

  try {
    renderWithStepDown(
      source,
      originalWidth,
      originalHeight,
      targetWidth,
      targetHeight,
      target.ctx,
      createHtmlSurface,
    );
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  } finally {
    releaseCanvas(canvas);
  }
}

export interface ResizeOutput {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Decodes `file`, resizes it by `settings.scale` percent with high-quality smoothing
 * (using multi-step halving when scaling below 50%) and encodes it to WebP at `settings.quality`.
 */
export async function resizeImageToWebP(file: Blob, settings: EncodeSettings): Promise<ResizeOutput> {
  const scale = clamp(settings.scale, MIN_SCALE, MAX_SCALE);
  const quality = clamp(settings.quality, MIN_QUALITY, MAX_QUALITY) / 100;

  const decoded = await decodeImage(file);
  try {
    const { width, height } = computeTargetDimensions(decoded.width, decoded.height, scale);

    if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_AREA) {
      throw new ImageProcessingError(
        `Output ${width}×${height} exceeds the browser canvas limit — choose a smaller scale.`,
      );
    }

    let blob: Blob | null = null;
    try {
      blob = await encodeWithOffscreenCanvas(decoded.source, decoded.width, decoded.height, width, height, quality);
    } catch {
      blob = null; // fall back to the DOM canvas below
    }
    if (!blob) {
      blob = await encodeWithHtmlCanvas(decoded.source, decoded.width, decoded.height, width, height, quality);
    }

    if (!blob || blob.size === 0) {
      throw new ImageProcessingError('Encoding failed — the browser returned an empty image.');
    }
    if (blob.type !== 'image/webp') {
      // e.g. browsers without a WebP encoder silently fall back to PNG.
      throw new ImageProcessingError('This browser cannot encode WebP. Please use a recent Chrome, Edge or Firefox.');
    }

    return { blob, width, height, originalWidth: decoded.width, originalHeight: decoded.height };
  } finally {
    decoded.release();
  }
}

/* -------------------------------------------------------------------------- */
/*                              Formatting helpers                            */
/* -------------------------------------------------------------------------- */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** 2_516_582 → "2.4 MB", 317_440 → "310 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : exponent === 1 ? (value < 10 ? 1 : 0) : 1;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[exponent]}`;
}

/** Signed percentage change, e.g. 2.4 MB → 310 KB ⇒ -87. */
export function percentChange(from: number, to: number): number {
  if (from <= 0) return 0;
  return Math.round(((to - from) / from) * 100);
}

export function formatPercentChange(change: number): string {
  return change > 0 ? `+${change}%` : `${change}%`;
}

/** "hero-banner.png" → "hero-banner.webp" | "hero-banner-50pct.webp". */
export function buildOutputName(originalName: string, scale: number, appendSuffix: boolean): string {
  const base = originalName.replace(/\.[^./\\]+$/, '').trim() || 'image';
  return `${base}${appendSuffix ? `-${scale}pct` : ''}.webp`;
}

/** Returns `name` or a "-1", "-2", … variant that is not yet in `used` (case-insensitive). */
export function uniqueFileName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let i = 1; used.has(candidate.toLowerCase()); i++) {
    candidate = `${base}-${i}${ext}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** "20261106-122020" */
export function timestampForFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/* -------------------------------------------------------------------------- */
/*                             Concurrency limiter                            */
/* -------------------------------------------------------------------------- */

export type LimitedRunner = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Creates a runner that executes at most `limit` async tasks at once; extra tasks wait
 * in FIFO order. Keeps decode/encode memory bounded when many large files are queued.
 */
export function createConcurrencyLimiter(limit: number): LimitedRunner {
  const max = Math.max(1, Math.floor(limit));
  const waiting: Array<() => void> = [];
  let active = 0;

  const next = () => {
    if (active >= max) return;
    const start = waiting.shift();
    if (!start) return;
    active++;
    start();
  };

  return <T,>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}

/** 3 workers on typical machines, 4 on machines with 8+ logical cores. */
export const DEFAULT_CONCURRENCY =
  typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 0) >= 8 ? 4 : 3;

/** Lets the browser paint between heavy tasks. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* -------------------------------------------------------------------------- */
/*                              Download / ZIP                                */
/* -------------------------------------------------------------------------- */

/** Triggers a browser download for an existing (caller-owned) object URL. */
export function downloadFromUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Triggers a download for a blob, creating and later revoking a temporary object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadFromUrl(url, filename);
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Bundles files into a ZIP. WebP is already compressed, so entries are stored without deflate. */
export async function createZipBlob(entries: ReadonlyArray<{ name: string; blob: Blob }>): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const { name, blob } of entries) zip.file(name, blob, { binary: true });
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
}
