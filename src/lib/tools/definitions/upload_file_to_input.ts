import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'upload_file_to_input',
  schema: { name: 'upload_file_to_input', description: 'Upload a file to a file input element using base64-encoded content.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector for the file input element.' }, filename: { type: 'string', description: 'The filename to use for the uploaded file.' }, content_base64: { type: 'string', description: 'Base64-encoded file content.' }, mime_type: { type: 'string', description: 'MIME type of the file (e.g. image/png, text/plain).' } }, required: ['selector', 'filename', 'content_base64'] } },
  meta: { label: 'Upload File', description: 'Upload a base64 file to a file input element' },
  handler: 'content',
};
