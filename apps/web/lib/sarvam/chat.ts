import { sarvamPost } from './client';

// Minimal types for Sarvam's chat completions API (POST /v1/chat/completions).

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ToolDef[];
  response_format?: { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };
};

export type ChatReply = { content: string | null; tool_calls?: ToolCall[]; finish_reason?: string | null };

/** One model call. Injectable so agents can be tested without the network. */
export type ChatFn = (req: ChatRequest) => Promise<ChatReply>;

type SarvamChatResponse = {
  choices: { message: { content: string | null; tool_calls?: ToolCall[] | null }; finish_reason: string | null }[];
};

export function sarvamChat(opts: { model?: string; reasoningEffort?: string | null; maxTokens?: number } = {}): ChatFn {
  const model = opts.model ?? process.env.AGENT_MODEL ?? 'sarvam-105b';
  // Low reasoning keeps per-utterance latency down; set SARVAM_REASONING_EFFORT=high to trade speed for care.
  const effort = opts.reasoningEffort === undefined ? (process.env.SARVAM_REASONING_EFFORT ?? 'low') : opts.reasoningEffort;
  return async (req) => {
    const body: Record<string, unknown> = {
      model,
      messages: req.messages,
      max_tokens: opts.maxTokens ?? 8192,
      temperature: 0.1,
    };
    if (effort) body.reasoning_effort = effort;
    if (req.tools?.length) {
      body.tools = req.tools;
      body.tool_choice = 'auto';
    }
    if (req.response_format) body.response_format = req.response_format;
    const res = await sarvamPost<SarvamChatResponse>('/v1/chat/completions', body);
    const choice = res.choices?.[0];
    if (!choice) throw new Error('Sarvam chat returned no choices');
    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls ?? undefined,
      finish_reason: choice.finish_reason,
    };
  };
}
