import { useState, type CSSProperties, type ChangeEvent, type KeyboardEvent } from 'react';
import { Download, Loader2, Trash2, Zap } from 'lucide-react';
import type { ProcessSettings, ResizeMode } from '../types/image';
import {
  DEFAULT_MAX_SCALE,
  MAX_MAX_WIDTH,
  MAX_QUALITY,
  MAX_SCALE,
  MIN_MAX_WIDTH,
  MIN_QUALITY,
  MIN_SCALE,
  clamp,
} from '../utils/imageProcessor';

const SCALE_PRESETS = [25, 50, 75, 100] as const;
const WIDTH_PRESETS = [800, 1200, 1920, 2560] as const;

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
  'inline-flex h-9 items-center justify-center gap-2 rounded-[2px] px-3.5 text-xs font-medium tracking-[0.06em] uppercase whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none';

const primaryBtn = `${btnBase} border border-transparent bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]`;
const primaryDisabled =
  'disabled:border-[var(--border-subtle)] disabled:bg-[var(--bg-elevated)] disabled:text-[var(--text-muted)]';

const sectionLabel = 'text-xs font-medium tracking-[0.1em] text-[var(--text-secondary)] uppercase';

function buildRangeStyle(value: number, min: number, max: number): CSSProperties {
  const safeMax = Math.max(min + 1, max);
  const clamped = clamp(value, min, safeMax);
  const pct = ((clamped - min) / (safeMax - min)) * 100;
  return {
    '--range-progress': `${pct}%`,
  } as CSSProperties;
}

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
  // Draft text for numeric inputs so users can type freely (e.g. clear the field) before committing.
  const [scaleDraft, setScaleDraft] = useState<string | null>(null);
  const [maxWidthDraft, setMaxWidthDraft] = useState<string | null>(null);
  const [unlockUpscale, setUnlockUpscale] = useState<boolean>(settings.scale > DEFAULT_MAX_SCALE);

  const effectiveMaxScale = unlockUpscale ? MAX_SCALE : DEFAULT_MAX_SCALE;

  const handleModeChange = (mode: ResizeMode) => {
    setScaleDraft(null);
    setMaxWidthDraft(null);
    onSettingsChange({ mode });
  };

  const handleToggleUnlockUpscale = (checked: boolean) => {
    setUnlockUpscale(checked);
    setScaleDraft(null);
    if (!checked && settings.scale > DEFAULT_MAX_SCALE) {
      onSettingsChange({ scale: DEFAULT_MAX_SCALE });
    }
  };

  const commitScale = (raw: string) => {
    const parsed = Math.round(Number(raw));
    if (raw.trim() !== '' && Number.isFinite(parsed)) {
      onSettingsChange({ scale: clamp(parsed, MIN_SCALE, effectiveMaxScale) });
    }
    setScaleDraft(null);
  };

  const handleScaleInput = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setScaleDraft(raw);
    const parsed = Number(raw);
    if (
      raw.trim() !== '' &&
      Number.isInteger(parsed) &&
      parsed >= MIN_SCALE &&
      parsed <= effectiveMaxScale
    ) {
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

  const commitMaxWidth = (raw: string) => {
    const parsed = Math.round(Number(raw));
    if (raw.trim() !== '' && Number.isFinite(parsed)) {
      onSettingsChange({ maxWidth: clamp(parsed, MIN_MAX_WIDTH, MAX_MAX_WIDTH) });
    }
    setMaxWidthDraft(null);
  };

  const handleMaxWidthInput = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setMaxWidthDraft(raw);
    const parsed = Number(raw);
    if (
      raw.trim() !== '' &&
      Number.isInteger(parsed) &&
      parsed >= MIN_MAX_WIDTH &&
      parsed <= MAX_MAX_WIDTH
    ) {
      onSettingsChange({ maxWidth: parsed });
    }
  };

  const handleMaxWidthKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setMaxWidthDraft(null);
      e.currentTarget.blur();
    }
  };

  const isProcessing = activeJobs > 0;
  const suffixToken = settings.mode === 'px' ? `${settings.maxWidth}px` : `${settings.scale}pct`;
  const exampleName = `hero-banner${settings.appendSuffix ? `-${suffixToken}` : ''}.webp`;

  return (
    <section
      aria-label="Conversion settings"
      className="sticky top-3 z-20 rounded-[2px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
    >
      <div className="grid gap-x-8 gap-y-5 p-4 md:grid-cols-2">
        {/* Resize (% Scale vs Max px) */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor={settings.mode === 'percent' ? 'scale-input' : 'max-width-input'}
                className={sectionLabel}
              >
                Resize
              </label>
              <div
                role="group"
                aria-label="Resize mode"
                className="inline-flex rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface-alt)] p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={settings.mode === 'percent'}
                  onClick={() => handleModeChange('percent')}
                  title="Percentage scale mode"
                  className={`h-5 rounded-[1px] px-2 text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                    settings.mode === 'percent'
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  aria-pressed={settings.mode === 'px'}
                  onClick={() => handleModeChange('px')}
                  title="Max width (px) mode"
                  className={`h-5 rounded-[1px] px-2 text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                    settings.mode === 'px'
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  PX
                </button>
              </div>
            </div>

            {settings.mode === 'percent' ? (
              <div className="flex items-center gap-2.5">
                <label
                  className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium tracking-[0.04em] text-[var(--text-secondary)] uppercase select-none hover:text-[var(--text-primary)]"
                  title="Allow enlarging images up to 200% (may cause blurriness)"
                >
                  <input
                    type="checkbox"
                    checked={unlockUpscale}
                    onChange={(e) => handleToggleUnlockUpscale(e.target.checked)}
                    className="size-3.5 cursor-pointer rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface-alt)] accent-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  />
                  <span>Unlock &gt;100%</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <input
                    id="scale-input"
                    type="number"
                    inputMode="numeric"
                    min={MIN_SCALE}
                    max={effectiveMaxScale}
                    step={1}
                    value={scaleDraft ?? String(settings.scale)}
                    onChange={handleScaleInput}
                    onBlur={(e) => commitScale(e.target.value)}
                    onKeyDown={handleScaleKeyDown}
                    className="h-7 w-16 rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface-alt)] px-2 text-right text-sm font-semibold tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-border)] focus:ring-1 focus:ring-[var(--accent)]"
                  />
                  <span className="text-xs font-medium text-[var(--text-muted)]">%</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="max-width-input"
                  className="text-[11px] font-medium tracking-[0.04em] text-[var(--text-secondary)] uppercase"
                >
                  Max Width (px)
                </label>
                <input
                  id="max-width-input"
                  type="number"
                  inputMode="numeric"
                  min={MIN_MAX_WIDTH}
                  max={MAX_MAX_WIDTH}
                  step={10}
                  value={maxWidthDraft ?? String(settings.maxWidth)}
                  onChange={handleMaxWidthInput}
                  onBlur={(e) => commitMaxWidth(e.target.value)}
                  onKeyDown={handleMaxWidthKeyDown}
                  className="h-7 w-20 rounded-[2px] border border-[var(--border-strong)] bg-[var(--bg-surface-alt)] px-2 text-right text-sm font-semibold tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-border)] focus:ring-1 focus:ring-[var(--accent)]"
                />
                <span className="text-xs font-medium text-[var(--text-muted)]">px</span>
              </div>
            )}
          </div>

          {settings.mode === 'percent' ? (
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
                      className={`h-7 rounded-[2px] border px-2.5 text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        active
                          ? 'border-[var(--accent-border)] bg-[var(--accent)] font-semibold text-[var(--accent-fg)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
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
                max={effectiveMaxScale}
                step={1}
                value={clamp(settings.scale, MIN_SCALE, effectiveMaxScale)}
                style={buildRangeStyle(settings.scale, MIN_SCALE, effectiveMaxScale)}
                onChange={(e) => {
                  setScaleDraft(null);
                  onSettingsChange({ scale: Number(e.target.value) });
                }}
                className="min-w-0 flex-1"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex shrink-0 gap-1" role="group" aria-label="Max width presets">
                {WIDTH_PRESETS.map((preset) => {
                  const active = settings.maxWidth === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setMaxWidthDraft(null);
                        onSettingsChange({ maxWidth: preset });
                      }}
                      className={`h-7 rounded-[2px] border px-2 text-xs tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        active
                          ? 'border-[var(--accent-border)] bg-[var(--accent)] font-semibold text-[var(--accent-fg)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {preset}px
                    </button>
                  );
                })}
              </div>
              <span className="truncate text-[11px] tracking-[0.02em] text-[var(--text-muted)]">
                Aspect locked · no upscale
              </span>
            </div>
          )}
        </div>

        {/* Quality */}
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="quality-input" className={sectionLabel}>
              WebP quality
            </label>
            <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
              {settings.quality}%
            </span>
          </div>
          <div className="flex h-7 items-center">
            <input
              id="quality-input"
              type="range"
              min={MIN_QUALITY}
              max={MAX_QUALITY}
              step={1}
              value={settings.quality}
              style={buildRangeStyle(settings.quality, MIN_QUALITY, MAX_QUALITY)}
              onChange={(e) => onSettingsChange({ quality: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-b-[2px] border-t border-[var(--border-subtle)] bg-[var(--bg-surface-alt)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 cursor-pointer items-center gap-2.5 text-xs text-[var(--text-secondary)]">
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={settings.appendSuffix}
              onChange={(e) => onSettingsChange({ appendSuffix: e.target.checked })}
              className="peer sr-only"
            />
            <span className="h-5 w-9 rounded-full border border-[var(--border-strong)] bg-[var(--bg-track)] transition-colors peer-checked:border-[var(--accent-border)] peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)]" />
            <span className="absolute left-0.5 size-4 rounded-full bg-[#f9f9f9] shadow transition-transform peer-checked:translate-x-4" />
          </span>
          <span className="shrink-0 tracking-[0.04em] text-[var(--text-primary)] uppercase">
            Scale suffix
          </span>
          <code className="truncate rounded-[2px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-muted)]">
            {exampleName}
          </code>
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <button
            type="button"
            onClick={onClearAll}
            disabled={totalCount === 0}
            className={`${btnBase} border border-transparent text-[var(--text-secondary)] hover:border-[var(--status-error-border)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-text)] disabled:text-[var(--text-muted)] disabled:opacity-50`}
          >
            <Trash2 className="size-4" aria-hidden />
            Clear All
          </button>
          <button
            type="button"
            onClick={onConvertAll}
            disabled={convertCount === 0}
            className={`${primaryBtn} ${isProcessing ? 'disabled:bg-[var(--accent)]/60 disabled:text-[var(--accent-fg)]' : primaryDisabled}`}
          >
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Zap className="size-4" aria-hidden />
            )}
            {isProcessing && convertCount === 0 ? `Converting… ${activeJobs} left` : 'Convert All'}
            {convertCount > 0 && (
              <span className="rounded-[2px] bg-black/25 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                {convertCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onDownloadAll}
            disabled={doneCount === 0 || isZipping}
            className={`${primaryBtn} ${isZipping ? 'disabled:bg-[var(--accent)]/60 disabled:text-[var(--accent-fg)]' : primaryDisabled}`}
          >
            {isZipping ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            {isZipping ? 'Zipping…' : doneCount > 1 ? 'Download All (.zip)' : 'Download'}
          </button>
        </div>
      </div>
    </section>
  );
}
