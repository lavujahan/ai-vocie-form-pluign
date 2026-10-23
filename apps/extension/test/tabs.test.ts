import { describe, expect, it } from 'vitest';
import { assertRoom, changesSince, endTab, MAX_TABS, mergeFill, migrate, otherSessions, patchTab, startTab, tabOfSession, watermarkOf, type Tabs } from '../src/background/tabs';
import { siteOf, type ActiveSession } from '../src/messages';

const session = (tab_id: number, id = `s${tab_id}`): ActiveSession => ({
  session_id: id,
  session_code: `code-${id}`,
  qr_url: `https://app.example/s/code-${id}`,
  expires_at: '2030-01-01T00:00:00Z',
  form_name: 'CAN registration',
  tab_id,
  field_count: 16,
  page_site: 'https://tnedistrict.tn.gov.in',
  snapshot: null,
});

describe('one form session per tab', () => {
  it('starting a form in a second tab keeps the first one', () => {
    let tabs: Tabs = {};
    tabs = startTab(tabs, 11, session(11));
    tabs = patchTab(tabs, 11, { filledUpTo: 5, canUndo: true });
    tabs = startTab(tabs, 22, session(22));
    expect(Object.keys(tabs)).toEqual(['11', '22']);
    expect(tabs[11]).toMatchObject({ filledUpTo: 5, canUndo: true, session: { session_id: 's11' } });
    expect(tabs[22]).toMatchObject({ filledUpTo: null, canUndo: false, session: { session_id: 's22' } });
    expect(tabOfSession(tabs, 's22')).toBe(22);
    expect(tabOfSession(tabs, 'nope')).toBeNull();
    expect(otherSessions(tabs, 11)).toBe(1);
    expect(otherSessions(tabs, 33)).toBe(2);
  });

  it('rescanning a tab replaces only that tab, and ending it leaves the others', () => {
    let tabs = startTab(startTab({}, 1, session(1)), 2, session(2));
    tabs = patchTab(tabs, 1, { filledUpTo: 9 });
    tabs = startTab(tabs, 1, session(1, 'fresh'));
    expect(tabs[1]).toMatchObject({ filledUpTo: null, session: { session_id: 'fresh' } });
    expect(tabs[2].session.session_id).toBe('s2');
    tabs = endTab(tabs, 1);
    expect(Object.keys(tabs)).toEqual(['2']);
    // Updating a tab whose session ended is a no-op.
    expect(patchTab(tabs, 1, { filledUpTo: 1 })).toBe(tabs);
  });

  it(`allows at most ${MAX_TABS} forms at once, but always allows rescanning an open one`, () => {
    let tabs: Tabs = {};
    for (let i = 1; i <= MAX_TABS; i++) tabs = startTab(tabs, i, session(i));
    expect(() => assertRoom(tabs, 99)).toThrow(/already open/);
    expect(() => startTab(tabs, 3, session(3, 'again'))).not.toThrow();
  });

  it('reads the older single-session storage shape', () => {
    const old = { auth: null, session: session(7), autoFill: true, lastFill: null, canUndo: true };
    expect(migrate(old).tabs).toEqual({ 7: { session: session(7), filledUpTo: null, lastFill: null, canUndo: true } });
    // Tabs stored with the old auto-fill flag: it is dropped (the page is only filled on "Fill form").
    const stored = { auth: null, tabs: { 3: { session: session(3), autoFill: true, lastFill: null, canUndo: false } } };
    expect(migrate(stored).tabs[3]).toEqual({ session: session(3), filledUpTo: null, lastFill: null, canUndo: false });
    expect(migrate(undefined)).toEqual({ auth: null, tabs: {} });
  });

  it('merges a partial re-fill into the last report', () => {
    const prev = { filled: ['name'], skipped: [{ field_key: 'taluk', reason: 'Not loaded' }] };
    expect(mergeFill(prev, { filled: ['taluk'], skipped: [] })).toEqual({ filled: ['name', 'taluk'], skipped: [] });
  });

  it('compares sites by scheme, host and port', () => {
    expect(siteOf('https://tnedistrict.tn.gov.in/eda/faces/x.xhtml?a=1')).toBe('https://tnedistrict.tn.gov.in');
    expect(siteOf('http://localhost:5174/vanilla.html')).toBe('http://localhost:5174');
    expect(siteOf('file:///C:/forms/a.html')).toBe('file://');
    expect(siteOf('not a url')).toBe('');
  });
});

describe('filling only on "Fill form"', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 23, 8, 0, s)).toISOString();
  const value = (id: string, v: string | null, s: number, seq = 5) => ({ field_id: id, value: v, confidence: 1, source_phrase: null, source_seq: seq, updated_at: at(s) });
  const snap = (values: ReturnType<typeof value>[], files: { id: string; status: 'uploaded' | 'filled'; s: number }[] = [], reset_seq = 0) =>
    ({
      session: { reset_seq },
      fields: [],
      utterances: [],
      values,
      files: files.map((f) => ({ id: f.id, field_id: f.id, file_name: 'x.jpg', mime: 'image/jpeg', bytes: 10, pages: null, status: f.status, reason: null, created_at: at(f.s) })),
    }) as never;

  it('counts nothing before the first Fill form, then only what changed after it', () => {
    const s1 = snap([value('a', 'Murugan', 1), value('b', '18', 2)]);
    expect(changesSince(s1, null)).toBeNull();
    const mark = watermarkOf(s1);
    expect(mark).toBe(Date.parse(at(2)));
    expect(changesSince(s1, mark)).toBe(0);
    const s2 = snap([value('a', 'Murugan', 1), value('b', '19', 5), value('c', 'Black', 6)], [{ id: 'f', status: 'uploaded', s: 7 }]);
    expect(changesSince(s2, mark)).toBe(3); // 2 answers + 1 upload not on the page yet
  });

  it('does not count answers emptied by a Start over, or uploads already filled', () => {
    const s = snap([value('a', null, 9, 4), value('b', 'Erode', 9, 6)], [{ id: 'f', status: 'filled', s: 9 }], 5);
    expect(changesSince(s, Date.parse(at(1)))).toBe(1);
  });
});
