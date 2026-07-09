import { useMemo, useState, memo } from 'react';
import { AppRenderer, type RequestHandlerExtra } from '@mcp-ui/client';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpAppInfo } from '../../lib/ai';
import { callMcpTool } from '../../lib/mcp';

interface McpAppFrameProps {
  info: McpAppInfo;
}

/**
 * Renders an MCP App in a sandboxed iframe using @mcp-ui/client's AppRenderer.
 *
 * We use the "no client" mode: the HTML is pre-fetched and passed via the `html`
 * prop, so AppRenderer skips resource fetching. App-originated tool calls are
 * proxied back to the originating MCP server via an ephemeral client created
 * inside `onCallTool` (matching this extension's ephemeral-connection pattern).
 *
 * The sandbox proxy iframe (sandbox.html, a web_accessible_resource) hosts the
 * guest HTML in a double-iframe for security isolation.
 */
const McpAppFrameInner = ({ info }: McpAppFrameProps) => {
  const [height, setHeight] = useState(240);
  const [collapsed, setCollapsed] = useState(false);

  // Sandbox proxy URL — loaded from the extension's web_accessible_resources.
  const sandboxUrl = useMemo(() => {
    return new URL(chrome.runtime.getURL('sandbox.html'));
  }, []);

  // Proxy app-originated tool calls back to the originating MCP server.
  // Each call spins up an ephemeral client (connect -> callTool -> close).
  const handleCallTool = useMemo(() => {
    return async (
      params: CallToolRequest['params'],
      _extra: RequestHandlerExtra,
    ): Promise<CallToolResult> => {
      try {
        const result = await callMcpTool(
          {
            name: params.name,
            originalName: params.name,
            serverId: info.serverId,
            serverName: info.serverName,
            serverUrl: info.serverUrl,
            serverType: info.serverType,
            serverHeaders: info.serverHeaders,
            description: '',
            inputSchema: { type: 'object', properties: {} },
          },
          (params.arguments as Record<string, unknown>) ?? {},
        );
        return {
          content: result.rawContent ?? [{ type: 'text', text: result.content }],
          isError: result.isError ?? false,
        };
      } catch (e) {
        return {
          content: [{ type: 'text', text: String(e) }],
          isError: true,
        };
      }
    };
  }, [info]);

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-border bg-background">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1.5 w-full bg-transparent border-none cursor-pointer px-2.5 py-1 text-[11px] text-left text-muted-foreground hover:bg-muted/50"
      >
        <span style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.18s', display: 'inline-block' }}>▶</span>
        MCP App: {info.toolName}
      </button>
      {!collapsed && (
        <div className="border-t border-border">
          <div style={{ height: `${height}px`, minHeight: '150px' }} className="w-full">
            <AppRenderer
              toolName={info.toolName}
              html={info.html}
              sandbox={{ url: sandboxUrl }}
              toolInput={info.input}
              toolResult={{ content: info.structuredResult }}
              onCallTool={handleCallTool}
              onSizeChanged={({ height: h }) => {
                if (h !== undefined && h > 0 && h < 2000) {
                  setHeight(h);
                }
              }}
              onOpenLink={async ({ url }) => {
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                return {};
              }}
              onError={(err) => console.error('[McpAppFrame] AppRenderer error:', err)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const McpAppFrame = memo(McpAppFrameInner);
