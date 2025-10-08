# 外部 API 集成

## OpenSea API v2

- **用途**：查询 NFT 集合数据、出价和验证订单状态
- **文档**：https://docs.opensea.io/reference/api-overview
- **基础 URL**：`https://api.opensea.io`
- **认证**：`X-API-KEY` header（必需）
- **速率限制**：未知（OpenSea 未为此等级文档化）

### 使用的关键端点

- `GET /api/v2/offers/collection/{slug}` - 获取集合出价
- `GET /api/v2/offers/collection/{slug}/nfts/{tokenId}/best` - 获取最佳 NFT 出价
- `GET /api/v2/collections/{slug}` - 获取集合信息
- `GET /api/v2/collections/{slug}/stats` - 获取统计数据（地板价、交易量等）
- `GET /api/v2/orders/{chain}/seaport/{orderHash}` - 检查订单状态

### 集成说明

- 3 次重试，1 秒延迟（硬编码）
- 404 响应返回空数组（不是错误）
- 401 响应立即抛出异常（API 密钥验证）
- 未实现速率限制处理

**使用位置**：`src/services/openseaApi.js`，被 OfferService、OfferStrategy、CheckCommand 调用

---

## Reservoir API

- **用途**：查询跨市场 NFT 数据、top 集合、热门数据
- **文档**：https://docs.reservoir.tools/
- **基础 URL**：
  - 以太坊：`https://api.reservoir.tools`
  - Base：`https://api-base.reservoir.tools`
  - Sepolia：`https://api-sepolia.reservoir.tools`
- **认证**：`x-api-key` header（大多数端点可选，更高速率限制需要）
- **速率限制**：根据计划变化，公共端点通常较宽松

### 使用的关键端点

- `GET /collections/v7` - 按交易量获取 top 集合（带分页）
- `GET /collections/trending/v1` - 按时间段获取热门集合
- `GET /orders/bids/v6` - 集合出价
- `POST /execute/list/v5`（通过 SDK）- 创建跨市场挂单

### 集成说明

- API URL 根据链自动选择
- 3 次重试，1 秒延迟（硬编码）
- 支持使用 continuation token 的分页
- SDK 用于创建挂单（需要 viem 钱包适配器）

**使用位置**：`src/services/reservoirApi.js`，被 ScanService、ListCommand 调用

---

## Alchemy RPC

- **用途**：以太坊节点访问以进行区块链操作
- **文档**：https://docs.alchemy.com/
- **基础 URL**：根据链和 API 密钥变化
- **认证**：URL 或提供商配置中的 API 密钥
- **速率限制**：根据计划变化（免费层：300 req/sec）

### 使用的关键操作

- 读取 WETH 余额（`balanceOf`）
- 估算交易 gas
- 发送签名交易
- 查询交易状态

### 集成说明

- ⚠️ **硬编码** - 无其他 RPC 提供商的回退
- 通过 `commandUtils.js:44-47` 中的 `ethers.AlchemyProvider` 创建
- 链名称映射：'ethereum' → 'mainnet'，'base' → 'base'，'sepolia' → 'sepolia'

**使用位置**：所有交易命令通过 CommandUtils 中的 `getWallet()` 使用
