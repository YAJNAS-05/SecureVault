#!/usr/bin/env bash
# Bring up the SQLInsight multi-agent swarm with ruflo.
# Prereqs: `npx ruflo@latest init` and `claude mcp add ruflo -- npx ruflo@latest mcp start`
# See docs/RUFLO_GUIDE.md and docs/IMPLEMENTATION_PLAN.md.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="ruflo/swarm.config.json"
echo "==> Initializing swarm from $CONFIG"

# 1. Create the swarm (hierarchical, queen-led).
ruflo swarm init --topology hierarchical --max-agents 8 --name sqlinsight

# 2. Freeze the shared contracts in memory BEFORE fan-out so parallel agents agree.
ruflo memory store --key spec/thesis      --file docs/thesis/thesis_extracted_text.txt || true
ruflo memory store --key contract/api     --file ruflo/contracts/api.json
ruflo memory store --key contract/metrics --file ml/artifacts/metrics.json || true

# 3. Spawn specialists (each reads its task file in ruflo/agents/).
ruflo agent spawn researcher       --task-file ruflo/agents/researcher.md
ruflo agent spawn ml-developer     --task-file ruflo/agents/ml-engineer.md
ruflo agent spawn backend-dev      --task-file ruflo/agents/backend-engineer.md
ruflo agent spawn frontend-dev     --task-file ruflo/agents/frontend-engineer.md
ruflo agent spawn api-docs         --task-file ruflo/agents/docs-writer.md
ruflo agent spawn tester           --task-file ruflo/agents/integrator-qa.md
ruflo agent spawn security-manager --task-file ruflo/agents/security-reviewer.md

# 4. Watch progress.
ruflo swarm status
echo "==> Swarm launched. Use 'ruflo swarm status' to monitor, 'ruflo verify' when done."
