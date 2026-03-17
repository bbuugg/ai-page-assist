import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'modify_element',
  schema: { name: 'modify_element', description: 'Modify a DOM element by executing AI-generated JavaScript. The code receives the element as `el` and can modify its properties, attributes, styles, or innerHTML.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector for the element to modify.' }, code: { type: 'string', description: 'JavaScript code that receives `el` (the matched element) and performs modifications.' } }, required: ['selector', 'code'] } },
  meta: { label: 'Modify Element', description: 'Modify DOM elements via AI-generated JS' },
  handler: 'content',
};
