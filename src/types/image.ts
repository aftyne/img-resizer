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

/** Resize dimension calculation strategy. */
export type ResizeMode = 'percent' | 'px';

/** Global conversion settings controlled from the top bar. */
export interface ProcessSettings {
  /** Resize mode: percentage ('percent') or max width in pixels ('px'). */
  mode: ResizeMode;
  /** Resize percentage, 1–200 (capped at 100 by default unless unlocked). */
  scale: number;
  /** Maximum target width in pixels when `mode === 'px'`. */
  maxWidth: number;
  /** WebP quality, 10–100. */
  quality: number;
  /** When true, output filename includes the scale or max-width suffix. */
  appendSuffix: boolean;
}

/** The subset of settings that actually affects the encoded pixels. */
export type EncodeSettings = Pick<ProcessSettings, 'mode' | 'scale' | 'maxWidth' | 'quality'>;

/** Output of a successful conversion. */
export interface ProcessedResult {
  blob: Blob;
  /** Object URL for `blob` — must be revoked when discarded. */
  url: string;
  width: number;
  height: number;
  size: number;
  /** Settings this result was produced with (used for "outdated" detection). */
  mode: ResizeMode;
  scale: number;
  maxWidth: number;
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
