import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { ALL_TOOLS, TOOL_MAP } from './registry';
import type { ToolResult, ToolMeta, ToolDef } from './types';

export type { ToolResult, ToolMeta, ToolDef };
export type ToolName = string;

export const TOOL_DEFINITIONS: Tool[] = ALL_TOOLS.map((t) => t.schema);

export interface ToolMetaEntry extends ToolMeta {
  name: string;
}
export const TOOL_META: ToolMetaEntry[] = ALL_TOOLS.map((t) => ({ name: t.name, ...t.meta }));

function formatToolError(name: string, message: string): string {
  if (/Cannot access internal browser page \((chrome|edge|about):\/\/\)/i.test(message)) {
    return `Tool ${name} cannot run on internal browser pages like chrome://, edge://, or about:. Do not call page interaction or DOM-reading tools on this page. If the user wants another site, first use open_url, open_tab, switch_tab, go_back, go_forward, or refresh to reach a normal web page, then continue with other tools. Original error: ${message}`;
  }
  return message;
}

function callContentTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'toContent', action_inner: 'tool', tool: name, input },
      (response: { result?: unknown; error?: string } | undefined) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (response?.error) reject(new Error(response.error));
        else resolve(response?.result);
      }
    );
    setTimeout(() => reject(new Error(`Tool ${name} timed out`)), 30000);
  });
}

function callBackgroundTool(name: string, input: Record<string, unknown>): Promise<{ result?: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'tabTool', tool: name, input }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
    setTimeout(() => reject(new Error(`${name} timed out`)), 10000);
  });
}

export async function executeTool(name: string, input: Record<string, unknown>, disabledTools: string[] = []): Promise<ToolResult> {
  if (disabledTools.includes(name)) return { content: `Tool "${name}" is disabled.`, isError: true };
  const def: ToolDef | undefined = TOOL_MAP.get(name);
  if (!def) return { content: `Unknown tool: ${name}`, isError: true };

  try {
    if (def.handler === 'content') {
      const result = await callContentTool(name, input);
      return { content: result != null && String(result) !== '' ? String(result) : 'null' };
    }
    if (def.handler === 'background') {
      const result = await callBackgroundTool(name, input);
      if (result.error) return { content: result.error, isError: true };
      return { content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result) };
    }
    // function handler
    return await def.handler(input);
  } catch (err) {
    return { content: formatToolError(name, (err as Error).message), isError: true };
  }
}
