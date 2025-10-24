# persistence-disable

🔒 **Disable Persistent State Management** - Return to in-memory caching only.
Safely disables file-based persistence and optionally clears existing cache data. After disabling, XC-MCP will operate with in-memory caching only, losing state on server restart.
Use this when:

## Parameters

### Required
- (See implementation for parameters)

### Optional
- (See implementation for optional parameters)

## Returns

- Tool execution results with structured output
- Success/failure status
- Guidance for next steps

## Related Tools

- See MCP server documentation for related tools

## Notes

- Tool is auto-registered with MCP server
- Full documentation in persistence_disable.ts
