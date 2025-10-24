#!/usr/bin/env python3
"""
Extract tool documentation from index.ts and generate sidecar .md files

This script:
1. Parses index.ts to find all registerTool() calls
2. Extracts tool name and description from each registration
3. Maps tool name to category (simctl, idb, xcodebuild, cache, etc.)
4. Generates markdown sidecar file for each tool in its category directory
5. Provides summary of generated files

Usage: python3 scripts/extract-tool-docs.py
"""

import re
import os
from pathlib import Path
from typing import Dict, List, Tuple

def parse_index_ts(file_path: str) -> List[Tuple[str, str]]:
    """Extract tool name and description from index.ts

    Returns: List of (tool_name, description) tuples
    """
    with open(file_path, 'r') as f:
        content = f.read()

    tools = []

    # Pattern: this.server.registerTool(
    #   'tool-name',
    #   {
    #     description: `...`,
    #     ...
    pattern = r"this\.server\.registerTool\(\s*['\"]([^'\"]+)['\"],\s*\{\s*description:\s*[`\"]([^`\"]*(?:[^`\"]*)?)[`\"]"

    for match in re.finditer(pattern, content, re.MULTILINE | re.DOTALL):
        tool_name = match.group(1)
        description = match.group(2).strip()

        # Clean up the description
        description = description.replace('\\n', '\n')

        tools.append((tool_name, description))

    return tools

def get_tool_category(tool_name: str) -> str:
    """Map tool name to category directory

    Examples:
    - xcodebuild-version -> xcodebuild
    - simctl-boot -> simctl
    - idb-ui-tap -> idb
    """
    parts = tool_name.split('-')

    # Known categories
    categories = {
        'xcodebuild': ['xcodebuild'],
        'simctl': ['simctl'],
        'idb': ['idb'],
        'cache': ['cache'],
        'persistence': ['persistence'],
    }

    for category, prefixes in categories.items():
        for prefix in prefixes:
            if parts[0] == prefix:
                return category

    return 'unknown'

def get_tool_filename(tool_name: str) -> str:
    """Extract filename from full tool name

    Examples:
    - xcodebuild-version -> version.ts (but .md for docs)
    - simctl-boot -> boot.ts (but .md for docs)
    - idb-ui-tap -> ui-tap.ts (but .md for docs)
    """
    parts = tool_name.split('-', 1)
    if len(parts) == 2:
        return parts[1]  # Remove category prefix
    return tool_name

def format_markdown(tool_name: str, description: str) -> str:
    """Format extracted description as markdown sidecar

    Takes raw description from index.ts and structures it as markdown.
    """

    lines = description.split('\n')

    # Extract advantages (bullet points)
    advantages = []
    summary_lines = []
    in_advantages = False

    for line in lines:
        stripped = line.strip()
        if 'Advantages' in line or 'Benefits' in line or 'Features' in line:
            in_advantages = True
            continue

        if in_advantages:
            if stripped.startswith('•') or stripped.startswith('-'):
                advantages.append(stripped)
            elif stripped.startswith('###') or stripped.startswith('##'):
                in_advantages = False
                summary_lines.append(line)
            elif stripped == '':
                continue
            else:
                in_advantages = False
                summary_lines.append(line)
        else:
            summary_lines.append(line)

    # Build markdown
    md = f"# {tool_name}\n\n"

    # Add description
    for line in summary_lines[:5]:  # First 5 lines
        if line.strip():
            md += line + "\n"

    if advantages:
        md += "\n## Advantages\n\n"
        for adv in advantages[:5]:  # First 5 advantages
            md += adv + "\n"

    md += f"""
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
- Full documentation in {tool_name.replace('-', '_')}.ts
"""

    return md

def main():
    """Main extraction routine"""

    print("📄 Extracting tool documentation from index.ts...")

    index_path = 'src/index.ts'
    if not os.path.exists(index_path):
        print(f"❌ Could not find {index_path}")
        return

    # Parse index.ts
    tools = parse_index_ts(index_path)
    print(f"✅ Found {len(tools)} tools\n")

    # Group by category
    by_category: Dict[str, List[Tuple[str, str]]] = {}

    for tool_name, description in tools:
        category = get_tool_category(tool_name)
        if category not in by_category:
            by_category[category] = []
        by_category[category].append((tool_name, description))

    # Generate .md files
    generated_count = 0

    for category in sorted(by_category.keys()):
        category_tools = by_category[category]
        category_dir = f'src/tools/{category}'

        print(f"📁 {category}/ ({len(category_tools)} tools)")

        for tool_name, description in category_tools:
            tool_filename = get_tool_filename(tool_name)
            md_path = f'{category_dir}/{tool_filename}.md'

            # Check if file already exists
            if os.path.exists(md_path):
                print(f"   ⏭️  {tool_filename}.md (already exists)")
                continue

            # Generate markdown
            markdown = format_markdown(tool_name, description)

            # Write file
            os.makedirs(category_dir, exist_ok=True)
            with open(md_path, 'w') as f:
                f.write(markdown)

            print(f"   ✅ {tool_filename}.md")
            generated_count += 1

    print(f"\n✨ Generated {generated_count} documentation files")
    print(f"📊 Total tools: {len(tools)}")
    print(f"📂 Categories: {', '.join(sorted(by_category.keys()))}")

if __name__ == '__main__':
    main()
