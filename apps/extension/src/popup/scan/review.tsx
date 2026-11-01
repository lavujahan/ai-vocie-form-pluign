import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, RotateCw } from 'lucide-react';
import { describeFileRules, effectiveFileRules, formatSize, uploadFileName, type SessionField } from '@vff/shared';
import { checkPickedPdf, detectScan, pagePreview, pdfToPages, preparePages, rotatedPreview, type Page, type Prepared } from '@vff/shared/ui/files/convert';
import { drawPdfPages } from '@vff/shared/ui/files/pdf-shrink';
import { insetQuad, moveCorner, rotateQuad, type Quad } from '@vff/shared/ui/files/crop';
import type { PopupRequest, PopupResponse } from '../../messages';
import { markUsed, putScan, scanId } from '../../scans-db';
import { Banner, Button, cx, Header } from '../ui';
import type { ScanFile } from './folder';

/**
 * The scans made ready for one field: found and straightened, in the field's format and within its
 * limits, shown before they are saved. A PDF the field can take as it is keeps its pages untouched.
 */

type Request = (req: PopupRequest) => Promise<PopupResponse>;
const WHOLE = insetQuad(0);

/** The selected scans as pages to work on. Read into memory now: the scanner may reuse the file name later. */
async function loadPages(scans: ScanFile[], kind: 'photo' | 'signature' | 'document'): Promise<Page[]> {
  const pages: Page[] = [];
  for (const scan of scans) {
    const file = await scan.handle!.getFile();
    const data = new Blob([await file.arrayBuffer()], { type: file.type });
    pages.push(...(scan.pdf ? await pdfToPages(data) : [{ id: scan.key, file: data, rotate: 0 as const, crop: null }]));
  }
  // A photo's colours stay as scanned; on paper the scan look gives white paper and dark writing.
  return Promise.all(pages.map(async (p, i) => ({ ...p, id: String(i), clean: kind !== 'photo', quad: await detectScan(p, kind) })));
}

export function Review({
  code,
  field,
  scans,
  request,
  onBack,
  onSaved,
}: {
  code: string;
  field: SessionField;
  scans: ScanFile[];
  request: Request;
  onBack: () => void;
  onSaved: () => void;
}) {
  const rules = effectiveFileRules(field);
  /** Null with a result: a PDF kept as it is, nothing to crop. */
  const [pages, setPages] = useState<Page[] | null>(null);
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<Prepared | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [making, setMaking] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const made = useRef(0);

  useEffect(() => {
    (async () => {
      const only = scans.length === 1 ? scans[0] : null;
      if (only?.pdf && rules.formats.includes('pdf')) {
        const file = await only.handle!.getFile();
        const drawn = await drawPdfPages(new Uint8Array(await file.arrayBuffer()), undefined, 1);
        if (typeof drawn !== 'string') {
          const first: Page = { id: '0', file: drawn.images[0]!, rotate: 0, crop: null };
          setPreview(await pagePreview(first, 900));
          setResultImage(await pagePreview(first, 500));
        }
        setResult(await checkPickedPdf(file, rules));
        setMaking(false);
        return;
      }
      setPages(await loadPages(scans, rules.kind));
    })().catch((e) => {
      setFailed((e as Error).message || "This scan can't be opened. Scan it again.");
      setMaking(false);
    });
    // The scans and the field are fixed for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The file is made again after each change; a slower older run can't replace a newer one.
  useEffect(() => {
    if (!pages) return;
    const run = ++made.current;
    setMaking(true);
    (async () => {
      const prepared = await preparePages(pages, rules);
      const image = await pagePreview(pages[at]!, 500);
      if (run !== made.current) return;
      setResult(prepared);
      setResultImage(image);
      setFailed(null);
      setMaking(false);
    })().catch((e) => {
      console.warn('could not make the file', e);
      if (run !== made.current) return;
      setResult(null);
      setFailed("This scan can't be opened. Scan it again.");
      setMaking(false);
    });
    // `rules` follows `field`, fixed for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, at]);

  const page = pages?.[at] ?? null;
  const rotate = page?.rotate;
  useEffect(() => {
    if (!page) return;
    let stale = false;
    rotatedPreview(page, 900).then((url) => !stale && setPreview(url), () => null);
    return () => {
      stale = true;
    };
    // Only the turn changes this picture, not the corners or the scan look.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, rotate, page?.id]);

  const change = (patch: Partial<Page>) => setPages((list) => list!.map((p, i) => (i === at ? { ...p, ...patch } : p)));

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      await putScan({
        id: scanId(code, field.field_key),
        session_code: code,
        field_key: field.field_key,
        name: uploadFileName([field.label, scans[0]!.name, field.field_key], result.format),
        mime: result.file.type,
        bytes: result.file.size,
        pages: result.pages,
        status: 'ready',
        reason: null,
        created_at: Date.now(),
        blob: result.file,
      });
      await markUsed(scans.map((s) => s.key));
      await request({ type: 'SCAN_SAVED' });
      onSaved();
    } catch (e) {
      console.warn('could not save the scan', e);
      setFailed("Couldn't save this scan. Close some other Chrome tabs and try again.");
      setSaving(false);
    }
  }

  return (
    <>
      <Header title={field.label} sub={`The website asks for ${describeFileRules(rules)}`} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-2.5 p-3.5">
          {pages && pages.length > 1 && (
            <div className="flex gap-1.5" role="tablist" aria-label="Pages">
              {pages.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={i === at}
                  onClick={() => setAt(i)}
                  className={cx('min-h-8 flex-1 rounded-md border text-[13px]', i === at ? 'border-brand bg-accent-bg font-semibold text-accent-ink' : 'border-line bg-card')}
                >
                  Page {i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
            <div className="grid content-start gap-1.5">
              <PaneTitle>Your scan</PaneTitle>
              <div className="grid place-items-center overflow-hidden rounded-lg border border-line bg-subtle p-2">
                {!preview ? (
                  <Loader2 size={18} className="my-16 animate-spin text-muted" />
                ) : page ? (
                  <Corners key={`${page.id}:${page.rotate}`} image={preview} quad={page.quad ?? null} onChange={(quad) => change({ quad })} />
                ) : (
                  <img src={preview} alt="The scan" className="max-h-[420px] max-w-full" />
                )}
              </div>
              {page && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button className="min-h-8 px-2.5 text-[13px]" onClick={() => change({ rotate: ((page.rotate + 90) % 360) as Page['rotate'], quad: page.quad ? rotateQuad(page.quad) : null })}>
                    <RotateCw size={15} /> Turn
                  </Button>
                  <Button className="min-h-8 px-2.5 text-[13px]" onClick={async () => change({ quad: await detectScan(page, rules.kind) })}>
                    Reset corners
                  </Button>
                  <Button className="min-h-8 px-2.5 text-[13px]" disabled={!page.quad} onClick={() => change({ quad: null })}>
                    Whole page
                  </Button>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input type="checkbox" className="size-4 accent-brand" checked={!!page.clean} onChange={(e) => change({ clean: e.target.checked })} /> Scan look
                  </label>
                </div>
              )}
            </div>
            <div className="grid content-start gap-1.5">
              <PaneTitle>Result</PaneTitle>
              <div className="relative grid min-h-24 place-items-center rounded-lg border border-line bg-subtle p-3">
                {resultImage && <img src={resultImage} alt="The file as it will go to the website" className={cx('max-w-full shadow-md', making && 'opacity-50')} />}
                {making && <Loader2 size={18} className="absolute animate-spin text-muted" />}
              </div>
              {result && !making && <Checks result={result} maxKb={rules.max_kb} straightened={!!pages?.some((p) => p.quad)} />}
            </div>
          </div>
          {failed && (
            <Banner tone="danger" icon={<AlertTriangle size={16} />}>
              {failed}
            </Banner>
          )}
          {result?.problem && !making && (
            <Banner tone="danger" icon={<AlertTriangle size={16} />}>
              {result.problem} Crop closer, or scan it again in black and white.
            </Banner>
          )}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-line bg-card px-3.5 py-2.5">
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" loading={saving} disabled={making || !result || !!result.problem} onClick={save}>
          Save to form
        </Button>
      </footer>
    </>
  );
}

const PaneTitle = ({ children }: { children: string }) => <h2 className="text-[11px] font-bold tracking-wider text-muted uppercase">{children}</h2>;

function Checks({ result, maxKb, straightened }: { result: Prepared; maxKb: number | null; straightened: boolean }) {
  const lines = [
    result.format === 'pdf' ? `PDF, ${result.pages === 1 ? '1 page' : `${result.pages} pages`}` : result.format.toUpperCase(),
    maxKb ? `${formatSize(result.file.size)}, limit ${formatSize(maxKb * 1024)}` : formatSize(result.file.size),
    ...(straightened ? ['Cropped and straightened'] : []),
  ];
  if (result.problem) return null;
  return (
    <ul className="grid gap-0.5 text-[13px] text-live-ink tabular-nums">
      {lines.map((line) => (
        <li key={line} className="flex items-center gap-1.5">
          <Check size={14} className="shrink-0" /> {line}
        </li>
      ))}
    </ul>
  );
}

/** The scan with its four corners to drag. No corners saved: the whole page, until one is moved. */
function Corners({ image, quad, onChange }: { image: string; quad: Quad | null; onChange: (quad: Quad) => void }) {
  const box = useRef<HTMLDivElement>(null);
  /** While dragging; the file is made again when the corner is let go. */
  const [dragged, setDragged] = useState<Quad | null>(null);
  const q = dragged ?? quad ?? WHOLE;

  const onMove = (i: number, e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = box.current!.getBoundingClientRect();
    setDragged(moveCorner(q, i, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
  };

  return (
    <div ref={box} className="relative touch-none select-none">
      <img src={image} alt="The scan" draggable={false} className="block max-h-[420px] max-w-full" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        <polygon points={q.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(30,78,156,.1)" stroke="var(--vf-brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {q.map((p, i) => (
        <span
          key={i}
          role="slider"
          tabIndex={-1}
          aria-label={`Corner ${i + 1}`}
          aria-valuenow={Math.round(p.x * 100)}
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-brand bg-card active:cursor-grabbing"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={(e) => onMove(i, e)}
          onPointerUp={() => {
            if (dragged) onChange(dragged);
            setDragged(null);
          }}
        />
      ))}
    </div>
  );
}
