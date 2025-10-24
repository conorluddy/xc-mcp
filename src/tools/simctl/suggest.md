# simctl-suggest

🧠 **Intelligent Simulator Suggestion** - Recommends best simulators based on project history, performance, and popularity.
Scoring algorithm considers: project preference (40%), recent usage (40%), iOS version (30%), popular model (20%), boot performance (10%).

## Advantages

• 🎯 **Project-aware** - Remembers your preferred simulator per project
• 📊 **Performance metrics** - Learns boot times and reliability
• 🏆 **Popularity ranking** - Suggests popular models (iPhone 16 Pro > iPhone 15, etc.)
• 💡 **Transparent scoring** - Shows reasoning for each recommendation
• ⚡ **Auto-boot option** - Optionally boots top suggestion immediately

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
- Full documentation in simctl_suggest.ts
