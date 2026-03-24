import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { ResolvedModel } from '../storage';

const SUMMARY_PROMPT =
  'You are a conversation summarizer. The following is a conversation history between a user and an AI assistant. ' +
  'Write a concise summary (in the same language as the conversation) that preserves: ' +
  '(1) key facts, decisions, and outcomes; ' +
  '(2) any important context the AI needs to continue helping the user; ' +
  '(3) the most recent user request and its resolution status. ' +
  'Output ONLY the summary text, no preamble.';

export async function compressHistory(
  history: MessageParam[],
  model: ResolvedModel,
): Promise<MessageParam[]> {
  if (history.length < 2) return history;

  // Build a plain-text transcript of the full history
  const transcript = history
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const content = typeof m.content === 'string' ? m.content
        : (m.content as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ');
      return `${role}: ${content}`;
    })
    .join('\n');

  let summary: string;
  if (model.type === 'anthropic') {
    const client = new Anthropic({ apiKey: model.apiKey, baseURL: model.baseURL || 'https://api.anthropic.com', dangerouslyAllowBrowser: true });
    const res = await client.messages.create({
      model: model.modelId,
      max_tokens: 1024,
      system: SUMMARY_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    });
    summary = res.content.filter((b) => b.type === 'text').map((b) => (b as { type: 'text'; text: string }).text).join('');
  } else {
    const client = new OpenAI({ apiKey: model.apiKey || 'ollama', baseURL: model.baseURL || 'https://api.openai.com/v1', dangerouslyAllowBrowser: true });
    const res = await client.chat.completions.create({
      model: model.modelId,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: transcript },
      ],
    });
    summary = res.choices[0]?.message?.content ?? '';
  }

  const summaryMessage: MessageParam = {
    role: 'user',
    content: `[Conversation summary — earlier context compressed]\n${summary}`,
  };
  const ackMessage: MessageParam = {
    role: 'assistant',
    content: 'Understood. I have the summary of our earlier conversation.',
  };

  return [summaryMessage, ackMessage];
}
