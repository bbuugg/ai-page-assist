import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'clear_input',
  schema: { name: 'clear_input', description: 'Clear the value of an input or textarea element.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector for the input or textarea to clear.' } }, required: ['selector'] } },
  meta: { label: 'Clear Input', description: 'Clear an input or textarea element' },
  handler: 'content',
};
