import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Usage } from '@openai/agents';
import { assistantMessage, ScriptedModel } from '@openai/agents/testing';
import { TranslateRequest } from '@vff/shared';
import { clearTranslateCache, translateToTamil } from '@/lib/agents/translator';

const reply = (tamil: string) =>
  new ScriptedModel([{ output: [assistantMessage(JSON.stringify({ tamil }))], usage: new Usage({ requests: 1, inputTokens: 300, outputTokens: 20 }) }]);

beforeEach(() => clearTranslateCache());

describe('Tamil helper translator', () => {
  it('returns the Tamil, trimmed, and reports its tokens for billing', async () => {
    const onUsage = vi.fn();
    const tamil = await translateToTamil('Date of birth', { model: reply('  பிறந்த தேதி \n'), onUsage });
    expect(tamil).toBe('பிறந்த தேதி');
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage.mock.calls[0][0].usage.inputTokens).toBe(300);
  });

  it('never asks the model for empty text', async () => {
    const model = new ScriptedModel([]);
    expect(await translateToTamil('   ', { model })).toBe('');
    expect(model.calls).toHaveLength(0);
  });

  it('answers a repeated text from memory, whatever its spacing or case', async () => {
    const model = reply('தந்தையின் பெயர்');
    await translateToTamil("Father's name", { model });
    const onUsage = vi.fn();
    expect(await translateToTamil("  father's   NAME ", { model, onUsage })).toBe('தந்தையின் பெயர்');
    expect(model.calls).toHaveLength(1);
    expect(onUsage).not.toHaveBeenCalled();
  });

  it('does not remember an empty answer', async () => {
    await translateToTamil('Occupation', { model: reply('') });
    expect(await translateToTamil('Occupation', { model: reply('தொழில்') })).toBe('தொழில்');
  });

  it('takes 1 to 500 characters from the phone', () => {
    expect(TranslateRequest.safeParse({ text: ' Pincode ' }).data).toEqual({ text: 'Pincode' });
    expect(TranslateRequest.safeParse({ text: '  ' }).success).toBe(false);
    expect(TranslateRequest.safeParse({ text: 'x'.repeat(501) }).success).toBe(false);
  });
});
