# list-cached-responses

List cached build and test results with progressive disclosure

## Description

Retrieve recent cached build/test results with ability to drill down into full logs via progressive disclosure pattern.

## Parameters

### Optional
- `limit` (number, default: 10): Maximum number of cached responses to return
- `tool` (string): Filter by specific tool (optional)

## Returns

- List of recent cache entries with IDs
- Summary information for each cached operation
- Cache expiry times
- References for accessing full details

## Related Tools

- `xcodebuild-get-details` - Retrieve full build logs from cache ID
- `xcodebuild-test` - Run tests (generates new cache entries)
- `cache-get-stats` - View cache performance statistics
- `cache-clear` - Clear specific caches

## Notes

- Returns summaries only to avoid token waste
- Use returned cache IDs with xcodebuild-get-details for full output
- Ordered by recency (most recent first)
- Limited to reduce response token usage
