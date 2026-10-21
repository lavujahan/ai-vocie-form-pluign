import Link from 'next/link';
import { Mic } from 'lucide-react';
import { Card } from '@/components/ui';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <Mic size={18} /> Voice form filler
        </h1>
        <p className="mt-2 text-sm text-muted">
          Open a form on your computer, click the extension and scan its QR code with your phone to fill the form by voice.
        </p>
        <Link href="/admin" className="mt-4 inline-block text-sm text-accent-ink underline underline-offset-2">
          Admin panel
        </Link>
      </Card>
    </main>
  );
}
