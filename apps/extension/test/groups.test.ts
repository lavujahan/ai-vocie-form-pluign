import { describe, expect, it } from 'vitest';
import type { FieldFile, SessionField, SessionValue } from '@vff/shared';
import { NOT_ON_PAGE } from '../src/messages';
import { groupFields } from '../src/popup/groups';

const field = (field_key: string, over: Partial<SessionField> = {}) =>
  ({ id: `id-${field_key}`, field_key, label: field_key, field_type: 'text', required: false, options: [], ...over }) as SessionField;
const value = (field_key: string, v: string, confidence = 0.95) =>
  ({ field_id: `id-${field_key}`, value: v, confidence, source_seq: 1 }) as SessionValue;
const file = (field_key: string, status: FieldFile['status']) =>
  ({ id: `file-${field_key}`, field_id: `id-${field_key}`, status, bytes: 1000, reason: null }) as FieldFile;

const snap = (o: { fields: SessionField[]; values?: SessionValue[]; files?: FieldFile[]; sent?: boolean; hidden?: string[] }) => ({
  fields: o.fields,
  values: o.values ?? [],
  files: o.files ?? [],
  session: { status: o.sent ? 'filled' : 'paired', hidden_fields: o.hidden ?? [] } as never,
});
const keys = (items: { field: SessionField }[]) => items.map((i) => i.field.field_key);

describe('popup field groups', () => {
  it('sorts answers by what the operator has to do, keeping the form order', () => {
    const g = groupFields(
      snap({
        fields: [field('name'), field('mobile'), field('district'), field('email')],
        values: [value('name', 'Ramesh'), value('mobile', '98765', 0.4), value('district', 'Salam')],
      }),
      [{ field_key: 'district', reason: 'No option matches' }],
      [],
    );
    expect(keys(g.look)).toEqual(['mobile', 'district']);
    expect(keys(g.filled)).toEqual(['name']);
    expect(keys(g.todo)).toEqual(['email']);
    expect([g.filledCount, g.total]).toEqual([1, 4]);
  });

  it('asks for an empty required field only once the phone sent the form', () => {
    const fields = [field('village', { required: true })];
    expect(keys(groupFields(snap({ fields }), undefined, []).todo)).toEqual(['village']);
    expect(keys(groupFields(snap({ fields, sent: true }), undefined, []).look)).toEqual(['village']);
  });

  it('keeps a value waiting for its field (not on the page yet) in "not answered yet"', () => {
    const g = groupFields(snap({ fields: [field('bank')], values: [value('bank', '5021')] }), [{ field_key: 'bank', reason: NOT_ON_PAGE }], []);
    expect(keys(g.todo)).toEqual(['bank']);
  });

  it('flags refused uploads and uploads whose page button must be clicked', () => {
    const fields = ['photo', 'proof', 'sign'].map((k) => field(k, { field_type: 'file' }));
    const g = groupFields(snap({ fields, files: [file('photo', 'rejected'), file('proof', 'filled'), file('sign', 'filled')] }), undefined, ['proof']);
    expect(keys(g.look)).toEqual(['photo', 'proof']);
    expect(keys(g.filled)).toEqual(['sign']);
  });

  it("lists fields a choice hides apart, and doesn't count them", () => {
    const g = groupFields(snap({ fields: [field('name'), field('org_name')], values: [value('org_name', 'Acme')], hidden: ['org_name'] }), undefined, []);
    expect(keys(g.hidden)).toEqual(['org_name']);
    expect([g.filledCount, g.total]).toEqual([0, 1]);
  });
});
