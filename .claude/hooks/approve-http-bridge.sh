#!/bin/bash
# Auto-approve bash commands that interact with the Figma HTTP Bridge
# No jq dependency — uses python3 for JSON parsing and plain echo for output

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Auto-approve anything hitting the HTTP Bridge
if echo "$COMMAND" | grep -q "localhost:3056"; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"HTTP Bridge command"}}'
  exit 0
fi

# Auto-approve writing to /tmp/figma-cmd.json (used for bridge payloads)
if echo "$COMMAND" | grep -q "/tmp/figma-cmd.json"; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Figma temp file"}}'
  exit 0
fi

# Everything else: proceed to normal permission check
exit 0
