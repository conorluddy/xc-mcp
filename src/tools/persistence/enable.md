# persistence-enable

🔒 **Enable Opt-in Persistent State Management** - File-based persistence for cache data across server restarts.
**Privacy First**: Disabled by default. Only usage patterns, build preferences, and performance metrics are stored. No source code, credentials, or personal information is persisted.
Storage Location Priority:

## Advantages

• 📈 **Learns Over Time** - Remembers successful build configurations and simulator preferences
• 🚀 **Faster Workflows** - Cached project information and usage patterns persist across restarts
• 🤝 **Team Sharing** - Project-local caching allows teams to benefit from shared optimizations
• 💾 **CI/CD Friendly** - Maintains performance insights across build environments

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
- Full documentation in persistence_enable.ts
