export type McpTransportType = 'http' | 'streamable-http';

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;       // e.g. http://localhost:3000/mcp
  enabled: boolean;
  type: McpTransportType; // 'http' = legacy JSON-RPC, 'streamable-http' = MCP Streamable HTTP
}

export interface McpTool {
  serverId: string;
  serverName: string;
  serverUrl: string;
  serverType: McpTransportType;
  name: string;          // prefixed: "mcp__serverName__toolName"
  originalName: string;  // raw tool name from server
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

function mcpHeaders(server: McpServerConfig): Record<string, string> {
  if (server.type === 'streamable-http') {
    return { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
  }
  return { 'Content-Type': 'application/json' };
}

async function mcpParseResponse(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/event-stream')) {
    // SSE: read lines and find the first data: {...} line
    const text = await res.text();
    for (const line of text.split('\n')) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data && data !== '[DONE]') return JSON.parse(data);
      }
    }
    return {};
  }
  return res.json();
}

// Fetch tool list from a single MCP server
export async function fetchMcpTools(server: McpServerConfig): Promise<McpTool[]> {
  const res = await fetch(server.url, {
    method: 'POST',
    headers: mcpHeaders(server),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  if (!res.ok) throw new Error(`MCP server "${server.name}" responded ${res.status}`);
  const json = await mcpParseResponse(res) as { result?: { tools?: unknown[] } };
  const tools: { name: string; description?: string; inputSchema?: Record<string, unknown> }[] =
    (json?.result?.tools ?? []) as never[];
  return tools.map((t) => ({
    serverId: server.id,
    serverName: server.name,
    serverUrl: server.url,
    serverType: server.type,
    name: `mcp__${server.name}__${t.name}`,
    originalName: t.name,
    description: `[MCP: ${server.name}] ${t.description ?? t.name}`,
    inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as McpTool['inputSchema'],
  }));
}

export interface McpToolResult {
  content: string;
  isError?: boolean;
  isImage?: boolean;
}

// Call a tool on a MCP server
export async function callMcpTool(
  tool: McpTool,
  args: Record<string, unknown>,
  serverConfig?: McpServerConfig,
): Promise<McpToolResult> {
  try {
    const type = serverConfig?.type ?? tool.serverType;
    const headers = mcpHeaders({ type } as McpServerConfig);
    const res = await fetch(tool.serverUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: tool.originalName, arguments: args },
      }),
    });
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      throw new Error(`MCP server responded ${res.status}${body ? `\n${body}` : ''}`);
    }
    const json = await (type === 'streamable-http' ? mcpParseResponse(res) : res.json()) as { error?: { message?: string }; result?: { content?: unknown } };
    if (json?.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    const content = json?.result?.content;
    const text = Array.isArray(content)
      ? content.map((c: { type: string; text?: string }) => (c.type === 'text' ? c.text ?? '' : JSON.stringify(c))).join('')
      : JSON.stringify(json?.result ?? json);
    return { content: text };
  } catch (e) {
    return { content: String(e), isError: true };
  }
}
