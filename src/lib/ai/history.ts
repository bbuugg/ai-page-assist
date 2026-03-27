import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type OpenAI from 'openai';
import { SYSTEM_PROMPT } from './prompt';

export type OAIMessage = OpenAI.Chat.ChatCompletionMessageParam;

/**
 * Convert internal Anthropic-format history to OpenAI chat format.
 * The app stores all conversation history in Anthropic's MessageParam format
 * regardless of provider. This function translates it for OpenAI-compatible APIs.
 */
export function anthropicToOAI(history: MessageParam[], extraSystemPrompt = ''): OAIMessage[] {
  const result: OAIMessage[] = [{ role: 'system', content: SYSTEM_PROMPT + extraSystemPrompt }];
  for (const m of history) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        result.push({ role: 'user', content: m.content });
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === 'tool_result') {
            result.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            });
          }
        }
      }
    } else if (m.role === 'assistant') {
      if (typeof m.content === 'string') {
        result.push({ role: 'assistant', content: m.content });
      } else if (Array.isArray(m.content)) {
        const textBlock = m.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined;
        const toolBlocks = m.content.filter((b) => b.type === 'tool_use') as Anthropic.Messages.ToolUseBlock[];
        result.push({
          role: 'assistant',
          content: textBlock?.text ?? null,
          tool_calls: toolBlocks.length > 0 ? toolBlocks.map((tb) => ({
            id: tb.id,
            type: 'function' as const,
            function: { name: tb.name, arguments: JSON.stringify(tb.input) },
          })) : undefined,
        });
      }
    }
  }
  return result;
}
