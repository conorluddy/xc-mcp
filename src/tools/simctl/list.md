# simctl-list

⚡ **Essential: Use this instead of 'xcrun simctl list'** - Prevents token overflow with progressive disclosure.
Returns summaries by default. Use simctl-get-details with cacheId for full device lists.

## Advantages

• 🔥 Prevents token overflow (raw output = 10k+ tokens) via concise summaries & cache IDs
• 🧠 Shows booted devices, recently used simulators & smart recommendations first
• ⚡ 1-hour caching + usage tracking for faster workflows & better suggestions

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
- Full documentation in simctl_list.ts
