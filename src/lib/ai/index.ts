import { loadDisabledTools, loadMcpServers, type Settings } from '../storage';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { StreamCallbacks } from './types';
import { runAnthropicTurn } from './anthropic';
import { runOpenAITurn } from './openai';
import { fetchMcpTools, type McpTool } from '../mcp';

export type { StreamCallbacks, MessageParam };

const PAGE_CTX_MARKER = '[__page_ctx__]';

function deduplicatePageContext(history: MessageParam[]): MessageParam[] {
  // Keep only the last page context message, remove older ones
  let lastCtxIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER)) {
      if (lastCtxIdx === -1) { lastCtxIdx = i; }
      else { continue; } // will be filtered below
    }
  }
  return history.filter((m, i) => {
    if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(PAGE_CTX_MARKER)) {
      return i === lastCtxIdx;
    }
    return true;
  });
}

export async function runConversationTurn(
  history: MessageParam[],
  settings: Settings,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<MessageParam[]> {
  const [disabledTools, mcpServers] = await Promise.all([loadDisabledTools(), loadMcpServers()]);

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
  if (settings.provider === 'anthropic') {
    return runAnthropicTurn(dedupedHistory, settings, callbacks, signal, disabledTools, mcpTools);
  }
  return runOpenAITurn(dedupedHistory, settings, callbacks, signal, disabledTools, mcpTools);
}
