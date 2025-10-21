# Epic 5: Wallet & Key Management - 安全钱包与密钥管理

## Epic Goal

建立安全、可靠的私钥和钱包管理系统，提供私钥加密存储、多密钥管理、代币转账、ETH/WETH兑换等核心钱包功能，确保用户资产安全和操作便捷性。

## Epic Description

### 系统核心功能

**现有核心功能：**
- `key` 命令：私钥管理（添加、列表、删除、切换）
- `send` 命令：多代币转账功能
- `swap` 命令：ETH与WETH互换功能
- AES-256-GCM加密私钥存储
- 多密钥管理和活动密钥切换
- 智能私钥格式验证和清理

**技术栈：**
- Node.js ES Modules 与 Node.js Crypto模块
- Ethers.js v6 用于钱包操作和区块链交互
- AES-256-GCM 加密算法保护私钥安全
- Enquirer.js 提供安全交互式界面
- 文件系统存储和JSON数据管理
- 多链WETH合约集成

**集成点：**
- KeyManager提供核心加密和解密服务
- 与commandUtils集成提供统一的私钥获取接口
- 代币配置系统集成支持多代币转账
- 多链配置确保跨链操作一致性
- 安全的私钥验证和格式化处理

### 功能模块详解

#### 1. 私钥管理系统 (`key` 命令)

**核心能力：**
- 私钥添加：安全添加新私钥到系统
- 密钥列表：查看所有已管理的私钥
- 密钥删除：安全删除不需要的私钥
- 密钥切换：切换活动私钥
- 私钥验证：格式和安全验证
- 加密存储：AES-256-GCM加密保护

**安全特性：**
```javascript
// 加密参数配置
export const ALGORITHM = 'aes-256-gcm';
export const SALT = Buffer.from('opensea-offer-maker-salt', 'utf8');
export const PASSWORD = 'opensea-offer-maker-password';
export const ENCRYPTION_KEY = scryptSync(PASSWORD, SALT, 32);

// 私钥加密存储
static async encryptKey(privateKey, name = 'default') {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // 存储加密数据和元数据
  keys[name] = {
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    address: address,
    isActive: !hasActiveKey,
    createdAt: new Date().toISOString()
  };
}
```

#### 2. 智能私钥验证和清理

**核心能力：**
- 私钥格式标准化和清理
- 64位十六进制字符串验证
- 前缀和后缀处理
- 非法字符过滤和修复
- 以太坊地址验证和生成
- 用户友好的错误提示

**私钥处理流程：**
```javascript
// 私钥清理和标准化
privateKey = privateKey.replace(/[\s\n\r\t]/g, ''); // 移除空格
if (privateKey.toLowerCase().startsWith('0x')) {
  privateKey = privateKey.slice(2);
}
privateKey = privateKey.replace(/[^0-9a-fA-F]/g, ''); // 移除非十六进制字符

// 长度处理
if (privateKey.length > 64) {
  privateKey = privateKey.slice(-64); // 截取最后64位
}
if (privateKey.length < 64) {
  privateKey = privateKey.padStart(64, '0'); // 补零到64位
}

// 验证和生成地址
if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error('Invalid private key format');
}
privateKey = '0x' + privateKey;
const wallet = new ethers.Wallet(privateKey);
```

#### 3. 多代币转账系统 (`send` 命令)

**核心能力：**
- 原生代币转账（ETH, MATIC, RON, APE等）
- ERC20代币转账（WETH等）
- 多链代币支持
- 地址验证和余额检查
- 交易确认和状态跟踪
- Gas费用估算和优化

**转账流程：**
```javascript
// 代币转账实现
if (tokenConfig.isNative) {
  // 原生代币转账
  tx = await wallet.sendTransaction({
    to: options.recipient,
    value: amount
  });
} else {
  // ERC20代币转账
  const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, wallet);
  tx = await tokenContract.transfer(options.recipient, amount);
}

// 交易确认和余额显示
receipt = await tx.wait();
const senderBalance = await tokenContract.balanceOf(walletAddress);
logger.info(`Remaining balance: ${ethers.formatUnits(senderBalance, tokenConfig.decimals)} ${tokenConfig.symbol}`);
```

#### 4. ETH/WETH兑换系统 (`swap` 命令)

**核心能力：**
- ETH转换为WETH
- WETH转换为ETH
- Gas费用估算和优化
- 余额验证和安全检查
- 多链WETH合约支持
- 实时余额显示

**兑换实现：**
```javascript
// WETH合约交互
const wethContract = new ethers.Contract(wethAddress, WETH_ABI, wallet);

// Gas费用估算
const gasEstimate = await wallet.provider.estimateGas({
  from: walletAddress,
  to: wethAddress,
  data: options.direction === 'eth2weth'
    ? wethContract.interface.encodeFunctionData('deposit')
    : wethContract.interface.encodeFunctionData('withdraw', [amount]),
  ...txParams
});

// 执行兑换
if (options.direction === 'eth2weth') {
  tx = await wethContract.deposit({ value: amount, gasLimit, gasPrice });
} else {
  tx = await wethContract.withdraw(amount, { gasLimit, gasPrice });
}
```

#### 5. KeyManager密钥管理服务

**核心职责：**
- 私钥加密和解密操作
- 密钥文件管理和持久化
- 活动密钥状态管理
- 密钥验证和安全性检查
- 向后兼容性处理
- 错误处理和恢复机制

**关键方法：**
- `encryptKey()` - 加密并存储私钥
- `decryptKey()` - 解密私钥
- `getActiveKey()` - 获取活动密钥
- `listKeys()` - 列出所有密钥
- `deleteKey()` - 删除指定密钥
- `setActiveKey()` - 设置活动密钥

### 业务流程

#### 私钥添加流程
1. **用户输入** - 接收私钥和可选名称
2. **格式清理** - 标准化私钥格式
3. **有效性验证** - 验证是否为有效的以太坊私钥
4. **地址生成** - 生成对应的钱包地址
5. **加密存储** - 使用AES-256-GCM加密存储
6. **状态更新** - 更新活动密钥状态

#### 代币转账流程
1. **参数验证** - 验证代币、金额、接收地址
2. **余额检查** - 确保有足够的余额
3. **地址验证** - 验证接收地址有效性
4. **交易构建** - 构建相应的转账交易
5. **Gas估算** - 估算交易费用
6. **交易执行** - 发送交易到区块链
7. **状态确认** - 等待交易确认并显示结果

#### ETH/WETH兑换流程
1. **方向验证** - 确认兑换方向（ETH→WETH或WETH→ETH）
2. **余额检查** - 验证余额是否足够
3. **Gas估算** - 估算合约交互费用
4. **合约调用** - 调用WETH合约的deposit或withdraw函数
5. **交易确认** - 等待交易确认
6. **余额更新** - 显示最新的ETH和WETH余额

### 成功标准

- ✅ 私钥安全加密存储，支持多密钥管理
- ✅ 智能私钥格式验证和错误恢复
- ✅ 多代币转账功能稳定可靠
- ✅ ETH/WETH兑换功能正常工作
- ✅ 完整的余额验证和安全检查
- ✅ 用户友好的交互界面和错误提示
- ✅ 多链支持和跨链操作一致性
- ✅ 高安全性和数据保护机制

## Stories

### Story 5.1: KeyManager核心服务增强
**实现文件：** `src/utils/keyManager.js`

**任务范围：**
- 完善KeyManager类的所有核心功能
- AES-256-GCM加密算法实现和优化
- 私钥加密存储和解密功能
- 多密钥管理和状态跟踪
- 活动密钥切换和验证
- 错误处理和恢复机制
- 向后兼容性和数据迁移

**验收标准：**
- KeyManager能够安全加密和解密私钥
- 支持多密钥管理和活动密钥切换
- 完整的错误处理和数据验证
- 加密算法安全可靠
- 密钥文件格式稳定且向后兼容
- 安全的密钥删除和清理功能

### Story 5.2: Key命令完整实现
**实现文件：** `src/commands/keyCommand.js`

**任务范围：**
- 实现`key add`命令及私钥添加流程
- 实现`key list`命令显示所有管理的密钥
- 实现`key delete`命令安全删除密钥
- 实现`key switch`命令切换活动密钥
- 智能私钥格式验证和清理
- 交互式界面和安全输入处理
- 详细的操作日志和状态反馈

**验收标准：**
- 所有key子命令按预期工作
- 私钥添加流程安全可靠
- 密钥列表显示清晰完整
- 密钥删除和切换功能正常
- 私钥格式验证智能且用户友好
- 交互界面流畅且安全

### Story 5.3: Send命令多代币转账
**实现文件：** `src/commands/sendCommand.js`

**任务范围：**
- 实现`send`命令及所有参数选项
- 原生代币转账功能（ETH, MATIC等）
- ERC20代币转账功能（WETH等）
- 多链代币支持和验证
- 地址验证和余额检查
- 交易确认和状态跟踪
- Gas费用估算和优化

**验收标准：**
- 支持所有配置链上的代币转账
- 原生代币和ERC20代币转账正常工作
- 完整的地址验证和余额检查
- 交易状态跟踪和确认可靠
- 用户友好的转账界面和状态显示
- 错误处理覆盖所有失败场景

### Story 5.4: Swap命令ETH/WETH兑换
**实现文件：** `src/commands/swapCommand.js`

**任务范围：**
- 实现`swap`命令及兑换方向选择
- ETH转换为WETH功能实现
- WETH转换为ETH功能实现
- 多链WETH合约支持
- Gas费用估算和优化
- 余额验证和安全检查
- 实时余额显示和状态更新

**验收标准：**
- ETH↔WETH双向兑换功能正常
- 多链WETH合约正确集成
- Gas费用估算准确且优化
- 完整的余额验证和安全检查
- 用户友好的兑换界面和状态显示
- 错误处理和异常情况处理

### Story 5.5: 安全性和验证增强
**实现文件：** 多个相关文件

**任务范围：**
- 私钥安全性验证和增强
- 输入验证和清理机制
- 错误处理和日志记录
- 安全存储和访问控制
- 用户输入敏感信息保护
- 审计日志和操作追踪
- 安全最佳实践实施

**验收标准：**
- 私钥存储和传输安全可靠
- 用户输入验证全面有效
- 错误处理不泄露敏感信息
- 操作日志完整且可追踪
- 安全机制符合最佳实践
- 用户敏感信息得到充分保护

## 兼容性要求

- ✅ 多链私钥管理和操作
- ✅ AES-256-GCM加密标准
- ✅ Ethers.js v6钱包兼容性
- ✅ ERC20代币标准支持
- ✅ WETH合约标准兼容
- ✅ 向后兼容的密钥文件格式

## 风险缓解

**主要风险：** 私钥泄露或存储安全漏洞

**缓解措施：**
- 使用行业标准的AES-256-GCM加密算法
- 实施严格的输入验证和清理
- 提供详细的操作日志和审计追踪
- 实施安全的内存管理和数据清理
- 定期安全审计和代码审查

**回滚计划：**
- 备份现有密钥文件
- 提供密钥导出和恢复工具
- 详细的迁移指导文档
- 技术支持和紧急响应机制

## 定义完成

- ✅ 所有Stories完成且满足验收标准
- ✅ KeyManager和密钥管理功能完全实现
- ✅ key、send、swap命令功能完整且安全
- ✅ 多链私钥和代币操作验证通过
- ✅ 安全性和加密机制验证通过
- ✅ 单元测试覆盖率>90%（关键安全代码）
- ✅ 集成测试覆盖完整钱包操作流程
- ✅ 安全审计和渗透测试通过
- ✅ 用户文档和安全指导完整
- ✅ 错误处理和异常恢复机制验证

---

## 验证清单 ✅

**范围验证：**
- ✅ Epic可在5个Stories内完成
- ✅ 遵循现有架构模式（工具类+命令）
- ✅ 集成复杂度可控（依赖加密库和区块链交互）
- ✅ 技术栈与现有系统一致

**风险评估：**
- ✅ 现有系统风险高（涉及资金安全）
- ✅ 回滚计划可行（密钥备份和恢复）
- ✅ 测试方法覆盖现有功能（全面安全测试）
- ✅ 团队具备充足知识（加密学和区块链安全）

**完整性检查：**
- ✅ Epic目标清晰且可实现
- ✅ Stories范围适当（核心服务→命令实现→安全增强）
- ✅ 成功标准可衡量
- ✅ 依赖关系明确（加密库、区块链节点、合约地址）