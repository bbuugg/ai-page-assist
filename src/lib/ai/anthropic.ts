import Anthropic from '@anthropic-ai/sdk';
import type { ResolvedModel } from '../storage';
import { TOOL_DEFINITIONS, executeTool, type ToolName } from '../tools/index';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { StreamCallbacks } from './types';
import { SYSTEM_PROMPT } from './prompt';
import { callMcpTool, type McpTool } from '../mcp';
import type { Desensitizer } from '../desensitize';

const CONTEXT_SWITCHING_TOOLS = new Set(['open_url', 'switch_tab', 'go_back', 'go_forward', 'refresh']);

export async function runAnthropicTurn(
  history: MessageParam[],
  model: ResolvedModel,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  disabledTools: string[] = [],
  mcpTools: McpTool[] = [],
  extraSystemPrompt = '',
  desensitizer?: Desensitizer,
): Promise<MessageParam[]> {
  const client = new Anthropic({
    apiKey: model.apiKey,
    baseURL: model.baseURL || 'https://api.anthropic.com',
    dangerouslyAllowBrowser: true,
  });

  const updatedHistory: MessageParam[] = [...history];
  let continueLoop = true;

  while (continueLoop) {
    if (signal?.aborted) return updatedHistory;
    continueLoop = false;

    const enabledTools = TOOL_DEFINITIONS.filter((t) => !disabledTools.includes(t.name));
    const mcpToolDefs: Anthropic.Messages.Tool[] = mcpTools.filter((t) => !disabledTools.includes(t.name)).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
    const allTools = [...enabledTools, ...mcpToolDefs];
    const thinkingEnabled = model.thinking?.enabled && model.type === 'anthropic';
    const budgetTokens = model.thinking?.budgetTokens ?? 8000;
    const maxTokens = thinkingEnabled ? budgetTokens + 4096 : 4096;
    const encodedHistory: MessageParam[] = desensitizer
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
    const requestParams = {
      model: model.modelId || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      ...(thinkingEnabled ? { thinking: { type: 'enabled' as const, budget_tokens: budgetTokens } } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      messages: encodedHistory,
      system: SYSTEM_PROMPT + extraSystemPrompt,
    };
    const stream = client.messages.stream(requestParams as Parameters<typeof client.messages.stream>[0], { signal });

    let assistantText = '';
    let currentThinkingText = '';
    let inThinkingBlock = false;
    const thinkingBlocks: Anthropic.Messages.ThinkingBlock[] = [];
    const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

    for await (const event of stream) {
      if (signal?.aborted) { stream.abort(); return updatedHistory; }
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolUseBlocks.push({ ...event.content_block, input: {} } as Anthropic.Messages.ToolUseBlock);
          inThinkingBlock = false;
        } else if ((event.content_block as { type: string }).type === 'thinking') {
          inThinkingBlock = true;
          currentThinkingText = '';
        } else {
          inThinkingBlock = false;
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const decodedText = desensitizer ? desensitizer.decode(event.delta.text) : event.delta.text;
          assistantText += decodedText;
          callbacks.onToken(decodedText);
        } else if ((event.delta as { type: string }).type === 'thinking_delta') {
          const thinkingDelta = (event.delta as { type: string; thinking: string }).thinking;
          currentThinkingText += thinkingDelta;
          callbacks.onThinking?.(currentThinkingText);
        } else if (event.delta.type === 'input_json_delta') {
          const last = toolUseBlocks[toolUseBlocks.length - 1];
          if (last) {
            (last as unknown as { _raw: string })._raw =
              ((last as unknown as { _raw: string })._raw ?? '') + event.delta.partial_json;
          }
        }
      } else if (event.type === 'content_block_stop') {
        if (inThinkingBlock && currentThinkingText) {
          thinkingBlocks.push({ type: 'thinking', thinking: currentThinkingText } as Anthropic.Messages.ThinkingBlock);
          inThinkingBlock = false;
        }
      } else if (event.type === 'message_stop') {
        for (const block of toolUseBlocks) {
          const raw = (block as unknown as { _raw: string })._raw ?? '{}';
          try { block.input = JSON.parse(raw); } catch { block.input = {}; }
        }
      }
    }

    const finalMessage = await stream.finalMessage().catch(() => null);
    if (callbacks.onRawLog) {
      callbacks.onRawLog(
        JSON.stringify(requestParams, null, 2),
        finalMessage ? JSON.stringify(finalMessage, null, 2) : '(no response)',
      );
    }

    // Handle max_tokens truncation: continue generation automatically
    let fullAssistantText = assistantText;
    if (finalMessage?.stop_reason === 'max_tokens' && toolUseBlocks.length === 0) {
      let continueText = fullAssistantText;
      while (true) {
        if (signal?.aborted) break;
        const contHistory: MessageParam[] = [
          ...updatedHistory,
          { role: 'assistant', content: [{ type: 'text', text: continueText }] },
          { role: 'user', content: 'continue' },
        ];
        const contStream = client.messages.stream({
          ...requestParams,
          messages: contHistory,
        } as Parameters<typeof client.messages.stream>[0], { signal });
        let chunk = '';
        let contStopReason: string | null = null;
        for await (const event of contStream) {
          if (signal?.aborted) { contStream.abort(); break; }
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const decoded = desensitizer ? desensitizer.decode(event.delta.text) : event.delta.text;
            chunk += decoded;
            callbacks.onToken(decoded);
          }
        }
        const contFinal = await contStream.finalMessage().catch(() => null);
        contStopReason = contFinal?.stop_reason ?? null;
        fullAssistantText += chunk;
        continueText = fullAssistantText;
        if (contStopReason !== 'max_tokens') break;
      }
    }

    const assistantContent: Anthropic.Messages.ContentBlock[] = [];
    // Thinking blocks must be preserved in history for multi-turn thinking conversations
    for (const tb of thinkingBlocks) assistantContent.push(tb as unknown as Anthropic.Messages.ContentBlock);
    if (fullAssistantText) assistantContent.push({ type: 'text', text: fullAssistantText } as Anthropic.Messages.ContentBlock);
    for (const tb of toolUseBlocks) assistantContent.push(tb as unknown as Anthropic.Messages.ContentBlock);
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
          const question = (tb.input as Record<string, unknown>).question as string;
          const isYesNo = !!(tb.input as Record<string, unknown>).is_yes_no;
          const answer = callbacks.onAskUser
            ? await callbacks.onAskUser(question, isYesNo)
            : '';
          toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: answer });
          // Push tool result and continue loop so AI can respond with the answer
          updatedHistory.push({ role: 'user', content: toolResults });
          continueLoop = true;
          break;
        }
        callbacks.onToolCall(tb.name, tb.input as Record<string, unknown>);
        const mcpTool = mcpTools.find((t) => t.name === tb.name);
        const result = mcpTool
          ? await callMcpTool(mcpTool, tb.input as Record<string, unknown>)
          : await executeTool(tb.name as ToolName, tb.input as Record<string, unknown>, disabledTools);
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
