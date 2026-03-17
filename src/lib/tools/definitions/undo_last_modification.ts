import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'undo_last_modification',
  schema: { name: 'undo_last_modification', description: 'Undo the last modify_element operation, restoring the previous DOM state.', input_schema: { type: 'object' as const, properties: {}, required: [] } },
  meta: { label: 'Undo Modification', description: 'Undo the last modify_element change' },
  handler: 'content',
};
