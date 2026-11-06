import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.PUBLIC_BASE_URL = 'https://app.test';

type Row = Record<string, unknown>;

/** Just enough of the Supabase query builder for the Tamil pad routes, over in-memory tables. */
let ids = 0;
function fakeDb(tables: Record<string, Row[]>) {
  class Query {
    private op: 'select' | 'insert' | 'update' = 'select';
    private payload: Row = {};
    private filters: ((r: Row) => boolean)[] = [];
    private sort: { col: string; asc: boolean } | null = null;
    private max = Infinity;
    private one: 'single' | 'maybe' | null = null;
    constructor(private name: string) {
      tables[name] ??= [];
    }
    select() {
      return this;
    }
    insert(row: Row) {
      this.op = 'insert';
      this.payload = row;
      return this;
    }
    update(patch: Row) {
      this.op = 'update';
      this.payload = patch;
      return this;
    }
    eq(col: string, v: unknown) {
      this.filters.push((r) => r[col] === v);
      return this;
    }
    is(col: string, v: unknown) {
      this.filters.push((r) => (r[col] ?? null) === v);
      return this;
    }
    gt(col: string, v: string) {
      this.filters.push((r) => String(r[col]) > v);
      return this;
    }
    order(col: string, { ascending = true } = {}) {
      this.sort = { col, asc: ascending };
      return this;
    }
    limit(n: number) {
      this.max = n;
      return this;
    }
    single() {
      this.one = 'single';
      return this;
    }
    maybeSingle() {
      this.one = 'maybe';
      return this;
    }
    then<T>(ok: (r: { data: unknown; error: { code?: string; message: string } | null }) => T, bad?: (e: unknown) => T) {
      return Promise.resolve(this.run()).then(ok, bad);
    }
    private run() {
      const rows = tables[this.name];
      let out: Row[];
      if (this.op === 'insert') {
        const now = new Date().toISOString();
        const row: Row =
          this.name === 'tamil_pads'
            ? { id: `pad-${++ids}`, created_at: now, paired_at: null, ended_at: null, last_seen_at: now, ...this.payload }
            : { deleted: false, created_at: now, updated_at: now, audio_ms: 0, ...this.payload };
        const clash =
          this.name === 'tamil_pad_pieces'
            ? rows.some((r) => r.pad_id === row.pad_id && r.seq === row.seq)
            : rows.some((r) => r.code === row.code);
        if (clash) return { data: null, error: { code: '23505', message: 'duplicate' } };
        rows.push(row);
        out = [row];
      } else {
        out = rows.filter((r) => this.filters.every((f) => f(r)));
        if (this.op === 'update') for (const r of out) Object.assign(r, this.payload);
        if (this.sort) {
          const { col, asc } = this.sort;
          out = [...out].sort((a, b) => (Number(a[col]) - Number(b[col])) * (asc ? 1 : -1));
        }
        out = out.slice(0, this.max);
      }
      out = out.map((r) => ({ ...r }));
      if (this.one === 'single' && !out[0]) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: this.one ? (out[0] ?? null) : out, error: null };
    }
  }
  return { from: (name: string) => new Query(name) };
}

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  assertCanUse: vi.fn(),
  recordUse: vi.fn(),
  recordUsage: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({ db: () => fakeDb(mocks.tables) }));
vi.mock('@/lib/billing/plans', () => ({ assertCanUse: mocks.assertCanUse, recordUse: mocks.recordUse }));
vi.mock('@/lib/usage/record', () => ({ recordUsage: mocks.recordUsage }));
vi.mock('@/lib/sarvam/stt', async (original) => ({
  ...(await original<typeof import('@/lib/sarvam/stt')>()),
  transcribe: mocks.transcribe,
}));

const create = await import('@/app/api/tamil-pads/route');
const one = await import('@/app/api/tamil-pads/[code]/route');
const pair = await import('@/app/api/tamil-pads/[code]/pair/route');
const speak = await import('@/app/api/tamil-pads/[code]/dictate/route');
const edit = await import('@/app/api/tamil-pads/[code]/pieces/[seq]/route');
const { signUserJwt } = await import('@/lib/auth');
const { fail } = await import('@/lib/http');

const OWNER = { id: 'u1', name: 'Operator', phone: '9000000001', role: 'user' as const };
const OTHER = { id: 'u2', name: 'Other', phone: '9000000002', role: 'user' as const };
let userToken = '';
let otherToken = '';

const req = (url: string, init: { method?: string; token?: string; json?: unknown; form?: FormData } = {}) =>
  new NextRequest(`https://app.test${url}`, {
    method: init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET'),
    headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
  });
const ctx = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });

async function newPad(query = '') {
  const res = await create.POST(req(`/api/tamil-pads${query}`, { method: 'POST', token: userToken }), undefined);
  return { res, body: await res.json() };
}
async function paired() {
  const { body } = await newPad();
  const res = await pair.POST(req(`/api/tamil-pads/${body.code}/pair`, { method: 'POST' }), ctx({ code: body.code }));
  return { code: body.code as string, pad: body, token: (await res.json()).token as string };
}
function audio(fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array([1, 2])], { type: 'audio/webm' }), 'speech');
  form.append('part', fields.part ?? '0');
  form.append('duration_ms', fields.duration_ms ?? '6000');
  for (const k of ['seq', 'replace']) if (fields[k]) form.append(k, fields[k]);
  return form;
}
const say = (code: string, token: string, fields: Record<string, string> = {}) =>
  speak.POST(req(`/api/tamil-pads/${code}/dictate`, { token, form: audio(fields) }), ctx({ code }));
const patch = (code: string, seq: number, token: string, json: unknown) =>
  edit.PATCH(req(`/api/tamil-pads/${code}/pieces/${seq}`, { method: 'PATCH', token, json }), ctx({ code, seq: String(seq) }));

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.tables = {
    users: [
      { ...OWNER, is_active: true },
      { ...OTHER, is_active: true },
    ],
    tamil_pads: [],
    tamil_pad_pieces: [],
  };
  mocks.assertCanUse.mockResolvedValue(undefined);
  mocks.transcribe.mockResolvedValue('வணக்கம்');
  userToken = (await signUserJwt(OWNER)).token;
  otherToken = (await signUserJwt(OTHER)).token;
});

describe('POST /api/tamil-pads', () => {
  it('makes a QR for the phone page, using no QR counter', async () => {
    const { res, body } = await newPad();
    expect(res.status).toBe(201);
    expect(body.qr_url).toBe(`https://app.test/t/${body.code}`);
    expect(mocks.assertCanUse).toHaveBeenCalledWith('u1', 'user');
    expect(mocks.recordUse).not.toHaveBeenCalled();
  });

  it('gives no QR when the plan has no minutes left', async () => {
    mocks.assertCanUse.mockRejectedValue(fail(402, 'Used up', { code: 'quota_exceeded' }));
    const { res, body } = await newPad();
    expect(res.status).toBe(402);
    expect(body.code).toBe('quota_exceeded');
    expect(mocks.tables.tamil_pads).toHaveLength(0);
  });

  it('ends the QR it replaces', async () => {
    const first = (await newPad()).body;
    await newPad(`?end=${first.code}`);
    expect(mocks.tables.tamil_pads.find((p) => p.code === first.code)?.ended_at).toBeTruthy();
  });
});

describe('pairing', () => {
  it('works once only', async () => {
    const { body } = await newPad();
    const first = await pair.POST(req(`/api/tamil-pads/${body.code}/pair`, { method: 'POST' }), ctx({ code: body.code }));
    expect(first.status).toBe(200);
    expect((await first.json()).token).toBeTruthy();
    const second = await pair.POST(req(`/api/tamil-pads/${body.code}/pair`, { method: 'POST' }), ctx({ code: body.code }));
    expect(second.status).toBe(410);
    expect((await second.json()).error).toMatch(/another phone/);
  });

  it('refuses an expired QR', async () => {
    const { body } = await newPad();
    mocks.tables.tamil_pads[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await pair.POST(req(`/api/tamil-pads/${body.code}/pair`, { method: 'POST' }), ctx({ code: body.code }));
    expect(res.status).toBe(410);
    expect((await res.json()).error).toMatch(/expired/);
  });
});

describe('speaking on the phone', () => {
  it('saves each recording as the next sentence and counts the seconds for the owner', async () => {
    const { code, token } = await paired();
    const a = await (await say(code, token)).json();
    mocks.transcribe.mockResolvedValue('நன்றி');
    const b = await (await say(code, token)).json();
    expect([a.piece.seq, b.piece.seq]).toEqual([1, 2]);
    expect(mocks.tables.tamil_pad_pieces.map((p) => p.text)).toEqual(['வணக்கம்', 'நன்றி']);
    expect(mocks.recordUsage.mock.calls[0][0][0]).toMatchObject({ user_id: 'u1', session_id: null, kind: 'stt', audio_ms: 6000 });
    expect(mocks.recordUse).not.toHaveBeenCalled();
  });

  it('joins a long recording’s next piece to its sentence', async () => {
    const { code, token } = await paired();
    await say(code, token);
    mocks.transcribe.mockResolvedValue('நன்றி');
    const res = await (await say(code, token, { part: '1', seq: '1' })).json();
    expect(res.piece).toMatchObject({ seq: 1, text: 'வணக்கம் நன்றி' });
    expect(mocks.tables.tamil_pad_pieces).toHaveLength(1);
  });

  it('Speak again replaces that sentence', async () => {
    const { code, token } = await paired();
    await say(code, token);
    mocks.transcribe.mockResolvedValue('புதியது');
    const res = await (await say(code, token, { replace: '1' })).json();
    expect(res.piece).toMatchObject({ seq: 1, text: 'புதியது' });
    expect(mocks.recordUsage).toHaveBeenCalledTimes(2);
  });

  it('makes no sentence when nothing was heard', async () => {
    const { code, token } = await paired();
    mocks.transcribe.mockResolvedValue('');
    expect((await (await say(code, token)).json()).piece).toBeNull();
    expect(mocks.tables.tamil_pad_pieces).toHaveLength(0);
  });

  it('blocks a new recording with no minutes left, and spends nothing', async () => {
    const { code, token } = await paired();
    mocks.assertCanUse.mockRejectedValue(fail(402, 'Used up', { code: 'quota_exceeded' }));
    const res = await say(code, token);
    expect(res.status).toBe(402);
    expect(mocks.transcribe).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it('lets a recording that started finish', async () => {
    const { code, token } = await paired();
    await say(code, token);
    mocks.assertCanUse.mockClear();
    mocks.assertCanUse.mockRejectedValue(fail(402, 'Used up'));
    expect((await say(code, token, { part: '1', seq: '1' })).status).toBe(200);
    expect(mocks.assertCanUse).not.toHaveBeenCalled();
  });

  it('refuses the extension’s own token, and the phone of another pad', async () => {
    const { code } = await paired();
    const other = await paired();
    expect((await say(code, userToken)).status).toBe(403);
    expect((await say(code, other.token)).status).toBe(403);
  });
});

describe('editing on the phone', () => {
  it('edits and deletes a sentence, costing nothing', async () => {
    const { code, token } = await paired();
    await say(code, token);
    mocks.recordUsage.mockClear();
    const edited = await (await patch(code, 1, token, { text: 'திருத்தியது' })).json();
    expect(edited).toMatchObject({ seq: 1, text: 'திருத்தியது', deleted: false });
    const gone = await (await patch(code, 1, token, { deleted: true })).json();
    expect(gone).toMatchObject({ seq: 1, deleted: true });
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it('refuses an empty edit and a sentence that is not there', async () => {
    const { code, token } = await paired();
    await say(code, token);
    expect((await patch(code, 1, token, { text: '  ' })).status).toBe(400);
    expect((await patch(code, 9, token, { text: 'x' })).status).toBe(404);
  });
});

describe('reading and ending', () => {
  it('shows the sentences to the owner, not to another user', async () => {
    const { code, token } = await paired();
    await say(code, token);
    const mine = await one.GET(req(`/api/tamil-pads/${code}`, { token: userToken }), ctx({ code }));
    expect((await mine.json()).pieces).toMatchObject([{ seq: 1, text: 'வணக்கம்' }]);
    expect((await one.GET(req(`/api/tamil-pads/${code}`, { token: otherToken }), ctx({ code }))).status).toBe(403);
  });

  it('Done on the phone ends it: no more speaking or edits', async () => {
    const { code, token } = await paired();
    await say(code, token);
    expect((await one.DELETE(req(`/api/tamil-pads/${code}`, { method: 'DELETE', token }), ctx({ code }))).status).toBe(200);
    const res = await say(code, token);
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe('pad_ended');
    expect((await patch(code, 1, token, { text: 'x' })).status).toBe(410);
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  });

  it('Disconnect in the popup ends it too', async () => {
    const { code, token } = await paired();
    await one.DELETE(req(`/api/tamil-pads/${code}`, { method: 'DELETE', token: userToken }), ctx({ code }));
    const info = await (await one.GET(req(`/api/tamil-pads/${code}`, { token }), ctx({ code }))).json();
    expect(info.ended_at).toBeTruthy();
  });
});
