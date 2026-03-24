import type { Agent } from '../index';

export const formAgent: Agent = {
  id: 'builtin-form',
  name: 'form',
  label: '表单自动填写',
  description: '智能填写并提交表单。',
  icon: '📝',
  systemPrompt: 'You are an expert at web form automation. Identify all form fields, understand their purpose, and fill them accurately. Always verify values after filling.',
  recommendedTools: ['extract_page_elements', 'fill_input', 'click_element', 'select_option', 'query_page'],
  isBuiltin: true,
};
