# OpenSea Offer Maker 架构文档

> **文档类型**：棕地架构文档
> **项目状态**：生产环境运行中
> **最后更新**：2024年（架构文档生成时）

## 📚 文档导航

本文档集提供了 OpenSea Offer Maker CLI 工具的完整架构概览。

### 核心文档

| 文档 | 描述 | 适用读者 |
|------|------|---------|
| [简介](./introduction.md) | 项目概述、快速参考、关键文件 | 所有人 |
| [高层架构](./high-level-architecture.md) | 系统架构、设计模式、架构图 | 架构师、开发者 |
| [技术栈](./tech-stack.md) | 技术选型、版本、依赖关系 | 开发者、DevOps |
| [数据模型](./data-models.md) | 配置对象、数据结构 | 开发者 |
| [组件](./components.md) | 核心组件详解、服务层架构 | 开发者 |
| [外部 API](./external-apis.md) | OpenSea、Reservoir、Alchemy 集成 | 开发者 |
| [工作流程](./workflows.md) | 核心业务流程、序列图 | 产品、开发者 |

### 实施文档

| 文档 | 描述 | 适用读者 |
|------|------|---------|
| [源代码结构](./source-tree.md) | 目录组织、文件位置 | 开发者 |
| [基础设施和部署](./infrastructure.md) | 部署策略、CI/CD、环境 | DevOps |
| [错误处理](./error-handling.md) | 错误处理策略、日志标准 | 开发者 |
| [编码标准](./coding-standards.md) | 代码规范、最佳实践 | 开发者 |
| [测试策略](./testing.md) | 测试方法、覆盖率、框架 | 开发者、QA |
| [安全](./security.md) | 安全措施、漏洞、建议 | 安全、开发者 |
| [技术债务](./technical-debt.md) | 已知问题、改进计划 | 技术负责人、开发者 |

## 🚀 快速开始

### 新开发者入门

1. **从简介开始** → [introduction.md](./introduction.md)
   - 了解项目背景和关键概念
   - 查看命令列表和快速参考

2. **理解架构** → [high-level-architecture.md](./high-level-architecture.md)
   - 掌握三层架构模式
   - 理解数据流向

3. **熟悉组件** → [components.md](./components.md)
   - 学习 6 个核心服务
   - 理解组件交互

4. **查看工作流程** → [workflows.md](./workflows.md)
   - 通过序列图理解业务流程

5. **了解编码标准** → [coding-standards.md](./coding-standards.md)
   - 遵循项目规范
   - 编写一致的代码

### 特定任务导航

#### 我想添加新功能
1. 阅读 [coding-standards.md](./coding-standards.md) - 了解编码规范
2. 阅读 [components.md](./components.md) - 找到相关组件
3. 阅读 [testing.md](./testing.md) - 编写测试
4. 检查 [technical-debt.md](./technical-debt.md) - 避免引入新债务

#### 我想修复 bug
1. 阅读 [source-tree.md](./source-tree.md) - 定位代码
2. 阅读 [error-handling.md](./error-handling.md) - 理解错误处理
3. 阅读 [testing.md](./testing.md) - 添加回归测试

#### 我想理解某个 API 调用
1. 阅读 [external-apis.md](./external-apis.md) - API 详情
2. 阅读 [workflows.md](./workflows.md) - 调用时序

#### 我想部署或配置 CI
1. 阅读 [infrastructure.md](./infrastructure.md) - 部署流程
2. 阅读 [security.md](./security.md) - 安全配置

## ⚠️ 关键注意事项

### 安全关键
🔴 **严重安全问题**：硬编码加密密钥

详见：[security.md](./security.md#严重安全问题)

**缓解措施**：
- 用户必须设置 `ENCRYPTION_KEY` 环境变量
- 仅用于低价值钱包

### 技术债务
当前最高优先级债务：

| 问题 | 优先级 | 详情 |
|------|--------|------|
| 硬编码加密密钥 | P1 🔴 | [technical-debt.md#1](./technical-debt.md#1-硬编码加密密钥-) |
| 无依赖扫描 | P1 🔴 | [technical-debt.md#2](./technical-debt.md#2-无依赖扫描-) |
| 测试覆盖率低 | P2 ⚠️ | [technical-debt.md#3](./technical-debt.md#3-测试覆盖率低-️) |

完整列表：[technical-debt.md](./technical-debt.md)

### 关键文件 - 谨慎修改

| 文件 | 原因 | 详情 |
|------|------|------|
| `src/utils/keyManager.js` | 安全关键 | [components.md#KeyManager](./components.md#keymanger) |
| `src/services/offerStrategy.js` | 最复杂逻辑 | [components.md#OfferStrategy](./components.md#offerstrategy) |
| `src/config.js` | 全局使用 | [data-models.md](./data-models.md) |

## 🎯 项目特点

### 架构亮点
✅ **三层架构** - 清晰的关注点分离
✅ **多链支持** - Ethereum、Base、Sepolia
✅ **加密密钥管理** - AES-256-GCM 加密
✅ **自动竞价** - 智能市场监控

### 技术亮点
- Node.js ES Modules
- Commander.js CLI 框架
- ethers.js v6 区块链交互
- OpenSea SDK + Reservoir SDK
- Jest 测试框架

## 📖 相关文档

### 产品文档
- [PRD (产品需求文档)](../prd.md) - 中文功能需求
- [README](../../README.md) - 用户使用手册

### 代码库
- [GitHub Repository](https://github.com/your-repo/opensea-offer-maker)
- [NPM Package](https://www.npmjs.com/package/opensea-offer-maker)

### 外部参考
- [OpenSea API 文档](https://docs.opensea.io/reference/api-overview)
- [Reservoir API 文档](https://docs.reservoir.tools/)
- [ethers.js 文档](https://docs.ethers.org/v6/)

## 🔍 按主题索引

### 命令层
- 命令文件结构：[coding-standards.md#文件结构标准](./coding-standards.md#文件结构标准)
- 命令列表：[introduction.md#命令快速参考](./introduction.md#命令快速参考)
- 命令实现：[source-tree.md#查找-CLI-命令](./source-tree.md#查找功能实现)

### 服务层
- 服务架构：[components.md](./components.md)
- 服务文件结构：[coding-standards.md#服务文件结构](./coding-standards.md#文件结构标准)
- API 服务：[external-apis.md](./external-apis.md)

### 测试
- 测试策略：[testing.md](./testing.md)
- 测试覆盖率：[testing.md#测试覆盖率](./testing.md#持续测试)
- 单元测试示例：[testing.md#示例测试结构](./testing.md#示例测试结构)

### 安全
- 安全策略：[security.md](./security.md)
- 密钥管理：[security.md#密钥管理](./security.md#密钥管理)
- 加密实现：[components.md#KeyManager](./components.md#keymanager)

### 部署
- 部署流程：[infrastructure.md#部署策略](./infrastructure.md#部署策略)
- CI/CD 配置：[infrastructure.md#自动化工作流](./infrastructure.md#自动化工作流)
- 环境配置：[infrastructure.md#环境](./infrastructure.md#环境)

## 🤝 贡献指南

### 提交代码前检查清单

- [ ] 阅读相关架构文档
- [ ] 遵循 [编码标准](./coding-standards.md)
- [ ] 添加单元测试（目标 80% 覆盖率）
- [ ] 检查 [技术债务](./technical-debt.md)，避免引入新债务
- [ ] 运行 `npm test` 确保测试通过
- [ ] 更新文档（如有架构变更）
- [ ] 进行代码审查

### AI 代理指南

如果您是 AI 开发代理：

1. **首次工作前**
   - 阅读 [introduction.md](./introduction.md)
   - 阅读 [high-level-architecture.md](./high-level-architecture.md)
   - 阅读 [technical-debt.md](./technical-debt.md)

2. **开发时**
   - 遵循 [coding-standards.md](./coding-standards.md)
   - 参考 [components.md](./components.md) 了解现有模式
   - 检查 [technical-debt.md](./technical-debt.md) 避免触及债务区域

3. **测试时**
   - 遵循 [testing.md](./testing.md)
   - 确保覆盖率达标

## 📊 文档维护

### 更新频率
- **架构变更时**：立即更新
- **功能添加时**：更新相关章节
- **每月审查**：检查文档准确性

### 负责人
- **技术负责人**：架构决策
- **开发团队**：保持文档同步
- **AI 代理**：根据代码自动更新文档建议

### 版本控制
- 文档与代码一起版本控制
- 使用 Git 追踪变更历史
- 重大架构变更时打标签

## 💡 获取帮助

### 常见问题
- 查看各文档的"需要改进的地方"部分
- 检查 [technical-debt.md](./technical-debt.md) 的已知问题

### 联系方式
- GitHub Issues: 技术问题和 bug
- Pull Requests: 代码贡献
- Discussions: 架构讨论

## 📝 文档约定

### 符号含义
- ✅ 已实现/推荐做法
- ❌ 不推荐/错误做法
- ⚠️ 警告/注意事项
- 🔴 严重问题
- 🟡 中等问题
- 🟢 低优先级问题

### 代码示例
- `代码` - 行内代码
- ```javascript``` - 代码块
- **粗体** - 重要术语
- *斜体* - 强调

---

**文档版本**：1.0
**生成日期**：架构文档创建时
**维护者**：开发团队

感谢您阅读 OpenSea Offer Maker 架构文档！🚀
