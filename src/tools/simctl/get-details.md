# simctl-get-details

🔍 **Get detailed simulator information from cached list results** - Progressive disclosure for devices.

Retrieves on-demand access to full simulator and runtime lists that were cached during simctl-list execution. Implements progressive disclosure pattern: initial simctl-list responses return concise summaries to prevent token overflow, while this tool allows drilling down into full device lists, filtered by device type or runtime when needed.

## Advantages

• Access full device lists without cluttering initial responses
• Filter to specific device types (iPhone, iPad, etc.)
• Filter to specific runtime versions
• Get only available (booted) devices or all devices
• Paginate results to manage token consumption

## Parameters

### Required
- cacheId (string): Cache ID from simctl-list response

### Optional
- detailType (string): Type of details to retrieve
  - "full-list": Complete device and runtime information
  - "devices-only": Just device information
  - "runtimes-only": Just available runtimes
  - "available-only": Only booted devices
- deviceType (string): Filter by device type (iPhone, iPad, etc.)
- runtime (string): Filter by iOS runtime version
- maxDevices (number): Maximum number of devices to return (default: 20)

## Returns

- Tool execution results with detailed simulator information
- Complete device lists with full state and capabilities
- Available devices and compatible runtimes

## Related Tools

- simctl-list: List available simulators and runtimes
- xcodebuild-get-details: Get build or test details

## Notes

- Tool is auto-registered with MCP server
- Requires valid cache ID from recent simctl-list
- Cache IDs expire after 1 hour
- Use for discovering available devices and runtimes

