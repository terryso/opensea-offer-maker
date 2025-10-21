# OpenSea Offer Maker - 架构总览

本文档概述了 OpenSea Offer Maker 的整体项目架构，这是一个成熟的 NFT 自动化交易 CLI 工具。其目标是作为 AI 驱动开发的指导性架构参考，确保对现有代码库模式的一致理解。

**文档目的**：这是一份**棕地架构文档**，记录系统的**当前实际状态**，包括实际的实现模式、技术债务和约束条件。它反映代码库的真实状态而非理想设计。

## 项目现状

**状态**：成熟的现有项目（棕地）

这是一个高度发展的 CLI 工具，具有：
- **已发布到 NPM**，包名 `opensea-offer-maker` v0.0.6
- **约 17,843 行生产代码**，代码规模显著增长
- **已实现 15 个 CLI 命令**，功能丰富完整
- **84.36% 的测试覆盖率**（服务层），质量较高
- **6 条区块链支持**，多链架构完善
- **实时监控功能**，支持 WebSocket 流式处理

**技术成熟度**：从简单的出价工具发展为功能完整的 NFT 交易平台

## 变更日志

| 日期 | 版本 | 描述 | 作者 |
|------|------|------|------|
| 2025-10-08 | 1.0 | 初始架构文档（棕地分析） | Winston (Architect) |
| 2025-10-21 | 2.0 | 基于深度代码分析的全面更新 | Winston (Architect) |

## 快速参考 - 关键文件和入口点

### 系统核心文件

- **CLI 入口**：`src/cli.js` - 全局代理配置和命令注册
- **配置系统**：
  - `src/config.js` - 主配置文件，环境变量验证
  - `src/constants/chains.js` - 6条链的完整配置
  - `src/config/tokens.js` - 多链代币地址定义
- **业务逻辑层**：`src/services/` 目录（8个核心服务）
  - `openseaApi.js` - OpenSea API v2 封装（33.1KB，最大文件）
  - `offerStrategy.js` - 自动竞价策略引擎（13KB）
  - `streamService.js` - 实时事件流处理（12.6KB）
  - `offerService.js` - 核心出价创建服务（5.1KB）
  - `cacheService.js` - 文件缓存系统（14.2KB）
  - `notificationService.js` - 通知系统（23.9KB）
  - `pollingMonitorService.js` - 轮询监控服务（25.9KB）
  - `buyService.js` - NFT 购买服务（10.7KB）

### 命令实现（15个命令）

位于 `src/commands/` 目录：
- **核心交易命令**：
  - `offerCommand.js` - 单次出价创建
  - `autoOfferCommand.js` - 自动竞价（集合和单品）
  - `buyCommand.js` - NFT 购买功能
  - `listCommand.js` - 跨市场挂单（51.7KB，最复杂命令）
- **监控和分析**：
  - `checkOffersCommand.js` - 出价查询和统计
  - `monitorCommand.js` - 实时监控（12.9KB）
  - `scanCommand.js` - 市场扫描（从PRD移除）
  - `trendingCommand.js` - 热门集合（从PRD移除）
- **工具和配置**：
  - `keyCommand.js` - 私钥管理
  - `balanceCommand.js` - 余额查询
  - `chainCommand.js` - 链配置管理
  - `cacheCommand.js` - 缓存管理
- **交易操作**：
  - `swapCommand.js` - ETH/WETH 兑换
  - `sendCommand.js` - 代币转账

### 工具和基础设施

- **安全关键**：
  - `src/utils/keyManager.js` - AES-256-GCM 加密私钥管理
  - `src/utils/commandUtils.js` - 钱包和链配置工具
- **系统工具**：
  - `src/utils/logger.js` - 分级日志系统
  - `src/utils/configManager.js` - 持久化配置管理
  - `src/utils/proxySetup.js` - HTTP 代理配置
  - `src/utils/env.js` - 环境变量验证

### 缓存和存储系统

- **文件缓存**：`.cache/` 目录
  - `events/` - 事件日志（JSONL格式）
  - `nfts/` - NFT 元数据缓存
  - `filters/` - 用户过滤器配置
- **配置存储**：
  - `.keys` - 加密私钥存储
  - `.env` - 环境变量配置

### ⚠️ 关键文件 - 谨慎修改

- `src/utils/keyManager.js` - 安全关键，涉及加密存储
- `src/services/offerStrategy.js` - 复杂业务逻辑，自动竞价核心
- `src/services/streamService.js` - WebSocket 连接管理
- `src/config.js` - 全局配置，多处依赖
- `.keys` 文件格式 - 向后兼容性关键

### 可安全修改的文件

- 单个命令文件（保持CLI接口不变）
- API 封装层（可添加重试、错误处理）
- 日志工具（可添加文件输出）
- 测试文件（请增加覆盖率！）
