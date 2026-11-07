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
  ZoomIn,
} from 'lucide-react';
import type { EncodeSettings, ItemStatus, QueueItem } from '../types/image';
import { formatBytes, formatPercentChange, percentChange, resolveTargetDimensions } from '../utils/imageProcessor';

interface QueueRowProps {
  item: QueueItem;
  /** Current global encode settings, used to preview target dimensions before conversion. */
  settings: EncodeSettings;
  /** Converted with settings that no longer match the current ones. */
  outdated: boolean;
  onPreview: (id: string) => void;
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
  'inline-flex min-h-11 min-w-11 md:size-8 md:min-h-0 md:min-w-0 items-center justify-center rounded-[2px] text-[var(--text-secondary)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:text-[var(--text-muted)] disabled:opacity-40';
const iconBtn = `${iconBtnBase} hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] active:bg-[var(--bg-elevated)]`;
const iconBtnDanger = `${iconBtnBase} hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-text)] active:bg-[var(--status-error-bg)]`;

const badge =
  'inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-xs font-medium tracking-[0.03em] tabular-nums whitespace-nowrap';

function QueueRowImpl({
  item,
  settings,
  outdated,
  onPreview,
  onRemove,
  onDownload,
  onRetry,
  onDimensions,
}: QueueRowProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const { result, status } = item;
  const meta = STATUS_META[status];

  const hasOriginalDims = item.originalWidth !== undefined && item.originalHeight !== undefined;
  // Show the actual output dims once converted (unless outdated, where we preview the new target dims),
  // otherwise a live preview from the current resize settings.
  const target =
    result && !outdated
      ? { width: result.width, height: result.height }
      : hasOriginalDims
        ? resolveTargetDimensions(item.originalWidth!, item.originalHeight!, settings)
        : result
          ? { width: result.width, height: result.height }
          : null;

  const change = result ? percentChange(item.originalSize, result.size) : 0;
  const canRetry = status === 'error' && item.previewUrl !== null;
  const canPreview = item.previewUrl !== null && !thumbFailed;

  const convertedSettingDesc = result
    ? result.mode === 'px'
      ? `Max ${result.maxWidth}px · Q${result.quality}`
      : `${result.scale}% · Q${result.quality}`
    : '';

  const renderBadges = () => (
    <>
      {hasOriginalDims && (
        <span className={`${badge} ${TINT.neutral} font-mono`}>
          {item.originalWidth}×{item.originalHeight}
          {target && (
            <>
              <ArrowRight className="size-3 text-[var(--text-muted)]" aria-label="to" />
              <span className={result && !outdated ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
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
          title={`Converted at ${convertedSettingDesc} — settings changed`}
        >
          Outdated · needs re-convert
        </span>
      )}

      {status === 'error' && item.error && (
        <span className="max-w-full min-w-0 truncate text-[var(--status-error-text)]" title={item.error}>
          {item.error}
        </span>
      )}
    </>
  );

  const renderActions = () => (
    <>
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
    </>
  );

  return (
    <li className="px-3 py-3 transition-colors hover:bg-[var(--bg-elevated)]/60 sm:px-4">
      {/* Mobile (<768px): Responsive Card Layout */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {/* Top line: 40x40px Thumbnail + truncated filename + status badge */}
        <div className="flex min-w-0 items-center gap-2.5">
          {canPreview ? (
            <button
              type="button"
              onClick={() => onPreview(item.id)}
              title="Click to preview before / after comparison"
              aria-label={`Preview ${item.name}`}
              className="group/thumb relative flex size-10 shrink-0 cursor-zoom-in items-center justify-center rounded-[2px] bg-[var(--bg-elevated)] ring-1 ring-[var(--border-strong)] transition-all outline-none after:absolute after:-inset-1 after:content-[''] hover:ring-[var(--accent-border)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <img
                src={item.previewUrl!}
                alt=""
                width={40}
                height={40}
                decoding="async"
                draggable={false}
                className="size-10 rounded-[2px] object-cover"
                onLoad={(e) => onDimensions(item.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                onError={() => setThumbFailed(true)}
              />
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center rounded-[2px] bg-black/55 opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100"
              >
                <ZoomIn className="size-3.5 text-white" />
              </span>
            </button>
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-[var(--bg-elevated)] ring-1 ring-[var(--border-strong)]">
              <ImageOff className="size-4 text-[var(--text-muted)]" aria-hidden />
            </div>
          )}

          <p
            className="min-w-0 flex-1 max-w-[180px] truncate text-sm font-medium text-[var(--text-primary)] sm:max-w-[280px]"
            title={item.name}
          >
            {item.name}
          </p>

          <span
            className={`${badge} ml-auto shrink-0 gap-1.5 uppercase ${meta.className}`}
            role="status"
            aria-label={meta.label}
          >
            <StatusIcon status={status} />
            <span>{meta.label}</span>
          </span>
        </div>

        {/* Bottom line: Dimension transformation badge + file savings badge + action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)]/60 pt-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
            {renderBadges()}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {renderActions()}
          </div>
        </div>
      </div>

      {/* Desktop (>=768px): Dense Tabular Horizontal Row Layout */}
      <div className="hidden md:flex md:items-center md:gap-3">
        {/* 48x48px Click-to-Preview Thumbnail */}
        {canPreview ? (
          <button
            type="button"
            onClick={() => onPreview(item.id)}
            title="Click to preview before / after comparison"
            aria-label={`Preview ${item.name}`}
            className="group/thumb relative flex size-12 shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-[2px] bg-[var(--bg-elevated)] ring-1 ring-[var(--border-strong)] transition-all outline-none hover:ring-[var(--accent-border)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <img
              src={item.previewUrl!}
              alt=""
              width={48}
              height={48}
              decoding="async"
              draggable={false}
              className="size-12 object-cover transition-transform duration-150 group-hover/thumb:scale-105"
              onLoad={(e) => onDimensions(item.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
              onError={() => setThumbFailed(true)}
            />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity duration-150 group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100"
            >
              <ZoomIn className="size-4 text-white" />
            </span>
          </button>
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-[var(--bg-elevated)] ring-1 ring-[var(--border-strong)]">
            <ImageOff className="size-5 text-[var(--text-muted)]" aria-hidden />
          </div>
        )}

        {/* Name + badges */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={item.name}>
            {item.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {renderBadges()}
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`${badge} mr-1 w-28 gap-1.5 uppercase ${meta.className}`}
            role="status"
            aria-label={meta.label}
          >
            <StatusIcon status={status} />
            <span>{meta.label}</span>
          </span>
          {renderActions()}
        </div>
      </div>
    </li>
  );
}

export const QueueRow = memo(QueueRowImpl);
