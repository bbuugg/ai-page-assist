import OpenAI from 'openai';
import type { ResolvedModel } from '../storage';
import { TOOL_DEFINITIONS, executeTool, type ToolName } from '../tools/index';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { StreamCallbacks, AskUserMode } from './types';
import { CONTEXT_SWITCHING_TOOLS } from './types';
import { callMcpTool, readMcpResource, type McpTool } from '../mcp';
import type { Desensitizer } from '../desensitize';
import { anthropicToOAI, type OAIMessage } from './history';

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
  model: ResolvedModel,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  disabledTools: string[] = [],
  mcpTools: McpTool[] = [],
  extraSystemPrompt = '',
  desensitizer?: Desensitizer,
): Promise<MessageParam[]> {
  const isOllama = model.type === 'ollama';
  const client = isOllama ? null : new OpenAI({
    apiKey: model.apiKey || 'openai',
    baseURL: model.baseURL,
    dangerouslyAllowBrowser: true,
  });

  const updatedHistory: MessageParam[] = [...history];
  let continueLoop = true;

  while (continueLoop) {
    if (signal?.aborted) return updatedHistory;
    continueLoop = false;

    const historyToEncode: MessageParam[] = desensitizer
      ? updatedHistory.map((m) => {
          if (typeof m.content === 'string') return { ...m, content: desensitizer.encode(m.content) };
          if (Array.isArray(m.content)) {
            return {
              ...m,
              content: m.content.map((b) => {
                if (b.type === 'text') return { ...b, text: desensitizer.encode(b.text) };
                if (b.type === 'tool_result' && typeof b.content === 'string') return { ...b, content: desensitizer.encode(b.content) };
                return b;
              }),
            };
          }
          return m;
        })
      : updatedHistory;
    const oaiMessages = anthropicToOAI(historyToEncode, extraSystemPrompt);
    const enabledOAITools = OAI_TOOLS.filter((t) => t.type === 'function' && !disabledTools.includes(t.function.name));
    const mcpOAITools: OpenAI.Chat.ChatCompletionTool[] = mcpTools.filter((t) => !disabledTools.includes(t.name)).map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    const allOAITools = [...enabledOAITools, ...mcpOAITools];
    const requestBody = {
      model: model.modelId,
      max_tokens: 4096,
      ...(allOAITools.length > 0 ? { tools: allOAITools, tool_choice: 'auto' as const } : {}),
      messages: oaiMessages,
      stream: true as const,
    };

    const stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk> = isOllama
      ? streamViaBackground(`${model.baseURL}/chat/completions`, requestBody, signal)
      : await client!.chat.completions.create(requestBody, { signal });

    let assistantText = '';
    let thinkingText = '';
    let inThinkTag = false;
    let thinkBuf = ''; // buffer to detect partial <think> / </think> tags at chunk boundaries
    const toolCalls: { id: string; name: string; args: string }[] = [];
    const rawChunks: OpenAI.Chat.ChatCompletionChunk[] = [];

    for await (const chunk of stream) {
      if (signal?.aborted) return updatedHistory;
      rawChunks.push(chunk);
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        const decodedContent = desensitizer ? desensitizer.decode(delta.content) : delta.content;
        thinkBuf += decodedContent;
        // Process buffer: extract <think>...</think> blocks
        let out = '';
        while (thinkBuf.length > 0) {
          if (inThinkTag) {
            const closeIdx = thinkBuf.indexOf('</think>');
            if (closeIdx === -1) {
              // whole buf is thinking content (but keep last 7 chars in case </think> straddles chunks)
              const safe = thinkBuf.slice(0, Math.max(0, thinkBuf.length - 7));
              if (safe) { thinkingText += safe; callbacks.onThinking?.(thinkingText); }
              thinkBuf = thinkBuf.slice(safe.length);
              break;
            } else {
              thinkingText += thinkBuf.slice(0, closeIdx);
              callbacks.onThinking?.(thinkingText);
              inThinkTag = false;
              thinkBuf = thinkBuf.slice(closeIdx + '</think>'.length);
            }
          } else {
            const openIdx = thinkBuf.indexOf('<think>');
            if (openIdx === -1) {
              // keep last 6 chars in case <think> straddles chunks
              const safe = thinkBuf.slice(0, Math.max(0, thinkBuf.length - 6));
              if (safe) { out += safe; }
              thinkBuf = thinkBuf.slice(safe.length);
              break;
            } else {
              out += thinkBuf.slice(0, openIdx);
              inThinkTag = true;
              thinkBuf = thinkBuf.slice(openIdx + '<think>'.length);
            }
          }
        }
        if (out) {
          assistantText += out;
          callbacks.onToken(out);
        }
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
      let contextChanged = false;
      for (const tb of toolUseBlocks) {
        if (contextChanged) {
          const skippedMessage = `Skipped ${tb.name} because a previous navigation/tab tool changed the current page or tab. Re-read the new page state before calling more page tools.`;
          callbacks.onToolCall(tb.name, tb.input as Record<string, unknown>);
          callbacks.onToolResult(tb.name, skippedMessage, true);
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: skippedMessage, is_error: true });
          continue;
        }
        if (tb.name === 'ask_user') {
          const question = (tb.input as { question?: string; mode?: string; options?: string[] }).question ?? 'Please provide more information.';
          const rawMode = (tb.input as { mode?: string }).mode || 'text';
          const askMode = (['text', 'yes_no', 'single', 'multiple'].includes(rawMode) ? rawMode : 'text') as AskUserMode;
          const options = (tb.input as { options?: string[] }).options;
          const answer = callbacks.onAskUser ? await callbacks.onAskUser(question, askMode, options) : '';
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: answer });
          // Do not call onToolCall/onToolResult for ask_user — UI handles it via onAskUser
          continue;
        }
        if (tb.name === 'rename_session') {
          const title = (tb.input as { title?: string }).title ?? '';
          callbacks.onRenameSession?.(title);
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: `Session renamed to: ${title}` });
          continue;
        }
        callbacks.onToolCall(tb.name, tb.input as Record<string, unknown>);
        const mcpTool = mcpTools.find((t) => t.name === tb.name);
        let result: { content: string; isError?: boolean };
        if (tb.name === 'mcp_list_resources') {
          const resources = mcpTool?._mcpResources ?? [];
          result = { content: resources.length === 0 ? 'No resources available.' : resources.map((r) => `${r.uri} — ${r.name}${r.description ? ': ' + r.description : ''}`).join('\n') };
        } else if (tb.name === 'mcp_read_resource') {
          const uri = (tb.input as { uri?: string }).uri ?? '';
          const resource = mcpTool?._mcpResources?.find((r) => r.uri === uri);
          if (!resource) {
            result = { content: `Resource not found: ${uri}`, isError: true };
          } else {
            try { result = { content: await readMcpResource(resource) }; }
            catch (e) { result = { content: String(e), isError: true }; }
          }
        } else if (mcpTool) {
          result = await callMcpTool(mcpTool, tb.input as Record<string, unknown>);
        } else {
          result = await executeTool(tb.name as ToolName, tb.input as Record<string, unknown>, disabledTools);
        }
        callbacks.onToolResult(tb.name, result.content, result.isError ?? false);
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result.content, is_error: result.isError });
        if (CONTEXT_SWITCHING_TOOLS.has(tb.name) && !result.isError) {
          contextChanged = true;
        }
      }
      updatedHistory.push({ role: 'user', content: toolResults });
    }
  }

  callbacks.onDone();
  return updatedHistory;
}
