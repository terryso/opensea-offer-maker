# 代理配置和 Listing 功能说明

## 🔧 安装依赖

首先安装新增的代理依赖:

```bash
npm install https-proxy-agent@^7.0.5
```

## 🌐 代理配置

### 默认代理
代码已配置默认代理地址: `http://127.0.0.1:7890`

### 自定义代理
如果需要使用不同的代理地址,可以通过环境变量设置:

```bash
# 临时设置
export HTTP_PROXY=http://your-proxy-host:port

# 或在命令前设置
HTTP_PROXY=http://your-proxy-host:port node src/cli.js list ...
```

### 在 .env 文件中配置
```bash
# .env
HTTP_PROXY=http://127.0.0.1:7890
```

## 📝 重构说明

### 变更内容

1. **移除 OpenSea SDK**
   - 原因: SDK 内部使用 ethers.js 的 HTTP 请求会超时
   - 解决: 直接使用 OpenSea API + axios (支持代理)

2. **添加代理支持**
   - 使用 `https-proxy-agent` 包
   - 在 axios 实例中配置代理
   - 所有 OpenSea API 请求都通过代理

3. **实现 Seaport Order 签名**
   - 手动构建 Seaport 1.5 order
   - 使用 EIP-712 签名
   - 直接提交到 OpenSea API

## 🚀 使用方法

### 基本用法
```bash
node src/cli.js list \
  -a 0x07152bfde079b5319e5308c43fb1dbc9c76cb4f9 \
  -t 36259 \
  -p 0.0015 \
  -e 1d \
  -m opensea
```

### 使用相对地板价
```bash
node src/cli.js list \
  -a 0xYourContract \
  -t 123 \
  --floor-diff +10% \
  -e 7d
```

### 使用调试模式
```bash
node src/cli.js list \
  -a 0xYourContract \
  -t 123 \
  -p 0.1 \
  --debug
```

## 🔍 技术细节

### Seaport Order 结构

```javascript
{
  parameters: {
    offerer: "0x...",           // 卖家地址
    zone: "0x0000...",          // Zone 地址 (通常为 0)
    offer: [{                   // 出售的 NFT
      itemType: 2,              // ERC721
      token: "0x...",           // NFT 合约地址
      identifierOrCriteria: "123", // Token ID
      startAmount: "1",
      endAmount: "1"
    }],
    consideration: [{           // 期望收到的代币
      itemType: 1,              // ERC20 (WETH)
      token: "0x...",           // WETH 地址
      identifierOrCriteria: "0",
      startAmount: "1000000000000000", // 价格 (Wei)
      endAmount: "1000000000000000",
      recipient: "0x..."        // 接收地址
    }],
    startTime: "1697000000",    // 开始时间
    endTime: "1697086400",      // 结束时间
    orderType: 0,               // FULL_OPEN
    zoneHash: "0x0000...",
    salt: "0x...",              // 随机盐值
    conduitKey: "0x0000007b...", // OpenSea Conduit
    totalOriginalConsiderationItems: 1,
    counter: 0
  },
  protocol_address: "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC" // Seaport 1.5
}
```

### EIP-712 签名

```javascript
const domain = {
  name: 'Seaport',
  version: '1.5',
  chainId: 1, // 或 8453 (Base), 11155111 (Sepolia)
  verifyingContract: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC'
};

const types = {
  OrderComponents: [...],
  OfferItem: [...],
  ConsiderationItem: [...]
};

const signature = await wallet.signTypedData(domain, types, parameters);
```

### API 端点

```
POST https://api.opensea.io/api/v2/orders/{chain}/seaport/listings

Headers:
  X-API-KEY: your_api_key
  Content-Type: application/json

Body:
  {
    "parameters": {...},
    "signature": "0x...",
    "protocol_address": "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC"
  }
```

## ⚠️ 注意事项

### 1. WETH 地址
不同链的 WETH 地址不同:
- Ethereum: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
- Base: `0x4200000000000000000000000000000000000006`
- Sepolia: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`

### 2. Seaport 版本
当前使用 Seaport 1.5:
- 合约地址: `0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC`
- 所有链都使用相同的地址

### 3. Counter 值
- 首次创建 listing 时 counter 为 0
- 如果之前有取消过订单,需要从链上读取当前 counter
- 当前实现假设 counter 为 0 (适用于大多数情况)

### 4. 代理连接
- 确保代理服务正在运行
- 代理地址和端口正确
- 如果代理需要认证,需要修改代理 URL 格式:
  ```
  http://username:password@host:port
  ```

## 🐛 故障排查

### 问题: 签名失败
**可能原因:**
- 私钥格式不正确
- EIP-712 类型定义错误

**解决方法:**
```bash
# 使用调试模式查看详细信息
node src/cli.js list ... --debug
```

### 问题: API 返回 400 错误
**可能原因:**
- Order 参数不正确
- 价格格式错误
- 时间戳无效

**解决方法:**
- 检查 API 错误响应中的详细信息
- 验证所有参数格式

### 问题: 代理连接失败
**可能原因:**
- 代理服务未运行
- 代理地址或端口错误

**解决方法:**
```bash
# 测试代理连接
curl -x http://127.0.0.1:7890 https://api.opensea.io/api/v2/chain/ethereum/account/0x0000000000000000000000000000000000000000

# 查看代理日志
# 检查代理软件的连接日志
```

### 问题: Counter 不匹配
**错误信息:** "Invalid counter"

**解决方法:**
需要从链上读取当前 counter 值:
```javascript
// 未来可能需要实现
const seaportContract = new ethers.Contract(
  '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC',
  ['function getCounter(address) view returns (uint256)'],
  provider
);
const counter = await seaportContract.getCounter(walletAddress);
```

## 📊 测试结果

### 成功案例
```bash
✅ NFT: 0x07152bfde079b5319e5308c43fb1dbc9c76cb4f9 #36259
✅ Price: 0.0015 ETH
✅ Expiration: 1 day
✅ Chain: Base
✅ 通过代理成功创建 listing
```

## 🔄 与之前版本的对比

| 功能 | Reservoir SDK 版本 | 当前版本 (OpenSea API) |
|------|-------------------|----------------------|
| 创建 listing | ✅ | ✅ |
| 代理支持 | ❌ | ✅ |
| 超时问题 | ❌ 经常超时 | ✅ 已解决 |
| 代码复杂度 | 高 (viem + SDK) | 中 (直接 API) |
| 调试难度 | 高 | 低 |

## 📚 参考资源

- [OpenSea API 文档](https://docs.opensea.io/reference/post_listing)
- [Seaport 协议文档](https://docs.opensea.io/docs/seaport)
- [EIP-712 规范](https://eips.ethereum.org/EIPS/eip-712)
- [https-proxy-agent](https://github.com/TooTallNate/proxy-agents)

## 🚀 下一步优化

1. **Counter 自动获取**
   - 从链上读取当前 counter 值
   - 避免 counter 不匹配错误

2. **批量 Listing**
   - 支持一次创建多个 listing
   - 提高效率

3. **多市场支持**
   - 研究 Blur API
   - 实现 Blur listing 功能

4. **错误重试**
   - 自动重试失败的请求
   - 更好的错误处理

---

**更新时间:** 2025-10-18  
**版本:** v0.0.7-proxy
