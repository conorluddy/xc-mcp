import { executeCommand } from './command.js';

/**
 * Element information extracted from accessibility tree
 */
export interface AccessibilityElement {
  type: string;
  label?: string;
  identifier?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  enabled?: boolean;
  visible?: boolean;
  hittable?: boolean;
}

/**
 * Extract interactive elements from an app's accessibility tree
 *
 * This queries the accessibility tree to find buttons, text fields, and other
 * interactive elements, returning their positions and properties.
 */
export async function extractAccessibilityElements(
  udid: string,
  bundleId: string
): Promise<AccessibilityElement[]> {
  try {
    // Query common interactive element types
    const elementTypes = [
      'XCUIElementTypeButton',
      'XCUIElementTypeTextField',
      'XCUIElementTypeSecureTextField',
      'XCUIElementTypeSwitch',
      'XCUIElementTypeSlider',
      'XCUIElementTypeStaticText',
      'XCUIElementTypeLink',
      'XCUIElementTypePickerWheel',
    ];

    const elements: AccessibilityElement[] = [];

    // Query each element type with location capture
    for (const elementType of elementTypes) {
      try {
        const predicate = `type == "${elementType}"`;
        const command = `xcrun simctl query "${udid}" "${bundleId}" "${predicate}" --locations`;

        const result = await executeCommand(command, {
          timeout: 10000,
        });

        if (result.code === 0 && result.stdout.trim()) {
          // Parse the query output
          const lines = result.stdout.trim().split('\n');

          for (const line of lines) {
            if (line.trim()) {
              try {
                // Try to parse as JSON or extract element info
                const element = parseElementLine(line, elementType);
                if (element) {
                  elements.push(element);
                }
              } catch {
                // Skip lines that can't be parsed
              }
            }
          }
        }
      } catch {
        // Continue with next element type if this one fails
      }
    }

    return elements;
  } catch (error) {
    console.error('[element-extraction] Error extracting elements:', error);
    return [];
  }
}

/**
 * Parse an element line from simctl query output
 *
 * The output format varies, but typically includes type, label, and location info
 */
function parseElementLine(line: string, elementType: string): AccessibilityElement | null {
  try {
    // Try to extract basic info from the line
    // Format typically: "Button, \"Label\", ... {x, y}"
    const element: AccessibilityElement = {
      type: elementType,
    };

    // Extract label if present (between quotes)
    const labelMatch = line.match(/"([^"]+)"/);
    if (labelMatch) {
      element.label = labelMatch[1];
    }

    // Try to extract coordinates {x, y, width, height}
    const boundsMatch = line.match(/\{x ([\d.]+) y ([\d.]+) w ([\d.]+) h ([\d.]+)\}/);
    if (boundsMatch) {
      element.bounds = {
        x: Math.round(parseFloat(boundsMatch[1])),
        y: Math.round(parseFloat(boundsMatch[2])),
        width: Math.round(parseFloat(boundsMatch[3])),
        height: Math.round(parseFloat(boundsMatch[4])),
      };
    }

    // Extract state information
    if (line.includes('enabled: 0')) {
      element.enabled = false;
    } else if (line.includes('enabled: 1')) {
      element.enabled = true;
    }

    if (line.includes('hittable: 0')) {
      element.hittable = false;
    } else if (line.includes('hittable: 1')) {
      element.hittable = true;
    }

    // Only return if we got some meaningful data
    if (element.label || element.bounds) {
      return element;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get screen dimensions for the simulator
 */
export async function getScreenDimensions(
  udid: string
): Promise<{ width: number; height: number; scale: number } | null> {
  try {
    // Use xcrun to get device info
    const command = `xcrun simctl list devices -j`;
    const result = await executeCommand(command, { timeout: 5000 });

    if (result.code === 0) {
      try {
        const data = JSON.parse(result.stdout);
        // Search for the device to get its screen size
        // For now, return common dimensions - can be enhanced with actual device info
        for (const runtime in data.devices) {
          const devices = data.devices[runtime];
          const device = devices.find((d: any) => d.udid === udid);
          if (device) {
            // Return common iPhone dimensions
            // In reality, this would be retrieved from device capabilities
            return {
              width: 393, // iPhone 16 dimensions
              height: 852,
              scale: 3,
            };
          }
        }
      } catch {
        // Fallback to common dimensions
      }
    }

    return null;
  } catch {
    return null;
  }
}
