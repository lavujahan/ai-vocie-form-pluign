import { z } from 'zod';
import type { ChatFn, ChatMessage, ToolDef } from '../sarvam/chat';

/** A function the model may call. Parameters are a zod object; the result is sent back as text. */
export type AgentTool<P extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  parameters: P;
  execute: (args: z.infer<P>) => Promise<string> | string;
};

export function defineTool<P extends z.ZodTypeAny>(t: AgentTool<P>): AgentTool<P> {
  return t;
}

export class AgentError extends Error {}

/** JSON schema for structured output / tool parameters (no $schema key, closed objects). */
export function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>;
  return rest;
}

/** Models sometimes wrap JSON in ```json fences or add a sentence around it. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('Reply is not JSON');
  }
}

/**
 * A small tool-calling agent loop on a chat-completions model (Sarvam):
 * call the model → run any tool calls it makes → feed results back → repeat until it answers
 * with JSON matching `output`. One retry if the answer doesn't parse.
 */
export async function runAgent<O extends z.ZodTypeAny>(args: {
  name: string;
  instructions: string;
  input: string;
  output: O;
  chat: ChatFn;
  tools?: AgentTool[];
  maxTurns?: number;
}): Promise<z.infer<O>> {
  const tools = args.tools ?? [];
  const toolDefs: ToolDef[] = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: jsonSchema(t.parameters) },
  }));
  const schema = jsonSchema(args.output);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${args.instructions}\n\nWhen you are done, reply with ONLY a JSON object matching this JSON schema (no prose, no code fences):\n${JSON.stringify(schema)}`,
    },
    { role: 'user', content: args.input },
  ];
  let badReplies = 0;

  for (let turn = 0; turn < (args.maxTurns ?? 8); turn++) {
    const reply = await args.chat({
      messages,
      tools: toolDefs.length ? toolDefs : undefined,
      response_format: {
        type: 'json_schema',
        json_schema: { name: args.name.replace(/[^\w-]/g, '_'), schema, strict: true },
      },
    });

    if (reply.tool_calls?.length) {
      messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls });
      for (const call of reply.tool_calls) {
        const tool = tools.find((t) => t.name === call.function.name);
        let result: string;
        if (!tool) result = JSON.stringify({ error: `Unknown tool "${call.function.name}"` });
        else {
          try {
            const parsed = tool.parameters.parse(JSON.parse(call.function.arguments || '{}'));
            result = await tool.execute(parsed);
          } catch (e) {
            result = JSON.stringify({ error: (e as Error).message });
          }
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      continue;
    }

    const text = reply.content ?? '';
    try {
      return args.output.parse(extractJson(text));
    } catch (e) {
      if (++badReplies > 1) throw new AgentError(`${args.name}: invalid output (${(e as Error).message})`);
      messages.push(
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `That reply did not match the required JSON schema: ${(e as Error).message.slice(0, 500)}. Reply again with only the corrected JSON object.`,
        },
      );
    }
  }
  throw new AgentError(`${args.name}: no answer after ${args.maxTurns ?? 8} turns`);
}
