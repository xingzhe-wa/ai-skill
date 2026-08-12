# Codex CLI Environment Fixes

Diagnostic recipes for when `codex exec` fails before reaching the model.

## 403 Forbidden: Reasoning-Effort Disabled by Team Admin

### Symptom

```
ERROR: unexpected status 403 Forbidden: CC Switch local proxy failed while handling Codex endpoint /responses. Provider: pier-codex; model: gpt-5.5; upstream_status: HTTP 403; cause: 当前团队「派迩-机组团队」已禁用模型「gpt-5.5」的推理级别「xhigh」，请求未发送成功。
```

### Root Cause

`~/.codex/config.toml` contains `model_reasoning_effort = "xhigh"`, but the team/org admin has disabled that reasoning level for the configured model.

### Fix

```bash
# 1. Backup
cp ~/.codex/config.toml ~/.codex/config.toml.bak

# 2. Downgrade reasoning effort
sed -i 's/model_reasoning_effort = "xhigh"/model_reasoning_effort = "high"/' ~/.codex/config.toml

# 3. Verify the change
grep model_reasoning_effort ~/.codex/config.toml

# 4. Smoke test — must return before dispatching real work
codex exec "reply OK" --sandbox danger-full-access
```

### Key Config Fields to Check

| Field | Location | Effect |
|---|---|---|
| `model` | `~/.codex/config.toml` (top-level) | Which model Codex calls (e.g. `gpt-5.5`) |
| `model_reasoning_effort` | `~/.codex/config.toml` (top-level) | Reasoning depth: `low`/`medium`/`high`/`xhigh` |
| `model_provider` | `~/.codex/config.toml` (top-level) | `custom` for self-hosted/proxy providers |
| `base_url` | `[model_providers.custom]` | Proxy endpoint (e.g. `http://127.0.0.1:15721/v1`) |
| `OPENAI_API_KEY` | `~/.codex/auth.json` or env | API key for auth |

### When the Proxy Itself Is Down

If `base_url` points to `http://127.0.0.1:xxxxx` and the proxy process is not running, Codex will show `Reconnecting... 1/5` through `5/5` then fail. Check:
```bash
curl -s http://127.0.0.1:15721/v1/models | head -5
```
If connection refused, the local proxy (e.g. CC Switch / pier-codex) needs to be started as a separate service.

## delegate_task Subagent Filesystem Isolation

### Symptom

A `delegate_task` subagent reports success but `git diff --stat` shows zero file changes. The subagent's log contains:
```
IO error for operation on /d/WorkFile/...: 系统找不到指定的路径
```

### Root Cause

Hermes internal `delegate_task` subagents run in an isolated sandbox that may not have drive-letter access to non-home directories (e.g. `D:\WorkFile\...` on Windows).

### Fix

Do NOT use `delegate_task` for filesystem-mutating tasks on non-home-drive paths. Use `codex exec` or `claude-code` CLI via `terminal()`, which inherit the user's full filesystem context. The CLI workers run in the user's shell environment and can access all drives.
