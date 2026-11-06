import { useEffect, useState } from 'react';
import { ArrowRight, Columns2, Download, Eye, Maximize2, Minimize2, Sparkles, X, Zap } from 'lucide-react';
import type { QueueItem } from '../types/image';
import { formatBytes, formatPercentChange, percentChange } from '../utils/imageProcessor';

type CompareMode = 'processed' | 'original' | 'side-by-side';

interface PreviewModalProps {
  item: QueueItem;
  onClose: () => void;
  onDownload: (id: string) => void;
  onConvert: (id: string) => void;
}

export function PreviewModal({ item, onClose, onDownload, onConvert }: PreviewModalProps) {
  const hasResult = Boolean(item.result);
  const [compareMode, setCompareMode] = useState<CompareMode>(hasResult ? 'processed' : 'original');
  const [nativeScale, setNativeScale] = useState<boolean>(true);

  // Switch automatically to processed view once conversion finishes while modal is open.
  useEffect(() => {
    if (hasResult && compareMode === 'original') {
      setCompareMode('processed');
    }
  }, [hasResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape key & lock body scroll while open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const { result } = item;
  const change = result ? percentChange(item.originalSize, result.size) : 0;
  const isProcessing = item.status === 'processing' || item.status === 'queued';

  const imgScaleClass = nativeScale
    ? 'max-w-none select-none'
    : 'max-h-[65vh] max-w-full object-contain select-none';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${item.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-6"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-2xl">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold tracking-[0.04em] text-[var(--text-primary)]" title={item.name}>
              {item.name}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] tabular-nums">
              {item.originalWidth && item.originalHeight && (
                <span>
                  Original: {item.originalWidth}×{item.originalHeight} ({formatBytes(item.originalSize)})
                </span>
              )}
              {result && (
                <>
                  <ArrowRight className="size-3 text-[var(--text-muted)]" aria-hidden />
                  <span className="font-semibold text-[var(--text-primary)]">
                    WebP: {result.width}×{result.height} ({formatBytes(result.size)})
                  </span>
                  <span
                    className={`rounded-[2px] px-1.5 py-0.5 text-[11px] font-semibold ${
                      change <= 0
                        ? 'bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                        : 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                    }`}
                  >
                    {formatPercentChange(change)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* View Mode Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Preview comparison mode"
              className="inline-flex rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface)] p-0.5"
            >
              <button
                type="button"
                aria-pressed={compareMode === 'processed'}
                onClick={() => setCompareMode('processed')}
                className={`inline-flex h-7 items-center gap-1.5 rounded-[1px] px-2.5 text-xs font-medium tracking-[0.04em] uppercase transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                  compareMode === 'processed'
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Sparkles className="size-3.5" aria-hidden />
                Processed WebP
              </button>
              <button
                type="button"
                aria-pressed={compareMode === 'original'}
                onClick={() => setCompareMode('original')}
                className={`inline-flex h-7 items-center gap-1.5 rounded-[1px] px-2.5 text-xs font-medium tracking-[0.04em] uppercase transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                  compareMode === 'original'
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Eye className="size-3.5" aria-hidden />
                Original
              </button>
              <button
                type="button"
                aria-pressed={compareMode === 'side-by-side'}
                onClick={() => setCompareMode('side-by-side')}
                className={`inline-flex h-7 items-center gap-1.5 rounded-[1px] px-2.5 text-xs font-medium tracking-[0.04em] uppercase transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                  compareMode === 'side-by-side'
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Columns2 className="size-3.5" aria-hidden />
                Side-by-Side
              </button>
            </div>

            <button
              type="button"
              onClick={() => setNativeScale((prev) => !prev)}
              aria-pressed={nativeScale}
              title={nativeScale ? 'Showing at 1:1 native pixel scale — click to fit viewport' : 'Showing fitted to viewport — click for 1:1 native scale'}
              className="inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 text-xs font-medium tracking-[0.04em] text-[var(--text-secondary)] uppercase transition-colors outline-none hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {nativeScale ? (
                <>
                  <Minimize2 className="size-3.5" aria-hidden />
                  1:1 Native
                </>
              ) : (
                <>
                  <Maximize2 className="size-3.5" aria-hidden />
                  Fit
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              title="Close (Esc)"
              className="inline-flex size-8 items-center justify-center rounded-[2px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors outline-none hover:border-[var(--status-error-border)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Modal Body — Checkerboard Viewport */}
        {compareMode === 'side-by-side' ? (
          <div className="grid min-h-[340px] flex-1 grid-cols-1 divide-y divide-[var(--border-subtle)] overflow-hidden md:grid-cols-2 md:divide-x md:divide-y-0">
            {/* Left Pane: Original Source */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs">
                <span className="font-semibold tracking-[0.06em] text-[var(--text-secondary)] uppercase">
                  Before · Original Source
                </span>
                <span className="font-mono text-[var(--text-primary)] tabular-nums">
                  {item.originalWidth && item.originalHeight
                    ? `${item.originalWidth}×${item.originalHeight} · `
                    : ''}
                  {formatBytes(item.originalSize)}
                </span>
              </div>
              <div className="bg-checkerboard flex flex-1 items-center justify-center overflow-auto p-4">
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={`Original ${item.name}`}
                    width={item.originalWidth}
                    height={item.originalHeight}
                    draggable={false}
                    className={imgScaleClass}
                  />
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Original preview unavailable.</p>
                )}
              </div>
            </div>

            {/* Right Pane: Processed WebP */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs">
                <span className="font-semibold tracking-[0.06em] text-[var(--accent-text)] uppercase">
                  After · Processed WebP
                </span>
                {result ? (
                  <span className="font-mono text-[var(--text-primary)] tabular-nums">
                    {result.width}×{result.height} · {formatBytes(result.size)} ({formatPercentChange(change)})
                  </span>
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">Not converted yet</span>
                )}
              </div>
              <div className="bg-checkerboard flex flex-1 items-center justify-center overflow-auto p-4">
                {result ? (
                  <img
                    src={result.url}
                    alt={`Processed ${item.name}`}
                    width={result.width}
                    height={result.height}
                    draggable={false}
                    className={imgScaleClass}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface)]/95 px-5 py-4 text-center backdrop-blur-xs">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Convert this image to inspect the WebP output side-by-side.
                    </p>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => onConvert(item.id)}
                      className="inline-flex h-8 items-center gap-2 rounded-[2px] bg-[var(--accent)] px-3 text-xs font-medium tracking-[0.06em] text-[var(--accent-fg)] uppercase transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    >
                      <Zap className="size-3.5" aria-hidden />
                      {isProcessing ? 'Converting…' : 'Convert Now'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : compareMode === 'processed' ? (
          <div className="bg-checkerboard flex min-h-[340px] flex-1 items-center justify-center overflow-auto p-6">
            {result ? (
              <img
                src={result.url}
                alt={`Processed ${item.name}`}
                width={result.width}
                height={result.height}
                draggable={false}
                className={imgScaleClass}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface)]/95 px-6 py-5 text-center backdrop-blur-xs">
                <p className="text-xs text-[var(--text-secondary)]">
                  This image has not been converted to WebP yet.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => onConvert(item.id)}
                    className="inline-flex h-8 items-center gap-2 rounded-[2px] bg-[var(--accent)] px-3 text-xs font-medium tracking-[0.06em] text-[var(--accent-fg)] uppercase transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    <Zap className="size-3.5" aria-hidden />
                    {isProcessing ? 'Converting…' : 'Convert Now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareMode('original')}
                    className="inline-flex h-8 items-center gap-2 rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-xs font-medium tracking-[0.06em] text-[var(--text-primary)] uppercase transition-colors hover:border-[var(--accent-border)]"
                  >
                    View Original
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-checkerboard flex min-h-[340px] flex-1 items-center justify-center overflow-auto p-6">
            {item.previewUrl ? (
              <img
                src={item.previewUrl}
                alt={`Original ${item.name}`}
                width={item.originalWidth}
                height={item.originalHeight}
                draggable={false}
                className={imgScaleClass}
              />
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Original image preview unavailable.</p>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-[var(--text-secondary)] tabular-nums">
            {compareMode === 'processed' && result ? (
              <>
                <span className="font-semibold tracking-[0.05em] text-[var(--accent-text)] uppercase">
                  Showing: Processed WebP ({nativeScale ? '1:1 Native Scale' : 'Fit to Viewport'})
                </span>
                <span>·</span>
                <span>
                  {result.width} × {result.height} px
                </span>
                <span>·</span>
                <span>{formatBytes(result.size)}</span>
              </>
            ) : compareMode === 'original' ? (
              <>
                <span className="font-semibold tracking-[0.05em] text-[var(--text-primary)] uppercase">
                  Showing: Original Source ({nativeScale ? '1:1 Native Scale' : 'Fit to Viewport'})
                </span>
                {item.originalWidth && item.originalHeight && (
                  <>
                    <span>·</span>
                    <span>
                      {item.originalWidth} × {item.originalHeight} px
                    </span>
                  </>
                )}
                <span>·</span>
                <span>{formatBytes(item.originalSize)}</span>
              </>
            ) : (
              <span className="font-semibold tracking-[0.05em] text-[var(--text-primary)] uppercase">
                Showing: Before / After Side-by-Side ({nativeScale ? '1:1 Native Scale' : 'Fit to Viewport'})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {result && (
              <button
                type="button"
                onClick={() => onDownload(item.id)}
                className="inline-flex h-8 items-center gap-2 rounded-[2px] bg-[var(--accent)] px-3 text-xs font-medium tracking-[0.06em] text-[var(--accent-fg)] uppercase transition-colors outline-none hover:bg-[var(--accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <Download className="size-3.5" aria-hidden />
                Download WebP
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-xs font-medium tracking-[0.06em] text-[var(--text-secondary)] uppercase transition-colors outline-none hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
