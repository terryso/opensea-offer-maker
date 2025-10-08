# 安全

## 输入验证

### 验证库
- **库**：无（手动验证）
- **验证位置**：命令层（参数解析）和服务层

### 必需规则

| 输入类型 | 验证方法 | 位置 |
|---------|---------|------|
| 链名称 | 对照 `SUPPORTED_CHAINS` 验证 | `src/utils/commandUtils.js` |
| 私钥 | 通过 ethers.js 验证（无效则抛出） | `src/utils/keyManager.js` |
| 地址 | 通过 ethers.js `isAddress()` | 各命令文件 |
| 金额 | 验证为正数 | 各命令文件 |
| 集合 slug | 字符串非空检查 | 各命令文件 |

### 验证示例

```javascript
// 链验证
import { SUPPORTED_CHAINS } from '../config.js';

function validateChain(chainName) {
  const chain = SUPPORTED_CHAINS.find(c => c.name === chainName);
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }
  return chain;
}

// 地址验证
import { isAddress } from 'ethers';

function validateAddress(address) {
  if (!isAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`);
  }
  return address;
}

// 金额验证
function validateAmount(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) {
    throw new Error('Amount must be a positive number');
  }
  return amount;
}
```

**⚠️ 有限验证**：
- 无输入清理（用于显示）
- 无 SQL 注入风险（无数据库）

## 认证和授权

### 认证方法
- **方法**：本地私钥（无远程认证）
- **会话管理**：不适用（CLI 工具，无会话）

### 必需模式

1. **密钥管理**
   - 用户必须通过 `key add` 命令添加私钥后才能进行交易
   - 自动选择活跃密钥，或使用 `--private-key` 标志指定
   - 无远程认证 - 工具作为用户钱包

2. **API 密钥**
   - OpenSea API 密钥：通过环境变量
   - Alchemy API 密钥：通过环境变量
   - 无中央认证服务器

## 密钥管理

### 开发环境
- **方式**：`.env` 文件（必须手动创建，gitignored）
- **内容**：
  ```
  OPENSEA_API_KEY=your_key_here
  ALCHEMY_API_KEY=your_key_here
  ENCRYPTION_KEY=optional_custom_key
  ```

### 生产环境
- **方式**：相同（用户机器上的 `.env` 文件）
- **责任**：用户负责保护其 API 密钥

### 代码要求

**✅ 应该做**：
- 仅从环境加载 API 密钥
- 私钥存储前加密
- 日志中不记录密钥（仅记录地址）

**⚠️ 违规**：
```javascript
// src/utils/keyManager.js:10-12
export const SALT = Buffer.from('opensea-offer-maker-salt', 'utf8');
export const PASSWORD = 'opensea-offer-maker-password';
```
源代码中硬编码的盐和密码意味着任何有源代码的人都可以解密存储的私钥。

### 可用的缓解措施
设置 `ENCRYPTION_KEY` 环境变量：
```bash
export ENCRYPTION_KEY="your-secure-password-here"
```

### 建议
1. 首次使用时提示用户输入密码
2. 使用系统钥匙串存储密钥
3. 或明确文档说明："仅用于低价值钱包"

## ⚠️ 严重安全问题

### 问题：硬编码加密密钥

**位置**：`src/utils/keyManager.js:10-12`

```javascript
export const SALT = Buffer.from('opensea-offer-maker-salt', 'utf8');
export const PASSWORD = 'opensea-offer-maker-password';
```

**影响**：
- 任何有源代码访问权限的人都可以解密 `.keys` 文件
- 所有未自定义 `ENCRYPTION_KEY` 的用户都使用相同的加密密钥
- 严重的安全漏洞

**风险等级**：🔴 严重

**缓解措施**：
1. **临时**：用户设置 `ENCRYPTION_KEY` 环境变量
2. **永久**：重构以使用：
   - 首次运行时的用户生成密码
   - 系统钥匙串集成
   - 硬件钱包支持

**用户警告**：
在 README 中明确说明：
> ⚠️ 警告：仅使用低价值钱包。始终设置自定义 ENCRYPTION_KEY。

## API 安全

### 速率限制
- **客户端实现**：未实现（依赖 API 提供商限制）
- **CORS 策略**：不适用（非 Web 服务器）
- **安全标头**：不适用（非 Web 服务器）
- **HTTPS 强制**：所有外部 API 使用 HTTPS（fetch 原生支持）

### API 端点安全

| API | 认证方法 | 安全措施 |
|-----|---------|---------|
| OpenSea v2 | `X-API-KEY` header | HTTPS, API 密钥在环境中 |
| Reservoir | `x-api-key` header（可选） | HTTPS |
| Alchemy RPC | URL 中的 API 密钥 | HTTPS |

## 数据保护

### 静态加密
- **私钥**：使用 AES-256-GCM 加密
- **算法**：AES-256-GCM（认证加密）
- **密钥派生**：scrypt(password, salt, 32)
- **存储格式**：JSON 文件，每个密钥独立的 IV 和认证标签

#### 加密实现

来源：`src/utils/keyManager.js`

```javascript
import crypto from 'crypto';

// 加密流程
const algorithm = 'aes-256-gcm';
const iv = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 32);

const cipher = crypto.createCipheriv(algorithm, key, iv);
let encrypted = cipher.update(privateKey, 'utf8', 'hex');
encrypted += cipher.final('hex');
const authTag = cipher.getAuthTag();

// 存储格式
{
  "wallet-name": {
    "encryptedKey": "hex_string",
    "authTag": "hex_string",
    "iv": "hex_string",
    "address": "0x...",
    "isActive": true
  }
}
```

### 传输中加密
- **方法**：所有 API 调用使用 HTTPS
- **实现**：fetch API 原生支持

### PII 处理
- **钱包地址**：记录（在加密领域视为公开信息）
- **私钥**：永不记录
- **API 密钥**：不记录

### 日志限制

```javascript
// ✅ 安全
logger.info('Creating offer from wallet:', wallet.address);
logger.debug('Using key:', key.slice(0, 6) + '...' + key.slice(-4));

// ❌ 不安全
logger.debug('Private key:', privateKey);  // 永远不要这样做！
logger.debug('API key:', apiKey);          // 永远不要这样做！
```

## 依赖安全

### 扫描工具
- **当前**：无配置（应添加 npm audit 或 Snyk）
- **更新策略**：手动更新（无自动化依赖更新）
- **审批流程**：无正式流程（开源，接受社区贡献）

**⚠️ 差距**：CI 中无自动化依赖漏洞扫描

### 建议配置

```yaml
# .github/workflows/security.yml
name: Security Scan
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm audit
      - run: npm audit fix  # 自动修复
```

## 安全测试

### SAST（静态应用安全测试）
- **工具**：无（应添加 ESLint 安全插件）
- **建议**：
  ```bash
  npm install --save-dev eslint-plugin-security
  ```

### DAST（动态应用安全测试）
- **工具**：不适用（非 Web 应用）

### 渗透测试
- **状态**：无（开源工具，社区审查）

## 安全建议

### 立即行动（优先级 1）
1. ✅ 修复硬编码加密密钥问题
   - 移除硬编码的 SALT 和 PASSWORD
   - 强制用户设置 ENCRYPTION_KEY
   - 或首次运行时提示输入密码

2. ✅ 在 CI 中添加 `npm audit`
   - 每次推送时扫描漏洞
   - 阻止有严重漏洞的部署

3. ✅ 在 README 中添加安全警告
   - 仅用于低价值钱包
   - 必须设置 ENCRYPTION_KEY
   - 备份 `.keys` 文件的重要性

### 短期（1-2 周）
4. 添加 ESLint 安全插件
5. 实现依赖更新自动化（Dependabot）
6. 为密钥操作添加审计日志

### 中期（1-2 月）
7. 探索系统钥匙串集成
8. 添加硬件钱包支持
9. 实现多重签名支持
10. 添加交易模拟预览

### 长期（3-6 月）
11. 安全审计（外部）
12. Bug 赏金计划
13. 形式化验证关键代码路径

## 安全检查清单

在部署前检查：

- [ ] 无硬编码密钥或密码
- [ ] 所有密钥从环境加载
- [ ] 私钥加密后存储
- [ ] 日志中无敏感数据
- [ ] 使用 HTTPS 进行所有外部调用
- [ ] 输入验证已实现
- [ ] 依赖项是最新的
- [ ] `npm audit` 通过无严重问题
- [ ] 安全文档是最新的
- [ ] README 包含安全最佳实践

## 安全联系

- **漏洞报告**：[GitHub Issues](https://github.com/your-repo/issues)（私密报告）
- **安全政策**：待添加 SECURITY.md
- **响应时间**：尽力而为（开源项目）

## 合规性

- **适用法规**：无（个人使用工具）
- **数据驻留**：本地（用户机器）
- **审计要求**：无
- **隐私政策**：无（不收集用户数据）

**注意**：作为本地 CLI 工具，无数据收集或远程存储。
