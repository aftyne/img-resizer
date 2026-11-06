import { memo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ImageOff,
  Loader2,
  RotateCw,
  X,
} from 'lucide-react';
import type { ItemStatus, QueueItem } from '../types/image';
import { computeTargetDimensions, formatBytes, formatPercentChange, percentChange } from '../utils/imageProcessor';

interface QueueRowProps {
  item: QueueItem;
  /** Current global scale, used to preview target dimensions before conversion. */
  scale: number;
  /** Converted with settings that no longer match the current ones. */
  outdated: boolean;
  onRemove: (id: string) => void;
  onDownload: (id: string) => void;
  onRetry: (id: string) => void;
  onDimensions: (id: string, width: number, height: number) => void;
}

const TINT = {
  success: 'bg-[var(--status-success-bg)] text-[var(--status-success-text)] border border-[var(--status-success-border)]',
  warning: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] border border-[var(--status-warning-border)]',
  error: 'bg-[var(--status-error-bg)] text-[var(--status-error-text)] border border-[var(--status-error-border)]',
  neutral: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]',
} as const;

const STATUS_META: Record<ItemStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: TINT.warning },
  queued: { label: 'Queued', className: TINT.warning },
  processing: { label: 'Processing', className: TINT.warning },
  done: { label: 'Done', className: TINT.success },
  error: { label: 'Error', className: TINT.error },
};

function StatusIcon({ status }: { status: ItemStatus }) {
  const cls = 'size-3.5 shrink-0';
  switch (status) {
    case 'pending':
      return <Circle className={cls} aria-hidden />;
    case 'queued':
      return <Clock className={cls} aria-hidden />;
    case 'processing':
      return <Loader2 className={`${cls} animate-spin`} aria-hidden />;
    case 'done':
      return <CheckCircle2 className={cls} aria-hidden />;
    case 'error':
      return <AlertCircle className={cls} aria-hidden />;
  }
}

const iconBtnBase =
  'inline-flex size-8 items-center justify-center rounded-[2px] text-[var(--text-secondary)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:text-[var(--text-muted)] disabled:opacity-40';
const iconBtn = `${iconBtnBase} hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]`;
const iconBtnDanger = `${iconBtnBase} hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-text)]`;

const badge =
  'inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-xs font-medium tracking-[0.03em] tabular-nums whitespace-nowrap';

function QueueRowImpl({ item, scale, outdated, onRemove, onDownload, onRetry, onDimensions }: QueueRowProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const { result, status } = item;
  const meta = STATUS_META[status];

  const hasOriginalDims = item.originalWidth !== undefined && item.originalHeight !== undefined;
  // Show the actual output dims once converted, otherwise a preview from the current scale.
  const target = result
    ? { width: result.width, height: result.height }
    : hasOriginalDims
      ? computeTargetDimensions(item.originalWidth!, item.originalHeight!, scale)
      : null;

  const change = result ? percentChange(item.originalSize, result.size) : 0;
  const canRetry = status === 'error' && item.previewUrl !== null;

  return (
    <li className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[var(--bg-elevated)]/60 sm:px-4">
      {/* Thumbnail */}
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-[var(--bg-elevated)] ring-1 ring-[var(--border-strong)]">
        {item.previewUrl && !thumbFailed ? (
          <img
            src={item.previewUrl}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="size-12 object-cover"
            onLoad={(e) => onDimensions(item.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <ImageOff className="size-5 text-[var(--text-muted)]" aria-hidden />
        )}
      </div>

      {/* Name + badges */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={item.name}>
          {item.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {hasOriginalDims && (
            <span className={`${badge} ${TINT.neutral} font-mono`}>
              {item.originalWidth}×{item.originalHeight}
              {target && (
                <>
                  <ArrowRight className="size-3 text-[var(--text-muted)]" aria-label="to" />
                  <span className={result ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
                    {target.width}×{target.height}
                  </span>
                </>
              )}
            </span>
          )}

          {result ? (
            <span className={`${badge} ${change <= 0 ? TINT.success : TINT.warning}`}>
              {formatBytes(item.originalSize)}
              <ArrowRight className="size-3 opacity-60" aria-label="to" />
              {formatBytes(result.size)}
              <span className="font-semibold">({formatPercentChange(change)})</span>
            </span>
          ) : (
            <span className={`${badge} ${TINT.neutral}`}>{formatBytes(item.originalSize)}</span>
          )}

          {outdated && (
            <span
              className={`${badge} ${TINT.warning}`}
              title={`Converted at ${result?.scale}% · Q${result?.quality} — settings changed`}
            >
              Outdated · needs re-convert
            </span>
          )}

          {status === 'error' && item.error && (
            <span className="max-w-full min-w-0 truncate text-[var(--status-error-text)]" title={item.error}>
              {item.error}
            </span>
          )}
        </div>
      </div>

      {/* Status + actions */}
      <div className="flex shrink-0 items-center gap-1">
        <span
          className={`${badge} mr-1 gap-1.5 uppercase sm:w-28 ${meta.className}`}
          role="status"
          aria-label={meta.label}
        >
          <StatusIcon status={status} />
          <span className="hidden sm:inline">{meta.label}</span>
        </span>

        {canRetry ? (
          <button
            type="button"
            className={iconBtn}
            onClick={() => onRetry(item.id)}
            title="Retry"
            aria-label={`Retry ${item.name}`}
          >
            <RotateCw className="size-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className={iconBtn}
            onClick={() => onDownload(item.id)}
            disabled={!result}
            title={result ? 'Download WebP' : 'Not converted yet'}
            aria-label={`Download ${item.name} as WebP`}
          >
            <Download className="size-4" aria-hidden />
          </button>
        )}
        <button
          type="button"
          className={iconBtnDanger}
          onClick={() => onRemove(item.id)}
          title="Remove"
          aria-label={`Remove ${item.name}`}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

export const QueueRow = memo(QueueRowImpl);
