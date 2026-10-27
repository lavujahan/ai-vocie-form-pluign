'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';

const TABS = [
  { href: '/admin', label: 'Users' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/usage', label: 'Usage' },
  { href: '/admin/forms', label: 'Forms' },
];

/** Users · Billing · Plans · Usage · Forms tabs at the top of the admin pages. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Admin">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'rounded-lg px-3 py-1.5 text-lg font-semibold',
              active ? 'text-ink' : 'text-muted hover:bg-subtle hover:text-ink',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
