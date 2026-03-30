import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverId: string;
  serverName: string;
  serverUrl: string;
  serverType: McpTransportType;
  serverHeaders?: Record<string, string>;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
  serverId: string;
  serverName: string;
  serverUrl: string;
  serverType: McpTransportType;
  serverHeaders?: Record<string, string>;
}

export type McpTransportType = 'http' | 'streamable-http';

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;       // e.g. http://localhost:3000/mcp
  enabled: boolean;
  type: McpTransportType; // 'http' | 'streamable-http' — both use StreamableHTTP transport
  headers?: Record<string, string>; // optional custom request headers (e.g. Authorization)
}

export interface McpTool extends Tool {
  name: string;          // prefixed: "mcp__serverName__toolName" (overrides Tool.name)
  originalName: string;  // raw tool name from server (= Tool.name)
  serverId: string;
  serverName: string;
  serverUrl: string;
  serverType: McpTransportType;
  serverHeaders?: Record<string, string>;
  _mcpResources?: McpResource[]; // virtual tools only: attached resource list
}

function createClient(server: McpServerConfig): { client: Client; transport: StreamableHTTPClientTransport } {
  const transport = new StreamableHTTPClientTransport(
    new URL(server.url),
    server.headers && Object.keys(server.headers).length > 0
      ? { requestInit: { headers: server.headers } }
      : undefined,
  );
  const client = new Client({ name: 'ai-page-assist', version: '1.0.0' }, { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() });
  return { client, transport };
}

// Fetch tool list from a single MCP server (all pages)
export async function fetchMcpTools(server: McpServerConfig): Promise<McpTool[]> {
  const { client, transport } = createClient(server);
  await client.connect(transport);
  try {
    const allTools: Tool[] = [];
    let cursor: string | undefined;
    do {
      const res = await client.listTools(cursor ? { cursor } : undefined);
      allTools.push(...res.tools);
      cursor = res.nextCursor;
    } while (cursor);
    return allTools.map((t) => ({
      serverId: server.id,
      serverName: server.name,
      serverUrl: server.url,
      serverType: server.type,
      serverHeaders: server.headers,
      name: `mcp__${server.name}__${t.name}`,
      originalName: t.name,
      description: `[MCP: ${server.name}] ${t.description ?? t.name}`,
      inputSchema: t.inputSchema,
    }));
  } finally {
    await client.close();
  }
}

export interface McpToolResult {
  content: string;
  isError?: boolean;
}

// Call a tool on a MCP server
export async function callMcpTool(
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const server: McpServerConfig = {
    id: tool.serverId,
    name: tool.serverName,
    url: tool.serverUrl,
    enabled: true,
    type: tool.serverType,
    headers: tool.serverHeaders,
  };
  const { client, transport } = createClient(server);
  await client.connect(transport);
  try {
    const result = await client.callTool({ name: tool.originalName, arguments: args }) as CallToolResult;
    if (result.isError) {
      const errText = Array.isArray(result.content)
        ? result.content.map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('')
        : JSON.stringify(result.content);
      return { content: errText, isError: true };
    }
    const text = Array.isArray(result.content)
      ? result.content.map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('')
      : JSON.stringify(result.content);
    return { content: text };
  } catch (e) {
    return { content: String(e), isError: true };
  } finally {
    await client.close();
  }
}

function serverFromResource(r: McpResource): McpServerConfig {
  return { id: r.serverId, name: r.serverName, url: r.serverUrl, enabled: true, type: r.serverType, headers: r.serverHeaders };
}

function serverFromPrompt(p: McpPrompt): McpServerConfig {
  return { id: p.serverId, name: p.serverName, url: p.serverUrl, enabled: true, type: p.serverType, headers: p.serverHeaders };
}

// Fetch all resources from a single MCP server (all pages)
export async function fetchMcpResources(server: McpServerConfig): Promise<McpResource[]> {
  const { client, transport } = createClient(server);
  await client.connect(transport);
  try {
    const all: McpResource[] = [];
    let cursor: string | undefined;
    do {
      const res = await client.listResources(cursor ? { cursor } : undefined);
      for (const r of res.resources) {
        all.push({ uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType, serverId: server.id, serverName: server.name, serverUrl: server.url, serverType: server.type, serverHeaders: server.headers });
      }
      cursor = res.nextCursor;
    } while (cursor);
    return all;
  } finally {
    await client.close();
  }
}

// Read a single resource
export async function readMcpResource(resource: McpResource): Promise<string> {
  const server = serverFromResource(resource);
  const { client, transport } = createClient(server);
  await client.connect(transport);
  try {
    const res = await client.readResource({ uri: resource.uri });
    return res.contents.map((c) => {
      if ('text' in c) return c.text as string;
      if ('blob' in c) return `[binary: ${c.mimeType ?? 'unknown'}]`;
      return JSON.stringify(c);
    }).join('\n');
  } finally {
    await client.close();
  }
}

// Fetch all prompts from a single MCP server (all pages)
export async function fetchMcpPrompts(server: McpServerConfig): Promise<McpPrompt[]> {
  const { client, transport } = createClient(server);
  await client.connect(transport);
  try {
    const all: McpPrompt[] = [];
    let cursor: string | undefined;
    do {
      const res = await client.listPrompts(cursor ? { cursor } : undefined);
      for (const p of res.prompts) {
        all.push({ name: p.name, description: p.description, arguments: p.arguments, serverId: server.id, serverName: server.name, serverUrl: server.url, serverType: server.type, serverHeaders: server.headers });
      }
      cursor = res.nextCursor;
    } while (cursor);
    return all;
  } finally {
    await client.close();
  }
}

// Get a prompt with arguments filled in — returns messages to inject
export async function getMcpPrompt(prompt: McpPrompt, args: Record<string, string>): Promise<{ role: string; content: string }[]> {
  const server = serverFromPrompt(prompt);
  const { client, transport } = createClient(server);
  await client.connect(transport);
  try {
    const res = await client.getPrompt({ name: prompt.name, arguments: args });
    return res.messages.map((m) => ({
      role: m.role,
      content: m.content.type === 'text' ? m.content.text : JSON.stringify(m.content),
    }));
  } finally {
    await client.close();
  }
}
