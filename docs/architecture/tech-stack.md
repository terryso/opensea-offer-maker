# 技术栈

**注意**：本节记录实际使用的技术栈。所有版本均在 `package.json` 中指定。

## 云基础设施

- **提供商**：无（CLI 工具，无云托管）
- **RPC 提供商**：Alchemy（硬编码依赖）
- **部署**：NPM Registry（公共包）

## 技术栈表

| 类别 | 技术 | 版本 | 用途 | 注意事项/约束 |
|------|------|------|------|--------------|
| **运行时** | Node.js | 16+ (LTS) | JavaScript 执行环境 | 需要 ES Modules 支持 |
| **包管理器** | npm | - | 依赖管理 | 使用 package-lock.json，CI 中使用 npm ci |
| **语言** | JavaScript | ES2022 | 主要语言 | ES Modules (type: "module") |
| **CLI 框架** | commander.js | ^12.1.0 | 命令行界面 | 所有 9 个命令基于此构建 |
| **区块链 SDK** | ethers.js | ^6.13.4 | 以太坊交互 | v6 API（非 v5）- v5 有重大变更 |
| **OpenSea SDK** | opensea-js | ^7.1.14 | NFT 市场出价 | 仅用于创建出价（不用于查询） |
| **Reservoir SDK** | @reservoir0x/reservoir-sdk | ^2.4.32 | 跨市场挂单 | 需要 viem 钱包适配器 |
| **环境配置** | dotenv | ^16.4.5 | 加载 .env 文件 | ⚠️ 导入时验证，无法跳过 |
| **用户输入** | enquirer | ^2.4.1 | 交互式提示 | 用于密码输入（密钥管理） |
| **测试框架** | Jest | ^29.7.0 | 单元和集成测试 | ⚠️ 需要 --experimental-vm-modules 标志 |
| **加密** | Node.js crypto | 内置 | 私钥加密 | AES-256-GCM 算法 |
| **HTTP 客户端** | fetch API | 内置 (Node 18+) | API 调用 | 原生 fetch，无需 axios/got |

## ⚠️ 技术债务

- Alchemy 作为 RPC 提供商硬编码（无回退）
- 加密盐/密码在源代码中硬编码
- Jest 需要实验性标志
- 部分依赖可以更新（安全补丁）
