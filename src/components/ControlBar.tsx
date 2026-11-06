import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Download, Loader2, Trash2, Zap } from 'lucide-react';
import type { ProcessSettings } from '../types/image';
import { MAX_QUALITY, MAX_SCALE, MIN_QUALITY, MIN_SCALE, clamp } from '../utils/imageProcessor';

const SCALE_PRESETS = [25, 50, 75, 100] as const;

interface ControlBarProps {
  settings: ProcessSettings;
  onSettingsChange: (patch: Partial<ProcessSettings>) => void;
  /** Items that would be (re)converted by "Convert All" (pending + outdated). */
  convertCount: number;
  doneCount: number;
  totalCount: number;
  activeJobs: number;
  isZipping: boolean;
  onConvertAll: () => void;
  onDownloadAll: () => void;
  onClearAll: () => void;
}

const btnBase =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:pointer-events-none';

const primaryBtn = `${btnBase} bg-indigo-600 text-white shadow-sm hover:bg-indigo-500`;
const primaryDisabled = 'disabled:bg-zinc-800 disabled:text-zinc-600 disabled:shadow-none';

const sectionLabel = 'text-xs font-semibold tracking-wide text-zinc-400 uppercase';

export function ControlBar({
  settings,
  onSettingsChange,
  convertCount,
  doneCount,
  totalCount,
  activeJobs,
  isZipping,
  onConvertAll,
  onDownloadAll,
  onClearAll,
}: ControlBarProps) {
  // Draft text for the numeric input so users can type freely (e.g. clear the field) before committing.
  const [scaleDraft, setScaleDraft] = useState<string | null>(null);

  const commitScale = (raw: string) => {
    const parsed = Math.round(Number(raw));
    if (raw.trim() !== '' && Number.isFinite(parsed)) {
      onSettingsChange({ scale: clamp(parsed, MIN_SCALE, MAX_SCALE) });
    }
    setScaleDraft(null);
  };

  const handleScaleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setScaleDraft(raw);
    const parsed = Number(raw);
    if (raw.trim() !== '' && Number.isInteger(parsed) && parsed >= MIN_SCALE && parsed <= MAX_SCALE) {
      onSettingsChange({ scale: parsed });
    }
  };

  const handleScaleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setScaleDraft(null);
      e.currentTarget.blur();
    }
  };

  const isProcessing = activeJobs > 0;
  const exampleName = `hero-banner${settings.appendSuffix ? `-${settings.scale}pct` : ''}.webp`;

  return (
    <section
      aria-label="Conversion settings"
      className="sticky top-3 z-20 rounded-xl border border-zinc-800/80 bg-zinc-900 shadow-sm shadow-black/40"
    >
      <div className="grid gap-x-8 gap-y-5 p-4 md:grid-cols-2">
        {/* Scale */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="scale-input" className={sectionLabel}>
              Resize
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="scale-input"
                type="number"
                inputMode="numeric"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={1}
                value={scaleDraft ?? String(settings.scale)}
                onChange={handleScaleInput}
                onBlur={(e) => commitScale(e.target.value)}
                onKeyDown={handleScaleKeyDown}
                className="h-7 w-16 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-right text-sm font-semibold tabular-nums text-zinc-100 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-zinc-500">%</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex shrink-0 gap-1" role="group" aria-label="Scale presets">
              {SCALE_PRESETS.map((preset) => {
                const active = settings.scale === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setScaleDraft(null);
                      onSettingsChange({ scale: preset });
                    }}
                    className={`h-7 rounded-md border px-2.5 text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      active
                        ? 'border-indigo-500/40 bg-indigo-500/15 font-medium text-indigo-300'
                        : 'border-zinc-700/50 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {preset}%
                  </button>
                );
              })}
            </div>
            <input
              type="range"
              aria-label="Resize percentage"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={1}
              value={settings.scale}
              onChange={(e) => {
                setScaleDraft(null);
                onSettingsChange({ scale: Number(e.target.value) });
              }}
              className="h-1.5 min-w-0 flex-1 rounded-full bg-zinc-800 accent-indigo-500"
            />
          </div>
        </div>

        {/* Quality */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="quality-input" className={sectionLabel}>
              WebP quality
            </label>
            <span className="text-sm font-semibold tabular-nums text-zinc-100">{settings.quality}%</span>
          </div>
          <div className="flex h-7 items-center">
            <input
              id="quality-input"
              type="range"
              min={MIN_QUALITY}
              max={MAX_QUALITY}
              step={1}
              value={settings.quality}
              onChange={(e) => onSettingsChange({ quality: Number(e.target.value) })}
              className="h-1.5 w-full rounded-full bg-zinc-800 accent-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-b-xl border-t border-zinc-800/80 bg-zinc-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 cursor-pointer items-center gap-2.5 text-sm text-zinc-400">
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={settings.appendSuffix}
              onChange={(e) => onSettingsChange({ appendSuffix: e.target.checked })}
              className="peer sr-only"
            />
            <span className="h-5 w-9 rounded-full border border-zinc-700/60 bg-zinc-800 transition-colors peer-checked:border-indigo-500 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-900" />
            <span className="absolute left-0.5 size-4 rounded-full bg-zinc-100 shadow transition-transform peer-checked:translate-x-4" />
          </span>
          <span className="shrink-0 text-zinc-300">Scale suffix</span>
          <code className="truncate rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-xs text-zinc-500">
            {exampleName}
          </code>
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <button
            type="button"
            onClick={onClearAll}
            disabled={totalCount === 0}
            className={`${btnBase} text-zinc-400 hover:bg-red-500/10 hover:text-red-400 disabled:text-zinc-600`}
          >
            <Trash2 className="size-4" aria-hidden />
            Clear All
          </button>
          <button
            type="button"
            onClick={onDownloadAll}
            disabled={doneCount === 0 || isZipping}
            className={`${primaryBtn} ${isZipping ? 'disabled:bg-indigo-600/50 disabled:text-indigo-100' : primaryDisabled}`}
          >
            {isZipping ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            {isZipping ? 'Zipping…' : doneCount > 1 ? `Download All (.zip)` : 'Download'}
          </button>
          <button
            type="button"
            onClick={onConvertAll}
            disabled={convertCount === 0}
            className={`${primaryBtn} ${isProcessing ? 'disabled:bg-indigo-600/50 disabled:text-indigo-100' : primaryDisabled}`}
          >
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Zap className="size-4" aria-hidden />
            )}
            {isProcessing && convertCount === 0 ? `Converting… ${activeJobs} left` : 'Convert All'}
            {convertCount > 0 && (
              <span className="rounded bg-indigo-400/30 px-1.5 text-xs tabular-nums">{convertCount}</span>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
