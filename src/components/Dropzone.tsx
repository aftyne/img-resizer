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
    'group cursor-pointer select-none rounded-xl border-2 border-dashed transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950';
  const state = isDragging
    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
    : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70';

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
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm">
          <Plus
            className={`size-4 transition-colors ${isDragging ? 'text-indigo-300' : 'text-zinc-500 group-hover:text-zinc-100'}`}
            aria-hidden
          />
          <span className={`font-medium ${isDragging ? 'text-indigo-300' : 'text-zinc-300'}`}>
            {isDragging ? 'Drop to add images' : 'Add more images…'}
          </span>
          <span className="hidden text-zinc-500 sm:inline">or drop files here</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div
            className={`flex size-12 items-center justify-center rounded-full ring-1 transition-colors ${
              isDragging
                ? 'bg-indigo-500/15 ring-indigo-500/40'
                : 'bg-zinc-800/60 ring-zinc-700/60 group-hover:bg-zinc-800'
            }`}
          >
            <ImagePlus className={`size-6 ${isDragging ? 'text-indigo-300' : 'text-zinc-400'}`} aria-hidden />
          </div>
          <div>
            <p className={`text-base font-semibold ${isDragging ? 'text-indigo-300' : 'text-zinc-100'}`}>
              {isDragging ? 'Drop images to add them' : 'Drop images here or click to browse'}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              PNG, JPEG, WebP or AVIF · single or bulk · processed locally, nothing is uploaded
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
