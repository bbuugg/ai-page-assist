import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'set_cookie',
  schema: { name: 'set_cookie', description: 'Set a cookie on the current page or a specified URL.', input_schema: { type: 'object' as const, properties: { name: { type: 'string', description: 'Cookie name.' }, value: { type: 'string', description: 'Cookie value.' }, url: { type: 'string', description: 'URL to set cookie for. Omit to use the current page URL.' } }, required: ['name', 'value'] } },
  meta: { label: 'Set Cookie', description: 'Set a cookie on the current page' },
  handler: 'background',
};
