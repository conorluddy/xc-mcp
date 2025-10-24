# cache-clear

🗑️ **Clear cached data to force fresh retrieval and resolve stale state** - Purge cache systems.

Removes all entries from the specified cache system(s). Forces fresh data retrieval on the next operation. Useful for troubleshooting stale cache issues, resetting learned patterns, or clearing memory after major project changes. Can target individual caches or clear all at once.

## Advantages

• Force fresh data after major Xcode project changes (new targets, schemes, build settings)
• Resolve issues caused by stale cached simulator or project data
• Clear memory before performance testing to establish baseline
• Reset learned patterns when switching between project configurations

## Parameters

### Required
- cacheType (string): Which cache to clear - "simulator", "project", "response", or "all"

### Optional
- (None)

## Returns

- Tool execution results with clear operation confirmation
- Results per cache type showing successful clearing
- Timestamp of cache clearing

## Related Tools

- cache-get-stats: Monitor cache before clearing
- cache-set-config: Configure cache retention
- cache-get-config: View cache configuration

## Notes

- Tool is auto-registered with MCP server
- Operation is immediate and irreversible
- Clearing all caches forces fresh retrieval on all tools
- Use before performance benchmarking

