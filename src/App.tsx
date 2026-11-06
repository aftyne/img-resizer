import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ImageIcon, Moon, RefreshCw, Sun, X } from 'lucide-react';
import type { EncodeSettings, ProcessSettings, QueueItem } from './types/image';
import {
  DEFAULT_CONCURRENCY,
  buildOutputName,
  createConcurrencyLimiter,
  createZipBlob,
  downloadBlob,
  downloadFromUrl,
  formatBytes,
  formatPercentChange,
  getErrorMessage,
  isSupportedImage,
  percentChange,
  resizeImageToWebP,
  timestampForFilename,
  uniqueFileName,
  yieldToMain,
} from './utils/imageProcessor';
import { ControlBar } from './components/ControlBar';
import { Dropzone } from './components/Dropzone';
import { QueueRow } from './components/QueueRow';

const DEFAULT_SETTINGS: ProcessSettings = { scale: 50, quality: 80, appendSuffix: false };

let idCounter = 0;
/** Works in non-secure contexts too (crypto.randomUUID requires HTTPS/localhost). */
const createId = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function isOutdated(item: QueueItem, settings: EncodeSettings): boolean {
  return (
    item.status === 'done' &&
    item.result !== undefined &&
    (item.result.scale !== settings.scale || item.result.quality !== settings.quality)
  );
}

function revokeItemUrls(item: QueueItem) {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.result) URL.revokeObjectURL(item.result.url);
}

export default function App() {
  const [items, setItems] = useState<QueueItem[]>([]);
  /** Synchronous mirror of `items` so async workers always see the latest queue. */
  const itemsRef = useRef<QueueItem[]>([]);
  const [settings, setSettings] = useState<ProcessSettings>(DEFAULT_SETTINGS);
  const [activeJobs, setActiveJobs] = useState(0);
  const [isZipping, setIsZipping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('theme');
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  const [runLimited] = useState(() => createConcurrencyLimiter(DEFAULT_CONCURRENCY));
  const scheduledIds = useRef(new Set<string>());

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      /* ignore storage errors */
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#111016' : '#e8e8e2');
    }
  }, [isDark]);

  /* ----------------------------- State helpers ---------------------------- */

  /** Applies an update to both the ref and React state (side-effect free, StrictMode-safe). */
  const commitItems = useCallback((updater: (prev: QueueItem[]) => QueueItem[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<QueueItem>) =>
      commitItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [commitItems],
  );

  const findItem = useCallback((id: string) => itemsRef.current.find((it) => it.id === id), []);

  /* -------------------------------- Effects ------------------------------- */

  // Revoke every object URL when the app unmounts.
  useEffect(
    () => () => {
      itemsRef.current.forEach(revokeItemUrls);
      itemsRef.current = [];
    },
    [],
  );

  // Prevent the browser from navigating to a file dropped outside the dropzone.
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  /* ------------------------------- Ingestion ------------------------------ */

  const addFiles = useCallback(
    (files: File[]) => {
      const newItems: QueueItem[] = files.map((file) => {
        const supported = isSupportedImage(file);
        return {
          id: createId(),
          file,
          name: file.name,
          originalSize: file.size,
          previewUrl: supported ? URL.createObjectURL(file) : null,
          status: supported ? 'pending' : 'error',
          error: supported ? undefined : 'Unsupported format — use PNG, JPEG, WebP or AVIF.',
        };
      });
      commitItems((prev) => [...prev, ...newItems]);
      setNotice(null);
    },
    [commitItems],
  );

  const handleDimensions = useCallback(
    (id: string, width: number, height: number) => {
      const item = findItem(id);
      if (!item || item.originalWidth !== undefined || !width || !height) return;
      patchItem(id, { originalWidth: width, originalHeight: height });
    },
    [findItem, patchItem],
  );

  /* ------------------------------- Processing ----------------------------- */

  const processItem = useCallback(
    async (id: string, snapshot: EncodeSettings) => {
      const item = findItem(id);
      if (!item) return; // removed while waiting in the queue

      patchItem(id, { status: 'processing', error: undefined });
      await yieldToMain();

      try {
        const output = await resizeImageToWebP(item.file, snapshot);
        const current = findItem(id);
        if (!current) return; // removed mid-flight — no URL was created, nothing to revoke

        if (current.result) URL.revokeObjectURL(current.result.url);
        patchItem(id, {
          status: 'done',
          error: undefined,
          originalWidth: output.originalWidth,
          originalHeight: output.originalHeight,
          result: {
            blob: output.blob,
            url: URL.createObjectURL(output.blob),
            width: output.width,
            height: output.height,
            size: output.blob.size,
            scale: snapshot.scale,
            quality: snapshot.quality,
          },
        });
      } catch (err) {
        const current = findItem(id);
        if (!current) return;
        if (current.result) URL.revokeObjectURL(current.result.url);
        patchItem(id, { status: 'error', error: getErrorMessage(err), result: undefined });
      }
    },
    [findItem, patchItem],
  );

  /** Schedules items through the concurrency limiter using a settings snapshot. */
  const enqueue = useCallback(
    (ids: string[], snapshot: EncodeSettings) => {
      const fresh = ids.filter((id) => !scheduledIds.current.has(id));
      if (fresh.length === 0) return;

      const freshSet = new Set(fresh);
      fresh.forEach((id) => scheduledIds.current.add(id));
      commitItems((prev) =>
        prev.map((it) => (freshSet.has(it.id) ? { ...it, status: 'queued', error: undefined } : it)),
      );
      setActiveJobs((n) => n + fresh.length);

      for (const id of fresh) {
        runLimited(() => processItem(id, snapshot))
          .catch(() => {
            /* processItem handles its own errors */
          })
          .finally(() => {
            scheduledIds.current.delete(id);
            setActiveJobs((n) => n - 1);
          });
      }
    },
    [commitItems, processItem, runLimited],
  );

  const encodeSnapshot: EncodeSettings = { scale: settings.scale, quality: settings.quality };

  const handleConvertAll = () => {
    const ids = itemsRef.current
      .filter((it) => it.status === 'pending' || isOutdated(it, encodeSnapshot))
      .map((it) => it.id);
    enqueue(ids, encodeSnapshot);
  };

  const handleRetry = useCallback(
    (id: string) => enqueue([id], { scale: settings.scale, quality: settings.quality }),
    [enqueue, settings.scale, settings.quality],
  );

  /* ------------------------------ Removal ------------------------------ */

  const handleRemove = useCallback(
    (id: string) => {
      const item = findItem(id);
      if (!item) return;
      revokeItemUrls(item);
      commitItems((prev) => prev.filter((it) => it.id !== id));
    },
    [commitItems, findItem],
  );

  const handleClearAll = () => {
    itemsRef.current.forEach(revokeItemUrls);
    commitItems(() => []);
    setNotice(null);
  };

  /* ------------------------------ Downloads ------------------------------ */

  const handleDownload = useCallback(
    (id: string) => {
      const item = findItem(id);
      if (!item?.result) return;
      downloadFromUrl(item.result.url, buildOutputName(item.name, item.result.scale, settings.appendSuffix));
    },
    [findItem, settings.appendSuffix],
  );

  const handleDownloadAll = async () => {
    const done = itemsRef.current.filter((it) => it.status === 'done' && it.result);
    if (done.length === 0) return;

    if (done.length === 1) {
      handleDownload(done[0].id);
      return;
    }

    setIsZipping(true);
    setNotice(null);
    try {
      const used = new Set<string>();
      const entries = done.map((it) => ({
        name: uniqueFileName(buildOutputName(it.name, it.result!.scale, settings.appendSuffix), used),
        blob: it.result!.blob,
      }));
      const zip = await createZipBlob(entries);
      downloadBlob(zip, `resized-images-${timestampForFilename()}.zip`);
    } catch (err) {
      setNotice(`Could not create ZIP archive: ${getErrorMessage(err)}`);
    } finally {
      setIsZipping(false);
    }
  };

  /* ------------------------------- Derived ------------------------------- */

  const stats = useMemo(() => {
    let pending = 0;
    let outdated = 0;
    let done = 0;
    let errors = 0;
    let originalBytes = 0;
    let outputBytes = 0;
    for (const it of items) {
      if (it.status === 'pending') pending++;
      if (it.status === 'error') errors++;
      if (it.status === 'done' && it.result) {
        done++;
        originalBytes += it.originalSize;
        outputBytes += it.result.size;
        if (it.result.scale !== settings.scale || it.result.quality !== settings.quality) outdated++;
      }
    }
    return { pending, outdated, done, errors, originalBytes, outputBytes };
  }, [items, settings.scale, settings.quality]);

  const handleSettingsChange = useCallback(
    (patch: Partial<ProcessSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  const hasItems = items.length > 0;
  const totalChange = percentChange(stats.originalBytes, stats.outputBytes);

  /* -------------------------------- Render ------------------------------- */

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-[0.08em] text-[var(--text-primary)] uppercase">
            <ImageIcon className="size-5 text-[var(--accent-text)]" aria-hidden />
            Image Resizer
          </h1>
          <p className="mt-1 text-xs tracking-[0.03em] text-[var(--text-secondary)]">
            Batch resize &amp; convert to WebP — runs entirely in your browser.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsDark((prev) => !prev)}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs font-medium tracking-[0.06em] text-[var(--text-secondary)] uppercase transition-colors outline-none hover:border-[var(--accent-border)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {isDark ? (
            <>
              <Sun className="size-4 text-[var(--stone)]" aria-hidden />
              <span className="hidden sm:inline">Light</span>
            </>
          ) : (
            <>
              <Moon className="size-4 text-[var(--accent-text)]" aria-hidden />
              <span className="hidden sm:inline">Dark</span>
            </>
          )}
        </button>
      </header>

      <div className="space-y-4">
        <ControlBar
          settings={settings}
          onSettingsChange={handleSettingsChange}
          convertCount={stats.pending + stats.outdated}
          doneCount={stats.done}
          totalCount={items.length}
          activeJobs={activeJobs}
          isZipping={isZipping}
          onConvertAll={handleConvertAll}
          onDownloadAll={handleDownloadAll}
          onClearAll={handleClearAll}
        />

        {notice && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-[2px] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-xs tracking-[0.02em] text-[var(--status-error-text)]"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--status-error-text)]" aria-hidden />
            <p className="flex-1">{notice}</p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-[2px] p-0.5 text-[var(--status-error-text)] transition-colors hover:bg-[var(--status-error-bg)]"
              aria-label="Dismiss"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {stats.outdated > 0 && (
          <div className="flex flex-col gap-3 rounded-[2px] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-xs tracking-[0.02em] text-[var(--status-warning-text)] sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-[var(--status-warning-text)]" aria-hidden />
              Settings changed — {stats.outdated} converted {stats.outdated === 1 ? 'image is' : 'images are'} out
              of date.
            </p>
            <button
              type="button"
              onClick={handleConvertAll}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[2px] bg-[var(--accent)] px-3 text-xs font-medium tracking-[0.06em] text-[var(--accent-fg)] uppercase transition-colors hover:bg-[var(--accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Apply &amp; Re-process
            </button>
          </div>
        )}

        <Dropzone compact={hasItems} onFiles={addFiles} />

        {hasItems && (
          <section
            aria-label="File queue"
            className="overflow-hidden rounded-[2px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] px-4 py-2.5 text-xs tracking-[0.04em] text-[var(--text-muted)] uppercase">
              <span>
                <span className="font-semibold text-[var(--text-primary)]">{items.length}</span>{' '}
                {items.length === 1 ? 'image' : 'images'}
                {' · '}
                {stats.done} done
                {activeJobs > 0 && ` · ${activeJobs} in progress`}
                {stats.errors > 0 && (
                  <span className="text-[var(--status-error-text)]"> · {stats.errors} failed</span>
                )}
              </span>
              {stats.done > 0 && (
                <span className="tabular-nums text-[var(--text-secondary)]">
                  {formatBytes(stats.originalBytes)} → {formatBytes(stats.outputBytes)}{' '}
                  <span
                    className={
                      totalChange <= 0
                        ? 'font-semibold text-[var(--status-success-text)]'
                        : 'font-semibold text-[var(--status-warning-text)]'
                    }
                  >
                    ({formatPercentChange(totalChange)})
                  </span>
                </span>
              )}
            </div>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {items.map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  scale={settings.scale}
                  outdated={isOutdated(item, encodeSnapshot)}
                  onRemove={handleRemove}
                  onDownload={handleDownload}
                  onRetry={handleRetry}
                  onDimensions={handleDimensions}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
