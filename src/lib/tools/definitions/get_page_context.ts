import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'get_page_context',
  schema: {
    name: 'get_page_context',
    description: 'Get the current page URL, title, and a plain-text summary of visible content (up to ~3000 chars). Call this whenever you need to know what page the user is on or what the page contains before answering a question.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  meta: { label: 'Get Page Context', description: 'Get current page URL, title and text summary' },
  handler: 'content',
};
