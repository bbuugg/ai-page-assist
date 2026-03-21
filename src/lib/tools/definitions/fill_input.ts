import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'fill_input',
  schema: { name: 'fill_input', description: 'Fill a text value into an input or textarea element on the page.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector for the input or textarea.' }, value: { type: 'string', description: 'The text value to fill in.' } }, required: ['selector', 'value'] } },
  meta: { label: 'Fill Input', description: 'Fill text into an input or textarea' },
  handler: 'content',
};
