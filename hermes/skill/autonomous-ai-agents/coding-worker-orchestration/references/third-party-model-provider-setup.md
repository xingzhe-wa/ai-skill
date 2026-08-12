# Third-Party Model Provider Setup (Claude Code CLI)

When Claude Code CLI is used with non-Anthropic models (e.g. `glm-5.1` / `glm-5.2` via `open.bigmodel.cn`), it needs specific environment configuration. This reference covers the diagnostics and fixes observed in practice.

## Model Recognition Warning

### Symptom

```
"glm-5.2" is not a model this version of Claude Code recognizes, so auto-compact
will keep this session within 200k tokens (the context window it assumes).
```

### Root Cause

Claude Code CLI maintains an internal model registry. Non-Anthropic model names routed through a compatible API endpoint are not recognized, so Claude Code falls back to conservative context-window enforcement (200k tokens).

### Fix

Set the environment variable to suppress the unknown-model enforcement:

```bash
export CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1
```

This is safe — the actual context window is governed by the upstream provider, not Claude Code's internal registry.

## Settings.json Model Mapping

### Configuration Location

`~/.claude/settings.json` contains the env block that maps Claude Code's internal model tiers to actual provider model names:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-5.1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.2",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5.1",
    "ANTHROPIC_AUTH_TOKEN": "<token>",
    "API_TIMEOUT_MS": "600000"
  }
}
```

### Critical: Keep Model Tiers Consistent

If the current chat model is `glm-5.1`, ensure `ANTHROPIC_DEFAULT_SONNET_MODEL` is NOT set to `glm-5.2`. Claude Code defaults to the `sonnet` tier, so a mismatch here causes the wrong model to be used silently.

To fix:

```bash
# Backup
cp ~/.claude/settings.json ~/.claude/settings.json.bak

# Fix: change sonnet mapping to match active model
python -c "
import json
with open('$HOME/.claude/settings.json','r',encoding='utf-8') as f:
    d = json.load(f)
d['env']['ANTHROPIC_DEFAULT_SONNET_MODEL'] = 'glm-5.1'
with open('$HOME/.claude/settings.json','w',encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
"
```

## Dispatch Pattern (Recommended)

When launching Claude Code with a non-native model, always include:

1. **Explicit model flag**: `--model glm-5.1`
2. **Environment override**: `CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1`
3. **Environment model override**: `ANTHROPIC_MODEL=glm-5.1`

Full example:

```bash
cd "D:/project/path" && \
CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 \
ANTHROPIC_MODEL=glm-5.1 \
claude -p "<task>" \
  --model glm-5.1 \
  --allowedTools "Read,Edit,Bash" \
  --max-turns 30 \
  --dangerously-skip-permissions
```

## Print Mode vs Interactive Mode

For batch annotation/editing tasks, prefer **print mode** (`-p`):
- No interactive dialogs to handle
- Exits when done, returns result
- No PTY/tmux needed
- Output appears all at once when complete (not incremental)

For multi-turn iterative work, use **tmux interactive mode** (see the claude-code skill).

## Choosing Between Codex CLI and Claude Code CLI

| Factor | Codex CLI | Claude Code CLI |
|---|---|---|
| Local proxy dependency | Yes (`127.0.0.1:15721` via CC Switch) | No (direct to provider) |
| Model config | `~/.codex/config.toml` | `~/.claude/settings.json` |
| Large annotation tasks | May stall (split into 2-3 files/task) | Generally handles larger batches |
| Reasoning effort control | `model_reasoning_effort` in config | `--effort` flag |
| PTY required | Yes (`pty=true`) | No for print mode |

When Codex CLI stalls or has proxy issues, switching to Claude Code CLI is the preferred fallback — it bypasses the local proxy entirely and connects directly to the provider endpoint.
