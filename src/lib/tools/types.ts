import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export interface ToolResult {
  content: string;
  isError?: boolean;
  isImage?: boolean;
}

export interface ToolMeta {
  label: string;
  description: string;
}

export interface ToolDef {
  /** Unique tool name passed to the AI */
  name: string;
  /** Anthropic Tool schema */
  schema: Tool;
  /** Short label + description shown in the UI */
  meta: ToolMeta;
  /**
   * How to execute this tool:
   * - 'content'    → forward to content script via background
   * - 'background' → forward to background via tabTool message
   * - function     → execute directly in the overlay
   */
  handler: 'content' | 'background' | ((input: Record<string, unknown>) => Promise<ToolResult>);
}
