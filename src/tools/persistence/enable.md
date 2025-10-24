# persistence-enable

🔋 **Enable opt-in persistent state management for learning across server restarts** - Activate persistence.

Activates file-based persistence for XC-MCP's intelligent caching systems. Stores usage patterns, build preferences, simulator performance metrics, and cached responses to disk. Enables the system to learn and improve over time, remembering successful configurations across server restarts. Privacy-first design: NO source code, credentials, or personal information is persisted.

## Advantages

• Retain learned build configurations and simulator preferences across restarts
• Accelerate repeated workflows by persisting successful operation patterns
• Enable team collaboration with shared project-local cache optimizations
• Maintain performance insights across CI/CD pipeline runs

## Parameters

### Required
- (None)

### Optional
- cacheDir (string): Custom directory for cache storage. If omitted, uses intelligent location selection

## Returns

- Tool execution results with persistence activation confirmation
- Cache directory location (resolved or custom)
- Storage information and writability status
- Privacy notice and next steps

## Related Tools

- persistence-disable: Turn off persistence
- persistence-status: View persistence system status

## Notes

- Tool is auto-registered with MCP server
- Privacy-first design - only patterns and preferences stored
- Enables team sharing via project-local cache
- Automatically selects best cache location if not specified

