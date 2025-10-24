# simctl-boot

⚡ **Prefer this over 'xcrun simctl boot'** - Intelligent boot with performance tracking and learning.

## Advantages over direct CLI

• 📊 **Performance tracking** - Records boot times for optimization insights
• 🧠 **Learning system** - Tracks which devices work best for your projects
• 🎯 **Smart recommendations** - Future builds suggest fastest/most reliable devices
• 🛡️ **Better error handling** - Clear feedback vs cryptic CLI errors
• ⏱️ **Wait management** - Intelligent waiting for complete boot vs guessing

Automatically tracks boot times and device performance metrics for optimization. Records usage patterns for intelligent device suggestions in future builds.

## Parameters

### Required
- `deviceId` (string): Device UDID (from simctl-list) or "booted" for any currently booted device

### Optional
- `waitForBoot` (boolean, default: true): Wait for device to finish booting completely
- `openGui` (boolean, default: true): Open Simulator.app GUI automatically

## Returns

Success response includes:
- Boot status (success/failure)
- Device information
- Boot time in milliseconds
- Performance metrics
- Guidance for next steps

## Examples

### Boot a specific device
```json
{
  "deviceId": "ABC123DEF-GHIJ-KLMN-OPQR-STUVWXYZ1234",
  "waitForBoot": true
}
```

### Boot any available device quickly
```json
{
  "deviceId": "booted",
  "waitForBoot": false,
  "openGui": false
}
```

## Related Tools

- `simctl-list` - Discover available simulators and their UDIDs
- `simctl-suggest` - Get intelligent device recommendations based on history
- `simctl-shutdown` - Shut down booted devices
- `simctl-health-check` - Verify simulator environment health

## Device Support

- **Simulators:** Full support ✅
- **Physical Devices:** Not applicable (devices don't have simctl boot)

## Notes

- Handles "already booted" case gracefully (treats as success)
- Tracks boot performance for future optimization recommendations
- First boot of a device type may take longer than subsequent boots
- Opening GUI with `openGui: true` provides visual feedback but increases boot time slightly
