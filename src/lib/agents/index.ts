export interface Agent {
  id: string;
  name: string;          // @mention trigger (lowercase, no spaces)
  label: string;         // display name
  description: string;
  icon: string;          // emoji
  systemPrompt: string;
  recommendedTools: string[];
  isBuiltin: boolean;
}

import { seoAgent } from './builtin/seo';
import { codeAgent } from './builtin/code';
import { formAgent } from './builtin/form';
import { dataAgent } from './builtin/data';
import { a11yAgent } from './builtin/a11y';
import { shoppingAgent } from './builtin/shopping';
import { browserAgent } from './builtin/browser';
import { apidocAgent } from './builtin/apidoc';
import { apidebugAgent } from './builtin/apidebug';
import { pptAgent } from './builtin/ppt';

export const BUILTIN_AGENTS: Agent[] = [
  seoAgent,
  codeAgent,
  formAgent,
  dataAgent,
  a11yAgent,
  shoppingAgent,
  browserAgent,
  apidocAgent,
  apidebugAgent,
  pptAgent,
];

export async function loadCustomAgents(): Promise<Agent[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['customAgents'], (result) => {
      resolve(result.customAgents ?? []);
    });
  });
}

export async function saveCustomAgents(agents: Agent[]): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ customAgents: agents }, resolve));
}

export function getAllAgents(customAgents: Agent[]): Agent[] {
  return [...BUILTIN_AGENTS, ...customAgents];
}

const PAGE_CONTEXT_TOOLS = new Set(['get_page_context', 'get_full_page_html', 'query_page', 'extract_page_elements', 'get_element_html', 'get_element_css', 'get_dom_state']);

export function buildAgentSystemPrompt(agent: Agent): string {
  const toolsHint = agent.recommendedTools.length > 0
    ? `\n\nPreferred tools for this agent: ${agent.recommendedTools.join(', ')}.`
    : '';
  const pageCtxHint = agent.recommendedTools.some((t) => PAGE_CONTEXT_TOOLS.has(t))
    ? '\n\nPage context: Each user message automatically includes a [Page context] block with the current page URL, title, and text summary — you do NOT need to call get_page_context. Use this context to answer page-related questions directly. If the page context says the current page is unavailable or is an internal browser page such as chrome://, edge://, or about:, do NOT call page interaction or DOM-reading tools on that page.' +
      '\n\nPage navigation rules: If the current page URL starts with chrome://, edge://, about:, data:, or javascript:, do NOT call any page content tools — use navigation tools first (open_url, open_tab, switch_tab), then page tools after reaching a normal web page. Never navigate away from the current page unless the user explicitly requests it.'
    : '';
  return `\n\n---\nActive Agent: ${agent.label}\n${agent.systemPrompt}${toolsHint}${pageCtxHint}`;
}
