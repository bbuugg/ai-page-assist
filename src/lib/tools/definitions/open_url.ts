import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'open_url',
  schema: { name: 'open_url', description: 'Navigate the current browser tab to a URL.', input_schema: { type: 'object' as const, properties: { url: { type: 'string', description: 'The URL to navigate to.' } }, required: ['url'] } },
  meta: { label: 'Open URL', description: 'Navigate the tab to a URL' },
  handler: async (input) => {
    const url = input.url as string;
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'openUrl', url }, (response: { error?: string } | undefined) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (response?.error) reject(new Error(response.error));
        else resolve();
      });
    });
    return { content: `Navigated to ${url}` };
  },
};
