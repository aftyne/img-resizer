/**
 * Shared state types for the batch image resizer.
 */

/** Lifecycle of a single queue item. */
export type ItemStatus =
  /** Added to the list but not yet scheduled for conversion. */
  | 'pending'
  /** Scheduled in the concurrency queue, waiting for a free slot. */
  | 'queued'
  /** Currently being decoded / resized / encoded. */
  | 'processing'
  /** Successfully converted; `result` is populated. */
  | 'done'
  /** Failed (corrupt file, unsupported format, encoder failure, …). */
  | 'error';

/** Global conversion settings controlled from the top bar. */
export interface ProcessSettings {
  /** Resize percentage, 1–200. */
  scale: number;
  /** WebP quality, 10–100. */
  quality: number;
  /** When true, output is `name-50pct.webp` instead of `name.webp`. */
  appendSuffix: boolean;
}

/** The subset of settings that actually affects the encoded pixels. */
export type EncodeSettings = Pick<ProcessSettings, 'scale' | 'quality'>;

/** Output of a successful conversion. */
export interface ProcessedResult {
  blob: Blob;
  /** Object URL for `blob` — must be revoked when discarded. */
  url: string;
  width: number;
  height: number;
  size: number;
  /** Settings this result was produced with (used for "outdated" detection). */
  scale: number;
  quality: number;
}

/** A single image in the processing queue. */
export interface QueueItem {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  /** Object URL for the thumbnail (null for unsupported files). Must be revoked. */
  previewUrl: string | null;
  originalWidth?: number;
  originalHeight?: number;
  status: ItemStatus;
  error?: string;
  result?: ProcessedResult;
}
