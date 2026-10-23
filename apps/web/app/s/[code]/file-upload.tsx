'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Crop as CropIcon, FileUp, Loader2, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { describeFileRules, formatSize, type FieldFile, type FileRules, type SessionField } from '@vff/shared';
import { checkPickedPdf, preparePages, rotatedPreview, type Crop, type Page, type Prepared } from '@/lib/files/convert';
import { Button, Card, Pill } from '@/components/ui';
import { useI18n } from './lang';

/**
 * Upload fields on the phone: take photos (or pick a file), turn them into what the website's field
 * takes (JPG under N KB, or one PDF of several pages under N KB), and send it to the computer.
 */

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()));

/** Status of an upload field, for the field lists. */
export function FileStatusMarker({ field, file }: { field: SessionField; file: FieldFile | undefined }) {
  const { t } = useI18n();
  if (!file) return field.required ? <Pill tone="warn">{t('fileNeeded')}</Pill> : <span className="text-muted">—</span>;
  if (file.status === 'filled') return <span className="text-live-ink">{t('fileFilled')}</span>;
  if (file.status === 'rejected') return <Pill tone="danger">{t('fileRefused')}</Pill>;
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <Check size={14} /> {t('fileSent')} · {formatSize(file.bytes)}
    </span>
  );
}

export function FileSheet({
  field,
  rules,
  file,
  onUpload,
  onClose,
}: {
  field: SessionField;
  rules: FileRules;
  file: FieldFile | undefined;
  onUpload: (file: File, pages: number | null) => Promise<string | null>;
  onClose: () => void;
}) {
  const { t, label, srv } = useI18n();
  const [pages, setPages] = useState<Page[]>([]);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState<'making' | 'uploading' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  const canPdf = rules.formats.includes('pdf');
  const imageOk = rules.formats.some((f) => f !== 'pdf');
  const maxPages = canPdf ? (rules.max_pages ?? 20) : 1;
  const pickAccept = [imageOk || canPdf ? 'image/*' : '', canPdf ? 'application/pdf' : ''].filter(Boolean).join(',');

  const setPage = (id: string, patch: Partial<Page>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setPrepared(null);
  };

  async function onFiles(list: FileList | null) {
    setError(null);
    for (const f of [...(list ?? [])]) {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        if (!canPdf) {
          setError(t('fileNoPdf'));
          continue;
        }
        // A ready PDF replaces the photos: it is sent as it is.
        setPages([]);
        setBusy('making');
        setPrepared(await checkPickedPdf(f, rules));
        setBusy(null);
        return;
      }
      setPages((prev) => {
        if (prev.length >= maxPages) {
          setError(t('fileTooManyPages', { n: maxPages }));
          return prev;
        }
        return [...prev, { id: newId(), file: f, rotate: 0, crop: null }];
      });
      setPrepared(null);
    }
  }

  async function make() {
    setError(null);
    setBusy('making');
    try {
      setPrepared(await preparePages(pages, rules));
    } catch {
      setError(t('fileNotImage'));
    }
    setBusy(null);
  }

  async function send() {
    if (!prepared || prepared.problem) return;
    setBusy('uploading');
    const err = await onUpload(prepared.file, prepared.format === 'pdf' ? prepared.pages : null);
    setBusy(null);
    if (err) setError(srv(err));
    else onClose();
  }

  const cropPage = pages.find((p) => p.id === cropping);

  return (
    <Card className="mb-3 border-accent-ink/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{label(field)}</h2>
          <p className="text-xs text-muted">
            {describeFileRules(rules)}
            {rules.note ? ` · ${rules.note}` : ''}
          </p>
        </div>
        <button onClick={onClose} aria-label={t('cancel')} className="-mr-1 grid size-9 shrink-0 place-items-center rounded-lg hover:bg-subtle">
          <X size={18} />
        </button>
      </div>

      {file?.status === 'rejected' && file.reason && (
        <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-ink">{t('fileRejected', { reason: file.reason })}</p>
      )}

      {/* Hidden pickers: the camera, and the gallery / files. */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
      <input
        ref={pickRef}
        type="file"
        accept={pickAccept}
        multiple={canPdf}
        hidden
        onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))}
      />

      {cropPage ? (
        <CropEditor page={cropPage} onDone={(crop) => (setPage(cropPage.id, { crop }), setCropping(null))} />
      ) : (
        <>
          {pages.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {pages.map((p) => (
                <Thumb
                  key={p.id}
                  page={p}
                  onRotate={() => setPage(p.id, { rotate: ((p.rotate + 90) % 360) as Page['rotate'], crop: null })}
                  onCrop={() => setCropping(p.id)}
                  onRemove={() => (setPages((prev) => prev.filter((x) => x.id !== p.id)), setPrepared(null))}
                />
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {pages.length < maxPages && (
              <Button onClick={() => camRef.current?.click()} disabled={!!busy}>
                <Camera size={16} /> {pages.length ? t('fileAddPage') : t('fileTakePhoto')}
              </Button>
            )}
            {pages.length < maxPages && (
              <Button variant="ghost" onClick={() => pickRef.current?.click()} disabled={!!busy}>
                <FileUp size={16} /> {t('fileChoose')}
              </Button>
            )}
          </div>
          {!pages.length && !prepared && rules.kind === 'document' && <p className="mt-2 text-xs text-muted">{t('fileHint')}</p>}

          {pages.length > 0 && !prepared && (
            <Button className="mt-3 w-full" variant="primary" loading={busy === 'making'} onClick={make}>
              {busy === 'making' ? t('fileMaking') : t('fileMake')}
            </Button>
          )}

          {prepared && (
            <div className="mt-3 space-y-2">
              <p className={prepared.problem ? 'text-sm text-danger-ink' : 'text-sm text-live-ink'}>
                {prepared.problem
                  ? srv(prepared.problem)
                  : t('fileReady', {
                      format: prepared.format.toUpperCase() + (prepared.format === 'pdf' && prepared.pages > 1 ? ` (${t('filePages', { n: prepared.pages })})` : ''),
                      size: formatSize(prepared.file.size),
                    })}
              </p>
              {!prepared.problem && (
                <Button className="w-full" variant="primary" loading={busy === 'uploading'} onClick={send}>
                  {busy === 'uploading' ? t('fileUploading') : t('fileUpload')}
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
    </Card>
  );
}

function Thumb({ page, onRotate, onCrop, onRemove }: { page: Page; onRotate: () => void; onCrop: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  const url = useMemo(() => URL.createObjectURL(page.file), [page.file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="rounded-lg border border-line p-1">
      <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-md bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="max-h-full max-w-full object-contain" style={{ transform: `rotate(${page.rotate}deg)` }} />
      </div>
      <div className="mt-1 flex justify-between">
        <button onClick={onRotate} aria-label={t('fileRotate')} className="grid size-8 place-items-center rounded-md hover:bg-subtle">
          <RotateCw size={15} />
        </button>
        <button
          onClick={onCrop}
          aria-label={t('fileCrop')}
          className={`grid size-8 place-items-center rounded-md hover:bg-subtle ${page.crop ? 'text-accent-ink' : ''}`}
        >
          <CropIcon size={15} />
        </button>
        <button onClick={onRemove} aria-label={t('fileRemove')} className="grid size-8 place-items-center rounded-md text-danger-ink hover:bg-subtle">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

/** Crop with two corner handles over the (rotated) photo; the box is kept as fractions of the photo. */
function CropEditor({ page, onDone }: { page: Page; onDone: (crop: Crop | null) => void }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [box, setBox] = useState<Crop>(page.crop ?? { x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<'tl' | 'br' | null>(null);

  useEffect(() => {
    let live = true;
    rotatedPreview(page).then((u) => live && setPreview(u));
    return () => {
      live = false;
    };
  }, [page]);

  const move = (e: React.PointerEvent) => {
    const corner = drag.current;
    const rect = frame.current?.getBoundingClientRect();
    if (!corner || !rect) return;
    const fx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setBox((b) => {
      const MIN = 0.08;
      if (corner === 'tl') {
        const x = Math.min(fx, b.x + b.w - MIN);
        const y = Math.min(fy, b.y + b.h - MIN);
        return { x, y, w: b.x + b.w - x, h: b.y + b.h - y };
      }
      return { ...b, w: Math.max(MIN, fx - b.x), h: Math.max(MIN, fy - b.y) };
    });
  };
  const handle = (corner: 'tl' | 'br') => ({
    onPointerDown: (e: React.PointerEvent) => {
      drag.current = corner;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: move,
    onPointerUp: () => (drag.current = null),
  });

  return (
    <div className="mt-3">
      {preview ? (
        <div ref={frame} className="relative touch-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="block w-full rounded-md" draggable={false} />
          <div
            className="absolute border-2 border-accent-ink shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
          >
            <span {...handle('tl')} className="absolute -top-3 -left-3 size-6 rounded-full border-2 border-white bg-accent-ink" />
            <span {...handle('br')} className="absolute -right-3 -bottom-3 size-6 rounded-full border-2 border-white bg-accent-ink" />
          </div>
        </div>
      ) : (
        <div className="grid h-40 place-items-center">
          <Loader2 className="animate-spin text-muted" />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" variant="primary" onClick={() => onDone(box)}>
          <Check size={16} /> {t('fileCropDone')}
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>
          <Plus size={16} className="rotate-45" /> {t('fileRemove')}
        </Button>
      </div>
    </div>
  );
}
