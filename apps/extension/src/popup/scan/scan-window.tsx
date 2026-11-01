import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Folder, Loader2, Printer, RefreshCw, X } from 'lucide-react';
import { describeFileRules, effectiveFileRules, maxPagesOf, type SessionField } from '@vff/shared';
import { pagePreview } from '@vff/shared/ui/files/convert';
import { drawPdfPages } from '@vff/shared/ui/files/pdf-shrink';
import type { ExtState, PopupRequest, PopupResponse, ScanInfo } from '../../messages';
import { usedScans } from '../../scans-db';
import { Banner, Button, cx, Header, HeaderChip, Pill } from '../ui';
import { connectFolder, listScans, loadFolder, readFolder, reconnectFolder, type DirHandle, type FolderState, type Listing, type ScanFile } from './folder';
import { Review } from './review';

/**
 * Fetch from scan: the operator picks scans from the scanner's folder and assigns them to the form's
 * upload fields. A window of its own, for one form: a popup would close when the scanner's app or the
 * page is clicked. The folder is read only while this window is open.
 */

const POLL_MS = 15_000;
/** Enough for a scan that just finished writing to show as settled on the first read. */
const SETTLE_MS = 1_500;

type Request = (req: PopupRequest) => Promise<PopupResponse>;
type Thumb = { url: string | null; pages: number };

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function useFolder() {
  const [folder, setFolder] = useState<FolderState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadFolder().then(setFolder, () => setFolder({ status: 'none' }));
  }, []);
  const connect = useCallback(async () => {
    setError(null);
    try {
      const next = await connectFolder();
      if (next) setFolder(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const reconnect = useCallback(async (dir: DirHandle) => {
    setError(null);
    try {
      setFolder(await reconnectFolder(dir));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  return { folder, setFolder, error, connect, reconnect };
}

/** Reads the folder while it is connected: at once, then every 15 s. */
function useListing(dir: DirHandle | null, older: boolean, lost: () => void) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [reading, setReading] = useState(false);
  const sizes = useRef(new Map<string, number>());

  const look = useCallback(async () => {
    if (!dir) return;
    if ((await dir.queryPermission({ mode: 'read' })) !== 'granted') return lost();
    const files = await readFolder(dir);
    setListing(listScans(files, sizes.current, { now: Date.now(), older }));
    sizes.current = new Map(files.map((f) => [f.path, f.size]));
  }, [dir, older, lost]);

  /** Two looks close together, so a finished scan shows now and not at the next poll. */
  const refresh = useCallback(async () => {
    setReading(true);
    try {
      await look();
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      await look();
    } catch (e) {
      console.warn('could not read the scan folder', e);
      lost();
    } finally {
      setReading(false);
    }
  }, [look, lost]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => look().catch(lost), POLL_MS);
    return () => clearInterval(t);
  }, [refresh, look, lost]);

  return { listing, reading, refresh };
}

/** Thumbnails, made one at a time: scans are large, and there may be thirty. */
function useThumbs(scans: ScanFile[]) {
  const [thumbs, setThumbs] = useState<Record<string, Thumb>>({});
  const made = useRef(new Set<string>());
  useEffect(() => {
    let stopped = false;
    (async () => {
      for (const scan of scans) {
        if (stopped) return;
        if (made.current.has(scan.key) || !scan.handle) continue;
        made.current.add(scan.key);
        const thumb = await makeThumb(scan).catch((): Thumb => ({ url: null, pages: 1 }));
        setThumbs((t) => ({ ...t, [scan.key]: thumb }));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [scans]);
  return thumbs;
}

async function makeThumb(scan: ScanFile): Promise<Thumb> {
  const file = await scan.handle!.getFile();
  if (!scan.pdf) return { url: await pagePreview({ id: scan.key, file, rotate: 0, crop: null }), pages: 1 };
  const drawn = await drawPdfPages(new Uint8Array(await file.arrayBuffer()), undefined, 1);
  if (typeof drawn === 'string') return { url: null, pages: 1 };
  return { url: await pagePreview({ id: scan.key, file: drawn.images[0], rotate: 0, crop: null }), pages: drawn.total };
}

export function ScanWindow({ state, request }: { state: ExtState | null; request: Request }) {
  const snap = state?.session?.snapshot;
  return (
    <main className="flex h-screen flex-col bg-page text-ink">
      {!state ? (
        <>
          <Header title="Fetch from scan" />
          <p className="flex items-center gap-2 p-3.5 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </p>
        </>
      ) : !state.auth || !snap || !state.session ? (
        <>
          <Header title="Fetch from scan" />
          <div className="grid gap-2.5 p-3.5">
            <Banner tone="warn" icon={<AlertTriangle size={16} />}>
              This form has ended, so its scans are no longer available.
            </Banner>
            <Button className="w-full" onClick={() => window.close()}>
              Close
            </Button>
          </div>
        </>
      ) : (
        <ScanScreen key={state.session.session_code} code={state.session.session_code} formName={snap.session.form_name} fields={snap.fields.filter((f) => f.field_type === 'file' && !(snap.session.hidden_fields ?? []).includes(f.field_key))} saved={state.scans} request={request} />
      )}
    </main>
  );
}

function ScanScreen({ code, formName, fields, saved, request }: { code: string; formName: string; fields: SessionField[]; saved: ScanInfo[]; request: Request }) {
  const { folder, setFolder, error, connect, reconnect } = useFolder();
  const [older, setOlder] = useState(false);
  /** Selected scans, in the order they were clicked: the order of the PDF's pages. */
  const [picked, setPicked] = useState<string[]>([]);
  const [review, setReview] = useState<{ field: SessionField; scans: ScanFile[] } | null>(null);
  const [used, setUsed] = useState(new Set<string>());
  const [notice, setNotice] = useState<string | null>(null);

  const dir = folder.status === 'connected' ? folder.dir : null;
  const lost = useCallback(() => setFolder((f) => (f.status === 'connected' ? { status: 'reconnect', dir: f.dir } : f)), [setFolder]);
  const { listing, reading, refresh } = useListing(dir, older, lost);
  const scans = listing?.scans ?? [];
  const thumbs = useThumbs(scans);
  useEffect(() => {
    usedScans().then(setUsed, () => null);
  }, [review]);

  const selected = picked.map((k) => scans.find((s) => s.key === k)).filter((s): s is ScanFile => !!s);
  const pageCount = selected.reduce((n, s) => n + (thumbs[s.key]?.pages ?? 1), 0);
  const sub = [formName, fields.length === 1 ? '1 upload field' : `${fields.length} upload fields`].join(' · ');

  if (review) {
    return (
      <Review
        code={code}
        field={review.field}
        scans={review.scans}
        request={request}
        onBack={() => setReview(null)}
        onSaved={() => {
          setNotice(`Saved for ${review.field.label}. Click Fill form in Voice2Fill to put it in the page.`);
          setPicked([]);
          setReview(null);
        }}
      />
    );
  }

  return (
    <>
      <Header title="Fetch from scan" sub={formName}>
        <HeaderChip>{fields.length === 1 ? '1 upload field' : `${fields.length} upload fields`}</HeaderChip>
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-label={sub}>
        <div className="grid gap-2.5 p-3.5">
          {error && <Banner tone="danger">{error}</Banner>}
          {folder.status === 'none' && <ConnectCard onConnect={connect} />}
          {(folder.status === 'connected' || folder.status === 'reconnect') && (
            <FolderBar folder={folder} reading={reading} onRefresh={refresh} onChange={connect} onReconnect={() => reconnect(folder.dir)} />
          )}
          {folder.status === 'connected' && (
            <>
              {notice && (
                <Banner tone="live" icon={<Check size={16} />}>
                  {notice}
                </Banner>
              )}
              {!!listing?.tiff && (
                <Banner tone="warn" icon={<AlertTriangle size={16} />}>
                  <b className="font-semibold">{listing.tiff === 1 ? '1 TIFF file' : `${listing.tiff} TIFF files`} can't be opened.</b> Set your scanner to save as JPG or PDF, then scan again.
                </Banner>
              )}
              <h2 className="flex items-baseline justify-between gap-2 text-[11px] font-bold tracking-wider text-muted uppercase">
                New scans
                <span className="text-xs font-medium tracking-normal normal-case">
                  {listing?.settling ? `${listing.settling === 1 ? '1 scan' : `${listing.settling} scans`} still saving · ` : ''}
                  {older ? 'All recent' : 'Last hour'}
                </span>
              </h2>
              {listing && !scans.length && !listing.settling && <EmptyCard />}
              {scans.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
                  {scans.map((s) => (
                    <ScanCard
                      key={s.key}
                      scan={s}
                      thumb={thumbs[s.key]}
                      order={picked.indexOf(s.key)}
                      used={used.has(s.key)}
                      onClick={() => {
                        setNotice(null);
                        setPicked((p) => (p.includes(s.key) ? p.filter((k) => k !== s.key) : [...p, s.key]));
                      }}
                    />
                  ))}
                </div>
              )}
              <FieldPicker
                fields={fields}
                saved={saved}
                selected={selected.length}
                pages={pageCount}
                onPick={(field) => setReview({ field, scans: selected })}
                onRemove={(field) => request({ type: 'SCAN_REMOVE', field_key: field.field_key })}
              />
            </>
          )}
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-card px-3.5 py-2.5 text-xs text-muted">
        <span>Scans stay on this computer until the form ends.</span>
        {folder.status === 'connected' && (
          <button type="button" className="font-medium text-accent-ink underline underline-offset-2" onClick={() => setOlder(!older)}>
            {older ? 'Show the last hour only' : 'Show older scans'}
          </button>
        )}
      </footer>
    </>
  );
}

function ConnectCard({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="mx-auto grid w-full max-w-[360px] gap-3 py-8 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-lg bg-brand text-brand-ink">
        <Folder size={22} />
      </span>
      <div className="grid gap-1">
        <h2 className="text-[15px] font-bold">Connect your scan folder</h2>
        <p className="text-[13.5px] text-muted">Choose the folder your scanner saves to. Use one just for scans, such as D:\Scans.</p>
      </div>
      <Button variant="primary" className="w-full" onClick={onConnect}>
        <Folder size={16} /> Connect scan folder
      </Button>
    </div>
  );
}

function FolderBar({
  folder,
  reading,
  onRefresh,
  onChange,
  onReconnect,
}: {
  folder: Extract<FolderState, { dir: DirHandle }>;
  reading: boolean;
  onRefresh: () => void;
  onChange: () => void;
  onReconnect: () => void;
}) {
  const on = folder.status === 'connected';
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card py-1.5 pr-2 pl-2.5 text-[13.5px]">
        <span className={cx('inline-flex items-center gap-1.5 font-semibold', on ? 'text-live-ink' : 'text-danger-ink')}>
          <span className={cx('size-[7px] rounded-full', on ? 'bg-live-dot' : 'bg-danger')} />
          {on ? 'Connected' : 'Needs reconnect'}
        </span>
        <Folder size={16} className="shrink-0" />
        <b className="min-w-0 truncate font-semibold">{folder.dir.name}</b>
        <span className="min-w-3 flex-1" />
        {on && (
          <>
            <Button className="min-h-8 px-2.5 text-[13px]" disabled={reading} onClick={onRefresh}>
              <RefreshCw size={15} className={reading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button className="min-h-8 px-2.5 text-[13px]" onClick={onChange}>
              Change folder
            </Button>
          </>
        )}
      </div>
      {!on && (
        <div className="grid gap-1.5">
          <Button variant="primary" className="w-full" onClick={onReconnect}>
            Reconnect folder
          </Button>
          <p className="text-xs text-muted">
            Choose <b className="font-semibold">Allow</b> when Chrome asks.
          </p>
        </div>
      )}
    </>
  );
}

function EmptyCard() {
  return (
    <div className="grid justify-items-center gap-1 rounded-lg border border-dashed border-line bg-card p-5 text-center">
      <Printer size={26} className="text-muted" />
      <b className="font-semibold">Scan the document</b>
      <span className="text-[13.5px] text-muted">It appears here in a few seconds.</span>
    </div>
  );
}

function ScanCard({ scan, thumb, order, used, onClick }: { scan: ScanFile; thumb: Thumb | undefined; order: number; used: boolean; onClick: () => void }) {
  const on = order >= 0;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={scan.path}
      className={cx(
        'relative grid overflow-hidden rounded-lg border bg-card text-left hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink',
        on ? 'border-brand ring-2 ring-brand' : 'border-line',
        used && !on && 'opacity-60',
      )}
    >
      <span className="grid aspect-[7/8] place-items-center overflow-hidden border-b border-row-line bg-subtle">
        {!thumb ? (
          <Loader2 size={18} className="animate-spin text-muted" />
        ) : thumb.url ? (
          <img src={thumb.url} alt="" className="size-full object-cover object-top" />
        ) : (
          <span className="p-2 text-center text-xs text-muted">Can't open this file</span>
        )}
      </span>
      <span className="grid px-[7px] py-1 text-xs leading-tight">
        <b className="font-semibold tabular-nums">{clock(scan.modified)}</b>
        <span className="break-all text-muted">{scan.name}</span>
      </span>
      {on && <span className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-brand text-[13px] font-bold text-brand-ink">{order + 1}</span>}
      <span className="absolute top-1.5 right-1.5 flex gap-1">
        {!!thumb && thumb.pages > 1 && <Pill>{thumb.pages} pages</Pill>}
        {used && <Pill tone="live">Used</Pill>}
      </span>
    </button>
  );
}

/** The form's upload fields with their rules. A field the selection doesn't fit can't be chosen: an image holds one page. */
function FieldPicker({
  fields,
  saved,
  selected,
  pages,
  onPick,
  onRemove,
}: {
  fields: SessionField[];
  saved: ScanInfo[];
  selected: number;
  pages: number;
  onPick: (field: SessionField) => void;
  onRemove: (field: SessionField) => void;
}) {
  if (!fields.length) return <Banner tone="warn">This page of the form has no upload fields.</Banner>;
  return (
    <section className="grid gap-1.5 border-t border-line pt-2.5">
      <p className="font-semibold">{!selected ? 'Select a scan.' : `${selected === 1 ? '1 scan' : `${selected} scans`} selected. Use for which field?`}</p>
      {fields.map((f) => {
        const rules = effectiveFileRules(f);
        const max = maxPagesOf(rules);
        const tooMany = pages > max;
        const scan = saved.find((s) => s.field_key === f.field_key);
        return (
          <div key={f.id} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!selected || tooMany}
              onClick={() => onPick(f)}
              className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1 text-left enabled:hover:border-brand enabled:hover:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted"
            >
              <span className="min-w-0 flex-1">
                <b className="font-semibold break-words">
                  {f.label}
                  {f.required && <span className="text-danger-ink"> *</span>}
                </b>
                <small className="block text-xs text-muted tabular-nums">{describeFileRules(rules)}</small>
              </span>
              {scan && <Pill tone={scan.status === 'refused' ? 'warn' : 'live'}>{scan.status === 'refused' ? 'Refused' : 'Saved'}</Pill>}
              {selected > 0 && tooMany && <Pill>{max === 1 ? 'Takes 1 scan' : `Up to ${max} pages`}</Pill>}
            </button>
            {/* Once in the page it stays there: a new scan replaces it on the next Fill form. */}
            {scan && scan.status !== 'filled' && (
              <button
                type="button"
                aria-label={`Remove the scan saved for ${f.label}`}
                title="Remove this scan"
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent-ink"
                onClick={() => onRemove(f)}
              >
                <X size={15} />
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
