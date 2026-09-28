#!/usr/bin/env bash
set -euo pipefail
# Requires: pip install genlayer-test genvm-linter pytest
setup_json=$(genvm-lint setup --contract contracts/uptime_credit.py --json)
export PYTHONPATH="$(SETUP_JSON="$setup_json" python - <<'PY'
import json, os
print(':'.join(json.loads(os.environ['SETUP_JSON'])['extraPaths']))
PY
)${PYTHONPATH:+:$PYTHONPATH}"
python -m pytest tests -q
