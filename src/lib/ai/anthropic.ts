import Anthropic from '@anthropic-ai/sdk';
import type { Settings } from '../storage';
import { TOOL_DEFINITIONS, executeTool, type ToolName } from '../tools/index';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { StreamCallbacks } from './types';
import { SYSTEM_PROMPT } from './prompt';
import { callMcpTool, type McpTool } from '../mcp';

const CONTEXT_SWITCHING_TOOLS = new Set(['open_url', 'open_tab', 'switch_tab', 'go_back', 'go_forward', 'refresh']);

export async function runAnthropicTurn(
  history: MessageParam[],
  settings: Settings,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  disabledTools: string[] = [],
  mcpTools: McpTool[] = [],
): Promise<MessageParam[]> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.anthropic.com',
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
    const requestParams = {
      model: settings.model || 'claude-sonnet-4-6',
      max_tokens: 4096,
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      messages: updatedHistory,
      system: SYSTEM_PROMPT,
    };
    const stream = client.messages.stream(requestParams, { signal });

    let assistantText = '';
    const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

    for await (const event of stream) {
      if (signal?.aborted) { stream.abort(); return updatedHistory; }
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolUseBlocks.push({ ...event.content_block, input: {} } as Anthropic.Messages.ToolUseBlock);
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          assistantText += event.delta.text;
          callbacks.onToken(event.delta.text);
        } else if (event.delta.type === 'input_json_delta') {
          const last = toolUseBlocks[toolUseBlocks.length - 1];
          if (last) {
            (last as unknown as { _raw: string })._raw =
              ((last as unknown as { _raw: string })._raw ?? '') + event.delta.partial_json;
          }
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

    const assistantContent: Anthropic.Messages.ContentBlock[] = [];
    if (assistantText) assistantContent.push({ type: 'text', text: assistantText } as Anthropic.Messages.ContentBlock);
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
