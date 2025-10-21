# Epic 4: NFT Trading & Portfolio Management - 交易执行与资产管理

## Epic Goal

提供完整的NFT交易执行和投资组合管理功能，包括购买NFT、挂单出售、余额查询、投资组合分析等核心交易能力，为用户提供一站式的NFT资产管理解决方案。

## Epic Description

### 系统核心功能

**现有核心功能：**
- `buy` 命令：购买特定NFT或地板价NFT
- `list` 命令：多平台NFT挂单出售，支持交互式选择
- `balance` 命令：多代币余额查询和管理
- 交互式NFT选择和缓存集成
- 多链资产管理和代币支持
- 智能定价策略和利润计算

**技术栈：**
- Node.js ES Modules 与 ethers.js v6
- OpenSea SDK和API集成用于市场交互
- Enquirer.js用于交互式命令行界面
- CacheService用于本地NFT数据管理
- 多链代币配置和ABI管理
- 智能价格算法和市场数据分析

**集成点：**
- BuyService处理NFT购买逻辑和安全验证
- ListCommand与CacheService集成进行NFT选择
- BalanceCommand与代币配置系统集成
- OpenSeaApi提供实时市场数据
- 多链配置确保跨链资产管理一致性

### 功能模块详解

#### 1. NFT购买系统 (`buy` 命令)

**核心能力：**
- 特定NFT购买：指定合约地址和Token ID
- 地板价购买：购买集合中最便宜的NFT
- 价格限制和风险控制
- 购买前确认和安全验证
- Gas费用估算和优化
- 多链购买支持

**技术实现：**
```javascript
// 购买特定NFT
export async function buySpecificNFT(sdk, contractAddress, tokenId, wallet, openseaApi, options = {}) {
  // 获取listing信息
  const listing = await openseaApi.getListingByTokenId(contractAddress, tokenId);

  // 价格验证
  const priceInETH = parseFloat(ethers.formatEther(listing.price.current.value));
  if (options.maxPrice) {
    validatePrice(priceInETH, options.maxPrice);
  }

  // 购买确认和执行
  await confirmPurchase({...});
  const transaction = await sdk.fulfillOrder({
    order: listing,
    accountAddress: walletAddress,
  });

  return transaction.hash;
}

// 地板价购买
export async function buyFloorNFT(sdk, collectionSlug, wallet, openseaApi, options = {}) {
  // 获取集合地板价NFT
  const floorNFTs = await openseaApi.getCollectionFloorNFTs(collectionSlug);
  const selectedNFT = await selectFloorNFT(floorNFTs, options);

  // 执行购买流程
  return await buySpecificNFT(sdk, selectedNFT.contract, selectedNFT.tokenId, wallet, openseaApi, options);
}
```

#### 2. NFT挂单系统 (`list` 命令)

**核心能力：**
- 交互式NFT选择：从缓存中选择要出售的NFT
- 智能定价策略：绝对价格、地板价差异、利润率
- 多平台挂单支持（目前OpenSea）
- 到期时间管理和费用控制
- 批量挂单和模板功能
- 挂单状态跟踪和管理

**交互式流程：**
1. **NFT选择** - 从缓存中或手动输入NFT信息
2. **定价方法选择** - 绝对价格、地板价差异、利润率
3. **价格计算** - 根据选择的方法计算最终价格
4. **参数设置** - 到期时间、市场平台、费用选项
5. **确认执行** - 用户确认后创建挂单

**定价策略实现：**
```javascript
// 绝对定价
if (options.price) {
  listingPrice = parseFloat(options.price);
}

// 地板价差异定价
if (options.floorDiff) {
  const floorPrice = await openseaApi.getCollectionFloorPrice(collectionSlug);
  listingPrice = calculateFloorPrice(floorPrice, options.floorDiff);
}

// 利润率定价
if (options.profitMargin || options.profitPercent) {
  const purchasePrice = await getPurchasePrice(contractAddress, tokenId);
  listingPrice = calculateProfitPrice(purchasePrice, options.profitMargin, options.profitPercent);
}
```

#### 3. 多代币余额系统 (`balance` 命令)

**核心能力：**
- 多链代币余额查询
- 支持原生代币和ERC20代币
- 实时余额更新和显示
- 代币配置动态管理
- 批量余额查询和筛选
- 余额历史记录功能

**支持的代币：**
- **Ethereum**: ETH, WETH
- **Base**: ETH, WETH
- **Arbitrum**: ETH, WETH
- **Polygon**: MATIC, WETH
- **Ronin**: RON, WETH
- **ApeChain**: APE, WETH
- **Sepolia**: ETH, WETH (测试网)

**技术实现：**
```javascript
// 查询代币余额
for (const [tokenKey, tokenConfig] of Object.entries(tokensToQuery)) {
  let balance;

  if (tokenConfig.isNative) {
    // 原生代币余额
    balance = await wallet.provider.getBalance(walletAddress);
  } else {
    // ERC20代币余额
    const tokenContract = new ethers.Contract(
      tokenConfig.address,
      ERC20_ABI,
      wallet
    );
    balance = await tokenContract.balanceOf(walletAddress);
  }

  const formattedBalance = ethers.formatUnits(balance, tokenConfig.decimals);
  logger.info(`  ${tokenConfig.symbol}: ${formattedBalance}`);
}
```

#### 4. BuyService购买服务层

**核心职责：**
- 封装NFT购买流程复杂性
- 提供统一的安全验证接口
- Listing数据获取和验证
- 价格验证和风险评估
- Gas费用估算和优化
- 交易状态监控和确认

**关键方法：**
- `buySpecificNFT()` - 购买特定NFT
- `buyFloorNFT()` - 购买地板价NFT
- `validateListing()` - 验证listing有效性
- `estimateGasFee()` - 估算Gas费用
- `confirmPurchase()` - 购买确认流程

#### 5. CacheService集成与NFT管理

**集成功能：**
- 交互式NFT选择界面
- 缓存数据实时更新
- NFT元数据展示和管理
- 收集筛选和搜索功能
- 投资组合可视化

### 业务流程

#### NFT购买流程
1. **参数验证** - 确保购买参数完整有效
2. **市场数据获取** - 查询当前listing和价格信息
3. **价格验证** - 检查价格是否在用户接受范围内
4. **风险评估** - Gas费用和滑点分析
5. **购买确认** - 用户确认购买详情
6. **交易执行** - 提交购买交易到区块链
7. **状态监控** - 跟踪交易确认状态

#### NFT挂单流程
1. **NFT选择** - 从缓存或手动输入选择NFT
2. **定价策略** - 选择定价方法和计算价格
3. **参数配置** - 设置到期时间、平台等参数
4. **风险评估** - 检查价格合理性和费用
5. **挂单确认** - 用户确认挂单详情
6. **挂单创建** - 在选定平台创建挂单
7. **状态跟踪** - 监控挂单状态和变化

#### 余额查询流程
1. **链配置** - 确定查询的区块链网络
2. **代币识别** - 获取链上支持的代币列表
3. **余额获取** - 批量查询各代币余额
4. **格式化显示** - 转换并格式化余额数据
5. **历史记录** - 更新余额历史数据

### 成功标准

- ✅ 用户能够购买特定NFT和地板价NFT
- ✅ 交互式NFT选择和挂单创建流程
- ✅ 多种定价策略和智能价格计算
- ✅ 多链代币余额查询和实时更新
- ✅ 完整的交易安全验证和风险控制
- ✅ 用户友好的交互界面和确认流程
- ✅ 投资组合管理和资产跟踪功能
- ✅ 跨链资产管理和统一视图

## Stories

### Story 4.1: BuyService购买服务实现
**实现文件：** `src/services/buyService.js`

**任务范围：**
- 实现BuyService类，封装NFT购买逻辑
- 特定NFT购买功能实现
- 地板价NFT购买功能实现
- Listing数据获取和验证
- 价格验证和风险评估逻辑
- Gas费用估算和优化
- 购买确认和安全检查机制

**验收标准：**
- BuyService能够安全可靠地购买特定NFT
- BuyService能够获取和验证地板价NFT信息
- 完整的价格验证和风险控制机制
- Gas费用估算准确性和优化建议
- 用户友好的购买确认流程
- 错误处理覆盖所有失败场景

### Story 4.2: Buy命令实现
**实现文件：** `src/commands/buyCommand.js`

**任务范围：**
- 实现`buy`命令及所有参数选项
- 特定NFT购买功能（-a, -t参数）
- 地板价购买功能（-c参数）
- 价格限制和安全控制（-m参数）
- 购买确认和跳过确认选项
- 多链支持和私钥管理
- 调试模式和详细日志输出

**验收标准：**
- 支持所有PRD中定义的购买类型
- 完整的参数验证和冲突检查
- 多链操作正确性验证
- 价格限制和风险控制有效
- 用户友好的命令行界面和错误提示
- 交易成功后显示交易哈希和状态

### Story 4.3: 交互式List命令实现
**实现文件：** `src/commands/listCommand.js`

**任务范围：**
- 实现交互式NFT选择流程
- 与CacheService集成获取NFT数据
- 多种定价策略实现（绝对价格、地板价差异、利润率）
- 智能价格计算和验证逻辑
- 多平台挂单支持（当前OpenSea）
- 到期时间管理和费用控制
- 用户界面优化和流程导航

**验收标准：**
- 交互式NFT选择流程流畅易用
- 所有定价策略按预期工作
- 智能价格计算准确可靠
- 挂单参数配置灵活完整
- 用户界面清晰友好，支持返回和取消操作
- 与缓存系统无缝集成

### Story 4.4: 多代币Balance命令实现
**实现文件：** `src/commands/balanceCommand.js`

**任务范围：**
- 实现多链代币余额查询功能
- 支持原生代币和ERC20代币查询
- 代币配置管理和动态更新
- 批量余额查询和性能优化
- 特定代币查询和筛选功能
- 余额格式化和显示优化
- 历史记录和趋势分析

**验收标准：**
- 能够查询所有配置链上的代币余额
- 支持原生代币和ERC20代币的正确处理
- 代币配置系统灵活可扩展
- 余额查询性能优化和批量处理
- 清晰的余额显示和格式化
- 支持特定代币查询和筛选

### Story 4.5: 代币配置系统增强
**实现文件：** `src/config/tokens.js`

**任务范围：**
- 扩展代币配置系统支持更多链
- 标准化代币配置格式和结构
- 实现动态代币配置加载
- 支持自定义代币添加和管理
- 代币ABI标准化和版本管理
- 配置验证和错误处理
- 代币元数据管理和更新

**验收标准：**
- 代币配置系统支持所有目标链
- 配置格式标准化且易于扩展
- 动态加载机制工作正常
- 支持用户自定义代币配置
- 完整的配置验证和错误处理
- 代币信息准确且及时更新

## 兼容性要求

- ✅ 多链支持：ethereum, base, arbitrum, polygon, ronin, apechain, sepolia
- ✅ OpenSea SDK和API集成
- ✅ ERC20代币标准兼容性
- ✅ 缓存系统集成和一致性
- ✅ 命令行界面向后兼容性
- ✅ 代币配置动态加载

## 风险缓解

**主要风险：** 市场数据延迟或错误导致交易失败

**缓解措施：**
- 实现实时数据验证和重试机制
- 提供详细的价格确认和风险提示
- 支持交易前模拟和预检查
- 实现交易状态监控和异常处理
- 提供手动干预和取消机制

**回滚计划：**
- Git恢复到稳定版本
- 清理未完成的交易和挂单
- 通知用户检查交易状态
- 提供手动交易完成指导
- 恢复代币配置到上一个稳定版本

## 定义完成

- ✅ 所有Stories完成且满足验收标准
- ✅ BuyService和交易执行功能完全实现
- ✅ buy、list、balance命令功能完整且稳定
- ✅ 多链代币支持验证通过
- ✅ 交互式界面流畅易用
- ✅ 单元测试覆盖率>80%
- ✅ 集成测试覆盖完整交易流程
- ✅ 错误处理和边界情况验证
- ✅ 用户文档和使用示例完整
- ✅ 安全审计和交易验证通过

---

## 验证清单 ✅

**范围验证：**
- ✅ Epic可在5个Stories内完成
- ✅ 遵循现有架构模式（服务+命令+配置）
- ✅ 集成复杂度可控（依赖OpenSea API和缓存系统）
- ✅ 技术栈与现有系统一致

**风险评估：**
- ✅ 现有系统风险中等（涉及资金交易）
- ✅ 回滚计划可行（Git恢复，交易状态检查）
- ✅ 测试方法覆盖现有功能（完整交易流程测试）
- ✅ 团队具备充足知识（区块链交易和代币管理）

**完整性检查：**
- ✅ Epic目标清晰且可实现
- ✅ Stories范围适当（服务层→命令层→配置层）
- ✅ 成功标准可衡量
- ✅ 依赖关系明确（OpenSea API、代币配置、缓存系统）