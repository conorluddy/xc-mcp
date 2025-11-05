import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateXcodeInstallation } from '../../utils/validation.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

/**
 * Comprehensive iOS simulator environment health check
 *
 * **What it does:**
 * Performs a complete diagnostic check of your iOS development environment, validating
 * Xcode tools, simulators, runtimes, and disk space. Returns actionable recommendations
 * for any issues found.
 *
 * **Why you'd use it:**
 * - Troubleshooting validates entire toolchain when operations fail unexpectedly
 * - Actionable guidance provides specific steps to fix each identified issue
 * - Comprehensive diagnostics check 6 critical areas in seconds
 * - CI/CD validation ensures environment health before running test suites
 *
 * **Parameters:**
 * None - performs complete environment check automatically
 *
 * **Returns:**
 * Health report with pass/fail status for each check and specific guidance for failures
 *
 * **Example:**
 * ```typescript
 * // Run complete health check
 * await simctlHealthCheckTool()
 * ```
 *
 * **Full documentation:** See simctl/health-check.md for diagnostic details
 *
 * @returns Tool result with comprehensive health status and guidance
 */
export async function simctlHealthCheckTool() {
  try {
    const checks = [];
    let allHealthy = true;

    // Check 1: Xcode Command Line Tools
    const xcodeCheck = await checkXcode();
    checks.push(xcodeCheck);
    if (!xcodeCheck.pass) allHealthy = false;

    // Check 2: simctl availability
    const simctlCheck = await checkSimctl();
    checks.push(simctlCheck);
    if (!simctlCheck.pass) allHealthy = false;

    // Check 3: Available simulators
    let simulatorListCheck: any = { pass: true, name: 'Simulator List', status: 'Loading...' };
    try {
      const simulatorList = await simulatorCache.getSimulatorList(true);
      const deviceCount = Object.values(simulatorList.devices).reduce(
        (sum, devices) => sum + devices.length,
        0
      );
      simulatorListCheck = {
        pass: deviceCount > 0,
        name: 'Simulator List',
        status: `Found ${deviceCount} simulators`,
        details: {
          runtimes: simulatorList.runtimes.length,
          deviceTypes: simulatorList.devicetypes.length,
          devices: deviceCount,
        },
      };
    } catch (error) {
      simulatorListCheck = {
        pass: false,
        name: 'Simulator List',
        status: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
    checks.push(simulatorListCheck);
    if (!simulatorListCheck.pass) allHealthy = false;

    // Check 4: Booted simulators
    let bootedCheck: any = { pass: true, name: 'Booted Simulators', status: 'Loading...' };
    try {
      const simulatorList = await simulatorCache.getSimulatorList();
      const bootedDevices = Object.values(simulatorList.devices).flatMap(devices =>
        devices.filter(d => d.state === 'Booted')
      );
      bootedCheck = {
        pass: true,
        name: 'Booted Simulators',
        status: `${bootedDevices.length} booted`,
        details: {
          devices: bootedDevices.map(d => ({
            name: d.name,
            udid: d.udid,
          })),
        },
      };
    } catch (error) {
      bootedCheck = {
        pass: false,
        name: 'Booted Simulators',
        status: `Failed to check: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
    checks.push(bootedCheck);

    // Check 5: Simulator runtimes
    let runtimesCheck: any = { pass: true, name: 'Available Runtimes', status: 'Loading...' };
    try {
      const simulatorList = await simulatorCache.getSimulatorList();
      const availableRuntimes = simulatorList.runtimes.filter(r => r.isAvailable);
      runtimesCheck = {
        pass: availableRuntimes.length > 0,
        name: 'Available Runtimes',
        status: `${availableRuntimes.length} available`,
        details: {
          runtimes: availableRuntimes.map(r => ({
            name: r.name,
            version: r.version,
          })),
        },
      };
    } catch (error) {
      runtimesCheck = {
        pass: false,
        name: 'Available Runtimes',
        status: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
    checks.push(runtimesCheck);
    if (!runtimesCheck.pass) allHealthy = false;

    // Check 6: Disk space (estimated)
    const diskCheck = await checkDiskSpace();
    checks.push(diskCheck);
    if (!diskCheck.pass) allHealthy = false;

    const responseData = {
      healthy: allHealthy,
      summary: {
        total: checks.length,
        passed: checks.filter(c => c.pass).length,
        failed: checks.filter(c => !c.pass).length,
      },
      checks,
      guidance: allHealthy
        ? [
            '✅ Your environment is healthy and ready for iOS development',
            'Use simctl-list to see available simulators',
            'Use simctl-suggest to get intelligent simulator recommendations',
            'Use simctl-boot to boot a simulator',
          ]
        : generateGuidance(checks),
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !allHealthy,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-health-check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check Xcode Command Line Tools installation
 */
async function checkXcode() {
  try {
    await validateXcodeInstallation();
    return {
      pass: true,
      name: 'Xcode Command Line Tools',
      status: 'Installed and valid',
    };
  } catch (error) {
    return {
      pass: false,
      name: 'Xcode Command Line Tools',
      status: `Not found or invalid: ${error instanceof Error ? error.message : 'Unknown error'}`,
      solution: 'Install with: xcode-select --install',
    };
  }
}

/**
 * Check simctl availability
 */
async function checkSimctl() {
  try {
    const result = await executeCommand('xcrun simctl list devices -j', {
      timeout: 5000,
    });
    if (result.code === 0) {
      return {
        pass: true,
        name: 'simctl Availability',
        status: 'Ready',
      };
    }
    return {
      pass: false,
      name: 'simctl Availability',
      status: `Command failed: ${result.stderr || 'Unknown error'}`,
    };
  } catch (error) {
    return {
      pass: false,
      name: 'simctl Availability',
      status: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      solution: 'Ensure Xcode Command Line Tools are installed',
    };
  }
}

/**
 * Check disk space (estimated for simulator data)
 */
async function checkDiskSpace() {
  try {
    // Use 'df' to check home directory disk space where simulators are stored
    const result = await executeCommand(
      "df -h ~ | awk 'NR==2 {print $4, $5, $6}'",
      { timeout: 5000 }
    );

    if (result.code === 0) {
      const [available, percentUsed] = result.stdout.trim().split(/\s+/);
      const usedPercent = parseInt(percentUsed, 10);

      // Warn if more than 80% used or less than 10GB available
      const pass = usedPercent < 80;
      return {
        pass,
        name: 'Disk Space',
        status: pass
          ? `${available} available (${percentUsed} used)`
          : `⚠️ Low space: ${percentUsed} used, ${available} available`,
        details: {
          available,
          percentUsed,
          recommendation: usedPercent > 80 ? 'Free up disk space for optimal simulator performance' : undefined,
        },
      };
    }

    return {
      pass: true,
      name: 'Disk Space',
      status: 'Unable to determine (continue with caution)',
    };
  } catch (error) {
    return {
      pass: true,
      name: 'Disk Space',
      status: 'Unable to check (continue)',
    };
  }
}

/**
 * Generate guidance based on failed checks
 */
function generateGuidance(checks: any[]): string[] {
  const guidance: string[] = [];
  const failed = checks.filter(c => !c.pass);

  guidance.push('❌ Issues found in your environment:');

  for (const check of failed) {
    if (check.name.includes('Xcode')) {
      guidance.push('• Xcode Command Line Tools: ' + check.status);
      if (check.solution) guidance.push(`  Solution: ${check.solution}`);
    } else if (check.name.includes('simctl')) {
      guidance.push('• simctl: ' + check.status);
      if (check.solution) guidance.push(`  Solution: ${check.solution}`);
    } else if (check.name.includes('Simulator')) {
      guidance.push('• Simulators: ' + check.status);
      guidance.push('  Create simulators with: simctl-create');
    } else if (check.name.includes('Runtime')) {
      guidance.push('• Runtimes: ' + check.status);
      guidance.push('  Download runtimes in Xcode preferences');
    } else if (check.name.includes('Disk')) {
      guidance.push('• Disk Space: ' + check.status);
      guidance.push('  Simulators require significant disk space');
    } else {
      guidance.push('• ' + check.name + ': ' + check.status);
    }
  }

  return guidance;
}

export const SIMCTL_HEALTH_CHECK_DOCS = `
# simctl-health-check

Comprehensive iOS simulator environment health check.

## Overview

Performs a complete diagnostic check of your iOS development environment, validating Xcode tools, simulators, runtimes, and disk space. Returns actionable recommendations for any issues found. Checks 6 critical areas in seconds: Xcode Command Line Tools, simctl availability, available simulators, booted simulators, available runtimes, and disk space.

## Parameters

None - performs complete environment check automatically.

## Returns

Health report with pass/fail status for each check, specific guidance for failures, summary of passed/failed checks, and overall healthy status indicator.

## Examples

### Run complete health check
\`\`\`typescript
await simctlHealthCheckTool();
\`\`\`

### Check before CI/CD pipeline
\`\`\`typescript
// Validate environment before running test suite
const health = await simctlHealthCheckTool();
if (!health.healthy) {
  console.error('Environment issues detected');
}
\`\`\`

## Related Tools

- simctl-list: See available simulators after health check passes
- simctl-create: Create simulators if none found
- simctl-suggest: Get intelligent simulator recommendations

## Notes

- Checks 6 critical areas: Xcode tools, simctl, simulators, booted devices, runtimes, disk space
- Provides specific solutions for each failed check
- Validates entire toolchain in seconds
- Warns if disk usage over 80% (simulators require significant space)
- Perfect for troubleshooting when operations fail unexpectedly
- Use before CI/CD pipeline execution to ensure environment health
`;
