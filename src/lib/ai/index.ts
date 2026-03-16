import { loadDisabledTools, loadMcpServers, type Settings } from '../storage';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { StreamCallbacks } from './types';
import { runAnthropicTurn } from './anthropic';
import { runOpenAITurn } from './openai';
import { fetchMcpTools, type McpTool } from '../mcp';

export type { StreamCallbacks, MessageParam };

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

  if (settings.provider === 'anthropic') {
    return runAnthropicTurn(history, settings, callbacks, signal, disabledTools, mcpTools);
  }
  return runOpenAITurn(history, settings, callbacks, signal, disabledTools, mcpTools);
}
