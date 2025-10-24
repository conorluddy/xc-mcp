# cache-get-config

🔍 **Get current cache retention configuration settings** - View cache policies.

Retrieves the current cache retention policies for simulator, project, and response caches. Shows both millisecond values and human-readable durations. Essential for understanding your current cache configuration before making adjustments or troubleshooting performance.

## Advantages

• Verify cache retention settings before tuning for specific workflows
• Understand current configuration when troubleshooting stale data issues
• Document cache settings for team collaboration or CI/CD configuration
• Compare settings across different environments (development vs production)

## Parameters

### Required
- (None)

### Optional
- cacheType (string): Which cache config to retrieve - "simulator", "project", "response", or "all". Defaults to "all"

## Returns

- Tool execution results with current cache configuration
- Retention times in both milliseconds and human-readable format
- Fixed response cache duration (30 minutes)

## Related Tools

- cache-set-config: Configure cache retention times
- cache-get-stats: Monitor cache performance
- cache-clear: Clear cached data

## Notes

- Tool is auto-registered with MCP server
- Shows default configurations before any customization
- Response cache duration is fixed at 30 minutes
- Use to verify config changes after using cache-set-config

