import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { ImagePlus, Plus } from 'lucide-react';
import { ACCEPT_ATTRIBUTE } from '../utils/imageProcessor';

interface DropzoneProps {
  /** Collapsed "Add more images…" bar once the queue has files. */
  compact: boolean;
  onFiles: (files: File[]) => void;
}

export function Dropzone({ compact, onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const openPicker = () => inputRef.current?.click();

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) onFiles(files);
    // Reset so selecting the same file(s) again still fires `change`.
    e.target.value = '';
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  const base =
    'group cursor-pointer select-none rounded-[2px] border border-dashed transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
  const state = isDragging
    ? 'border-[var(--accent-border)] bg-[var(--accent-subtle)] text-[var(--accent-text)]'
    : 'border-[var(--border-strong)] bg-[var(--bg-surface)] hover:border-[var(--accent-border)] hover:bg-[var(--bg-elevated)]/60';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Add images: drop files here or press Enter to browse"
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`${base} ${state}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        onChange={handleInputChange}
        onClick={(e) => e.stopPropagation()}
        className="hidden"
        tabIndex={-1}
      />

      {compact ? (
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-xs tracking-[0.06em] uppercase">
          <Plus
            className={`size-4 transition-colors ${
              isDragging ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
            }`}
            aria-hidden
          />
          <span className={`font-medium ${isDragging ? 'text-[var(--accent-text)]' : 'text-[var(--text-primary)]'}`}>
            {isDragging ? 'Drop to add images' : 'Add more images…'}
          </span>
          <span className="hidden text-[var(--text-muted)] sm:inline">or drop files here</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div
            className={`flex size-12 items-center justify-center rounded-full ring-1 transition-colors ${
              isDragging
                ? 'bg-[var(--accent)] text-[var(--accent-fg)] ring-[var(--accent-border)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] ring-[var(--border-strong)] group-hover:bg-[var(--accent)] group-hover:text-[var(--accent-fg)] group-hover:ring-[var(--accent-border)]'
            }`}
          >
            <ImagePlus className="size-5" aria-hidden />
          </div>
          <div>
            <p
              className={`text-sm font-semibold tracking-[0.08em] uppercase ${
                isDragging ? 'text-[var(--accent-text)]' : 'text-[var(--text-primary)]'
              }`}
            >
              {isDragging ? 'Drop images to add them' : 'Drop images here or click to browse'}
            </p>
            <p className="mt-1.5 text-xs tracking-[0.03em] text-[var(--text-muted)]">
              PNG, JPEG, WebP or AVIF · single or bulk · processed locally, nothing is uploaded
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
