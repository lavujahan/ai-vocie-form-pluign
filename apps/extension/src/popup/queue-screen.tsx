import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Pencil } from 'lucide-react';
import type { CreateSessionResponse, LatestForm } from '@vff/shared';
import { TA_FONT } from '@vff/shared/ui/voice-tips';
import type { PopupRequest, PopupResponse } from '../messages';
import { QrBlock } from './qr';
import { Banner, Button, Header, HeaderChip, Screen } from './ui';

/** How often the popup asks whether the QR code on screen was scanned. */
const POLL_MS = 3000;

/**
 * QR for other: a QR code for one customer, as a new form session made from a form the operator scanned
 * before. A QR code works only once, so the popup goes back home when a phone scans it.
 */
export function QueueScreen({
  form,
  voice,
  request,
  chip,
  planNote,
  onBack,
  onScanned,
}: {
  form: LatestForm;
  voice: boolean;
  request: (req: PopupRequest) => Promise<PopupResponse>;
  chip: React.ReactNode;
  /** Why the plan refuses, when it does. */
  planNote: React.ReactNode;
  onBack: () => void;
  /** Stable: a new function would restart the poll. */
  onScanned: () => void;
}) {
  const [qr, setQr] = useState<CreateSessionResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newQr = useCallback(async () => {
    setBusy(true);
    const res = await request({ type: 'QUEUE_QR', source_id: form.source_id, voice });
    if (res.ok && res.qr) {
      setQr(res.qr);
      setError(null);
    } else if (!res.ok) {
      setError(res.error);
    }
    setBusy(false);
  }, [request, form.source_id, voice]);

  // The first QR code as the screen opens (once: React runs effects twice in development).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void newQr();
  }, [newQr]);

  const code = qr?.session_code;
  useEffect(() => {
    if (!code) return;
    const t = setInterval(async () => {
      const res = await request({ type: 'QUEUE_STATUS', session_code: code });
      if (res.ok && res.text && res.text !== 'waiting') onScanned();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [code, request, onScanned]);

  return (
    <Screen
      header={
        <Header sub={[form.form_name, form.page_origin.replace(/^https?:\/\//, '')].join(' · ')}>
          {!voice && (
            <HeaderChip title="The customer types every answer. No mic on the phone.">
              <Pencil size={11} /> Typing only
            </HeaderChip>
          )}
          {chip}
        </Header>
      }
      footer={
        <Button className="flex-1" onClick={onBack}>
          <ChevronLeft size={16} /> Back
        </Button>
      }
    >
      {planNote ?? (error && <Banner tone="danger">{error}</Banner>)}
      {qr && (
        <div className="rounded-lg border border-line bg-card p-2">
          <QrBlock
            url={qr.qr_url}
            expiresAt={qr.expires_at}
            large
            copyLink
            hint={
              <>
                <b className="block text-[15px] font-semibold">Scan with your phone camera</b>
                <span className="text-muted" style={{ fontFamily: TA_FONT }}>
                  உங்கள் போன் கேமராவால் ஸ்கேன் செய்யுங்கள்
                </span>
              </>
            }
            expired={
              <div className="grid justify-items-center gap-2 py-4 text-center">
                <p className="text-sm text-muted">This QR code has expired.</p>
                <Button variant="primary" loading={busy} onClick={newQr}>
                  New QR
                </Button>
              </div>
            }
          />
        </div>
      )}
    </Screen>
  );
}
