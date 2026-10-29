import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AlertTriangle, Check, Clock, Loader2, Pencil, Smartphone } from 'lucide-react';
import { formatSize, LOCK_MINUTES, MAX_PIN_ATTEMPTS, PIN_LENGTH, type AccountResponse, type FieldFile, type SessionField } from '@vff/shared';
import { NOT_ON_PAGE, type ActiveSession, type ExtState, type PopupRequest, type PopupResponse, type StateMessage } from '../messages';
import { ACCOUNT_URL, PRIVACY_URL } from '../env';
import { groupFields, type FieldGroup, type FieldItem } from './groups';
import { Banner, Button, FieldRow, FoldedGroup, GroupCard, Header, HeaderChip, Input, Menu, Pill, Progress, Screen } from './ui';

/** State of the form session in the tab this popup was opened on (each tab has its own). */
function useExtState() {
  const [state, setState] = useState<ExtState | null>(null);
  const tabId = useRef<number | undefined>(undefined);
  /** The tab's site, known before a tap: Chrome only shows its permission prompt straight from a click. */
  const site = useRef<string | null>(null);
  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let closed = false;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (closed) return;
      tabId.current = tab?.id;
      try {
        const u = new URL(tab?.url ?? '');
        site.current = /^https?:$/.test(u.protocol) ? u.origin : null;
      } catch {
        site.current = null;
      }
      port = chrome.runtime.connect({ name: `popup:${tab?.id ?? ''}` });
      port.onMessage.addListener((m: StateMessage) => m.type === 'STATE' && setState(m.state));
    });
    return () => {
      closed = true;
      port?.disconnect();
    };
  }, []);

  /**
   * Sends a request; resolves to an error message or null. Scanning first asks Chrome for this one site
   * (once; already-allowed sites don't ask), so the form's next pages fill too. Saying No still scans this page.
   */
  const send = async (req: PopupRequest): Promise<string | null> => {
    if (req.type === 'START_SESSION' && site.current) {
      await chrome.permissions.request({ origins: [`${site.current}/*`] }).catch(() => false);
    }
    const res = (await chrome.runtime.sendMessage({ ...req, tab_id: tabId.current })) as PopupResponse;
    setState(res.state);
    return res.ok ? null : res.error;
  };
  // Read at render: the first STATE arrives after the tab (and so the site) is known.
  return { state, send, site: site.current };
}

/** "forms.example.in" from an origin or URL (as it is, if it isn't one). */
const hostOf = (url: string | null | undefined) => {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
/** The header's second line: the parts that are set, joined with " · ". */
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** Voice on for this form (false: typing only). The snapshot has the latest; before it loads, the scan's choice. */
const voiceOn = (s: ActiveSession) => (s.snapshot?.session.voice_enabled ?? s.voice_enabled) !== false;
/** No voice minutes left on an active plan (typing-only forms still work). */
const noMinutes = (a: AccountResponse | null) => !!a && !a.unlimited && !!a.plan?.plan_id && a.plan.minutes_left <= 0;

/** "✎ Typing only" in the header of a typing-only form. */
const TypingChip = () => (
  <HeaderChip title="The customer types every answer. No mic on the phone.">
    <Pencil size={11} /> Typing only
  </HeaderChip>
);

/** The operator's last choice, kept for the next scan. */
const TYPING_KEY = 'vf-typing-only';

export function App() {
  const { state, send, site } = useExtState();

  const polling = !!state?.session && !state.live;
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => send({ type: 'GET_STATE' }), 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  // The minutes chip moves while the user speaks: re-read the plan every 30 s while the popup is open.
  const signedIn = !!state?.auth;
  useEffect(() => {
    if (!signedIn) return;
    const t = setInterval(() => send({ type: 'GET_ACCOUNT' }), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const others =
    state?.auth && state.otherSessions > 0
      ? state.otherSessions === 1
        ? '1 other form open'
        : `${state.otherSessions} other forms open`
      : null;

  let body: React.ReactNode;
  if (!state) {
    body = (
      <Screen header={<Header />}>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </p>
      </Screen>
    );
  } else if (!state.auth) {
    body = <SignIn send={send} />;
  } else if (!state.session) {
    body = <StartCard state={state} send={send} site={site} others={others} />;
  } else if (!state.session.snapshot || (state.session.snapshot.session.status === 'waiting' && !state.session.reconnect)) {
    body = <QrCard state={state} send={send} others={others} />;
  } else {
    body = <PairedCard state={state} send={send} others={others} />;
  }
  return <main className="bg-page text-ink">{body}</main>;
}

type Send = (req: PopupRequest) => Promise<string | null>;

function SignIn({ send }: { send: Send }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen header={<Header sub="Fill web forms by speaking on your phone" />}>
      <form
        className="grid gap-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(await send({ type: 'LOGIN', phone, pin }));
          setBusy(false);
        }}
      >
        <label className="grid gap-1 text-xs text-muted">
          Phone number
          <Input
            inputMode="numeric"
            placeholder="9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
            autoFocus
          />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          PIN
          <Input
            type="password"
            inputMode="numeric"
            placeholder={`${PIN_LENGTH}-digit PIN`}
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
          />
        </label>
        <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={phone.length < 6 || pin.length !== PIN_LENGTH}>
          Sign in
        </Button>
        <p className={error ? 'text-xs text-danger-ink' : 'text-xs text-muted'}>
          {error ?? `Locks for ${LOCK_MINUTES} min after ${MAX_PIN_ATTEMPTS} failed tries.`}
        </p>
      </form>
      {ACCOUNT_URL && (
        <p className="text-xs text-muted">
          No account yet?{' '}
          <a href={ACCOUNT_URL} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">
            Get one
          </a>
        </p>
      )}
      {/* Chrome Web Store: data use must be disclosed in the product, before collection, and agreed to by an action. */}
      <p className="border-t border-line pt-3 text-xs text-muted">
        When you scan a form, its page address and fields are sent to Voice2Fill. Your spoken answers are turned
        into text by Sarvam AI and OpenAI and deleted within about an hour. By signing in you agree to this.{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">
          Privacy policy
        </a>
      </p>
    </Screen>
  );
}

function StartCard({ state, send, site, others }: { state: ExtState; send: Send; site: string | null; others: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingOnly, setTypingOnly] = useState(false);
  useEffect(() => {
    chrome.storage.local.get(TYPING_KEY).then((r) => setTypingOnly(r[TYPING_KEY] === true), () => null);
  }, []);
  const steps = ['Scan the form', 'Pair your phone', typingOnly ? 'Customer types answers' : 'Speak the answers', 'Click Fill form'];
  return (
    <Screen
      header={
        <Header sub={join(`Signed in as ${state.auth?.user.name}`, others)}>
          <MinutesChip account={state.account} />
        </Header>
      }
      footer={
        <>
          <span className="flex-1" />
          <Menu items={[{ label: 'Sign out', onSelect: () => send({ type: 'LOGOUT' }) }]} />
        </>
      }
    >
      {site && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2 text-[13px]">
          <span className="text-muted">This page</span>
          <span className="min-w-0 truncate font-medium">{hostOf(site)}</span>
        </p>
      )}
      <Button
        variant="primary"
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(await send({ type: 'START_SESSION', voice: !typingOnly }));
          setBusy(false);
        }}
      >
        Scan form on this page
      </Button>
      <label
        className={`flex cursor-pointer items-start gap-2.5 rounded-lg border bg-card p-2.5 ${typingOnly ? 'border-brand ring-1 ring-brand' : 'border-line'}`}
      >
        <input
          type="checkbox"
          className="mt-0.5 size-[18px] shrink-0 accent-brand"
          checked={typingOnly}
          onChange={(e) => {
            setTypingOnly(e.target.checked);
            void chrome.storage.local.set({ [TYPING_KEY]: e.target.checked });
          }}
        />
        <span className="grid gap-0.5">
          <span className="text-[13.5px] font-semibold">Typing only (no voice)</span>
          <span className="text-xs text-muted">The customer types every answer. No mic on the phone, no voice minutes used.</span>
        </span>
      </label>
      {/* A plan refusal is already explained by the plan note. */}
      {error && !planBlocked(state.account) && <p className="text-xs text-danger-ink">{error}</p>}
      <ol className="grid grid-cols-2 gap-1.5">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-accent-bg text-[11px] font-semibold text-accent-ink">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      {state.account && <PlanMeter account={state.account} />}
    </Screen>
  );
}

const DAY_MS = 86_400_000;
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

/** Why the plan doesn't allow scanning or speaking (null = it does, or plans don't apply). */
function planBlocked(a: AccountResponse | null): string | null {
  if (!a || a.unlimited) return null;
  const p = a.plan;
  if (!p?.plan_id) return 'Your account has no active plan.';
  if (!p.active) return `Your ${p.plan_name} plan ended on ${shortDate(p.ends_at)}.`;
  if (p.minutes_left <= 0) return `You have used all ${p.minutes_total} voice minutes of your ${p.plan_name} plan.`;
  return null;
}

type Plan = NonNullable<AccountResponse['plan']>;
const minutesUsed = (p: Plan) => Math.min(p.minutes_total, Math.max(0, p.minutes_used));
const usedPct = (p: Plan) => (p.minutes_total > 0 ? Math.round((minutesUsed(p) / p.minutes_total) * 100) : 100);
/** Most minutes used, or the paid time about to end: shown in amber, with Renew. */
const isLow = (p: Plan) => usedPct(p) >= 80 || (!!p.paid_until && Date.parse(p.paid_until) - Date.now() < 3 * DAY_MS);

/** Voice minutes left, in the header: amber when low, red when the plan doesn't allow speaking. */
function MinutesChip({ account }: { account: AccountResponse | null }) {
  if (!account || account.unlimited) return null;
  const p = account.plan;
  if (!p?.plan_id) return <HeaderChip tone="danger">No plan</HeaderChip>;
  if (!p.active) return <HeaderChip tone="danger">Plan ended</HeaderChip>;
  const left = Math.max(0, Math.floor(p.minutes_left));
  return (
    <HeaderChip tone={left <= 0 ? 'danger' : isLow(p) ? 'warn' : 'plain'} title={`${p.plan_name} plan · voice minutes left`}>
      {left} min
    </HeaderChip>
  );
}

/** The plan and its voice minutes, used of allowed with a bar, or why scanning is refused with a Renew link. */
function PlanMeter({ account }: { account: AccountResponse }) {
  const blocked = planBlocked(account);
  if (blocked) {
    return (
      <Banner tone="danger">
        {blocked}{' '}
        {ACCOUNT_URL ? (
          <a href={ACCOUNT_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            Renew
          </a>
        ) : (
          'Contact us to renew.'
        )}
      </Banner>
    );
  }
  const p = account.plan;
  if (account.unlimited || !p) {
    return account.forms_completed ? (
      <div className="rounded-lg border border-line bg-card p-2.5">
        <FormsDone account={account} />
      </div>
    ) : null;
  }
  const used = minutesUsed(p);
  const pct = usedPct(p);
  const low = isLow(p);
  return (
    <div className="grid gap-1.5 rounded-lg border border-line bg-card p-2.5 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className={low ? 'text-warn-ink' : 'text-muted'}>
          {p.plan_name} plan · till {shortDate(p.paid_until)}
          {low && ACCOUNT_URL && (
            <>
              {' · '}
              <a href={ACCOUNT_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Renew
              </a>
            </>
          )}
        </span>
        <span className={`shrink-0 tabular-nums ${low ? 'font-medium text-warn-ink' : 'text-muted'}`}>
          <b className="font-semibold text-ink">{Math.floor(used)}</b> / {p.minutes_total} min · {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Voice minutes used"
        aria-valuemin={0}
        aria-valuemax={p.minutes_total}
        aria-valuenow={Math.floor(used)}
        className="h-1.5 overflow-hidden rounded-full bg-track"
      >
        <div className={`h-full rounded-full ${low ? 'bg-warn-ink' : 'bg-accent-ink'}`} style={{ width: `${pct}%` }} />
      </div>
      <FormsDone account={account} />
    </div>
  );
}

/** Forms the computer filled (at most 2 fields left empty): this plan period (30 days without a plan) and in total. */
function FormsDone({ account }: { account: AccountResponse }) {
  const f = account.forms_completed;
  if (!f) return null;
  const period = account.plan && !account.unlimited ? 'this plan' : 'in 30 days';
  return (
    <p className="text-xs text-muted">
      Forms completed: <span className="font-semibold text-ink tabular-nums">{f.period}</span> {period} ·{' '}
      <span className="tabular-nums">{f.total}</span> total
    </p>
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
    <div className="grid justify-items-center gap-1.5 py-1">
      {qr ? <img src={qr} alt="QR code to open on your phone" className="size-44 rounded-lg bg-white p-1.5" /> : <div className="size-44" />}
      <p className="text-center text-[13.5px] text-ink">{hint}</p>
      <p className="flex items-center gap-1 text-xs text-muted tabular-nums">
        <Clock size={12} /> Expires in {text}
      </p>
    </div>
  );
}

function QrCard({ state, send, others }: { state: ExtState; send: Send; others: string | null }) {
  const s = state.session!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = s.snapshot?.session.form_name || s.form_name;

  return (
    <Screen
      header={
        <Header sub={join(name, hostOf(s.page_site), others)}>
          {!voiceOn(s) && <TypingChip />}
          <HeaderChip>{s.field_count} fields</HeaderChip>
        </Header>
      }
      footer={
        <>
          <span className="flex-1 text-xs text-muted">Waiting for your phone…</span>
          <Button onClick={() => send({ type: 'END_SESSION' })}>Cancel</Button>
        </>
      }
    >
      <QrBlock
        url={s.qr_url}
        expiresAt={s.expires_at}
        hint="Scan with your phone camera"
        expired={
          <div className="grid justify-items-center gap-2 py-4 text-center">
            <p className="text-sm text-muted">This QR code has expired.</p>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                // A new QR for the same form, with the same voice choice.
                setError(await send({ type: 'START_SESSION', voice: voiceOn(s) }));
                setBusy(false);
              }}
            >
              Regenerate
            </Button>
            {/* e.g. the plan ended meanwhile */}
            {planBlocked(state.account) ? (
              <PlanMeter account={state.account!} />
            ) : (
              error && <p className="text-xs text-danger-ink">{error}</p>
            )}
          </div>
        }
      />
      {s.site_access === false && /^https?:/.test(s.page_site) && (
        <Banner tone="warn" icon={<AlertTriangle size={16} />}>
          Allow access to this site when you scan, so the next pages of the form fill too. This page works now.
        </Banner>
      )}
    </Screen>
  );
}

function displayValue(f: SessionField, v: string) {
  if (f.field_type === 'checkbox' && !f.multiple) return v === 'true' ? 'Yes' : v === 'false' ? 'No' : v;
  return v;
}

/** The state icon at the start of a row: ✓ filled, ⚠ needs a look. */
const ICON: Partial<Record<FieldGroup, React.ReactNode>> = {
  filled: <Check size={16} className="text-live-ink" aria-label="Filled" />,
  look: <AlertTriangle size={16} className="text-warn-ink" aria-label="Needs a look" />,
};

function PairedCard({ state, send, others }: { state: ExtState; send: Send; others: string | null }) {
  const s = state.session!;
  const snap = s.snapshot!;
  const [busy, setBusy] = useState<'fill' | 'undo' | 'reconnect' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The QR code is shown again ("Connect phone again") and no phone has scanned it yet. */
  const waiting = snap.session.status === 'waiting';

  const groups = useMemo(() => groupFields(snap, state.lastFill?.skipped, state.uploadClicks), [snap, state.lastFill, state.uploadClicks]);
  const processingKeys = useMemo(
    () => new Set(snap.utterances.filter((u) => u.status === 'processing' && u.target_field_key).map((u) => u.target_field_key!)),
    [snap.utterances],
  );
  const processing = snap.utterances.filter((u) => u.status === 'processing').length;
  const hasValues = snap.values.some((v) => v.value) || (snap.files ?? []).some((f) => f.status === 'uploaded');
  const fresh = state.unfilledChanges ?? 0;
  const voice = voiceOn(s);

  async function act(type: 'FILL' | 'UNDO' | 'RECONNECT') {
    setBusy(type === 'FILL' ? 'fill' : type === 'UNDO' ? 'undo' : 'reconnect');
    setError(await send({ type }));
    setBusy(null);
  }

  // One status line: the most important thing that happened, and what to do about it.
  let banner: React.ReactNode = null;
  if (error) banner = <Banner tone="danger">{error}</Banner>;
  else if (state.notice) banner = <Banner tone="accent" icon={<Smartphone size={16} />}>{state.notice}</Banner>;
  else if (fresh) {
    // The page only changes on "Fill form": newer answers wait here until then.
    banner = (
      <Banner tone="accent" icon={<Smartphone size={16} />}>
        <b className="font-semibold">{fresh === 1 ? '1 new answer' : `${fresh} new answers`}</b> from the phone. Click Fill form to add them.
      </Banner>
    );
  } else if (snap.session.status === 'filled') {
    banner = (
      <Banner tone="live" icon={<Check size={16} />}>
        Your phone marked the form as done.
      </Banner>
    );
  }

  const row = ({ field: f, value: v, file, reason, needsClick, low }: FieldItem, group: FieldGroup) => {
    if (f.field_type === 'file') return <FileRow key={f.id} field={f} file={file} needsClick={needsClick} group={group} />;
    let content: React.ReactNode;
    if (processingKeys.has(f.field_key)) content = <Loader2 size={14} className="inline animate-spin text-muted" />;
    else if (v?.value)
      content = low ? (
        <span className="inline-flex items-center gap-1.5">
          {displayValue(f, v.value)} <Pill tone="warn">Check</Pill>
        </span>
      ) : (
        displayValue(f, v.value)
      );
    else if (f.required && group === 'look') content = <Pill tone="warn">Missing</Pill>;
    else if (f.required && group !== 'hidden') content = <Pill>Required</Pill>;
    else content = <span className="font-normal text-muted">—</span>;
    return (
      <FieldRow
        key={f.id}
        icon={ICON[group]}
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
  };

  return (
    <Screen
      header={
        <Header sub={join(snap.session.form_name, hostOf(s.page_site), others)}>
          {!voice && <TypingChip />}
          {processing > 0 && (
            <HeaderChip title="Recordings being read">
              <Loader2 size={11} className="animate-spin" /> {processing}
            </HeaderChip>
          )}
          <HeaderChip>
            <span className={`size-[7px] rounded-full ${state.live ? 'bg-live-dot' : 'bg-header-ink/40'}`} />
            {state.live ? 'Live' : 'Reconnecting'}
          </HeaderChip>
          <MinutesChip account={state.account} />
        </Header>
      }
      footer={
        <>
          <Button variant="primary" className="flex-1" loading={busy === 'fill'} disabled={!hasValues} onClick={() => act('FILL')}>
            Fill form
            {fresh > 0 && <span className="rounded-full bg-page/20 px-1.5 text-xs font-semibold tabular-nums">{fresh} new</span>}
          </Button>
          <Button loading={busy === 'undo'} disabled={!state.canUndo} onClick={() => act('UNDO')}>
            Undo
          </Button>
          <Menu
            items={[
              {
                label: 'New form',
                confirm: { text: 'End this form? The phone stops sending.', action: 'End form' },
                onSelect: () => send({ type: 'END_SESSION' }),
              },
              voice
                ? { label: 'Turn voice off', onSelect: () => send({ type: 'SET_VOICE', voice: false }) }
                : {
                    label: 'Turn voice on',
                    // Without minutes the phone's recordings would be refused anyway.
                    ...(noMinutes(state.account) && {
                      confirm: { text: 'No voice minutes left: recordings will be refused until you renew. Turn voice on anyway?', action: 'Turn on' },
                    }),
                    onSelect: () => send({ type: 'SET_VOICE', voice: true }),
                  },
              // The phone page was closed (back button, tab closed): same form, answers kept.
              ...(waiting ? [] : [{ label: 'Connect phone again', onSelect: () => act('RECONNECT') }]),
              { label: 'Sign out', last: true, onSelect: () => send({ type: 'LOGOUT' }) },
            ]}
          />
        </>
      }
    >
      {waiting && (
        <div className="rounded-lg border border-line bg-card p-2">
          <QrBlock
            url={s.qr_url}
            expiresAt={s.expires_at}
            hint="Scan with your phone. Answers so far are kept."
            expired={
              <div className="grid justify-items-center gap-2 py-2 text-center">
                <p className="text-sm text-muted">This QR code has expired.</p>
                <Button loading={busy === 'reconnect'} onClick={() => act('RECONNECT')}>
                  Show QR again
                </Button>
              </div>
            }
          />
        </div>
      )}
      {planBlocked(state.account) && <PlanMeter account={state.account!} />}
      <Progress done={groups.filledCount} total={groups.total} label="filled" />
      {banner}
      {groups.look.length > 0 && (
        <GroupCard title="Needs a look" count={groups.look.length} tone="warn">
          {groups.look.map((it) => row(it, 'look'))}
        </GroupCard>
      )}
      {groups.filled.length > 0 && (
        <GroupCard title="Filled" count={groups.filled.length}>
          {groups.filled.map((it) => row(it, 'filled'))}
        </GroupCard>
      )}
      {groups.todo.length > 0 && (
        <GroupCard title="Not answered yet" count={groups.todo.length}>
          {groups.todo.map((it) => row(it, 'todo'))}
        </GroupCard>
      )}
      {groups.hidden.length > 0 && (
        // The other branch of the form: kept with its answers, filled again if the choice comes back.
        <FoldedGroup title={`Not on the form now (${groups.hidden.length})`} hint="A choice on the page hides these fields. Their answers are kept.">
          {groups.hidden.map((it) => row(it, 'hidden'))}
        </FoldedGroup>
      )}
    </Screen>
  );
}

/** An upload field: waiting for the phone, received, in the page (maybe needing the page's Upload button), or refused. */
function FileRow({ field, file, needsClick, group }: { field: SessionField; file: FieldFile | undefined; needsClick: boolean; group: FieldGroup }) {
  let content: React.ReactNode;
  let sub: React.ReactNode;
  if (!file) {
    content = field.required ? (
      <Pill tone={group === 'look' ? 'warn' : 'neutral'}>From phone</Pill>
    ) : (
      <span className="font-normal text-muted">Waiting for phone</span>
    );
  } else if (file.status === 'rejected') {
    content = <Pill tone="warn">Refused</Pill>;
    sub = <span className="text-danger-ink">Refused by the site: {file.reason ?? 'check its size / type rules'}</span>;
  } else if (file.status === 'filled') {
    content = formatSize(file.bytes);
    if (needsClick) sub = <span className="text-accent-ink">Click “Upload” next to this field on the page</span>;
  } else content = <span className="font-normal text-muted">Received · {formatSize(file.bytes)}</span>;
  return (
    <FieldRow icon={ICON[group]} label={field.label} sub={sub}>
      {content}
    </FieldRow>
  );
}
