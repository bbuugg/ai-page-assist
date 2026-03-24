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

export function buildAgentSystemPrompt(agent: Agent): string {
  const toolsHint = agent.recommendedTools.length > 0
    ? `\n\nPreferred tools for this agent: ${agent.recommendedTools.join(', ')}.`
    : '';
  return `\n\n---\nActive Agent: ${agent.label}\n${agent.systemPrompt}${toolsHint}`;
}
