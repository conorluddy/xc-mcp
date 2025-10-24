# cache-get-stats

📊 **Get comprehensive statistics across all XC-MCP cache systems** - Monitor cache performance and effectiveness.

Retrieves detailed statistics from the simulator cache, project cache, and response cache systems. Shows hit rates, entry counts, storage usage, and performance metrics across all caching layers. Essential for monitoring cache effectiveness and identifying optimization opportunities.

## Advantages

• Monitor cache performance across all simulator, project, and response caches
• Understand cache hit rates to optimize build and test workflows
• Track memory usage and identify tuning opportunities
• Debug performance issues by analyzing cache patterns

## Parameters

### Required
- (None - retrieves statistics from all cache systems automatically)

### Optional
- (None)

## Returns

- Tool execution results with structured cache statistics
- Statistics for each cache system (simulator, project, response)
- Hit rates, entry counts, and performance metrics
- Timestamp of statistics collection

## Related Tools

- cache-set-config: Configure cache retention times
- cache-get-config: Get current cache configuration
- cache-clear: Clear cached data

## Notes

- Tool is auto-registered with MCP server
- Statistics are calculated in real-time
- Use regularly to monitor cache effectiveness
- Export statistics for performance analysis across time
