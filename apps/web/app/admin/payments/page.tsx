import { PaymentsAdmin } from './payments-admin';

export const metadata = { title: 'Payments · Voice form filler' };

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

/** `?from&to` (YYYY-MM-DD): the dates to open with, e.g. from Billing's "Manage in Payments". */
export default async function PaymentsPage({ searchParams }: Props) {
  const { from, to } = await searchParams;
  return <PaymentsAdmin from={from} to={to} />;
}
