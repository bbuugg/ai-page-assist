import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
export type { MessageParam };

export type AskUserMode = 'text' | 'yes_no' | 'single' | 'multiple';

export const CONTEXT_SWITCHING_TOOLS = new Set(['open_url', 'switch_tab', 'go_back', 'go_forward', 'refresh']);

/** Information passed to the UI when an MCP App (tool with UI) is invoked. */
export interface McpAppInfo {
  /** Tool name (prefixed, e.g. "mcp__server__tool"). */
  toolName: string;
  /** HTML source of the MCP App UI. */
  html: string;
  /** Tool input arguments. */
  input: Record<string, unknown>;
  /** Structured CallToolResult content (array of content blocks). */
  structuredResult: CallToolResult['content'];
  /** MCP server config for proxying app-originated tool calls. */
  serverId: string;
  serverName: string;
  serverUrl: string;
  serverType: 'http' | 'streamable-http';
  serverHeaders?: Record<string, string>;
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onToolCall: (name: string, input: Record<string, unknown>) => void;
  onToolResult: (name: string, result: string, isError: boolean) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  onRawLog?: (request: string, response: string) => void;
  /** Called when AI uses ask_user tool. Resolve the promise with the user's answer to continue. */
  onAskUser?: (question: string, mode: AskUserMode, options?: string[]) => Promise<string>;
  /** Called when a thinking block is received (Anthropic extended thinking). */
  onThinking?: (text: string) => void;
  /** Called when an MCP tool with a UI resource is invoked, providing the app HTML + structured result. */
  onMcpApp?: (info: McpAppInfo) => void;
}
