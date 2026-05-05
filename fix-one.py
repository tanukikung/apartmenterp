#!/usr/bin/env python3
import re
import sys

filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find all occurrences of ${BASE_URL} (without backticks) in goto calls
# Pattern: someVar.goto('${BASE_URL}/path') or page.goto('${BASE_URL}/path')
# We need to replace ${BASE_URL} with BASE_URL (string concat)

# Count total occurrences
total = content.count('${BASE_URL}')
print(f"Total ${'{BASE_URL}'} occurrences: {total}")

# Replace non-backtick ${BASE_URL} with BASE_URL in strings
# This pattern matches ${BASE_URL} not inside backticks
lines = content.split('\n')
fixed_lines = []
for line in lines:
    # Replace ${BASE_URL} when it's in a regular string (with ' or ")
    # But NOT when already part of a template literal
    if '${BASE_URL}' in line:
        # Check if it has backticks on the same line
        if '`${BASE_URL}' in line:
            # Template literal: `${BASE_URL}/path` -> BASE + '/path'
            line = re.sub(r'`\$\{BASE_URL\}', "BASE_URL_TEMP", line)
            line = re.sub(r'BASE_URL_TEMP([^\`]+)', r"BASE + '\1'", line)
            line = line.replace('BASE_URL_REPLACED_BACK', '${BASE_URL}')
        else:
            # Regular string: '${BASE_URL}/path' -> BASE + '/path'
            line = re.sub(r'\$\{BASE_URL\}', "BASE_URL_REPLACED", line)
            line = re.sub(r'BASE_URL_REPLACED([^\s\'\"]+)', r"BASE + '\1'", line)
            line = line.replace('BASE_URL_REPLACED', '${BASE_URL}')

    fixed_lines.append(line)

new_content = '\n'.join(fixed_lines)
remaining = new_content.count('${BASE_URL}')
replacements = total - remaining

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"{filepath}: {replacements} replacements, {remaining} ${'{BASE_URL}'} remaining")