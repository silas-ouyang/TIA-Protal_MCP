# TIA Portal MCP 配置说明

### DSH 配置文件

```yml
- insert:
    - id: mcp-tia-portal
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: tia-portal-mcp
        transport: streamable-http
        url: 'http://127.0.0.1:8000/mcp'
        toolCallTimeoutMs: 600000
        failOnStartupError: false
```
