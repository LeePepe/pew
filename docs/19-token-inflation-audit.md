# 19 — Token Inflation Audit & Fix Plan

## Background

Dashboard 上 Total Tokens 异常膨胀，经审计发现两个独立问题导致数据严重失真。

---

## Issue 1: Device ID Duplication (dev/prod 分裂)

### Root Cause

`ConfigManager` 根据 `dev` flag 读取不同的 config 文件：

- `config.json` (prod) → device ID: `7f2bdbdb-...`
- `config.dev.json` (dev) → device ID: `14a28b16-...`

同一台机器上 `pew sync` 和 `pew sync --dev` 使用不同的 device_id，导致相同的原始数据被作为两个独立 device 上传到 D1。

**代码位置**: `packages/cli/src/config/manager.ts:16-18`

```typescript
constructor(configDir: string, dev = false) {
  const filename = dev ? DEV_CONFIG : PROD_CONFIG;
  this.configPath = join(configDir, filename);
}
```

### Impact

- UNIQUE constraint `(user_id, device_id, source, model, hour_start)` 中 `device_id` 不同，相同数据被视为两条独立记录
- Dashboard `SUM(total_tokens)` 跨 device 聚合，同一份数据被计算两次
- 本机验证：dev device 2,911 行 **100% 与 prod device 重叠**，dev 的 token 值从未超过 prod

### Status

**已修复 (数据层)**：已从 D1 删除 dev device `14a28b16-...` 的 2,911 行 usage_records + 1 行 device_aliases。

**待修复 (代码层)**：需要将 `deviceId` 改为环境无关的共享存储。

---

## Issue 2: Queue Accumulation on Cursor Reset (4x Token Inflation)

### Root Cause

数据管线中存在架构级 bug，cursor reset 导致 D1 数据按倍数膨胀：

1. `rm cursors.json` 清除游标后 re-sync
2. 所有历史 deltas 被重新解析
3. 新的 records **append** 到 `queue.jsonl`（追加，不是覆盖）
4. Upload 时 `aggregateRecords()` 读取全部未上传的 queue records 按 `(source, model, hour_start, device_id)` 做 **SUM**
5. Worker `ON CONFLICT DO UPDATE SET total_tokens = excluded.total_tokens` 用 SUM 值 **覆盖** D1

**结果**：N 次 cursor reset + sync + upload → D1 值 = N × 真实值

**代码位置**:
- Queue append: `packages/cli/src/storage/base-queue.ts:39-43` (`appendBatch`)
- Aggregation SUM: `packages/cli/src/commands/upload.ts:52-72` (`aggregateRecords`)
- Worker overwrite: `packages/worker/src/index.ts:48-58` (`TOKEN_UPSERT_SQL`)
- Cursor persist before queue: `packages/cli/src/commands/sync.ts:339-345`

### Evidence

本机原始数据 vs D1 (prod device `7f2bdbdb-...`) 对比：

| Source | Local Raw | D1 Prod | Ratio |
|--------|-----------|---------|-------|
| opencode | 7,450,016,338 | 17,607,707,877 | **2.36x** |
| claude-code | 354,044,326 | 1,416,682,362 | **4.00x** |
| codex | 301,976,679 | 1,187,600,717 | **3.93x** |
| gemini-cli | 5,423,314 | 21,693,256 | **4.00x** |
| vscode-copilot | 2,980,668 | 11,922,672 | **4.00x** |
| **Total** | **8,114,441,325** | **20,245,606,884** | **2.49x** |

claude-code / codex / gemini-cli / vscode-copilot 均精确 **4.00x**，说明进行了 4 次 cursor reset。
opencode 为 2.36x 因为 opencode 数据随时间变化（新增 session 改变了累积值）。

### Additional Context: `default` Device

`default` device（device_id 功能上线前的遗留数据）情况：

- 4,883 行，17.6B tokens
- 与 prod device 重叠 2,837 行（100% 的 prod 时间范围内）
- 2,046 行为独有数据：
  - 60 行 2025 年旧数据（pre device-id era）
  - 1,986 行 2026 年数据中 prod device 没有的 source/model 组合（如 `openclaw` 1,315 行、`github_copilot/*` 模型等）
- 11 行 default > prod（集中在 2026-02-16 opencode/claude-opus-4.6）
- `openclaw` 数据（309M tokens）仅存在于 `default` 和 Mac Studio device 中，本机无 openclaw 原始文件

**结论**：`default` device 混合了多台机器的数据（device_id 功能上线前所有机器共用 `"default"`），不能简单删除或合并。

---

## Fix Plan

### Step 1: Fix Queue Accumulation Bug

**目标**：cursor reset 后不再累积重复数据。

**方案**：sync 时如果检测到 cursors 不存在（fresh parse），自动清空 queue + queue.state。

**修改文件**：
- `packages/cli/src/commands/sync.ts` — 在 `executeSync()` 入口检测 cursors 是否为空，若空则清空 queue
- 或者更安全的方案：每次 sync 写入 queue 时用 **overwrite** 而非 append（需要区分增量和全量模式）

**验证**：L1 单元测试模拟 cursor reset + 二次 sync，确认 queue 不累积。

### Step 2: Fix D1 Data with Correct Values

**目标**：用本机原始数据的正确值覆盖 D1 中 prod device 的膨胀数据。

**方案**：
1. 清除 cursors + queue（fresh state）
2. 执行一次 full sync（生成正确的累积总量到 queue）
3. Upload 到 D1（Worker overwrite 用正确值覆盖）

**前置条件**：Step 1 必须先完成，否则如果 queue 里还有旧数据会再次累积。

### Step 3: Merge `default` Device

**目标**：清理 `default` device 的重复数据，保留独有数据。

**方案**：
1. 删除 `default` 中与 prod device 重叠的 2,837 行（prod 值 >= default 的 2,826 行直接删；11 行 default > prod 的先更新 prod 再删）
2. 将 `default` 中独有的 2,046 行迁移到 prod device `7f2bdbdb-...`（UPDATE device_id）
3. 删除 `default` 的 device_aliases 记录

**风险**：`default` 中的 `openclaw` 数据（1,412 行）可能来自其他机器，迁移到本机 device 可能归属错误。需要进一步调查确认。

### Step 4: Share Device ID Across dev/prod

**目标**：同一台机器 dev 和 prod 使用相同的 device ID。

**方案**：将 `deviceId` 存储在独立的 `device.json` 文件中，不区分 dev/prod。`config.json` 和 `config.dev.json` 只存 `token`。

**修改文件**：
- `packages/cli/src/config/manager.ts` — 新增 `ensureDeviceId()` 读写 `device.json`
- `packages/core/src/types.ts` — `PewConfig` 中移除 `deviceId` 字段（或保留向后兼容）

### Execution Order

1. Step 1 (fix bug) → commit
2. Step 4 (share device ID) → commit
3. `bun run build` → rebuild CLI
4. Step 2 (fix D1 data) → manual operation
5. Step 3 (merge default) → manual SQL operation
