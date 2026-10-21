import { VoiceSession } from './voice-session';

export const metadata = { title: 'Fill by voice', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <VoiceSession code={code} />;
}
