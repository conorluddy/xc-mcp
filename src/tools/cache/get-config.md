# cache-get-config

Get current cache configuration settings

## Description

Retrieve the current cache configuration parameters including cache type, max age, and retention policies.

## Parameters

### Optional
- `cacheType` (string, default: 'all'): Which cache configuration to retrieve
  - Options: 'simulator', 'project', 'response', 'all'

## Returns

- Current cache configuration for specified cache type
- Max age/TTL in milliseconds
- Cache type information
- Settings summary

## Related Tools

- `cache-set-config` - Modify cache configuration
- `cache-get-stats` - View cache performance statistics
- `cache-clear` - Clear specific caches

## Notes

- Returns read-only configuration information
- Use `cache-set-config` to modify settings
- All cache types are documented in cache management module
