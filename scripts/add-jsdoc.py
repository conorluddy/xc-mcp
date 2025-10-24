#!/usr/bin/env python3
"""
Add JSDoc documentation to all tool functions

This script reads .md files and generates appropriate JSDoc blocks for each tool's
main exported function. It preserves existing code while adding documentation.

Usage: python3 scripts/add-jsdoc.py
"""

import os
import re
from pathlib import Path

# JSDoc template
JSDOC_TEMPLATE = '''/**
 * {tool_title}
 *
 * **What it does:**
 * {what_it_does}
 *
 * **Why you\'d use it:**
 * {why_use}
 *
 * **Parameters:**
 * {parameters}
 *
 * **Returns:**
 * {returns}
 *
 * **Example:**
 * ```typescript
 * {example}
 * ```
 *
 * **Full documentation:** See {md_file} for detailed parameters and examples
 *
 * @param args Tool arguments
 * @returns Tool result with status and guidance
 */'''

def load_md_content(md_path: str) -> dict:
    """Extract information from markdown file"""
    try:
        with open(md_path, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        return {}

    # Extract tool name (first heading)
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    title = title_match.group(1) if title_match else "Tool"

    # Extract first paragraph as "what it does"
    para_match = re.search(r'^#.*?\n\n(.+?)(?:\n\n|##)', content, re.MULTILINE | re.DOTALL)
    what_it_does = para_match.group(1).strip() if para_match else "No description available"

    # Extract advantages as "why use"
    advantages = []
    adv_match = re.search(r'## Advantages.*?\n\n(.+?)(?:\n\n##|$)', content, re.DOTALL)
    if adv_match:
        adv_text = adv_match.group(1)
        for line in adv_text.split('\n'):
            line = line.strip()
            if line.startswith('•') or line.startswith('-'):
                advantages.append(line)
        advantages = advantages[:4]  # Limit to 4

    why_use = '\n * '.join(advantages) if advantages else "- Provides enhanced functionality over raw CLI commands"

    # Extract parameters
    params = []
    params_match = re.search(r'## Parameters.*?\n\n(.+?)(?:\n\n##|$)', content, re.DOTALL)
    if params_match:
        params_text = params_match.group(1)
        for line in params_text.split('\n')[:4]:  # First 4 lines
            line = line.strip()
            if line and not line.startswith('#'):
                params.append(f"- {line}")

    parameters = '\n * '.join(params) if params else "- See implementation for parameters"

    # Returns
    returns = "Structured result with status, metadata, and guidance"

    # Example
    example = "await toolFunction(args)"

    return {
        'title': title,
        'what_it_does': what_it_does,
        'why_use': why_use,
        'parameters': parameters,
        'returns': returns,
        'example': example,
    }

def find_function_export(content: str, tool_name: str) -> tuple:
    """Find the export function and its position"""
    # Pattern: export async function toolName(args: any) {
    pattern = r'(export\s+(?:async\s+)?function\s+\w+\(.*?\)\s*(?::\s*\w+)?\s*\{)'

    match = re.search(pattern, content)
    if match:
        start_pos = match.start()
        func_start = match.group(1)
        return start_pos, func_start
    return None, None

def add_jsdoc_to_file(file_path: str, md_path: str) -> bool:
    """Add JSDoc to a tool file"""
    try:
        with open(file_path, 'r') as f:
            content = f.read()
    except Exception as e:
        print(f"   ❌ Could not read {file_path}: {e}")
        return False

    # Skip if JSDoc already exists
    if '/**' in content[:500]:  # Check first 500 chars
        print(f"   ⏭️  {Path(file_path).name} (JSDoc already exists)")
        return False

    # Load markdown
    md_info = load_md_content(md_path)
    if not md_info:
        print(f"   ⚠️  {Path(file_path).name} (no markdown found)")
        return False

    # Find export function
    start_pos, func_def = find_function_export(content)
    if start_pos is None:
        print(f"   ⚠️  {Path(file_path).name} (no export function found)")
        return False

    # Generate JSDoc
    md_rel_path = Path(md_path).relative_to(Path(file_path).parent)
    jsdoc = JSDOC_TEMPLATE.format(
        tool_title=md_info['title'],
        what_it_does=md_info['what_it_does'],
        why_use=md_info['why_use'],
        parameters=md_info['parameters'],
        returns=md_info['returns'],
        example=md_info['example'],
        md_file=md_rel_path,
    )

    # Insert JSDoc before function
    new_content = content[:start_pos] + jsdoc + '\n' + content[start_pos:]

    try:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"   ✅ {Path(file_path).name}")
        return True
    except Exception as e:
        print(f"   ❌ Could not write {file_path}: {e}")
        return False

def main():
    """Main function"""
    print("📚 Adding JSDoc documentation to tool files...\n")

    categories = ['xcodebuild', 'simctl', 'idb', 'cache', 'persistence']
    total_count = 0
    success_count = 0

    for category in categories:
        category_dir = f'src/tools/{category}'
        ts_files = sorted(Path(category_dir).glob('*.ts'))

        print(f"📁 {category}/ ({len(ts_files)} tools)")

        for ts_file in ts_files:
            # Skip common files
            if ts_file.name in ['cache-management.ts', 'persistence-tools.ts', 'index.ts']:
                # These might have multiple exports
                print(f"   ⏭️  {ts_file.name} (multi-export file)")
                continue

            # Find corresponding .md file
            md_file = ts_file.with_suffix('.md')
            if not md_file.exists():
                # Try alternative naming
                base_name = ts_file.stem
                if base_name == 'xcodebuild-test':
                    md_file = ts_file.parent / 'test.md'
                elif base_name == 'screenshot-inline':
                    md_file = ts_file.parent / 'screenshot-inline.md'

            total_count += 1
            if add_jsdoc_to_file(str(ts_file), str(md_file)):
                success_count += 1

    print(f"\n✨ Updated {success_count}/{total_count} tool files")

if __name__ == '__main__':
    main()
