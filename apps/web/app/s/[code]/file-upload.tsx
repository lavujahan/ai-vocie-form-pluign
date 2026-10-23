'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Crop as CropIcon, FileUp, Loader2, Plus, RotateCw, Trash2, X } from 'lucide-react';
import { describeFileRules, formatSize, photoShape, targetFormat, type FieldFile, type FileRules, type SessionField } from '@vff/shared';
import { checkPickedPdf, detectQuad, pagePreview, preparePages, rotatedPreview, type Crop, type Page, type Prepared } from '@/lib/files/convert';
import { fitBox, hasShape, insetQuad, moveBox, moveCorner, resizeBox, rotateQuad, type Box, type Quad } from '@/lib/files/crop';
import { Button, Card, Pill } from '@/components/ui';
import { useI18n } from './lang';

/**
 * Upload fields on the phone: take photos (or pick a file), turn them into what the website's field
 * takes (JPG under N KB, or one PDF of several pages under N KB), and send it to the computer. Document
 * photos are cut out along the sheet's corners and straightened; a picked PDF that is too big is made
 * smaller.
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
  const [busy, setBusy] = useState<'making' | 'shrinking' | 'finding' | 'uploading' | null>(null);
  const [progress, setProgress] = useState<{ n: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const isDoc = rules.kind === 'document';
  const [scanLook, setScanLook] = useState(true);
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  const canPdf = rules.formats.includes('pdf');
  const imageOk = rules.formats.some((f) => f !== 'pdf');
  const maxPages = canPdf ? (rules.max_pages ?? 20) : 1;
  const pickAccept = [imageOk || canPdf ? 'image/*' : '', canPdf ? 'application/pdf' : ''].filter(Boolean).join(',');
  // The page states a photo size: the crop frame keeps that shape (only for a single image, not a PDF).
  const shape = photoShape(rules);
  const ratio = shape && targetFormat(rules, Math.max(1, pages.length)) !== 'pdf' ? shape.ratio : null;
  const sizeText = describeFileRules(rules).split(' · ').at(-1) ?? '';

  const setPage = (id: string, patch: Partial<Page>) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setPrepared(null);
  };

  async function onFiles(list: FileList | null) {
    setError(null);
    let count = pages.length;
    let opened = false;
    for (const f of [...(list ?? [])]) {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        if (!canPdf) {
          setError(t('fileNoPdf'));
          continue;
        }
        // A ready PDF replaces the photos: sent as it is, or made smaller first when it is over the limit.
        setPages([]);
        setProgress(null);
        setBusy(rules.max_kb && f.size > rules.max_kb * 1024 ? 'shrinking' : 'making');
        setPrepared(await checkPickedPdf(f, rules, (n, of) => setProgress({ n, of })));
        setBusy(null);
        return;
      }
      if (count >= maxPages) {
        setError(t('fileTooManyPages', { n: maxPages }));
        continue;
      }
      const page: Page = { id: newId(), file: f, rotate: 0, crop: null, clean: isDoc && scanLook };
      if (isDoc) {
        // Find the sheet of paper; when it isn't clear, the user places the corners.
        setBusy('finding');
        page.quad = await detectQuad(page).catch(() => null);
        setBusy(null);
      }
      setPages((prev) => [...prev, page]);
      // A document: check its corners. A stated photo size: frame the photo in that shape.
      if (!opened && (isDoc || (ratio && count === 0))) {
        setCropping(page.id);
        opened = true;
      }
      count++;
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

      {cropPage && isDoc ? (
        <QuadEditor page={cropPage} onDone={(quad) => (setPage(cropPage.id, { quad }), setCropping(null))} />
      ) : cropPage ? (
        <CropEditor page={cropPage} ratio={ratio} onDone={(crop) => (setPage(cropPage.id, { crop }), setCropping(null))} />
      ) : (
        <>
          {pages.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {pages.map((p) => (
                <Thumb
                  key={p.id}
                  page={p}
                  onRotate={() => setPage(p.id, { rotate: ((p.rotate + 90) % 360) as Page['rotate'], crop: null, quad: p.quad && rotateQuad(p.quad) })}
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
          {!pages.length && !prepared && isDoc && <p className="mt-2 text-xs text-muted">{t('fileHint')}</p>}
          {isDoc && pages.length > 0 && !prepared && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={scanLook}
                onChange={(e) => {
                  const clean = e.target.checked;
                  setScanLook(clean);
                  setPages((prev) => prev.map((p) => ({ ...p, clean })));
                  setPrepared(null);
                }}
              />
              {t('fileScanLook')}
            </label>
          )}
          {(busy === 'shrinking' || busy === 'finding') && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" />
              {busy === 'finding' ? t('fileFinding') : t('fileShrinking')}
              {busy === 'shrinking' && progress && progress.of > 1 ? ` ${t('filePageOf', { n: progress.n, of: progress.of })}` : ''}
            </p>
          )}
          {ratio && !prepared && <p className="mt-2 text-xs text-accent-ink">{t('fileShapeHint', { size: sizeText })}</p>}

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
              {prepared.shrunkFrom && !prepared.problem && <p className="text-xs text-muted">{t('fileShrunkFrom', { size: formatSize(prepared.shrunkFrom) })}</p>}
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
  // The page as it will be sent (turned, cut out, scan look); the plain photo until that is ready.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setPreview(null);
    pagePreview(page)
      .then((u) => live && setPreview(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [page]);
  return (
    <div className="rounded-lg border border-line p-1">
      <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-md bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview ?? url}
          alt=""
          className="max-h-full max-w-full object-contain"
          style={preview ? undefined : { transform: `rotate(${page.rotate}deg)` }}
        />
      </div>
      <div className="mt-1 flex justify-between">
        <button onClick={onRotate} aria-label={t('fileRotate')} className="grid size-8 place-items-center rounded-md hover:bg-subtle">
          <RotateCw size={15} />
        </button>
        <button
          onClick={onCrop}
          aria-label={t('fileCrop')}
          className={`grid size-8 place-items-center rounded-md hover:bg-subtle ${page.crop || page.quad ? 'text-accent-ink' : ''}`}
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

/**
 * Crop with two corner handles over the (rotated) photo; drag inside the frame to move it. When the page
 * states a photo size (`ratio` = its width / height), the frame keeps exactly that shape.
 */
function CropEditor({ page, ratio, onDone }: { page: Page; ratio: number | null; onDone: (crop: Crop | null) => void }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  /** Width / height of the photo as shown (the frame's shape depends on it). */
  const [imgRatio, setImgRatio] = useState<number | null>(null);
  const [box, setBox] = useState<Box>(page.crop ?? fitBox(null, 1));
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'tl' | 'br' | 'move'; x: number; y: number; start: Box } | null>(null);

  useEffect(() => {
    let live = true;
    rotatedPreview(page).then((u) => live && setPreview(u));
    return () => {
      live = false;
    };
  }, [page]);

  // Once the photo's shape is known: start (or redo) the frame in the page's shape.
  useEffect(() => {
    if (!imgRatio || !ratio) return;
    setBox((b) => (page.crop && hasShape(b, ratio, imgRatio) ? b : fitBox(ratio, imgRatio)));
  }, [imgRatio, ratio, page.crop]);

  const at = (e: React.PointerEvent) => {
    const rect = frame.current!.getBoundingClientRect();
    return { fx: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), fy: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) };
  };
  const start = (mode: 'tl' | 'br' | 'move') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const { fx, fy } = at(e);
    drag.current = { mode, x: fx, y: fy, start: box };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !frame.current) return;
    const { fx, fy } = at(e);
    setBox(d.mode === 'move' ? moveBox(d.start, fx - d.x, fy - d.y) : resizeBox(d.start, d.mode, fx, fy, ratio, imgRatio ?? 1));
  };
  const end = () => (drag.current = null);

  return (
    <div className="mt-3">
      {preview ? (
        <div ref={frame} className="relative touch-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            className="block w-full rounded-md"
            draggable={false}
            onLoad={(e) => setImgRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          />
          <div
            onPointerDown={start('move')}
            onPointerMove={onMove}
            onPointerUp={end}
            className="absolute cursor-move border-2 border-accent-ink shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
          >
            <span
              onPointerDown={start('tl')}
              onPointerMove={onMove}
              onPointerUp={end}
              className="absolute -top-3.5 -left-3.5 size-7 rounded-full border-2 border-white bg-accent-ink"
            />
            <span
              onPointerDown={start('br')}
              onPointerMove={onMove}
              onPointerUp={end}
              className="absolute -right-3.5 -bottom-3.5 size-7 rounded-full border-2 border-white bg-accent-ink"
            />
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

/**
 * A document's 4 corners over the (rotated) photo, as found (or just inside the edges when the sheet
 * wasn't found): drag each onto a corner of the page. The page is then cut out and straightened.
 */
function QuadEditor({ page, onDone }: { page: Page; onDone: (quad: Quad | null) => void }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad>(page.quad ?? insetQuad());
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    rotatedPreview(page).then((u) => live && setPreview(u));
    return () => {
      live = false;
    };
  }, [page]);

  const onMove = (e: React.PointerEvent) => {
    const i = drag.current;
    if (i === null || !frame.current) return;
    const rect = frame.current.getBoundingClientRect();
    setQuad((q) => moveCorner(q, i, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height));
  };
  const outline = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs text-muted">{page.quad ? t('fileCornersHint') : t('fileNotFound')}</p>
      {preview ? (
        <div ref={frame} className="relative touch-none select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="block w-full rounded-md" draggable={false} />
          <svg className="pointer-events-none absolute inset-0 size-full text-accent-ink" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path fillRule="evenodd" fill="rgba(0,0,0,0.45)" d={`M0 0H100V100H0Z M${outline.replace(/ /g, ' L')}Z`} />
            <polygon points={outline} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          {quad.map((p, i) => (
            <span
              key={i}
              onPointerDown={(e) => {
                drag.current = i;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              <span className="size-6 rounded-full border-2 border-white bg-accent-ink" />
            </span>
          ))}
        </div>
      ) : (
        <div className="grid h-40 place-items-center">
          <Loader2 className="animate-spin text-muted" />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" variant="primary" onClick={() => onDone(quad)}>
          <Check size={16} /> {t('fileCropDone')}
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>
          {t('fileWholePhoto')}
        </Button>
      </div>
    </div>
  );
}
