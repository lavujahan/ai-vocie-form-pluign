import { describe, expect, it } from 'vitest';
import { assistantMessage, ScriptedModel } from '@openai/agents/testing';
import { resolveOption } from '@/lib/agents/optionResolver';

const options = ['Attur', 'Omalur', 'Salem South'].map((label, i) => ({ value: String(i), label }));
const reply = (o: unknown) => new ScriptedModel([[assistantMessage(JSON.stringify(o))]]);

describe('Option Resolver Agent output checks', () => {
  it('accepts an exact label from the list', async () => {
    const r = await resolveOption({ label: 'Taluk', spoken: 'Omaloor', options }, { model: reply({ choice: 'Omalur', ambiguous: false, top: ['Omalur'] }) });
    expect(r).toEqual({ choice: 'Omalur', ambiguous: false, top: ['Omalur'] });
  });

  it('never returns an option that is not on the page', async () => {
    const r = await resolveOption(
      { label: 'Taluk', spoken: 'Omalore', options },
      { model: reply({ choice: 'Omalur Town', ambiguous: false, top: ['Omalur Town', 'Omalur', 'Made Up'] }) },
    );
    expect(r.choice).toBeNull();
    expect(r.top).toEqual(['Omalur']);
  });

  it('treats an ambiguous answer as no choice, keeping the candidates for the phone picker', async () => {
    const r = await resolveOption(
      { label: 'Taluk', spoken: 'Salem', options },
      { model: reply({ choice: 'Salem South', ambiguous: true, top: ['Salem South', 'Attur'] }) },
    );
    expect(r).toEqual({ choice: null, ambiguous: true, top: ['Salem South', 'Attur'] });
  });
});
