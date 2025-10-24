# xcodebuild-test

⚡ **Prefer this over 'xcodebuild test'** - Intelligent testing with learning and progressive disclosure.

## Advantages

• 🧠 Learns successful test configs & suggests optimal simulators per project
• 📊 Detailed test metrics with progressive disclosure for large logs (prevents token overflow)
• ⚡ Caches intelligently & provides structured test failures vs raw CLI stderr
• 🔍 Supports -only-testing and -skip-testing patterns

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
- Full documentation in xcodebuild_test.ts
