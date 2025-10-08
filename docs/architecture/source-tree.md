# 项目源代码结构

## 目录树

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
├── .gemini/                        # Gemini 配置
├── .windsurf/                      # Windsurf 配置
├── .github/
│   └── workflows/
│       └── publish.yml             # NPM 发布工作流（⚠️ 集成测试已禁用）
├── coverage/                       # Jest 覆盖率报告（gitignored）
├── docs/
│   ├── architecture/               # 架构文档（本目录）
│   ├── prd.md                      # 产品需求文档（中文）
│   └── architecture.md             # 完整架构文档（英文原版）
├── node_modules/                   # NPM 依赖（gitignored）
├── src/
│   ├── __tests__/                  # 测试文件（⚠️ 覆盖率约 60%）
│   │   ├── openseaApi.test.js              # 单元测试（模拟）
│   │   ├── openseaApi.integration.test.js  # 集成测试（真实 API）
│   │   └── offerService.integration.test.js
│   ├── commands/                   # CLI 命令（共 9 个）
│   │   ├── autoOfferCommand.js             # 自动竞价（2 个子命令）
│   │   ├── checkOffersCommand.js           # 查询出价/统计
│   │   ├── keyCommand.js                   # 密钥管理（6 个子命令）
│   │   ├── listCommand.js                  # 跨市场挂单
│   │   ├── offerCommand.js                 # 单次出价创建
│   │   ├── scanCommand.js                  # 市场扫描
│   │   ├── sendCommand.js                  # 代币转账
│   │   ├── swapCommand.js                  # ETH/WETH 兑换
│   │   ├── trendingCommand.js              # 热门集合
│   │   └── index.js                        # 导出所有命令
│   ├── config/
│   │   └── tokens.js               # 代币配置（多链地址）
│   ├── services/                   # 业务逻辑层
│   │   ├── offerService.js                 # 出价创建封装
│   │   ├── offerStrategy.js                # ⚠️ 自动竞价（复杂）
│   │   ├── openseaApi.js                   # OpenSea API 封装
│   │   ├── reservoirApi.js                 # Reservoir API 封装
│   │   └── scanService.js                  # 市场扫描逻辑
│   ├── utils/                      # 工具函数
│   │   ├── commandUtils.js                 # 链验证、钱包创建
│   │   ├── env.js                          # 环境变量导出
│   │   ├── keyManager.js                   # ⚠️ 密钥加密（安全关键）
│   │   └── logger.js                       # 日志工具
│   ├── cli.js                      # CLI 入口点（Commander 设置）
│   └── config.js                   # 主配置（链、环境验证）
├── .env                            # ⚠️ 环境变量（用户创建，gitignored）
├── .keys                           # ⚠️ 加密密钥存储（自动生成，gitignored）
├── .gitignore                      # Git 忽略规则
├── .npmignore                      # NPM 发布忽略（⚠️ 排除测试）
├── babel.config.js                 # Jest 的 Babel 配置
├── jest.config.js                  # Jest 配置
├── package.json                    # NPM 包定义
├── package-lock.json               # 锁定的依赖版本
└── README.md                       # 用户文档
```

## 关键目录说明

### `src/commands/`
每个文件对应一个 CLI 命令（遵循 Commander.js 模式）

**职责**：
- 定义命令行接口（参数、选项、帮助文本）
- 参数验证和解析
- 调用服务层执行业务逻辑
- 处理错误并向用户显示结果

### `src/services/`
业务逻辑与 CLI 关注点分离

**职责**：
- 实现核心功能逻辑
- 协调多个 API 调用
- 处理复杂的业务规则
- 提供可复用的服务接口

### `src/utils/`
跨命令/服务使用的共享工具

**职责**：
- 通用辅助函数
- 配置管理
- 日志记录
- 密钥加密/解密

### `.bmad-core/`、`.claude/`、`.gemini/`、`.windsurf/`
AI 开发工具配置（不属于运行时）

**说明**：这些目录包含 AI 辅助开发工具的配置，不参与实际运行。

## ⚠️ 关键文件

### 必须注意的文件

1. **`.env`** - 必须由用户手动创建
   - 包含 API 密钥（OpenSea、Alchemy 等）
   - 不在版本控制中
   - 参见 README.md 获取模板

2. **`.keys`** - 自动生成，包含加密的私钥
   - 由 `key add` 命令创建
   - 使用 AES-256-GCM 加密
   - ⚠️ 加密密钥在源代码中硬编码（安全问题）

3. **`src/utils/keyManager.js`** - 安全关键，谨慎修改
   - 处理私钥加密/解密
   - 修改可能导致用户无法访问密钥
   - 格式变更会破坏现有密钥存储

4. **`src/services/offerStrategy.js`** - 代码库中最复杂的逻辑
   - 自动竞价策略实现
   - 使用 `process.exit()` 关闭
   - 错误处理返回 null 并继续
   - 一次只能监控一个集合

## 文件组织原则

### 命令层（Commands）
- 一个文件 = 一个主命令
- 可能包含子命令（如 `key` 有 6 个子命令）
- 不包含业务逻辑，仅协调

### 服务层（Services）
- 封装外部 API
- 实现业务规则
- 可被多个命令使用
- 与 CLI 框架解耦

### 工具层（Utils）
- 纯函数优先
- 无状态（KeyManager 除外，需要文件 I/O）
- 广泛可复用

## 代码定位指南

### 查找功能实现

| 功能 | 位置 |
|------|------|
| 创建集合出价 | `src/services/offerService.js` |
| 自动竞价逻辑 | `src/services/offerStrategy.js` |
| OpenSea API 调用 | `src/services/openseaApi.js` |
| 市场扫描 | `src/services/scanService.js` |
| 密钥管理 | `src/utils/keyManager.js` |
| 链配置 | `src/config.js` |
| 代币配置 | `src/config/tokens.js` |

### 查找 CLI 命令

| 命令 | 文件 |
|------|------|
| `offer` | `src/commands/offerCommand.js` |
| `auto` | `src/commands/autoOfferCommand.js` |
| `check` | `src/commands/checkOffersCommand.js` |
| `scan` | `src/commands/scanCommand.js` |
| `key` | `src/commands/keyCommand.js` |
| `swap` | `src/commands/swapCommand.js` |
| `send` | `src/commands/sendCommand.js` |
| `list` | `src/commands/listCommand.js` |
| `trending` | `src/commands/trendingCommand.js` |

## 依赖关系

```
Commands（命令层）
    ↓ 调用
Services（服务层）
    ↓ 调用
Utils（工具层）+ External APIs（外部 API）
```

**原则**：
- 命令不直接调用外部 API，通过服务层
- 服务可以调用其他服务
- 工具层不依赖命令或服务
- 配置文件可被任何层引用
