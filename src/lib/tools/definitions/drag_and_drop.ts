import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'drag_and_drop',
  schema: { name: 'drag_and_drop', description: 'Drag an element and drop it onto another element.', input_schema: { type: 'object' as const, properties: { source_selector: { type: 'string', description: 'CSS selector of the element to drag.' }, target_selector: { type: 'string', description: 'CSS selector of the drop target element.' } }, required: ['source_selector', 'target_selector'] } },
  meta: { label: 'Drag and Drop', description: 'Drag an element onto another element' },
  handler: 'content',
};
