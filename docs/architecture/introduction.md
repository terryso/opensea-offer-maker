# 简介

本文档概述了 OpenSea Offer Maker 的整体项目架构，这是一个用于自动化 NFT 交易的 Node.js CLI 工具。其主要目标是作为 AI 驱动开发的指导性架构参考，确保理解现有代码库模式的一致性。

**文档目的**：这是一份**棕地架构文档**，记录系统的**当前实际状态**，包括实际的实现模式、技术债务和约束条件。它与绿地架构文档不同，专注于现实而非理想。

## 启动模板或现有项目

**状态**：现有项目（棕地）

这是一个已建立的 CLI 工具，具有：
- 已发布到 NPM，包名 `opensea-offer-maker` v0.0.6
- 约 2000+ 行生产代码
- 已实现 9 个 CLI 命令
- 正在积极开发，配置了 AI 工具

**未使用启动模板** - 该项目从零开始构建，采用手动设置。

## 变更日志

| 日期 | 版本 | 描述 | 作者 |
|------|------|------|------|
| 2025-10-08 | 1.0 | 初始架构文档（棕地分析） | Winston (Architect) |

## 快速参考 - 关键文件和入口点

### 必读的关键文件

- **CLI 入口**：`src/cli.js` - Commander.js CLI 设置，注册所有 9 个命令
- **配置**：`src/config.js`（主配置）、`src/utils/env.js`、`.env`（用户创建）
- **核心业务逻辑**：`src/services/` 目录
  - `offerService.js` - 封装 OpenSea SDK 的出价创建
  - `offerStrategy.js` - ⚠️ **复杂** - 自动竞价策略核心逻辑
  - `openseaApi.js` - OpenSea API v2 封装，带重试机制
  - `reservoirApi.js` - Reservoir API 封装
  - `scanService.js` - 市场机会扫描器
- **API 定义**：无 OpenAPI 规范 - API 封装即文档
- **私钥管理**：`src/utils/keyManager.js` - ⚠️ **安全关键**
- **密钥存储**：`.keys`（自动生成的 JSON 文件，AES-256-GCM 加密）

### 命令实现（9 个）

位于 `src/commands/` 目录：
- `offerCommand.js` - 单次出价
- `autoOfferCommand.js` - 自动竞价（集合和单品，2 个子命令）
- `checkOffersCommand.js` - 查询出价和统计数据
- `scanCommand.js` - Top 集合扫描
- `trendingCommand.js` - 热门集合
- `listCommand.js` - OpenSea 挂单
- `swapCommand.js` - ETH/WETH 兑换
- `sendCommand.js` - 代币转账
- `keyCommand.js` - 私钥管理（6 个子命令）

### 工具和配置

- **密钥管理器**：`src/utils/keyManager.js` - ⚠️ **安全关键**，AES-256-GCM 加密
- **命令工具**：`src/utils/commandUtils.js` - 链验证、钱包获取
- **日志工具**：`src/utils/logger.js` - 分级日志（INFO/DEBUG/ERROR）
- **代币配置**：`src/config/tokens.js` - 多链代币地址和 ABI

### ⚠️ 关键文件 - 谨慎修改

- `src/utils/keyManager.js` - 安全关键
- `src/services/offerStrategy.js` - 复杂逻辑
- `src/config.js` - 全局使用
- `.keys` 文件格式 - 破坏性变更会影响用户

### 可安全修改的文件

- 单个命令文件（保持 CLI 接口不变）
- API 封装（添加重试逻辑、改进错误处理）
- 日志工具（添加文件输出、改进格式）
- 测试（请添加更多！）
