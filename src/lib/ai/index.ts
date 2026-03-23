import { loadMcpServers, type ResolvedModel } from '../storage';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { StreamCallbacks } from './types';
import { runAnthropicTurn } from './anthropic';
import { runOpenAITurn } from './openai';
import type { Desensitizer } from '../desensitize';
import { fetchMcpTools, type McpTool } from '../mcp';

export type { StreamCallbacks, MessageParam };

const PAGE_CTX_MARKER = '[Page context]';

function deduplicatePageContext(history: MessageParam[]): MessageParam[] {
  // Keep only the last page context injection, strip it from older messages
  let lastCtxIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER)) {
      if (lastCtxIdx === -1) { lastCtxIdx = i; }
    }
  }
  return history.map((m, i) => {
    if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER) && i !== lastCtxIdx) {
      // Strip the page context prefix, keep only the user message part
      const userMsgStart = m.content.indexOf('\n\n[User message]\n');
      const stripped = userMsgStart >= 0 ? m.content.slice(userMsgStart + '\n\n[User message]\n'.length) : m.content;
      return { ...m, content: stripped };
    }
    return m;
  });
}

export async function runConversationTurn(
  history: MessageParam[],
  model: ResolvedModel,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  extraSystemPrompt?: string,
  extraDisabledTools?: string[],
  desensitizer?: Desensitizer,
): Promise<MessageParam[]> {
  const mcpServers = await loadMcpServers();
  const effectiveDisabledTools = extraDisabledTools ?? [];

  const mcpTools: McpTool[] = [];
  for (const server of mcpServers.filter((s) => s.enabled)) {
    try {
      const tools = await fetchMcpTools(server);
      mcpTools.push(...tools);
    } catch (e) {
      console.warn(`[MCP] Failed to load tools from "${server.name}":`, e);
    }
  }

  const dedupedHistory = deduplicatePageContext(history);
  if (model.type === 'anthropic') {
    return runAnthropicTurn(dedupedHistory, model, callbacks, signal, effectiveDisabledTools, mcpTools, extraSystemPrompt, desensitizer);
  }
  return runOpenAITurn(dedupedHistory, model, callbacks, signal, effectiveDisabledTools, mcpTools, extraSystemPrompt, desensitizer);
}
