import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'fetch_url',
  schema: { name: 'fetch_url', description: 'Fetch the content of any URL and return the response body as text.', input_schema: { type: 'object' as const, properties: { url: { type: 'string', description: 'The URL to fetch.' } }, required: ['url'] } },
  meta: { label: 'Fetch URL', description: 'Fetch content from any URL' },
  handler: async (input) => {
    const result = await new Promise<{ text?: string; status?: number; statusText?: string; error?: string }>((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchUrl', url: input.url }, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
    if (result.error) return { content: result.error, isError: true };
    return { content: `${result.status} ${result.statusText}\n${result.text}` };
  },
};
