# 编码标准

## 核心标准

### 语言和运行时
- **语言**：JavaScript ES2022
- **运行时**：Node.js 16+ (ES Modules)
- **模块系统**：ES Modules (package.json 中 `"type": "module"`)
- **代码风格**：无正式 linter 配置（应添加 ESLint）

### 测试组织
- **单元测试**：`src/__tests__/*.test.js`（模拟外部依赖）
- **集成测试**：`src/__tests__/*.integration.test.js`（真实 API）
- **测试框架**：Jest，需要实验性 ES Modules 支持

## 命名约定

| 元素 | 约定 | 示例 |
|------|------|------|
| 文件 | camelCase | `offerService.js`, `keyManager.js` |
| 类 | PascalCase | `class OfferService`, `class KeyManager` |
| 函数 | camelCase | `createOffer()`, `getWallet()` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_CHAIN`, `SUPPORTED_CHAINS` |
| 私有方法 | _前缀 | `_processCollections()`（非严格执行） |
| 环境变量 | UPPER_SNAKE_CASE | `OPENSEA_API_KEY`, `ALCHEMY_API_KEY` |

## 关键规则

### 日志规范
**规则**：使用 `logger.info/debug/error()` from `src/utils/logger.js` - 永远不要直接使用 `console.log`

**⚠️ 当前违规**：`offerService.js` 使用 console.log

```javascript
// ✅ 正确
import logger from '../utils/logger.js';
logger.info('Creating offer for collection:', collectionSlug);
logger.debug('Offer parameters:', params);
logger.error('Failed to create offer:', error);

// ❌ 错误
console.log('Creating offer...');
```

### 错误处理
**规则**：命令必须捕获错误并在退出前调用 `logger.error()`

- 不要让原始堆栈跟踪显示给用户
- 提供有帮助的错误消息

```javascript
// ✅ 正确
try {
  await offerService.createOffer(params);
} catch (error) {
  logger.error('Failed to create offer:', error.message);
  process.exit(1);
}

// ❌ 错误
await offerService.createOffer(params);  // 未捕获的错误
```

### 环境变量
**规则**：通过 `src/config.js` 或 `src/utils/env.js` 访问 - 不要直接使用 `process.env`

集中访问使验证成为可能。

```javascript
// ✅ 正确
import { OPENSEA_API_KEY } from './utils/env.js';

// ❌ 错误
const apiKey = process.env.OPENSEA_API_KEY;
```

### 私钥安全
**规则**：永远不要记录私钥，即使在调试模式下

- 仅记录地址或部分密钥（前 6 + 后 4 字符）

```javascript
// ✅ 正确
logger.debug('Using wallet:', wallet.address);
logger.debug('Key:', key.slice(0, 6) + '...' + key.slice(-4));

// ❌ 错误
logger.debug('Private key:', privateKey);
```

### API 密钥
**规则**：仅从环境加载，永远不要硬编码

```javascript
// ✅ 正确
import { OPENSEA_API_KEY } from './utils/env.js';
const api = new OpenSeaApi(OPENSEA_API_KEY);

// ❌ 错误
const api = new OpenSeaApi('sk_live_1234567890');
```

### 链配置
**规则**：使用 `SUPPORTED_CHAINS` from `src/config.js` - 不要硬编码链参数

```javascript
// ✅ 正确
import { SUPPORTED_CHAINS } from './config.js';
const chain = SUPPORTED_CHAINS.find(c => c.name === chainName);

// ❌ 错误
const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
```

### BigInt 运算
**规则**：处理 Wei 金额时，谨慎使用 BigInt

- 运算前始终转换为 BigInt
- 正确格式化显示（ethers.formatUnits）

```javascript
// ✅ 正确
const amount = parseUnits(amountStr, 18);  // 返回 BigInt
const total = amount + fee;  // BigInt 运算
logger.info('Amount:', formatUnits(total, 18), 'ETH');

// ❌ 错误
const amount = parseFloat(amountStr);  // 精度损失
const total = amount + 0.001;  // 浮点运算不安全
```

## 文件结构标准

### 命令文件结构
```javascript
// src/commands/exampleCommand.js
import { Command } from 'commander';
import logger from '../utils/logger.js';
import SomeService from '../services/someService.js';

export default function createExampleCommand() {
  const command = new Command('example')
    .description('Example command description')
    .option('-o, --option <value>', 'Option description')
    .action(async (options) => {
      try {
        // 1. 验证参数
        // 2. 调用服务
        // 3. 显示结果
      } catch (error) {
        logger.error('Command failed:', error.message);
        process.exit(1);
      }
    });

  return command;
}
```

### 服务文件结构
```javascript
// src/services/exampleService.js
import logger from '../utils/logger.js';

export class ExampleService {
  constructor(config) {
    this.config = config;
  }

  async doSomething(params) {
    try {
      logger.debug('Doing something with:', params);
      // 业务逻辑
      return result;
    } catch (error) {
      logger.error('Service operation failed:', error);
      throw error;  // 传播给调用者
    }
  }
}

export default ExampleService;
```

### 工具文件结构
```javascript
// src/utils/exampleUtil.js
import logger from './logger.js';

export function helperFunction(input) {
  // 验证输入
  if (!input) {
    throw new Error('Input required');
  }

  // 处理并返回
  return processedInput;
}

export default { helperFunction };
```

## 注释标准

### 何时添加注释

**需要注释的地方**：
- 复杂的业务逻辑
- 非显而易见的算法
- 变通方法和已知问题
- 安全关键代码
- 公共 API 接口

**不需要注释的地方**：
- 自解释的代码
- 变量声明（除非复杂）
- 简单的 getter/setter

### 注释风格

```javascript
/**
 * 为集合创建出价
 *
 * @param {string} collectionSlug - OpenSea 集合 slug
 * @param {string} offerAmount - 出价金额（ETH）
 * @param {Object} options - 额外选项
 * @returns {Promise<string>} 订单哈希
 * @throws {Error} 如果余额不足或 API 调用失败
 */
async createCollectionOffer(collectionSlug, offerAmount, options = {}) {
  // 实现
}

// ⚠️ SECURITY: 不要记录私钥
logger.debug('Wallet address:', wallet.address);

// TODO: 添加重试逻辑
await api.fetch(url);

// FIXME: 硬编码值应移至配置
const RETRY_COUNT = 3;
```

## 依赖管理

### 添加新依赖

**流程**：
1. 检查是否已有类似功能的依赖
2. 评估包的维护状态和安全性
3. 使用 `npm install --save` 或 `--save-dev`
4. 更新文档说明新依赖的用途

### 更新依赖

**流程**：
1. 运行 `npm outdated` 检查过时的包
2. 检查 CHANGELOG 了解破坏性变更
3. 更新并测试
4. 更新 package-lock.json

## 性能考虑

### 异步操作
```javascript
// ✅ 正确 - 并行执行
const [offers, stats] = await Promise.all([
  api.getCollectionOffers(slug),
  api.getCollectionStats(slug)
]);

// ❌ 错误 - 串行执行（慢）
const offers = await api.getCollectionOffers(slug);
const stats = await api.getCollectionStats(slug);
```

### 避免不必要的计算
```javascript
// ✅ 正确 - 缓存结果
const chain = SUPPORTED_CHAINS.find(c => c.name === chainName);
if (chain) {
  // 多次使用 chain
}

// ❌ 错误 - 重复查找
if (SUPPORTED_CHAINS.find(c => c.name === chainName)) {
  const chain = SUPPORTED_CHAINS.find(c => c.name === chainName);
}
```

## 代码审查检查清单

审查代码时检查：

- [ ] 使用 logger 而不是 console.log
- [ ] 错误被正确捕获和处理
- [ ] 私钥/API 密钥没有被记录
- [ ] 使用配置而不是硬编码值
- [ ] 添加了适当的测试
- [ ] 函数有清晰的职责
- [ ] 变量和函数命名清晰
- [ ] 复杂逻辑有注释
- [ ] 遵循现有代码模式
- [ ] 没有引入新的技术债务

## 需要改进的地方

### 待添加
1. **ESLint 配置**
   - 添加 ESLint 和推荐规则
   - 配置 Prettier 进行代码格式化
   - 添加 pre-commit hook

2. **更严格的类型检查**
   - 考虑添加 JSDoc 类型注释
   - 或迁移到 TypeScript

3. **标准化导入顺序**
   - 外部包
   - 内部模块
   - 相对导入

4. **一致的文件命名**
   - 所有服务使用 `*Service.js`
   - 所有命令使用 `*Command.js`
