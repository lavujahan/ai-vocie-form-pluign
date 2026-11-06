import { TamilPad } from './tamil-pad';

export const metadata = { title: 'Tamil typing', robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TamilPad code={code} />;
}
