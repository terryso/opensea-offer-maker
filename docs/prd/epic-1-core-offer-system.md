# Epic 1: Core Offer Making System - 基础设施重构

## Epic Goal

建立一个完整、可靠的NFT出价系统，支持单个NFT出价、集合出价、自动竞价策略和出价监控功能，为OpenSea Offer Maker工具提供核心交易能力。

## Epic Description

### 系统核心功能

**现有核心功能：**
- `offer` 命令：创建单个NFT或集合的出价
- `auto` 命令：自动化竞价策略，支持集合和单品
- `check` 命令：监控集合出价状态和市场信息
- OpenSea SDK集成，支持多链操作
- WETH余额验证和交易安全性保障

**技术栈：**
- Node.js ES Modules 与 ethers.js v6
- OpenSea SDK (opensea-js v8.0.3) 用于市场交互
- Commander.js v12.1.0 用于CLI命令结构
- 自定义OfferService和OfferStrategy服务类
- 多链支持（ethereum, base, sepolia）

**集成点：**
- OfferService封装OpenSea SDK调用，提供统一出价接口
- OfferStrategy实现自动化竞价逻辑和策略
- OpenSeaApi服务提供市场数据和集合统计
- 与KeyManager集成进行钱包管理
- 支持多链配置和WETH合约交互

### 功能模块详解

#### 1. 单次出价系统 (`offer` 命令)

**核心能力：**
- 单个NFT出价：指定合约地址和Token ID
- 集合出价：基于collection slug创建集合级出价
- 特征出价：支持基于NFT特征（trait）的定向出价
- 出价过期时间管理
- 多链支持和交易确认

**技术实现：**
```javascript
// 创建SDK实例
const chainSpecificSdk = new OpenSeaSDK(wallet, {
  chain: chainConfig.chain,
  apiKey: OPENSEA_API_KEY,
});

// 单个NFT出价
await chainSpecificSdk.createOffer({
  asset: {
    tokenId: options.tokenId,
    tokenAddress: options.address,
  },
  accountAddress: walletAddress,
  startAmount: parseFloat(options.offerAmount),
  expirationTime
});

// 集合出价
await chainSpecificSdk.createCollectionOffer({
  collection: options.collection,
  accountAddress: walletAddress,
  amount: parseFloat(options.offerAmount),
  expirationTime,
  trait: {
    type: options.traitType,
    value: options.traitValue
  }
});
```

#### 2. 自动竞价系统 (`auto` 命令)

**核心能力：**
- 自动集合竞价：持续监控并调整集合出价
- 自动单品竞价：针对特定NFT的自动出价策略
- 价格范围控制：设置最低/最高出价限制
- 地板价保护：防止出价超过地板价指定百分比
- 智能增量：可配置的价格递增策略
- 间隔控制：自定义检查频率

**技术实现：**
- OfferStrategy类实现竞价算法和策略逻辑
- 与OpenSeaApi集成获取实时市场数据
- 支持多种竞价策略和风险控制机制
- 异步循环处理，支持优雅停止

#### 3. 出价监控系统 (`check` 命令)

**核心能力：**
- 集合出价状态查询
- 市场统计信息获取（地板价、交易量等）
- 最高出价分析
- 出价历史追踪
- 竞争对手分析

**技术实现：**
- OpenSeaApi服务提供RESTful数据获取
- 实时市场数据展示
- 支持多链数据查询

#### 4. OfferService服务层

**核心职责：**
- 封装OpenSea SDK复杂性
- 提供统一的出价接口
- WETH余额验证和管理
- 交易参数验证和安全性检查
- 错误处理和重试逻辑

**关键方法：**
- `validateBalance()` - WETH余额验证
- `validateCollectionOffer()` - 集合出价参数验证
- `createOffer()` - 统一出价创建接口
- `approveWETH()` - WETH授权管理

#### 5. OfferStrategy策略层

**核心职责：**
- 实现自动化竞价算法
- 价格范围控制和风险管理
- 地板价监控和限制
- 竞争对手出价分析
- 策略配置和动态调整

**策略特性：**
- 可配置的价格增量策略
- 智能价格边界检查
- 市场数据驱动的决策逻辑
- 优雅的错误处理和恢复机制

### 业务流程

#### 单次出价流程
1. **参数验证** - 确保必需参数完整且有效
2. **余额检查** - 验证WETH余额是否充足
3. **SDK初始化** - 创建链特定的OpenSea SDK实例
4. **出价创建** - 调用SDK创建出价交易
5. **交易确认** - 返回订单哈希和交易状态

#### 自动竞价流程
1. **策略初始化** - 加载竞价策略配置
2. **市场监控** - 定期获取集合和市场数据
3. **价格分析** - 计算最优出价价格
4. **风险评估** - 验证出价符合风险控制要求
5. **出价执行** - 创建或更新出价
6. **循环监控** - 持续监控市场变化

### 成功标准

- ✅ 用户可以为单个NFT创建出价，支持多链操作
- ✅ 用户可以创建集合级出价，支持特征筛选
- ✅ 自动竞价系统能够根据市场变化动态调整出价
- ✅ 所有出价操作都有完整的安全验证和余额检查
- ✅ 支持出价过期时间管理和批量操作
- ✅ 实时市场数据监控和竞争对手分析
- ✅ 多链支持确保在不同网络上的操作一致性
- ✅ 错误处理机制确保系统稳定性和用户体验

## Stories

### Story 1.1: OfferService核心服务实现
**实现文件：** `src/services/offerService.js`

**任务范围：**
- 实现OfferService类，封装OpenSea SDK
- WETH余额验证和授权管理
- 出价参数验证（单个NFT、集合、特征）
- 统一错误处理和重试逻辑
- 多链支持和合约地址管理
- 单元测试覆盖（>80%）

**验收标准：**
- OfferService能够创建和管理单个NFT出价
- OfferService能够创建集合级出价和特征出价
- 完整的余额验证和安全检查机制
- 支持多链配置和WETH合约交互
- 错误处理覆盖所有失败场景

### Story 1.2: 单次出价命令实现
**实现文件：** `src/commands/offerCommand.js`

**任务范围：**
- 实现`offer`命令及所有参数选项
- 单个NFT出价功能（-a, -t参数）
- 集合出价功能（-c参数）
- 特征出价功能（--trait-type, --trait-value）
- 出价过期时间管理（-e参数）
- 多链支持和私钥管理
- 参数验证和用户友好的错误信息

**验收标准：**
- 支持所有PRD中定义的出价类型
- 完整的参数验证和冲突检查
- 多链操作正确性验证
- 用户友好的命令行界面和错误提示
- 交易成功后显示订单哈希等关键信息

### Story 1.3: OfferStrategy竞价策略服务
**实现文件：** `src/services/offerStrategy.js`

**任务范围：**
- 实现OfferStrategy类，包含竞价算法
- 价格范围控制逻辑（min, max参数）
- 地板价保护机制（floor-percentage）
- 智能价格增量策略（increment）
- 间隔控制和循环监控逻辑
- 竞争对手出价分析和响应
- 风险管理和安全控制机制

**验收标准：**
- 自动竞价策略能够根据市场变化调整出价
- 价格范围控制和地板价保护正常工作
- 系统能够优雅处理网络错误和API限制
- 竞价策略配置灵活且易于使用
- 完整的错误恢复和状态管理

### Story 1.4: 自动竞价命令实现
**实现文件：** `src/commands/autoOfferCommand.js`

**任务范围：**
- 实现`auto collection`和`auto token`子命令
- 自动集合竞价功能，支持所有策略参数
- 自动单品竞价功能，针对特定NFT
- 实时监控和状态显示
- 优雅停止机制（Ctrl+C处理）
- 调试模式和详细日志输出
- 进度显示和性能统计

**验收标准：**
- 自动竞价系统能够持续运行并响应市场变化
- 所有策略参数按预期工作
- 系统能够安全停止并保存状态
- 提供清晰的状态信息和进度反馈
- 支持调试模式和故障排查

### Story 1.5: 出价监控命令实现
**实现文件：** `src/commands/checkOffersCommand.js`

**任务范围：**
- 实现`check`命令，监控集合出价状态
- 集合统计信息获取和显示
- 最高出价分析和竞争对手监控
- 市场数据展示（地板价、交易量等）
- 多链数据查询支持
- 数据格式化和用户友好显示

**验收标准：**
- 能够准确显示集合出价状态和统计信息
- 实时市场数据获取和展示
- 支持多链数据查询和对比
- 清晰的数据格式化和用户界面
- 错误处理和数据验证机制

## 兼容性要求

- ✅ 多链支持：ethereum, base, sepolia
- ✅ OpenSea SDK v8.0.3集成
- ✅ WETH代币支持和余额管理
- ✅ 私钥管理和安全性保障
- ✅ 命令行参数向后兼容性
- ✅ 错误处理和用户体验一致性

## 风险缓解

**主要风险：** OpenSea API变更或网络问题影响出价功能

**缓解措施：**
- 实现健壮的错误处理和重试机制
- 支持多种网络条件和超时处理
- 提供详细的调试日志和故障诊断
- 实现交易状态监控和恢复机制
- 定期更新OpenSea SDK版本以保持兼容性

**回滚计划：**
- Git恢复到稳定版本
- 清理未完成的交易和出价
- 通知用户检查交易状态
- 提供手动交易完成指导

## 定义完成

- ✅ 所有Stories完成且满足验收标准
- ✅ OfferService和OfferStrategy完全实现并测试
- ✅ offer、auto、check命令功能完整且稳定
- ✅ 多链支持验证通过
- ✅ 单元测试覆盖率>80%
- ✅ 集成测试覆盖完整业务流程
- ✅ 错误处理和边界情况验证
- ✅ 用户文档和使用示例完整
- ✅ 性能测试和压力测试通过
- ✅ 安全审计和私钥管理验证

---

## 验证清单 ✅

**范围验证：**
- ✅ Epic可在5个Stories内完成
- ✅ 遵循现有架构模式（服务+命令）
- ✅ 集成复杂度可控（依赖OpenSea SDK和API）
- ✅ 技术栈与现有系统一致

**风险评估：**
- ✅ 现有系统风险低（核心功能，已有代码基础）
- ✅ 回滚计划可行（Git恢复，清理未完成交易）
- ✅ 测试方法覆盖现有功能（完整测试套件）
- ✅ 团队具备充足知识（OpenSea SDK和ethers.js）

**完整性检查：**
- ✅ Epic目标清晰且可实现
- ✅ Stories范围适当（服务层→命令层→策略层）
- ✅ 成功标准可衡量
- ✅ 依赖关系明确（OpenSea SDK、API密钥）