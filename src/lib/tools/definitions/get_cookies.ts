import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'get_cookies',
  schema: { name: 'get_cookies', description: 'Get all cookies for the current page or a specified URL.', input_schema: { type: 'object' as const, properties: { url: { type: 'string', description: 'URL to get cookies for. Omit to use the current page URL.' } }, required: [] } },
  meta: { label: 'Get Cookies', description: 'Get cookies for the current page' },
  handler: 'background',
};
