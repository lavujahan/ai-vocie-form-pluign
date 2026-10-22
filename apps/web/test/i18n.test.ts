import { describe, expect, it } from 'vitest';
import { cleanTamilLabel } from '@/lib/agents/formAnalyzer';
import { fieldLabelFor, serverText, translate } from '@/lib/i18n';
import { MSG } from '@/lib/session-rules';

describe('phone screens in Tamil', () => {
  it('translates screen text and fills in values', () => {
    expect(translate('en', 'processing', { n: 2 })).toBe('2 processing');
    expect(translate('ta', 'processing', { n: 2 })).toBe('2 செயலாக்கத்தில்');
    expect(translate('ta', 'ackFilled', { filled: 14, total: 16 })).toContain('14/16');
  });

  it('translates known server messages and leaves others as they are', () => {
    expect(serverText('ta', MSG.tabClosed)).toMatch(/^டேப் மூடப்பட்டது/);
    expect(serverText('ta', "Didn't catch any speech. Tap to retry.")).toContain('பேச்சு எதுவும் கேட்கவில்லை');
    expect(serverText('en', MSG.qrUsed)).toBe(MSG.qrUsed);
    expect(serverText('ta', 'Phone must be 10 digits')).toBe('Phone must be 10 digits');
  });

  it('shows the Tamil label next to the English one (which matches the computer screen)', () => {
    const f = { label: "Father's name", label_ta: 'தந்தை பெயர்' };
    expect(fieldLabelFor('ta', f)).toBe("தந்தை பெயர் · Father's name");
    expect(fieldLabelFor('en', f)).toBe("Father's name");
    expect(fieldLabelFor('ta', { label: 'Email', label_ta: null })).toBe('Email');
  });

  it('keeps only a short Tamil label from the analyzer', () => {
    expect(cleanTamilLabel('தந்தை பெயர்')).toBe('தந்தை பெயர்');
    expect(cleanTamilLabel('Father name (தந்தை பெயர்)')).toBe('(தந்தை பெயர்)');
    expect(cleanTamilLabel("Father's name")).toBeNull();
    expect(cleanTamilLabel('')).toBeNull();
    expect(cleanTamilLabel('அ'.repeat(100))!.length).toBe(60);
  });
});
