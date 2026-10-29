import type { PaymentMethod } from '@vff/shared';

/** How a payment was made, for the admin's selects. */
export const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'upi', label: 'UPI' },
  { id: 'bank', label: 'Bank transfer' },
  { id: 'cash', label: 'Cash' },
  { id: 'other', label: 'Other' },
];

/** 'razorpay' is allowed in the table but not offered for new payments. */
export const methodLabel = (m: string) => METHODS.find((x) => x.id === m)?.label ?? (m === 'razorpay' ? 'Razorpay' : m);
