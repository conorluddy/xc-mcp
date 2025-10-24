# screenshot-save

Take screenshot and save to file path

## Description

Capture simulator screen and save as PNG file to specified file path on disk.

## Parameters

### Required
- `deviceId` (string): Device UDID (from simctl-list)
- `outputPath` (string): File path where screenshot PNG will be saved

### Optional
- `size` (string, default: 'half'): Screenshot size preset
  - Options: 'full', 'half', 'quarter', 'thumb'

## Returns

- Success status
- File path where screenshot was saved
- Image dimensions
- File size information
- Metadata about captured screenshot

## Related Tools

- `simctl-screenshot-inline` - Capture screenshot and return as base64 inline
- `simctl-io` - General I/O operations including screenshots
- `simctl-addmedia` - Add media to simulator photo library

## Notes

- Saves PNG file to specified path
- Creates intermediate directories if needed
- For use with external image processing tools
- File can then be used with coordinate transformation for UI automation
