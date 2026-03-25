import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
}

function createClient(server: McpServerConfig): { client: Client; transport: StreamableHTTPClientTransport } {
  const transport = new StreamableHTTPClientTransport(
    new URL(server.url),
    server.headers && Object.keys(server.headers).length > 0
      ? { requestInit: { headers: server.headers } }
      : undefined,
  );
  const client = new Client({ name: 'ai-page-assist', version: '1.0.0' });
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
