# xcodebuild-get-details

🔍 **Retrieve detailed build or test output from cached results** - Progressive disclosure for logs.

Provides on-demand access to full build and test logs that were cached during xcodebuild-build or xcodebuild-test execution. Implements progressive disclosure pattern: initial build/test responses return concise summaries to prevent token overflow, while this tool allows drilling down into full logs, filtered errors, warnings, or metadata when needed for debugging.

## Advantages

• Access full build logs without cluttering initial responses
• Filter to just errors or warnings for faster debugging
• Retrieve exact command executed and exit code
• Inspect build metadata and cache information

## Parameters

### Required
- buildId (string): Cache ID from xcodebuild-build or xcodebuild-test response
- detailType (string): Type of details to retrieve
  - "full-log": Complete stdout and stderr output
  - "errors-only": Lines containing errors or build failures
  - "warnings-only": Lines containing warnings
  - "summary": Build metadata and configuration used
  - "command": Exact xcodebuild command executed
  - "metadata": Cache info and output sizes

### Optional
- maxLines (number): Maximum lines to return (default: 100)

## Returns

- Tool execution results with requested build or test details
- Full logs or filtered errors/warnings with line counts
- Build metadata and execution information

## Related Tools

- xcodebuild-build: Build iOS projects (returns buildId)
- xcodebuild-test: Run tests (returns testId)
- simctl-get-details: Get simulator list details

## Notes

- Tool is auto-registered with MCP server
- Requires valid cache ID from recent build/test
- Cache IDs expire after 30 minutes
- Use for debugging build failures and test issues

