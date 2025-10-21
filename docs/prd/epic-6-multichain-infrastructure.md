# Epic 6: Multi-Chain Infrastructure - 多链基础设施

## Epic Goal

构建健壮、可扩展的多链基础设施，支持在以太坊、Base、Arbitrum、Polygon、Ronin、ApeChain等多个区块链网络上的统一操作，为用户提供无缝的跨链NFT交易和管理体验。

## Epic Description

### 系统核心功能

**现有核心功能：**
- `chain` 命令：默认链配置管理
- 7条区块链网络支持（包括测试网）
- 统一的链配置和参数管理
- 智能链选择和回退机制
- 跨链代币和合约地址管理
- 动态配置和持久化存储

**技术栈：**
- Node.js ES Modules 与文件系统管理
- OpenSea.js Chain枚举和配置集成
- Alchemy RPC节点网络支持
- JSON配置文件和持久化存储
- 统一的链配置验证和管理
- 动态链切换和回退机制

**集成点：**
- CommandUtils提供统一的链选项处理
- ConfigManager处理配置持久化和读取
- 与所有命令集成提供多链支持
- 代币配置系统支持链特定代币
- OpenSea API集成支持链特定API调用

### 功能模块详解

#### 1. 支持的区块链网络

**主要网络：**
- **Ethereum Mainnet** (Chain ID: 1) - 以太坊主网
- **Base** (Chain ID: 8453) - Coinbase Layer2网络
- **Arbitrum One** (Chain ID: 42161) - Arbitrum Layer2网络
- **Polygon** (Chain ID: 137) - Polygon主网
- **Ronin** (Chain ID: 2020) - Axie Infinity游戏链
- **ApeChain** (Chain ID: 33139) - ApeCoin生态链
- **Sepolia Testnet** (Chain ID: 11155111) - 以太坊测试网

**链配置结构：**
```javascript
export const SUPPORTED_CHAINS = {
  ethereum: {
    name: 'ethereum',
    chain: Chain.Mainnet,
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    chainId: 1,
    alchemyNetwork: 'mainnet',
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
    apiChainName: 'ethereum',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18
    }
  },
  base: {
    name: 'base',
    chain: Chain.Base,
    wethAddress: '0x4200000000000000000000000000000000000006',
    chainId: 8453,
    alchemyNetwork: 'base',
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/',
    apiChainName: 'base',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18
    }
  }
  // ... 其他链配置
};
```

#### 2. 链配置管理系统 (`chain` 命令)

**核心能力：**
- 默认链设置和查询
- 支持链列表显示和验证
- 配置持久化和读取
- 链参数验证和错误处理
- 用户友好的配置界面

**命令实现：**
```javascript
// 设置默认链
chainCommand
  .command('set')
  .description('Set default chain')
  .argument('<chain>', 'Chain name (ethereum, base, sepolia)')
  .action(async (chain) => {
    const result = await ConfigManager.setDefaultChain(chain);
    logger.info(`Default chain set to: ${result.chain}`);
  });

// 查询当前默认链
chainCommand
  .command('get')
  .description('Display current default chain')
  .action(async () => {
    const chain = await ConfigManager.getDefaultChain();
    if (chain) {
      logger.info(`Current default chain: ${chain}`);
    } else {
      logger.info(`Default chain: ${DEFAULT_CHAIN} (fallback)`);
    }
  });

// 列出所有支持的链
chainCommand
  .command('list')
  .description('List all supported chains')
  .action(() => {
    const chains = ConfigManager.getSupportedChains();
    chains.forEach(chain => {
      logger.info(`  - ${chain.name}`);
      logger.info(`    WETH: ${chain.wethAddress}`);
    });
  });
```

#### 3. ConfigManager配置管理服务

**核心职责：**
- 配置文件读写和管理
- 默认链配置持久化
- 配置验证和错误处理
- 向后兼容性维护
- 配置文件格式标准化

**关键方法：**
```javascript
export class ConfigManager {
  static async getDefaultChain() {
    try {
      const data = await this._fs.readFile(this._configFile, 'utf8');
      const config = JSON.parse(data);
      return config.defaultChain || null;
    } catch (error) {
      return null; // 配置文件不存在或无效
    }
  }

  static async setDefaultChain(chain) {
    if (!SUPPORTED_CHAINS[chain]) {
      throw new Error(`Invalid chain: ${chain}`);
    }

    let config = {};
    try {
      const data = await this._fs.readFile(this._configFile, 'utf8');
      config = JSON.parse(data);
    } catch (error) {
      // 配置文件不存在，使用空对象
    }

    config.defaultChain = chain;
    await this._fs.writeFile(this._configFile, JSON.stringify(config, null, 2));
    return { chain };
  }
}
```

#### 4. CommandUtils链工具集成

**核心功能：**
- 统一的链选项处理
- 智能链选择和回退机制
- 链验证和配置获取
- 与命令行参数集成

**链选择逻辑：**
```javascript
export const getEffectiveChain = async (options) => {
  let chainName = options.chain;

  // 检查用户是否显式提供了 --chain 参数
  const chainExplicitlyProvided = process.argv.includes('--chain');

  if (!chainExplicitlyProvided) {
    // 如果用户没有显式指定链，使用配置的默认链
    const configuredChain = await ConfigManager.getDefaultChain();
    if (configuredChain) {
      chainName = configuredChain;
    }
  }

  return validateChain(chainName);
};
```

#### 5. 跨链代币和合约管理

**支持的代币：**
- **Ethereum**: ETH, WETH
- **Base**: ETH, WETH
- **Arbitrum**: ETH, WETH
- **Polygon**: MATIC, WETH
- **Ronin**: RON, WETH
- **ApeChain**: APE, WETH
- **Sepolia**: ETH, WETH (测试)

**合约地址管理：**
- 每个链的WETH合约地址
- 链特定的原生代币配置
- 代币ABI标准化管理
- 跨链代币映射和转换

### 业务流程

#### 链配置流程
1. **用户输入** - 用户指定链名称
2. **链验证** - 验证链是否在支持列表中
3. **配置更新** - 更新默认链配置
4. **持久化** - 保存配置到文件
5. **确认反馈** - 向用户确认配置成功

#### 链选择流程
1. **参数解析** - 解析命令行链参数
2. **配置检查** - 检查用户配置的默认链
3. **链验证** - 验证链配置有效性
4. **配置应用** - 应用链配置到操作
5. **回退处理** - 处理无效链的回退机制

#### 跨链操作流程
1. **链识别** - 确定操作的区块链网络
2. **配置加载** - 加载链特定的配置参数
3. **节点连接** - 连接到链的RPC节点
4. **合约交互** - 使用链特定的合约地址
5. **API调用** - 调用链特定的API端点

### 成功标准

- ✅ 支持7条主要区块链网络的统一操作
- ✅ 默认链配置持久化和管理
- ✅ 智能链选择和回退机制
- ✅ 跨链代币和合约地址管理
- ✅ 用户友好的配置界面
- ✅ 完整的链验证和错误处理
- ✅ 配置向后兼容性和迁移支持
- ✅ 高性能的链切换和配置加载

## Stories

### Story 6.1: 链配置基础设施
**实现文件：** `src/constants/chains.js`

**任务范围：**
- 完善SUPPORTED_CHAINS配置对象
- 标准化链配置结构和格式
- 实现链查找和验证功能
- 原生代币配置管理
- 合约地址管理和验证
- 链特定参数和元数据

**验收标准：**
- SUPPORTED_CHAINS包含所有目标链的完整配置
- 链配置结构标准化且一致
- 链查找和验证功能正确工作
- 合约地址准确且验证有效
- 原生代币配置完整且正确

### Story 6.2: ConfigManager配置管理服务
**实现文件：** `src/utils/configManager.js`

**任务范围：**
- 实现ConfigManager类的核心功能
- 配置文件读写和持久化
- 默认链配置管理
- 配置验证和错误处理
- 向后兼容性维护
- 配置文件格式标准化

**验收标准：**
- ConfigManager能够读写配置文件
- 默认链配置正确保存和读取
- 配置验证覆盖所有边界情况
- 错误处理不破坏现有配置
- 配置文件格式稳定且可解析

### Story 6.3: Chain命令实现
**实现文件：** `src/commands/chainCommand.js`

**任务范围：**
- 实现`chain get`命令查询当前默认链
- 实现`chain set`命令设置默认链
- 实现`chain list`命令显示所有支持链
- 链参数验证和错误处理
- 用户友好的输出格式
- 配置状态反馈和确认

**验收标准：**
- 所有chain子命令按预期工作
- 链设置正确保存到配置文件
- 链列表显示完整且格式清晰
- 参数验证覆盖所有无效输入
- 用户界面友好且信息完整

### Story 6.4: CommandUtils链工具集成
**实现文件：** `src/utils/commandUtils.js`

**任务范围：**
- 完善addChainOption函数
- 实现getEffectiveChain智能选择逻辑
- 链验证和配置获取功能
- 与命令行参数的集成
- 回退机制和错误处理
- 链配置标准化接口

**验收标准：**
- addChainOption正确添加链选项到所有命令
- getEffectiveChain智能选择逻辑正确工作
- 链验证覆盖所有支持的链
- 用户显式指定链优先于配置默认链
- 回退机制确保总是有有效的链配置

### Story 6.5: 跨链配置集成和优化
**实现文件：** 多个相关文件

**任务范围：**
- 集成多链配置到所有现有命令
- 优化链切换性能和加载速度
- 实现配置缓存和延迟加载
- 跨链操作的一致性验证
- 配置迁移和版本管理
- 监控和日志记录增强

**验收标准：**
- 所有命令正确支持多链操作
- 链切换性能优化且响应快速
- 配置缓存机制提高加载速度
- 跨链操作行为一致且可预测
- 配置迁移不丢失用户设置
- 详细的操作日志和监控信息

## 兼容性要求

- ✅ OpenSea.js Chain枚举兼容性
- ✅ Alchemy RPC节点网络支持
- ✅ 现有命令行参数向后兼容
- ✅ 配置文件格式向后兼容
- ✅ 多链操作API一致性
- ✅ 代币和合约地址标准化

## 风险缓解

**主要风险：** 链配置错误导致交易失败或资产损失

**缓解措施：**
- 实施严格的链验证和参数检查
- 提供详细的配置验证和错误提示
- 实现配置备份和恢复机制
- 支持配置审计和变更追踪
- 提供测试网环境用于配置验证

**回滚计划：**
- 备份现有配置文件
- 提供配置重置和恢复功能
- 详细的配置迁移指导
- 技术支持和配置验证工具

## 定义完成

- ✅ 所有Stories完成且满足验收标准
- ✅ 多链基础设施完全实现且稳定
- ✅ chain命令和ConfigManager功能完整
- ✅ 所有命令正确支持多链操作
- ✅ 链配置验证和错误处理完善
- ✅ 单元测试覆盖率>85%
- ✅ 集成测试覆盖所有支持的链
- ✅ 配置迁移和兼容性验证
- ✅ 用户文档和配置指导完整
- ✅ 性能测试和负载验证通过

---

## 验证清单 ✅

**范围验证：**
- ✅ Epic可在5个Stories内完成
- ✅ 遵循现有架构模式（配置+工具+命令）
- ✅ 集成复杂度可控（依赖现有配置系统）
- ✅ 技术栈与现有系统一致

**风险评估：**
- ✅ 现有系统风险中等（配置影响所有操作）
- ✅ 回滚计划可行（配置备份和恢复）
- ✅ 测试方法覆盖现有功能（多链测试）
- ✅ 团队具备充足知识（区块链配置和RPC）

**完整性检查：**
- ✅ Epic目标清晰且可实现
- ✅ Stories范围适当（配置层→工具层→命令层→集成）
- ✅ 成功标准可衡量
- ✅ 依赖关系明确（链配置、RPC节点、API集成）