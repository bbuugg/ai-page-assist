import type { ToolDef } from '../types';

export const def: ToolDef = {
  name: 'preview_get_html',
  schema: {
    name: 'preview_get_html',
    description: 'Get the current full HTML source of the HTML preview page. Use this before making partial edits with preview_exec_js so you understand the current DOM structure.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  meta: { label: 'Get Preview HTML', description: 'Read current HTML from preview page' },
  handler: async () => {
    const result = await new Promise<string>((resolve) => {
      chrome.storage.local.get(['previewHtml'], (r) => resolve(r.previewHtml ?? ''));
    });
    if (!result) return { content: 'Preview page is empty. No HTML has been sent to the preview page yet.', isError: true };
    return { content: result };
  },
};
