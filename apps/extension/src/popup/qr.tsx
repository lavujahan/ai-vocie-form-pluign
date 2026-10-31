import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Clock, Copy } from 'lucide-react';
import { Button, cx } from './ui';

function useCountdown(until: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return { left, text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

/** The same link as the QR code, for a customer who can't scan it (not at the counter any more). */
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid justify-items-center gap-1 pt-1">
      <Button
        className="min-h-8 px-3 text-[13px]"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
      </Button>
      <p className="text-center text-xs text-muted">Send this only to this customer. It works once, for 10 minutes.</p>
    </div>
  );
}

/** The QR code with its countdown; `expired` is shown in its place once it runs out. */
export function QrBlock({
  url,
  expiresAt,
  hint,
  expired,
  copyLink = false,
  large = false,
}: {
  url: string;
  expiresAt: string;
  hint: React.ReactNode;
  expired: React.ReactNode;
  copyLink?: boolean;
  /** For a window turned to the customers, to scan from a step away. */
  large?: boolean;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const { left, text } = useCountdown(expiresAt);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setQr);
  }, [url]);
  if (left <= 0) return <>{expired}</>;
  const size = large ? 'size-64' : 'size-44';
  return (
    <div className="grid justify-items-center gap-1.5 py-1">
      {qr ? <img src={qr} alt="QR code to open on your phone" className={cx(size, 'rounded-lg bg-white p-1.5')} /> : <div className={size} />}
      <p className="text-center text-[13.5px] text-ink">{hint}</p>
      <p className="flex items-center gap-1 text-xs text-muted tabular-nums">
        <Clock size={12} /> Expires in {text}
      </p>
      {copyLink && <CopyLink url={url} />}
    </div>
  );
}
