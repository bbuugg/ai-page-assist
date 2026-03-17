import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'screenshot',
  schema: { name: 'screenshot', description: 'Capture a screenshot of the visible page or the full page.', input_schema: { type: 'object' as const, properties: { full_page: { type: 'boolean', description: 'If true, capture the full scrollable page. Default false.' } }, required: [] } },
  meta: { label: 'Screenshot', description: 'Capture a screenshot of the page' },
  handler: async (input) => {
    const fullPage = !!(input.full_page);
    const action = fullPage ? 'screenshotFullPage' : 'screenshot';
    const dataUrl = await new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({ action }, (response: { dataUrl?: string; error?: string } | undefined) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (response?.error) reject(new Error(response.error));
        else resolve(response?.dataUrl ?? '');
      });
      setTimeout(() => reject(new Error('screenshot timed out')), 30000);
    });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    return { content: base64, isImage: true };
  },
};
