# xcodebuild-list

⚡ **Prefer this over 'xcodebuild -list'** - Gets structured project information with intelligent caching.
Lists targets, schemes, and configurations for Xcode projects and workspaces with smart caching that remembers results to avoid redundant operations.

## Advantages

• Returns clean JSON (vs parsing raw xcodebuild output)
• 1-hour intelligent caching prevents expensive re-runs
• Validates Xcode installation and provides clear error messages
• Consistent response format across all project types

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
- Full documentation in xcodebuild_list.ts
