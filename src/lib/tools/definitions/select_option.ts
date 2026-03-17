import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'select_option',
  schema: { name: 'select_option', description: 'Select an option from a <select> dropdown element by value or label.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector for the <select> element.' }, value: { type: 'string', description: 'The option value to select.' }, label: { type: 'string', description: 'The option label (text) to select. Used if value is not provided.' } }, required: ['selector'] } },
  meta: { label: 'Select Option', description: 'Select an option from a <select> dropdown' },
  handler: 'content',
};
