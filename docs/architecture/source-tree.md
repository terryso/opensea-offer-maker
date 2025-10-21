# 项目源代码结构

## 目录树（当前实际状态）

```
opensea-offer-maker/
├── .bmad-core/                     # BMAD 框架配置（AI 开发工具）
│   ├── agents/                     # AI 代理定义
│   ├── checklists/                 # 质量检查清单
│   ├── data/                       # 项目数据/偏好设置
│   ├── tasks/                      # 可重用任务定义
│   ├── templates/                  # 文档模板
│   └── utils/                      # 框架工具
├── .claude/                        # Claude Code 配置
├── .cache/                         # 文件缓存系统（运行时生成）
│   ├── events/                     # 事件日志存储（JSONL格式）
│   ├── nfts/                       # NFT元数据缓存
│   └── filters/                    # 用户过滤器配置
├── .github/
│   └── workflows/
│       └── publish.yml             # NPM 发布工作流
├── coverage/                       # Jest 覆盖率报告（gitignored）
├── docs/
│   ├── architecture/               # 架构文档（本目录）
│   ├── prd/                        # 产品需求文档分片
│   ├── qa/                         # 质量保证文档
│   ├── stories/                    # 用户故事和开发任务
│   ├── prd.md                      # 产品需求文档（中文）
│   └── architecture.md             # 完整架构文档（英文原版）
├── node_modules/                   # NPM 依赖（gitignored）
├── src/                            # 源代码目录（17,843行代码）
│   ├── __tests__/                  # 测试文件（84.36% 覆盖率）
│   │   ├── commands/               # 命令层测试
│   │   │   ├── offerCommand.test.js
│   │   │   ├── autoOfferCommand.test.js
│   │   │   ├── listCommand.test.js
│   │   │   ├── monitorCommand.test.js
│   │   │   ├── keyCommand.test.js
│   │   │   ├── balanceCommand.test.js
│   │   │   ├── chainCommand.test.js
│   │   │   ├── cacheCommand.test.js
│   │   │   ├── sendCommand.test.js
│   │   │   ├── swapCommand.test.js
│   │   │   ├── buyCommand.test.js
│   │   │   ├── checkOffersCommand.test.js
│   │   │   └── monitorCommand.integration.test.js
│   │   ├── services/               # 服务层测试
│   │   │   ├── offerStrategy.test.js
│   │   │   ├── openseaApi.test.js
│   │   │   ├── openseaApi.integration.test.js
│   │   │   ├── offerService.integration.test.js
│   │   │   ├── streamService.test.js
│   │   │   ├── buyService.test.js
│   │   │   └── cacheService.test.js
│   │   ├── utils/                  # 工具层测试
│   │   │   ├── configManager.test.js
│   │   │   ├── configManager.integration.test.js
│   │   │   ├── chains.test.js
│   │   │   └── logger.test.js
│   │   ├── config.test.js           # 配置测试
│   │   └── jest.setup.js           # 测试环境配置
│   ├── commands/                   # CLI 命令层（15个命令）
│   │   ├── autoOfferCommand.js     # 自动竞价（5.9KB）
│   │   ├── balanceCommand.js       # 余额查询（2.8KB）
│   │   ├── buyCommand.js           # NFT购买（4.8KB）
│   │   ├── cacheCommand.js         # 缓存管理（17.0KB）
│   │   ├── chainCommand.js         # 链配置（1.7KB）
│   │   ├── checkOffersCommand.js   # 出价查询（5.0KB）
│   │   ├── index.js                # 命令导出（614B）
│   │   ├── keyCommand.js           # 密钥管理（7.9KB）
│   │   ├── listCommand.js          # 跨市场挂单（51.7KB - 最大文件）
│   │   ├── monitorCommand.js       # 实时监控（12.9KB）
│   │   ├── offerCommand.js         # 单次出价（3.8KB）
│   │   ├── sendCommand.js          # 代币转账（3.1KB）
│   │   └── swapCommand.js          # ETH/WETH兑换（4.8KB）
│   ├── config/                     # 配置数据
│   │   └── tokens.js               # 多链代币配置
│   ├── constants/                  # 系统常量
│   │   └── chains.js               # 6条链配置（131行）
│   ├── services/                   # 业务逻辑层（8个核心服务）
│   │   ├── buyService.js           # NFT购买服务（10.7KB）
│   │   ├── cacheService.js         # 缓存服务（14.2KB）
│   │   ├── notificationService.js  # 通知系统（23.9KB）
│   │   ├── offerService.js         # 出价服务（5.1KB）
│   │   ├── offerStrategy.js        # 策略引擎（13.0KB）
│   │   ├── openseaApi.js           # OpenSea API封装（33.1KB - 最大服务文件）
│   │   ├── pollingMonitorService.js # 轮询监控（25.9KB）
│   │   └── streamService.js        # 流式服务（12.6KB）
│   ├── utils/                      # 基础设施层（6个工具类）
│   │   ├── commandUtils.js         # 命令工具（链/钱包管理）
│   │   ├── configManager.js        # 配置管理
│   │   ├── env.js                  # 环境变量验证
│   │   ├── keyManager.js           # 密钥管理器（安全关键）
│   │   ├── logger.js               # 日志系统
│   │   └── proxySetup.js           # 代理配置
│   ├── cli.js                      # CLI入口点（全局代理配置）
│   └── config.js                   # 主配置文件（环境变量验证）
├── .env                            # 环境变量配置（gitignored）
├── .env.example                    # 环境变量模板
├── .keys                           # 加密私钥存储（gitignored）
├── .gitignore                      # Git忽略规则
├── jest.setup.js                   # Jest测试配置
├── LICENSE                         # 开源许可证
├── package.json                    # NPM包配置和依赖
├── package-lock.json               # 依赖锁定文件
└── README.md                       # 项目说明文档
```

## 代码组织原则

### 分层架构

代码按照四层架构组织：

1. **表现层** (`src/commands/`)
   - CLI 命令定义和参数处理
   - 用户交互和响应格式化
   - 15个主要命令，覆盖完整的 NFT 交易流程

2. **业务逻辑层** (`src/services/`)
   - 核心业务逻辑和算法实现
   - 外部 API 集成和数据处理
   - 8个核心服务，84.36% 测试覆盖率

3. **数据访问层** (`src/config/`, `src/constants/`)
   - 配置数据和常量定义
   - 多链支持和代币配置
   - 环境特定的参数管理

4. **基础设施层** (`src/utils/`)
   - 通用工具和辅助函数
   - 安全、日志、配置管理
   - 跨层共享的基础服务

### 命名约定

- **文件命名**：camelCase（JavaScript 标准）
- **类命名**：PascalCase（ES6 类标准）
- **函数命名**：camelCase，动词开头
- **常量命名**：UPPER_SNAKE_CASE
- **配置文件**：kebab-case 或 camelCase

### 模块依赖规则

- **上层依赖下层**：Commands → Services → Utils
- **避免循环依赖**：严格的依赖方向
- **接口抽象**：服务间通过明确接口交互
- **配置注入**：依赖通过构造函数注入

## 关键目录详解

### `/src/commands/` - 命令层

**职责**：CLI 接口定义，用户输入处理，业务逻辑协调

**关键文件**：
- `listCommand.js` (51.7KB) - 最复杂的命令，交互式 NFT 挂单
- `cacheCommand.js` (17.0KB) - 缓存管理和操作
- `monitorCommand.js` (12.9KB) - 实时监控命令
- `autoOfferCommand.js` (5.9KB) - 自动竞价功能

**模式**：
- 每个命令文件导出一个 Commander.js Command 实例
- 统一的错误处理和用户反馈
- 可选的调试模式和详细日志

### `/src/services/` - 业务逻辑层

**职责**：核心业务逻辑，API 集成，数据处理，状态管理

**关键文件**：
- `openseaApi.js` (33.1KB) - OpenSea API v2 完整封装
- `notificationService.js` (23.9KB) - 通知和事件处理
- `pollingMonitorService.js` (25.9KB) - 轮询监控实现
- `cacheService.js` (14.2KB) - 文件缓存系统
- `offerStrategy.js` (13.0KB) - 自动竞价策略引擎

**特点**：
- 高度模块化，单一职责原则
- 广泛的错误处理和重试机制
- WebSocket 和 HTTP 双重通信支持

### `/src/utils/` - 基础设施层

**职责**：通用工具，系统服务，安全功能，配置管理

**关键文件**：
- `keyManager.js` - AES-256-GCM 私钥加密存储
- `commandUtils.js` - 链配置和钱包管理工具
- `configManager.js` - 持久化配置管理
- `logger.js` - 分级日志系统
- `proxySetup.js` - HTTP 代理配置

**安全重点**：
- 私钥加密和安全存储
- 环境变量验证和保护
- 网络代理和安全传输

### `/src/__tests__/` - 测试套件

**测试覆盖率**：84.36%（服务层），整体高质量

**测试类型**：
- **单元测试**：模拟依赖，测试单个功能
- **集成测试**：真实 API 调用，测试完整流程
- **命令测试**：CLI 命令的端到端测试

**测试配置**：
- Jest 框架，实验性 ES 模块支持
- 控制台输出抑制，清洁测试环境
- 自动化覆盖率报告

## 文件大小分析

### 最大文件（复杂度指标）

1. `listCommand.js` - 51.7KB（交互式挂单系统）
2. `openseaApi.js` - 33.1KB（API 完整封装）
3. `notificationService.js` - 23.9KB（通知系统）
4. `pollingMonitorService.js` - 25.9KB（轮询监控）
5. `cacheCommand.js` - 17.0KB（缓存管理）

### 服务层分布

- **API 集成**：33.1KB（最大复杂度）
- **监控服务**：38.8KB（轮询 + 流式）
- **缓存和通知**：38.1KB（数据管理）
- **交易服务**：18.1KB（核心业务）

### 命令层分布

- **复杂命令**：68.6KB（list + cache + monitor）
- **核心命令**：19.7KB（offer + auto + buy）
- **工具命令**：16.2KB（key + balance + chain）
- **交易命令**：7.9KB（send + swap + check）

## 数据流架构

### 典型执行流程

```
用户输入 → CLI 解析 → 命令路由 → 服务调用 → API/区块链
                ↓
缓存检查 ← 数据处理 ← 响应解析 ← 结果返回
                ↓
用户输出 ← 格式化 ← 通知触发 ← 状态更新
```

### 实时监控流程

```
WebSocket 连接 → 事件接收 → 数据解析 → 通知触发
       ↓
事件存储 ← 缓存更新 ← 状态检查 ← 用户界面
```

## 扩展点设计

### 新命令添加

1. 在 `src/commands/` 创建新命令文件
2. 在 `src/commands/index.js` 导出命令
3. 在 `src/cli.js` 注册命令
4. 添加对应的测试文件

### 新服务集成

1. 在 `src/services/` 创建服务类
2. 实现标准接口方法
3. 在命令层注入和使用
4. 添加完整的测试覆盖

### 新链支持

1. 在 `src/constants/chains.js` 添加链配置
2. 在 `src/config/tokens.js` 添加代币地址
3. 更新相关服务的链处理逻辑
4. 添加链特定的测试用例

## 构建和部署结构

### 开发环境

```bash
npm install          # 安装依赖
npm run test         # 运行测试
npm run lint         # 代码检查
npm run dev          # 开发模式（如果适用）
```

### 生产构建

```bash
npm run build        # 构建命令（如有）
npm pack            # 打包 NPM 包
npm publish         # 发布到 NPM
```

### 测试执行

```bash
npm test             # 单元测试
npm run integration  # 集成测试
npm run test:coverage # 覆盖率报告
```

这个源码结构反映了项目从简单 CLI 工具演进为成熟 NFT 交易平台的过程，具有良好的分层架构、高测试覆盖率和清晰的扩展点设计。