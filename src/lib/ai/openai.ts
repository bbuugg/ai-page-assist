import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Settings } from '../storage';
import { TOOL_DEFINITIONS, executeTool, type ToolName } from '../tools';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { StreamCallbacks } from './types';
import { SYSTEM_PROMPT } from './prompt';
import { callMcpTool, type McpTool } from '../mcp';

type OAIMessage = OpenAI.Chat.ChatCompletionMessageParam;

function anthropicToOAI(history: MessageParam[]): OAIMessage[] {
  const result: OAIMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const m of history) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        result.push({ role: 'user', content: m.content });
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === 'tool_result') {
            // Check if content contains an image block
            const contentArr = Array.isArray(block.content) ? block.content : null;
            const imageBlock = contentArr?.find((b: { type: string }) => b.type === 'image') as
              | { type: 'image'; source: { type: string; media_type: string; data: string } }
              | undefined;
            if (imageBlock) {
              // tool role cannot carry image content in OpenAI API — send empty tool result + image as user message
              result.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: '[screenshot attached]',
              });
              result.push({
                role: 'user',
                content: [
                  { type: 'text' as const, text: 'Screenshot result:' },
                  { type: 'image_url' as const, image_url: { url: `data:${imageBlock.source.media_type};base64,${imageBlock.source.data}` } },
                ],
              });
            } else {
              result.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
              });
            }
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

const OAI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFINITIONS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as Record<string, unknown>,
  },
}));

// Stream via background service worker to avoid chrome-extension origin CORS block (e.g. Ollama)
function streamViaBackground(
  url: string,
  body: object,
  signal?: AbortSignal,
): AsyncIterable<OpenAI.Chat.ChatCompletionChunk> {
  const streamId = `${Date.now()}-${Math.random()}`;
  return {
    [Symbol.asyncIterator]() {
      let resolve: ((v: IteratorResult<OpenAI.Chat.ChatCompletionChunk>) => void) | null = null;
      let reject: ((e: unknown) => void) | null = null;
      const queue: OpenAI.Chat.ChatCompletionChunk[] = [];
      let done = false;
      let error: string | null = null;

      const listener = (msg: { action: string; streamId: string; chunk?: string; done?: boolean; error?: string }) => {
        if (msg.action !== 'proxyStreamChunk' || msg.streamId !== streamId) return;
        if (msg.error) {
          error = msg.error;
          if (reject) { reject(new Error(msg.error)); reject = null; resolve = null; }
        } else if (msg.done) {
          done = true;
          if (resolve) { resolve({ value: undefined as unknown as OpenAI.Chat.ChatCompletionChunk, done: true }); resolve = null; }
        } else if (msg.chunk) {
          // Parse SSE lines
          for (const line of msg.chunk.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if (data === '[DONE]') { done = true; if (resolve) { resolve({ value: undefined as unknown as OpenAI.Chat.ChatCompletionChunk, done: true }); resolve = null; } return; }
            try {
              const parsed = JSON.parse(data) as OpenAI.Chat.ChatCompletionChunk;
              if (resolve) { resolve({ value: parsed, done: false }); resolve = null; }
              else queue.push(parsed);
            } catch { /* skip malformed */ }
          }
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      signal?.addEventListener('abort', () => { done = true; chrome.runtime.onMessage.removeListener(listener); if (resolve) { resolve({ value: undefined as unknown as OpenAI.Chat.ChatCompletionChunk, done: true }); resolve = null; } });

      chrome.runtime.sendMessage({ action: 'proxyStream', url, body, streamId });

      return {
        next(): Promise<IteratorResult<OpenAI.Chat.ChatCompletionChunk>> {
          if (error) return Promise.reject(new Error(error));
          if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
          if (done) { chrome.runtime.onMessage.removeListener(listener); return Promise.resolve({ value: undefined as unknown as OpenAI.Chat.ChatCompletionChunk, done: true }); }
          return new Promise((res, rej) => { resolve = res; reject = rej; });
        },
        return(): Promise<IteratorResult<OpenAI.Chat.ChatCompletionChunk>> {
          chrome.runtime.onMessage.removeListener(listener);
          return Promise.resolve({ value: undefined as unknown as OpenAI.Chat.ChatCompletionChunk, done: true });
        },
      };
    },
  };
}

export async function runOpenAITurn(
  history: MessageParam[],
  settings: Settings,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  disabledTools: string[] = [],
  mcpTools: McpTool[] = [],
): Promise<MessageParam[]> {
  const isOllama = settings.provider === 'ollama';
  const client = isOllama ? null : new OpenAI({
    apiKey: settings.apiKey || 'openai',
    baseURL: settings.baseURL,
    dangerouslyAllowBrowser: true,
  });

  const updatedHistory: MessageParam[] = [...history];
  let continueLoop = true;

  while (continueLoop) {
    if (signal?.aborted) return updatedHistory;
    continueLoop = false;

    const oaiMessages = anthropicToOAI(updatedHistory);
    const enabledOAITools = OAI_TOOLS.filter((t) => t.type === 'function' && !disabledTools.includes(t.function.name));
    const mcpOAITools: OpenAI.Chat.ChatCompletionTool[] = mcpTools.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    const allOAITools = [...enabledOAITools, ...mcpOAITools];
    const requestBody = {
      model: settings.model,
      max_tokens: 4096,
      ...(allOAITools.length > 0 ? { tools: allOAITools, tool_choice: 'auto' as const } : {}),
      messages: oaiMessages,
      stream: true as const,
    };

    const stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk> = isOllama
      ? streamViaBackground(`${settings.baseURL}/chat/completions`, requestBody, signal)
      : await client!.chat.completions.create(requestBody, { signal });

    let assistantText = '';
    const toolCalls: { id: string; name: string; args: string }[] = [];
    const rawChunks: OpenAI.Chat.ChatCompletionChunk[] = [];

    for await (const chunk of stream) {
      if (signal?.aborted) return updatedHistory;
      rawChunks.push(chunk);
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        assistantText += delta.content;
        callbacks.onToken(delta.content);
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index !== undefined) {
            if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' };
            if (tc.id) toolCalls[tc.index].id = tc.id;
            if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[tc.index].args += tc.function.arguments;
          }
        }
      }
    }

    if (callbacks.onRawLog) {
      callbacks.onRawLog(
        JSON.stringify({ ...requestBody, messages: oaiMessages }, null, 2),
        JSON.stringify(rawChunks, null, 2),
      );
    }

    // Build Anthropic-format assistant message for history
    const assistantContent: Anthropic.Messages.ContentBlock[] = [];
    if (assistantText) assistantContent.push({ type: 'text', text: assistantText } as Anthropic.Messages.ContentBlock);
    const toolUseBlocks = toolCalls.map((tc) => ({
      type: 'tool_use' as const,
      id: tc.id,
      name: tc.name,
      input: (() => { try { return JSON.parse(tc.args); } catch { return {}; } })(),
    })) as unknown as Anthropic.Messages.ToolUseBlock[];
    for (const tb of toolUseBlocks) assistantContent.push(tb);
    if (assistantContent.length > 0) updatedHistory.push({ role: 'assistant', content: assistantContent });

    if (toolUseBlocks.length > 0) {
      continueLoop = true;
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const tb of toolUseBlocks) {
        if (tb.name === 'ask_user') {
          const question = (tb.input as { question?: string }).question ?? 'Please provide more information.';
          const answer = callbacks.onAskUser ? await callbacks.onAskUser(question) : '';
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: answer });
          // Do not call onToolCall/onToolResult for ask_user — UI handles it via onAskUser
          continue;
        }
        callbacks.onToolCall(tb.name, tb.input as Record<string, unknown>);
        const mcpTool = mcpTools.find((t) => t.name === tb.name);
        const result = mcpTool
          ? await callMcpTool(mcpTool, tb.input as Record<string, unknown>)
          : await executeTool(tb.name as ToolName, tb.input as Record<string, unknown>);
        callbacks.onToolResult(tb.name, result.content, result.isError ?? false, result.isImage);
        if (result.isImage) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tb.id,
            content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: result.content } }],
          });
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result.content, is_error: result.isError });
        }
      }
      updatedHistory.push({ role: 'user', content: toolResults });
    }
  }

  callbacks.onDone();
  return updatedHistory;
}
