import { NextResponse } from 'next/server';
import { PaymentUpdate, type PaymentRow } from '@vff/shared';
import { requireAdmin } from '@/lib/auth';
import { PAYMENT_COLUMNS, paidAtOn, toPaymentRows } from '@/lib/billing/admin';
import { fail, must, route } from '@/lib/http';
import { db } from '@/lib/supabase-admin';
import { isDate, todayIst } from '@/lib/usage/summary';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Fix a payment's date, amount, method, reference or note. Who paid, and the plan or minutes the
 * payment was for, can't change here: the plan and minutes it gave stay as they are.
 */
export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin(req);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail(404, 'Payment not found');
  const body = PaymentUpdate.parse(await req.json());
  if (!isDate(body.paid_on)) throw fail(400, 'Choose a real date');
  if (body.paid_on > todayIst()) throw fail(400, 'The payment date can’t be in the future');

  const old = must(await db().from('payments').select('paid_at').eq('id', id).maybeSingle()) as { paid_at: string } | null;
  if (!old) throw fail(404, 'Payment not found');
  const { paid_on, ...fields } = body;
  const updated = must(
    await db()
      .from('payments')
      .update({ ...fields, paid_at: paidAtOn(paid_on, old.paid_at) })
      .eq('id', id)
      .select(PAYMENT_COLUMNS)
      .maybeSingle(),
  );
  if (!updated) throw fail(404, 'Payment not found');
  return NextResponse.json({ payment: toPaymentRows([updated])[0] satisfies PaymentRow });
});
