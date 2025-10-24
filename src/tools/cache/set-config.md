# cache-set-config

⚙️ **Configure cache retention times to optimize for your workflow** - Fine-tune cache policies.

Fine-tune cache retention policies for simulator, project, and response caches. Allows you to balance performance (longer cache retention) against freshness (shorter retention). Default is 1 hour for most caches. Supports specifying duration in milliseconds, minutes, or hours for convenience.

## Advantages

• Optimize for development workflows (longer cache = faster repeated operations)
• Optimize for CI/CD environments (shorter cache = fresher data, less stale state)
• Reduce memory usage by lowering retention times for infrequently-accessed caches
• Extend retention for slow-changing projects to maximize performance gains

## Parameters

### Required
- cacheType (string): Which cache to configure - "simulator", "project", "response", or "all"

### Optional
- maxAgeMs (number): Cache retention in milliseconds
- maxAgeMinutes (number): Cache retention in minutes (alternative to maxAgeMs)
- maxAgeHours (number): Cache retention in hours (alternative to maxAgeMs)

Note: Specify exactly one of maxAgeMs, maxAgeMinutes, or maxAgeHours. Minimum 1000ms (1 second).

## Returns

- Tool execution results with configuration update confirmation
- Results per cache type with human-readable durations
- Timestamp of configuration change

## Related Tools

- cache-get-config: Get current cache configuration
- cache-get-stats: Monitor cache performance
- cache-clear: Clear cached data

## Notes

- Tool is auto-registered with MCP server
- Changes apply immediately
- Response cache is currently fixed at 30 minutes
- Use with cache-get-stats to verify effectiveness

