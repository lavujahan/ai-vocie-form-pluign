/**
 * Creates (or promotes) an admin user.
 *   pnpm seed:admin --phone 9876543210 --pin 482915 --name "Admin"
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from apps/web/.env.local.
 */
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { Phone, Pin } from '@vff/shared';

const { values } = parseArgs({
  options: { phone: { type: 'string' }, pin: { type: 'string' }, name: { type: 'string', default: 'Admin' } },
});

const phone = Phone.safeParse(values.phone);
const pin = Pin.safeParse(values.pin);
if (!phone.success || !pin.success) {
  console.error('Usage: pnpm seed:admin --phone <6-15 digits> --pin <6 digits> [--name "Admin"]');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const { error } = await db.from('users').upsert(
  {
    phone: phone.data,
    name: values.name,
    pin_hash: await bcrypt.hash(pin.data, 10),
    role: 'admin',
    is_active: true,
    failed_attempts: 0,
    locked_until: null,
  },
  { onConflict: 'phone' },
);
if (error) {
  console.error('Failed:', error.message);
  process.exit(1);
}
console.log(`Admin ${values.name} (${phone.data}) is ready. Sign in at /admin/login.`);
