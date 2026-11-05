import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, Monitor, Pencil, Printer, Smartphone, X } from 'lucide-react';
import {
  COUNTER_LABELS,
  formatSize,
  LOCK_MINUTES,
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  SENT_HOLD_MIN,
  USER_JWT_TTL_HOURS,
  type AccountResponse,
  type DeviceInfo,
  type FieldFile,
  type HeldForm,
  type LatestForm,
  type SessionField,
} from '@vff/shared';
import { NOT_ON_PAGE, type ActiveSession, type ExtState, type PopupRequest, type PopupResponse, type ScanInfo, type StateMessage } from '../messages';
import { ACCOUNT_URL, PRIVACY_URL } from '../env';
import { groupFields, type FieldGroup, type FieldItem } from './groups';
import { QrBlock } from './qr';
import { QueueScreen } from './queue-screen';
import { ScanWindow } from './scan/scan-window';
import { TamilTyping } from './tamil-typing';
import { Banner, Button, FieldRow, FoldedGroup, GroupCard, Header, HeaderChip, Input, Menu, OpenTamilTyping, Pill, Progress, Screen } from './ui';

/**
 * Opened in a window of its own (right-click menu or shortcut, for a site installed as an app, whose
 * window has no toolbar): the tab it is for. Undefined in the toolbar popup.
 */
const WINDOW_TAB = Number(new URLSearchParams(location.search).get('tab')) || undefined;
/** Tamil typing in a window of its own (it has no form, so no tab). */
const TAMIL_WINDOW = new URLSearchParams(location.search).has('tamil');
/** Fetch from scan: a window of its own that stays open beside the form (a popup closes when the page is clicked). */
const SCAN_WINDOW = new URLSearchParams(location.search).has('scan');
if (SCAN_WINDOW) document.documentElement.dataset.window = 'scan';

/** State of the form session in the tab this popup was opened on (each tab has its own). */
function useExtState() {
  const [state, setState] = useState<ExtState | null>(null);
  const tabId = useRef<number | undefined>(undefined);
  /** The tab's site, known before a tap: Chrome only shows its permission prompt straight from a click. */
  const site = useRef<string | null>(null);
  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let closed = false;
    const tabOpenedOn = WINDOW_TAB
      ? chrome.tabs.get(WINDOW_TAB).catch(() => undefined)
      : chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);
    // The form's tab closed: this window has nothing left to fill.
    const onRemoved = (id: number) => id === WINDOW_TAB && window.close();
    if (WINDOW_TAB) chrome.tabs.onRemoved.addListener(onRemoved);
    tabOpenedOn.then((tab) => {
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
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
  }, []);

  /**
   * Sends a request; resolves to an error message or null. Scanning first asks Chrome for this one site
   * (once; already-allowed sites don't ask), so the form's next pages fill too. Saying No still scans this page.
   */
  const request = useCallback(async (req: PopupRequest): Promise<PopupResponse> => {
    if ((req.type === 'START_SESSION' || req.type === 'RESUME_SESSION') && site.current) {
      await chrome.permissions.request({ origins: [`${site.current}/*`] }).catch(() => false);
    }
    const res = (await chrome.runtime.sendMessage({ ...req, tab_id: tabId.current })) as PopupResponse;
    setState(res.state);
    return res;
  }, []);
  const send = async (req: PopupRequest): Promise<string | null> => {
    const res = await request(req);
    return res.ok ? null : res.error;
  };
  // Read at render: the first STATE arrives after the tab (and so the site) is known.
  return { state, send, request, site: site.current };
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
/** The notice about the longer hold of sent answers was closed (shown once, privacy policy section 11). */
const HOLD_NOTICE_KEY = 'vf-hold-notice-seen';

const HOLD_HOURS = SENT_HOLD_MIN / 60;

export function App() {
  const { state, send, request, site } = useExtState();
  /** Tamil typing lives here, above the screens: a form moving on behind it doesn't end a recording. */
  const [tamil, setTamil] = useState<'closed' | 'open' | 'hidden'>(TAMIL_WINDOW ? 'open' : 'closed');
  const openTamil = useCallback(() => setTamil('open'), []);

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

  if (SCAN_WINDOW) return <ScanWindow state={state} request={request} />;

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
    body = <SignIn request={request} notice={state.notice} />;
  } else if (!state.session) {
    body = <StartCard state={state} send={send} request={request} site={site} others={others} />;
  } else if (!state.session.snapshot || (state.session.snapshot.session.status === 'waiting' && !state.session.reconnect)) {
    body = <QrCard state={state} send={send} others={others} />;
  } else {
    body = <PairedCard state={state} send={send} others={others} />;
  }
  const tamilOn = !!state?.auth && tamil !== 'closed';
  return (
    <main className={`relative bg-page text-ink ${TAMIL_WINDOW && state?.auth ? 'h-screen overflow-hidden' : tamil === 'open' && state?.auth ? 'min-h-[560px]' : ''}`}>
      <OpenTamilTyping.Provider value={state?.auth ? openTamil : null}>{TAMIL_WINDOW && state?.auth ? null : body}</OpenTamilTyping.Provider>
      {tamilOn && (
        <TamilTyping
          hidden={tamil === 'hidden'}
          own={TAMIL_WINDOW}
          chip={<MinutesChip account={state.account} />}
          planNote={planBlocked(state.account) ? <PlanMeter account={state.account!} /> : null}
          send={request}
          onClose={() => (TAMIL_WINDOW ? window.close() : setTamil('hidden'))}
        />
      )}
    </main>
  );
}

type Send = (req: PopupRequest) => Promise<string | null>;

/** `notice`: why the server signed this computer out, if it did. */
function SignIn({ request, notice }: { request: (req: PopupRequest) => Promise<PopupResponse>; notice: string | null }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The plan's computers are all signed in: pick one to sign out. */
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);

  async function signIn(replace?: string) {
    setBusy(replace ?? 'form');
    const res = await request({ type: 'LOGIN', phone, pin, ...(replace ? { replace_device_id: replace } : {}) });
    setBusy(null);
    setError(res.ok ? null : res.error);
    setDevices(!res.ok && res.code === 'too_many_computers' ? (res.devices ?? []) : null);
  }

  if (devices) {
    return (
      <Screen header={<Header sub="Fill web forms by speaking on your phone" />}>
        <Banner tone="warn">{error}</Banner>
        <div className="grid divide-y divide-line rounded-lg border border-line bg-card px-3">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center gap-2.5 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-bg text-accent-ink">
                <Monitor size={16} />
              </span>
              <span className="min-w-0 flex-1 text-xs">
                <b className="block text-[13px] font-semibold text-ink">{d.name}</b>
                <span className="text-muted">
                  {join(d.label, `last used ${new Date(d.last_seen_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`)}
                </span>
              </span>
              <Button loading={busy === d.id} disabled={!!busy} onClick={() => signIn(d.id)}>
                Sign out
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          That computer asks for the PIN again at its next step, and its open forms end. A computer not used for {USER_JWT_TTL_HOURS}{' '}
          hours is signed out by itself.
        </p>
        <Button className="w-full" disabled={!!busy} onClick={() => (setDevices(null), setError(null))}>
          Cancel
        </Button>
      </Screen>
    );
  }

  return (
    <Screen header={<Header sub="Fill web forms by speaking on your phone" />}>
      {notice && !error && <Banner tone="warn">{notice}</Banner>}
      <form
        className="grid gap-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          await signIn();
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
        <Button type="submit" variant="primary" className="w-full" loading={busy === 'form'} disabled={phone.length < 6 || pin.length !== PIN_LENGTH}>
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
        into text by Sarvam AI and OpenAI and deleted within about an hour, or about {HOLD_HOURS} hours after your
        customer sends them. With Tamil typing, your voice goes to
        Sarvam AI from this computer's mic and is not stored. By signing in you agree to this.{' '}
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">
          Privacy policy
        </a>
      </p>
    </Screen>
  );
}

function StartCard({
  state,
  send,
  request,
  site,
  others,
}: {
  state: ExtState;
  send: Send;
  request: (req: PopupRequest) => Promise<PopupResponse>;
  site: string | null;
  others: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingOnly, setTypingOnly] = useState(false);
  const [holdNotice, setHoldNotice] = useState(false);
  /** QR for other is open: Latest forms shows, and stays open for the next customer's QR. */
  const [showForms, setShowForms] = useState(false);
  const [loadingForms, setLoadingForms] = useState(false);
  /** QR for this page was pressed: nothing is read until Generate QR. */
  const [askingPage, setAskingPage] = useState(false);
  /** The form whose QR code is on screen. */
  const [qrFor, setQrFor] = useState<LatestForm | null>(null);
  /** The last QR code was scanned: home says so. */
  const [scanned, setScanned] = useState(false);
  const qrScanned = useCallback(() => {
    setQrFor(null);
    setScanned(true);
  }, []);
  const chooseTyping = (on: boolean) => {
    setTypingOnly(on);
    void chrome.storage.local.set({ [TYPING_KEY]: on });
  };
  useEffect(() => {
    chrome.storage.local.get([TYPING_KEY, HOLD_NOTICE_KEY]).then((r) => {
      setTypingOnly(r[TYPING_KEY] === true);
      setHoldNotice(r[HOLD_NOTICE_KEY] !== true);
    }, () => null);
  }, []);
  const waiting = state.held.length > 0;
  const steps = ['QR for this page', 'Pair your phone', typingOnly ? 'Customer types answers' : 'Speak the answers', 'Click Fill form'];
  if (qrFor) {
    return (
      <QueueScreen
        form={qrFor}
        voice={!typingOnly}
        request={request}
        chip={<MinutesChip account={state.account} />}
        planNote={planBlocked(state.account) ? <PlanMeter account={state.account!} /> : null}
        onBack={() => setQrFor(null)}
        onScanned={qrScanned}
      />
    );
  }
  return (
    <Screen
      tips
      header={
        <Header sub={join(`Signed in as ${state.auth?.user.name}`, others)}>
          <MinutesChip account={state.account} />
        </Header>
      }
      footer={
        <>
          {/* The plan and its minutes, beside Sign out; a plan that refuses scanning is a banner above instead. */}
          {state.account && !planBlocked(state.account) ? <PlanMeter account={state.account} inFooter /> : <span className="flex-1" />}
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
      {holdNotice && (
        <Banner tone="accent">
          New: answers your customer has sent are now kept for {HOLD_HOURS} hours, so you can finish a form after a website
          logs you out. Other answers are still deleted within about an hour.{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => {
              setHoldNotice(false);
              void chrome.storage.local.set({ [HOLD_NOTICE_KEY]: true });
            }}
          >
            OK
          </button>
        </Banner>
      )}
      {scanned && (
        <Banner tone="live" icon={<Check size={16} />}>
          QR scanned. The answers appear here once the customer presses Send.
        </Banner>
      )}
      {waiting && <WaitingCard forms={state.held} site={site} send={send} />}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          className={`w-full px-2 whitespace-nowrap ${askingPage ? 'ring-2 ring-brand/40' : ''}`}
          aria-expanded={askingPage}
          onClick={() => {
            setAskingPage(!askingPage);
            setShowForms(false);
          }}
        >
          QR for this page
        </Button>
        <Button
          className={`w-full px-2 whitespace-nowrap ${showForms ? 'border-brand text-accent-ink ring-1 ring-brand' : ''}`}
          aria-expanded={showForms}
          onClick={async () => {
            setShowForms(!showForms);
            setAskingPage(false);
            if (showForms) return;
            // A form scanned moments ago appears now.
            setLoadingForms(true);
            await send({ type: 'GET_LATEST' });
            setLoadingForms(false);
          }}
        >
          QR for other {showForms ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </Button>
      </div>
      {askingPage && (
        <TypingConfirm
          className="rounded-lg border border-line bg-card p-2"
          on={typingOnly}
          onChange={chooseTyping}
          busy={busy}
          onCancel={() => setAskingPage(false)}
          onGenerate={async () => {
            setBusy(true);
            setError(await send({ type: 'START_SESSION', voice: !typingOnly }));
            setBusy(false);
          }}
        />
      )}
      {showForms &&
        (state.latest.length > 0 ? (
          <LatestCard
            forms={state.latest}
            typingOnly={typingOnly}
            onTyping={chooseTyping}
            send={send}
            onPick={(f) => {
              setScanned(false);
              setQrFor(f);
            }}
          />
        ) : loadingForms ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading your forms…
          </p>
        ) : state.latestFailed ? (
          <Banner tone="danger">Couldn't load your forms. Check your connection, then open QR for other again.</Banner>
        ) : (
          <Banner tone="accent">No forms yet. Open a form and press QR for this page once. It then appears here.</Banner>
        ))}
      {/* A plan refusal is already explained by the plan note. */}
      {error && !planBlocked(state.account) && <p className="text-xs text-danger-ink">{error}</p>}
      {!waiting && (
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
      )}
      {planBlocked(state.account) && <PlanMeter account={state.account!} />}
    </Screen>
  );
}

/** Asked before any QR code is made: Typing only or not (kept for the next QR), then Generate QR. */
function TypingConfirm({
  className,
  on,
  onChange,
  busy = false,
  onCancel,
  onGenerate,
}: {
  className: string;
  on: boolean;
  onChange: (on: boolean) => void;
  busy?: boolean;
  onCancel: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border bg-card p-2.5 ${on ? 'border-brand ring-1 ring-brand' : 'border-line'}`}>
        <input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-brand" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className="grid gap-0.5">
          <span className="text-[13.5px] font-semibold">Typing only (no voice)</span>
          <span className="text-xs text-muted">The customer types every answer. No mic on the phone, no voice minutes used.</span>
        </span>
      </label>
      <div className="flex justify-end gap-1.5">
        <Button className="min-h-8 px-2.5 text-[13px]" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" className="min-h-8 px-2.5 text-[13px]" loading={busy} onClick={onGenerate}>
          Generate QR
        </Button>
      </div>
    </div>
  );
}

/**
 * Forms this operator scanned lately, most used first. QR asks about Typing only, then shows a unique QR
 * code for one customer, from any tab: no portal login is needed until the customer's turn. The answers
 * then wait under Customer answers waiting. × takes a form off this operator's list.
 */
function LatestCard({
  forms,
  typingOnly,
  onTyping,
  send,
  onPick,
}: {
  forms: LatestForm[];
  typingOnly: boolean;
  onTyping: (on: boolean) => void;
  send: Send;
  onPick: (form: LatestForm) => void;
}) {
  /** The form whose QR was pressed: nothing is made until Generate QR. */
  const [asking, setAsking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LatestForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(form: LatestForm) {
    setBusy(true);
    setError(await send({ type: 'HIDE_LATEST', source_id: form.source_id }));
    setBusy(false);
    setRemoving(null);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-header-line bg-card">
      <h2 className="flex items-center justify-between gap-2 bg-subtle px-2.5 py-1.5 text-[13px] font-bold">
        Latest forms
        <span className="text-xs font-medium text-muted">One QR per customer</span>
      </h2>
      {forms.map((f) => {
        const open = asking === f.source_id;
        const confirming = removing?.source_id === f.source_id;
        return (
          <Fragment key={f.source_id}>
            <div className={`flex items-center gap-2 border-t border-row-line px-2.5 py-[7px] ${open || confirming ? 'bg-accent-bg' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold break-words">{f.form_name}</p>
                <p className="text-xs text-muted tabular-nums">
                  {hostOf(f.page_origin)} · {f.field_count} fields · {f.uses === 1 ? 'Used once' : `Used ${f.uses} times`}
                </p>
              </div>
              {!open && !confirming && (
                <>
                  <Button
                    className="min-h-8 shrink-0 px-3 text-[13px]"
                    onClick={() => {
                      setRemoving(null);
                      setAsking(f.source_id);
                    }}
                  >
                    QR
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete ${f.form_name}`}
                    title="Delete from this list"
                    className="-ml-1 grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent-ink"
                    onClick={() => {
                      setAsking(null);
                      setRemoving(f);
                    }}
                  >
                    <X size={15} />
                  </button>
                </>
              )}
            </div>
            {open && (
              <TypingConfirm
                className="border-t border-row-line bg-page p-2"
                on={typingOnly}
                onChange={onTyping}
                onCancel={() => setAsking(null)}
                onGenerate={() => onPick(f)}
              />
            )}
            {confirming && (
              <div className="grid gap-2 border-t border-row-line bg-page p-2">
                <Banner tone="warn">Remove {f.form_name} from your list? Answers already waiting are kept.</Banner>
                <div className="flex justify-end gap-1.5">
                  <Button className="min-h-8 px-2.5 text-[13px]" onClick={() => setRemoving(null)}>
                    Keep
                  </Button>
                  <Button variant="danger" className="min-h-8 px-2.5 text-[13px]" loading={busy} onClick={() => remove(f)}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
      {error && (
        <div className="border-t border-row-line p-2">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
    </section>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
/** "1 h 42 left", "25 min left". */
function timeLeft(until: string) {
  const min = Math.max(1, Math.round((Date.parse(until) - Date.now()) / 60_000));
  return min < 60 ? `${min} min left` : `${Math.floor(min / 60)} h ${min % 60} left`;
}

/**
 * The last forms customers sent, kept for the operator when a website logs out before the form is
 * filled. Use carries one on in this tab; its site must be the form's. × deletes the answers now.
 */
function WaitingCard({ forms, site, send }: { forms: HeldForm[]; site: string | null; send: Send }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<HeldForm | null>(null);

  async function act(type: 'RESUME_SESSION' | 'DISCARD_HELD', code: string) {
    setBusy(code);
    setAsking(null);
    setError(await send({ type, session_code: code }));
    setBusy(null);
  }

  return (
    <section className="overflow-hidden rounded-lg border-2 border-brand bg-card">
      <h2 className="flex items-center justify-between gap-2 bg-accent-bg px-2.5 py-1.5 text-[13px] font-bold text-accent-ink">
        Customer answers waiting
        <span className="min-w-5 rounded-full bg-brand px-1.5 text-center text-xs text-brand-ink tabular-nums">{forms.length}</span>
      </h2>
      {forms.map((f) => {
        const here = !site || f.page_origin === site;
        const name = f.customer ?? 'Customer';
        return (
          <div key={f.session_code} className="flex items-center gap-2 border-t border-row-line px-2.5 py-[7px]">
            <div className={`min-w-0 flex-1 ${here ? '' : 'opacity-65'}`}>
              <p className="flex flex-wrap items-baseline gap-x-1.5 text-[13.5px] font-semibold">
                <span className="min-w-0 break-words">{name}</span>
                {f.phone_last4 && <span className="text-xs font-normal text-muted tabular-nums">•••• {f.phone_last4}</span>}
                {f.filled_at && <Pill>Filled {clock(f.filled_at)}</Pill>}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {f.form_name} · {here ? `Sent ${clock(f.sent_at)} · ${timeLeft(f.hold_until)}` : `Open ${hostOf(f.page_origin)} to use this`}
              </p>
            </div>
            <Button
              variant={here && !f.filled_at ? 'primary' : 'outline'}
              className="min-h-8 shrink-0 px-3 text-[13px]"
              disabled={!here || (!!busy && busy !== f.session_code)}
              loading={busy === f.session_code}
              onClick={() => act('RESUME_SESSION', f.session_code)}
            >
              Use
            </Button>
            <button
              type="button"
              aria-label={`Delete ${name}'s answers`}
              title="Delete these answers"
              className="-ml-1 grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent-ink"
              onClick={() => setAsking(f)}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
      {(asking || error) && (
        <div className="grid gap-2 border-t border-row-line p-2">
          {asking ? (
            <>
              <Banner tone="warn">Delete {asking.customer ?? 'this customer'}'s answers now? This can't be undone.</Banner>
              <div className="flex justify-end gap-1.5">
                <Button className="min-h-8 px-2.5 text-[13px]" onClick={() => setAsking(null)}>
                  Keep
                </Button>
                <Button variant="danger" className="min-h-8 px-2.5 text-[13px]" onClick={() => act('DISCARD_HELD', asking.session_code)}>
                  Delete
                </Button>
              </div>
            </>
          ) : (
            <Banner tone="danger">{error}</Banner>
          )}
        </div>
      )}
    </section>
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
/** The free Trial: its link says Upgrade (to a paid plan) and is always shown; paid plans say Renew. */
const isTrial = (p: Plan | null | undefined) => p?.plan_id === 'trial';
const renewLabel = (p: Plan | null | undefined) => (isTrial(p) ? 'Upgrade' : 'Renew');

/** Voice minutes left, in the header: amber when low, red (and a link to renew) when the plan doesn't allow speaking. */
function MinutesChip({ account }: { account: AccountResponse | null }) {
  if (!account || account.unlimited) return null;
  const p = account.plan;
  const href = ACCOUNT_URL || undefined;
  const title = `${renewLabel(p)} your plan`;
  if (!p?.plan_id) return <HeaderChip tone="danger" href={href} title={title}>No plan</HeaderChip>;
  if (!p.active) return <HeaderChip tone="danger" href={href} title={title}>Plan ended</HeaderChip>;
  const left = Math.max(0, Math.floor(p.minutes_left));
  return (
    <HeaderChip
      tone={left <= 0 ? 'danger' : isLow(p) ? 'warn' : 'plain'}
      href={left <= 0 ? href : undefined}
      title={left <= 0 ? title : `${p.plan_name} plan · voice minutes left`}
    >
      {left} min
    </HeaderChip>
  );
}

/**
 * The plan and its voice minutes, used of allowed with a bar, or why scanning is refused with a Renew link.
 * `inFooter`: no card around it, filling the footer row beside the ⋯ menu.
 */
function PlanMeter({ account, inFooter = false }: { account: AccountResponse; inFooter?: boolean }) {
  const box = inFooter ? 'grid min-w-0 flex-1 gap-1 text-xs' : 'grid gap-1.5 rounded-lg border border-line bg-card p-2.5 text-xs';
  const blocked = planBlocked(account);
  if (blocked) {
    return (
      <Banner tone="danger">
        {blocked}{' '}
        {ACCOUNT_URL ? (
          <a href={ACCOUNT_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            {renewLabel(account.plan)}
          </a>
        ) : (
          `Contact us to ${renewLabel(account.plan).toLowerCase()}.`
        )}
      </Banner>
    );
  }
  const p = account.plan;
  if (account.unlimited || !p) return inFooter ? <span className="flex-1" /> : null;
  const used = minutesUsed(p);
  const pct = usedPct(p);
  const low = isLow(p);
  return (
    <div className={box}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className={low ? 'text-warn-ink' : 'text-muted'}>
          {p.plan_name} plan · till {shortDate(p.paid_until)}
          {(low || isTrial(p)) && ACCOUNT_URL && (
            <>
              {' · '}
              <a href={ACCOUNT_URL} target="_blank" rel="noreferrer" className={`font-medium underline underline-offset-2 ${low ? '' : 'text-accent-ink'}`}>
                {renewLabel(p)}
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
      <CounterLine account={account} />
    </div>
  );
}

/**
 * The plan's other counters this period, e.g. "Documents 61/250 · Voice Form Fill QR 141/400": amber when
 * most is used, red when used up; computers as they are. Counters without a limit are left out.
 */
function CounterLine({ account }: { account: AccountResponse }) {
  const c = account.plan?.counters;
  if (!c) return null;
  type Item = { label: string; used: number; total: number | null; plain?: boolean };
  const all: Item[] = [
    { label: COUNTER_LABELS.documents, ...c.documents },
    { label: COUNTER_LABELS.voice_qrs, ...c.voice_qrs },
    { label: COUNTER_LABELS.nonvoice_qrs, ...c.nonvoice_qrs },
    ...(account.computers_in_use !== undefined ? [{ label: COUNTER_LABELS.computers, used: account.computers_in_use, total: c.computers, plain: true }] : []),
  ];
  const items = all.filter((i): i is Item & { total: number } => i.total !== null);
  if (!items.length) return null;
  return (
    <p className="flex flex-wrap gap-x-2 text-muted">
      {items.map((i) => {
        // Computers: this one is always signed in, so all of them in use is normal.
        const tone = i.plain ? '' : i.used >= i.total ? 'font-medium text-danger-ink' : i.used >= i.total * 0.8 ? 'font-medium text-warn-ink' : '';
        return (
          <span key={i.label} className={`tabular-nums ${tone}`}>
            {i.label} {Math.min(i.used, i.total)}/{i.total}
          </span>
        );
      })}
    </p>
  );
}


function QrCard({ state, send, others }: { state: ExtState; send: Send; others: string | null }) {
  const s = state.session!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = s.snapshot?.session.form_name || s.form_name;

  return (
    <Screen
      tips={voiceOn(s)}
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
                // A new QR for the same form, with the same voice choice (not counted when nobody scanned it).
                setError(await send({ type: 'START_SESSION', voice: voiceOn(s), regenerate: true }));
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

  const groups = useMemo(() => groupFields(snap, state.lastFill?.skipped, state.uploadClicks, state.scans), [snap, state.lastFill, state.uploadClicks, state.scans]);
  const processingKeys = useMemo(
    () => new Set(snap.utterances.filter((u) => u.status === 'processing' && u.target_field_key).map((u) => u.target_field_key!)),
    [snap.utterances],
  );
  const processing = snap.utterances.filter((u) => u.status === 'processing').length;
  const hasValues = snap.values.some((v) => v.value) || (snap.files ?? []).some((f) => f.status === 'uploaded') || state.scans.length > 0;
  const fresh = state.unfilledChanges ?? 0;
  const freshScans = state.scans.filter((x) => x.status === 'ready').length;
  const voice = voiceOn(s);
  const hidden = snap.session.hidden_fields ?? [];
  const uploads = snap.fields.some((f) => f.field_type === 'file' && !hidden.includes(f.field_key));

  async function act(type: 'FILL' | 'UNDO' | 'RECONNECT') {
    setBusy(type === 'FILL' ? 'fill' : type === 'UNDO' ? 'undo' : 'reconnect');
    setError(await send({ type }));
    setBusy(null);
  }

  async function fetchScan() {
    const failed = await send({ type: 'OPEN_SCAN_WINDOW' });
    if (failed) setError(failed);
    else if (!WINDOW_TAB) window.close(); // the toolbar popup; the window now has the operator's attention
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
  } else if (freshScans) {
    banner = (
      <Banner tone="accent" icon={<Printer size={16} />}>
        <b className="font-semibold">{freshScans === 1 ? '1 scan' : `${freshScans} scans`}</b> saved. Click Fill form to add {freshScans === 1 ? 'it' : 'them'}.
      </Banner>
    );
  } else if (snap.session.status === 'filled') {
    banner = (
      <Banner tone="live" icon={<Check size={16} />}>
        Your phone marked the form as done.
      </Banner>
    );
  }

  const row = ({ field: f, value: v, file, scan, reason, needsClick, low }: FieldItem, group: FieldGroup) => {
    if (f.field_type === 'file') return <FileRow key={f.id} field={f} file={file} scan={scan} needsClick={needsClick} group={group} />;
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
      tips={voiceOn(s)}
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
            {fresh + freshScans > 0 && <span className="rounded-full bg-page/20 px-1.5 text-xs font-semibold tabular-nums">{fresh + freshScans} new</span>}
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
            copyLink
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
      {uploads && <FetchScanButton saved={state.scans.length} onClick={fetchScan} />}
      {s.resumed && !waiting && (
        <Button className="w-full" loading={busy === 'reconnect'} onClick={() => act('RECONNECT')}>
          Customer needs to correct
        </Button>
      )}
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

/** Opens the scan window, where the scanner's files are picked for this form's upload fields. */
function FetchScanButton({ saved, onClick }: { saved: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg border-2 border-brand bg-card px-2.5 py-2 text-left hover:bg-accent-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand text-brand-ink">
        <Printer size={16} />
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="text-sm font-bold">Fetch from scan</span>
        <span className="text-xs text-muted">Scans for this form stay on this computer</span>
      </span>
      {saved > 0 && <Pill tone="accent">{saved} saved</Pill>}
    </button>
  );
}

/** An upload field: a scan, or waiting for the phone, received, in the page (maybe needing the page's Upload button), or refused. */
function FileRow({
  field,
  file,
  scan,
  needsClick,
  group,
}: {
  field: SessionField;
  file: FieldFile | undefined;
  scan: ScanInfo | undefined;
  needsClick: boolean;
  group: FieldGroup;
}) {
  let content: React.ReactNode;
  let sub: React.ReactNode;
  if (scan?.status === 'refused') {
    content = <Pill tone="warn">Refused</Pill>;
    sub = <span className="text-danger-ink">Refused by the site: {scan.reason ?? 'check its size / type rules'}</span>;
  } else if (scan) {
    content = (
      <span className="inline-flex items-center gap-1.5">
        {formatSize(scan.bytes)} <Pill tone="accent">Scan</Pill>
      </span>
    );
    if (needsClick) sub = <span className="text-accent-ink">Click “Upload” next to this field on the page</span>;
    else if (scan.pages > 1) sub = `PDF · ${scan.pages} pages`;
  } else if (!file) {
    content = field.required ? (
      <Pill tone={group === 'look' ? 'warn' : 'neutral'}>Phone or scan</Pill>
    ) : (
      <span className="font-normal text-muted">Waiting</span>
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
