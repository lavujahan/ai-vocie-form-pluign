import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ClipboardList, Clock, Loader2, Mic, Smartphone } from 'lucide-react';
import { formatSize, LOCK_MINUTES, LOW_CONFIDENCE, MAX_PIN_ATTEMPTS, type FieldFile, type SessionField } from '@vff/shared';
import { NOT_ON_PAGE, type ExtState, type PopupRequest, type PopupResponse, type StateMessage } from '../messages';
import { PRIVACY_URL } from '../env';
import { Button, Card, FieldRow, Input, LinkButton, Pill } from './ui';

/** State of the form session in the tab this popup was opened on (each tab has its own). */
function useExtState() {
  const [state, setState] = useState<ExtState | null>(null);
  const tabId = useRef<number | undefined>(undefined);
  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let closed = false;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (closed) return;
      tabId.current = tab?.id;
      port = chrome.runtime.connect({ name: `popup:${tab?.id ?? ''}` });
      port.onMessage.addListener((m: StateMessage) => m.type === 'STATE' && setState(m.state));
    });
    return () => {
      closed = true;
      port?.disconnect();
    };
  }, []);

  /** Sends a request; resolves to an error message or null. */
  const send = async (req: PopupRequest): Promise<string | null> => {
    const res = (await chrome.runtime.sendMessage({ ...req, tab_id: tabId.current })) as PopupResponse;
    setState(res.state);
    return res.ok ? null : res.error;
  };
  return { state, send };
}

export function App() {
  const { state, send } = useExtState();

  const polling = !!state?.session && !state.live;
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => send({ type: 'GET_STATE' }), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  let body: React.ReactNode;
  if (!state) {
    body = (
      <Card className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </Card>
    );
  } else if (!state.auth) {
    body = <SignIn send={send} />;
  } else if (!state.session) {
    body = <StartCard state={state} send={send} />;
  } else if (!state.session.snapshot || (state.session.snapshot.session.status === 'waiting' && !state.session.reconnect)) {
    body = <QrCard state={state} send={send} />;
  } else {
    body = <PairedCard state={state} send={send} />;
  }
  return (
    <main className="bg-page p-3">
      {body}
      {!!state?.auth && state.otherSessions > 0 && (
        <p className="mt-2 text-center text-xs text-muted">
          {state.otherSessions === 1 ? '1 other tab has' : `${state.otherSessions} other tabs have`} a form in progress
        </p>
      )}
    </main>
  );
}

type Send = (req: PopupRequest) => Promise<string | null>;

function SignIn({ send }: { send: Send }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <h1 className="flex items-center gap-2 text-sm font-semibold">
        <Mic size={16} /> Voice2Fill
      </h1>
      <p className="mt-1.5 text-sm text-muted">Sign in with the account your admin created.</p>
      <form
        className="mt-3 space-y-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(await send({ type: 'LOGIN', phone, pin }));
          setBusy(false);
        }}
      >
        <Input
          inputMode="numeric"
          placeholder="9876543210"
          aria-label="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
          autoFocus
        />
        <Input
          type="password"
          inputMode="numeric"
          placeholder="5-digit PIN"
          aria-label="PIN"
          maxLength={5}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
        />
        <Button type="submit" className="w-full" loading={busy} disabled={phone.length < 6 || pin.length !== 5}>
          Sign in
        </Button>
        <p className={error ? 'text-xs text-danger-ink' : 'text-xs text-muted'}>
          {error ?? `Locks for ${LOCK_MINUTES} min after ${MAX_PIN_ATTEMPTS} failed tries.`}
        </p>
      </form>
      {/* Chrome Web Store: data use must be disclosed in the product, before collection, and agreed to by an action. */}
      <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
        When you scan a form, its page address and fields are sent to Voice2Fill. Your spoken answers are turned
        into text by Sarvam AI and OpenAI and deleted within about an hour. By signing in you agree to this.{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">
          Privacy policy
        </a>
      </p>
    </Card>
  );
}

function StartCard({ state, send }: { state: ExtState; send: Send }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <h1 className="flex items-center gap-2 text-sm font-semibold">
        <Mic size={16} /> Voice2Fill
      </h1>
      <p className="mt-1.5 text-sm text-muted">Open the page with the form, then scan it to pair your phone.</p>
      <Button
        className="mt-3 w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(await send({ type: 'START_SESSION' }));
          setBusy(false);
        }}
      >
        Scan form on this page
      </Button>
      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>Signed in as {state.auth?.user.name}</span>
        <LinkButton onClick={() => send({ type: 'LOGOUT' })}>Sign out</LinkButton>
      </div>
    </Card>
  );
}

function useCountdown(until: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

/** The QR code with its countdown; `expired` is shown in its place once it runs out. */
function QrBlock({ url, expiresAt, hint, expired }: { url: string; expiresAt: string; hint: string; expired: React.ReactNode }) {
  const [qr, setQr] = useState<string | null>(null);
  const { left, text } = useCountdown(expiresAt);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setQr);
  }, [url]);
  if (left <= 0) return <>{expired}</>;
  return (
    <>
      <div className="mt-3 grid place-items-center">
        {qr ? <img src={qr} alt="QR code to open on your phone" className="size-44 rounded-md bg-white p-1" /> : <div className="size-44" />}
      </div>
      <p className="mt-2 text-center text-sm text-ink/80">{hint}</p>
      <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted">
        <Clock size={12} /> Expires in {text}
      </p>
    </>
  );
}

function QrCard({ state, send }: { state: ExtState; send: Send }) {
  const s = state.session!;
  const [busy, setBusy] = useState(false);
  const name = s.snapshot?.session.form_name || s.form_name;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h1 className="flex items-start gap-2 text-sm font-semibold">
          <ClipboardList size={16} className="mt-0.5 shrink-0" /> {name}
        </h1>
        <Pill tone="accent">{s.field_count} fields</Pill>
      </div>
      <QrBlock
        url={s.qr_url}
        expiresAt={s.expires_at}
        hint="Scan with your phone"
        expired={
          <div className="mt-4 text-center">
            <p className="text-sm text-muted">This QR code has expired.</p>
            <Button
              className="mt-3"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                await send({ type: 'START_SESSION' });
                setBusy(false);
              }}
            >
              Regenerate
            </Button>
          </div>
        }
      />
      <div className="mt-3 text-center">
        <LinkButton onClick={() => send({ type: 'END_SESSION' })}>Cancel</LinkButton>
      </div>
    </Card>
  );
}

function displayValue(f: SessionField, v: string) {
  if (f.field_type === 'checkbox' && !f.multiple) return v === 'true' ? 'Yes' : v === 'false' ? 'No' : v;
  return v;
}

function PairedCard({ state, send }: { state: ExtState; send: Send }) {
  const s = state.session!;
  const snap = s.snapshot!;
  const [busy, setBusy] = useState<'fill' | 'undo' | 'reconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The QR code is shown again ("Connect phone again") and no phone has scanned it yet. */
  const waiting = snap.session.status === 'waiting';

  const valueOf = useMemo(() => new Map(snap.values.map((v) => [v.field_id, v])), [snap.values]);
  const fileOf = useMemo(() => new Map((snap.files ?? []).map((f) => [f.field_id, f])), [snap.files]);
  const processingKeys = useMemo(
    () => new Set(snap.utterances.filter((u) => u.status === 'processing' && u.target_field_key).map((u) => u.target_field_key!)),
    [snap.utterances],
  );
  const processing = snap.utterances.filter((u) => u.status === 'processing').length;
  const skipped = new Map((state.lastFill?.skipped ?? []).map((x) => [x.field_key, x.reason]));
  const hasValues = snap.values.some((v) => v.value) || (snap.files ?? []).some((f) => f.status === 'uploaded');

  async function act(type: 'FILL' | 'UNDO' | 'RECONNECT') {
    setBusy(type === 'FILL' ? 'fill' : type === 'UNDO' ? 'undo' : 'reconnect');
    setError(await send({ type }));
    setBusy(null);
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone size={16} /> {waiting ? 'Connect your phone' : 'Phone paired'}
        </h1>
        <div className="flex items-center gap-1.5">
          {processing > 0 && (
            <Pill>
              <Loader2 size={11} className="animate-spin" /> {processing}
            </Pill>
          )}
          {state.live ? <Pill tone="live">Live</Pill> : <Pill>Reconnecting</Pill>}
        </div>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{snap.session.form_name}</p>

      {waiting && (
        <div className="mt-1 border-b border-line pb-3">
          <QrBlock
            url={s.qr_url}
            expiresAt={s.expires_at}
            hint="Scan with your phone. Answers so far are kept."
            expired={
              <div className="mt-3 text-center">
                <p className="text-sm text-muted">This QR code has expired.</p>
                <Button className="mt-2" loading={busy === 'reconnect'} onClick={() => act('RECONNECT')}>
                  Show QR again
                </Button>
              </div>
            }
          />
        </div>
      )}

      <div className="mt-2 max-h-72 overflow-y-auto">
        {snap.fields.map((f) => {
          if (f.field_type === 'file') {
            return <FileRow key={f.id} field={f} file={fileOf.get(f.id)} needsClick={state.uploadClicks.includes(f.field_key)} />;
          }
          const v = valueOf.get(f.id);
          const reason = skipped.get(f.field_key);
          let content: React.ReactNode;
          if (processingKeys.has(f.field_key)) content = <Loader2 size={14} className="inline animate-spin text-muted" />;
          else if (v?.value)
            content =
              (v.confidence ?? 1) < LOW_CONFIDENCE ? (
                <span className="inline-flex items-center gap-1.5">
                  {displayValue(f, v.value)} <Pill tone="warn">Check</Pill>
                </span>
              ) : (
                displayValue(f, v.value)
              );
          else if (f.required) content = <Pill tone="warn">Missing</Pill>;
          else content = <span className="text-muted">—</span>;
          return (
            <FieldRow
              key={f.id}
              label={f.label}
              sub={
                !reason ? undefined : reason === NOT_ON_PAGE ? (
                  // Fills by itself when the field appears (next step, or shown by another answer).
                  <span className="text-muted">{reason}</span>
                ) : (
                  <span className="text-danger-ink">Not filled: {reason}</span>
                )
              }
            >
              {content}
            </FieldRow>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <Button className="flex-1" loading={busy === 'fill'} disabled={!hasValues} onClick={() => act('FILL')}>
          {state.unfilledChanges ? `Fill form (${state.unfilledChanges} new)` : 'Fill form'}
        </Button>
        <Button loading={busy === 'undo'} disabled={!state.canUndo} onClick={() => act('UNDO')}>
          Undo
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger-ink">{error}</p>}
      {state.notice && !error && <p className="mt-2 text-xs text-accent-ink">{state.notice}</p>}
      {!!state.unfilledChanges && !error && (
        // The page only changes on "Fill form": newer answers wait here until then.
        <p className="mt-2 text-xs text-accent-ink">
          {state.unfilledChanges === 1 ? '1 new answer from the phone' : `${state.unfilledChanges} new answers from the phone`} · not on the page yet
        </p>
      )}
      {snap.session.status === 'filled' && <p className="mt-1 text-xs text-live-ink">Your phone marked the form as done.</p>}
      <div className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1">
        <LinkButton onClick={() => send({ type: 'END_SESSION' })}>New form</LinkButton>
        {/* The phone page was closed (back button, tab closed): same form, answers kept. */}
        {!waiting && <LinkButton onClick={() => act('RECONNECT')}>Connect phone again</LinkButton>}
        <LinkButton onClick={() => send({ type: 'LOGOUT' })}>Sign out</LinkButton>
      </div>
    </Card>
  );
}

/** An upload field: waiting for the phone, received, in the page (maybe needing the page's Upload button), or refused. */
function FileRow({ field, file, needsClick }: { field: SessionField; file: FieldFile | undefined; needsClick: boolean }) {
  let content: React.ReactNode;
  let sub: React.ReactNode;
  if (!file) content = field.required ? <Pill tone="warn">From phone</Pill> : <span className="text-muted">Waiting for phone</span>;
  else if (file.status === 'rejected') {
    content = <Pill tone="warn">Refused</Pill>;
    sub = <span className="text-danger-ink">Refused by the site: {file.reason ?? 'check its size / type rules'}</span>;
  } else if (file.status === 'filled') {
    content = `✓ ${formatSize(file.bytes)}`;
    if (needsClick) sub = <span className="text-accent-ink">Click “Upload” next to this field on the page</span>;
  } else content = <span className="text-muted">Received · {formatSize(file.bytes)}</span>;
  return (
    <FieldRow label={field.label} sub={sub}>
      {content}
    </FieldRow>
  );
}
