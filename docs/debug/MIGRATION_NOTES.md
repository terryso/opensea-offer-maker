# Reservoir 到 OpenSea API 迁移笔记

## 迁移概述

由于 Reservoir 将在 2025年10月15日停止 NFT API 服务,我们正在将项目从 Reservoir API 迁移到 OpenSea API。

## 已完成的迁移

### ✅ 1. listCommand.js (已完成)

**变更内容:**
- ❌ 移除 `@reservoir0x/reservoir-sdk` 依赖
- ❌ 移除 `viem` 相关代码
- ✅ 改用 `OpenSeaSDK` 创建 listing
- ✅ 使用 `OpenSeaApi.getCollectionByContract()` 获取地板价
- ✅ 保留所有原有功能(价格计算、过期时间等)

**API 映射:**
| 原 Reservoir API | 新 OpenSea API | 状态 |
|-----------------|----------------|------|
| `reservoirApi.getTopCollections()` | `openseaApi.getCollectionByContract()` | ✅ |
| `client.actions.listToken()` | `sdk.createListing()` | ✅ |

**已知限制:**
- ✅ OpenSea listing 完全支持

**测试建议:**
```bash
# 测试绝对价格
node src/cli.js list -a 0xYourContract -t 123 -p 0.1 --chain base

# 测试相对地板价
node src/cli.js list -a 0xYourContract -t 123 --floor-diff +10% --chain ethereum

# 测试过期时间
node src/cli.js list -a 0xYourContract -t 123 -p 0.1 -e 7d
```

## 待迁移的文件

### 🔄 2. scanCommand.js & scanService.js (待处理)

**当前依赖:**
- `reservoirApi.getTopCollections()` - 按交易量排序获取集合
- `reservoirApi.getCollectionOffers()` - 获取集合 offers

**迁移方案:**
- **方案 A:** 使用 Alchemy NFT API 获取 trending collections
- **方案 B:** 手动维护热门项目列表
- **方案 C:** 使用其他第三方数据源 (Dune Analytics, CoinGecko)

**OpenSea API 限制:**
- ❌ 没有 "按交易量排序的集合列表" 端点
- ✅ 可以获取单个集合的统计数据
- ✅ 可以获取集合的 offers

### 🔄 3. trendingCommand.js (待处理)

**当前依赖:**
- `reservoirApi.getTrendingCollections()` - 获取热门集合

**迁移方案:** 同 scanCommand.js

### ✅ 4. checkOffersCommand.js (无需修改)

**状态:** 已使用 OpenSea API,无需修改

### ✅ 5. offerCommand.js (无需修改)

**状态:** 已使用 OpenSea SDK,无需修改

### ✅ 6. autoOfferCommand.js (无需修改)

**状态:** 已使用 OpenSea SDK 和 API,无需修改

## 新增的 API 方法

### OpenSeaApi.getCollectionByContract()

```javascript
/**
 * 通过合约地址获取 collection 信息
 * @param {string} contractAddress - NFT 合约地址
 * @returns {Promise<Object>} - 包含 collection slug 的对象
 */
async getCollectionByContract(contractAddress) {
    const url = `${this.baseUrl}/api/v2/chain/${this.chainConfig.name}/contract/${contractAddress}`;
    // 返回: { collection: "collection-slug", ... }
}
```

**使用场景:**
- 当只有合约地址,需要获取 collection slug 时
- 用于获取地板价等集合级别的数据

## 依赖包变更

### 可以移除的包:
```json
{
  "@reservoir0x/reservoir-sdk": "^2.4.32",  // ❌ 可移除
  "viem": "^x.x.x"  // ❌ 如果只用于 Reservoir SDK,可移除
}
```

### 需要保留的包:
```json
{
  "opensea-js": "^7.1.14",  // ✅ 保留
  "ethers": "^6.13.4",  // ✅ 保留
  "axios": "^x.x.x"  // ✅ 保留 (用于 OpenSeaApi)
}
```

## 下一步行动

### 立即行动 (本周):
1. ✅ 完成 listCommand 迁移
2. 🔄 测试 listCommand 功能
3. 🔄 评估 Alchemy NFT API 作为 trending/top collections 的数据源
4. 🔄 申请 Alchemy API key (如果还没有)

### 短期 (下周):
1. 🔄 实现 Alchemy API 集成
2. 🔄 迁移 scanCommand 和 trendingCommand
3. 🔄 更新测试用例
4. 🔄 更新文档

### 中期:
1. 🔄 移除 Reservoir SDK 依赖
2. 🔄 清理不再使用的代码
3. 🔄 全面测试所有功能

## 注意事项

### OpenSea API 限制:
1. **Rate Limiting:** 注意 API 调用频率限制
2. **Chain Support:** 确认所有链都支持
3. **Data Format:** OpenSea 和 Reservoir 的数据格式可能不同

### 测试重点:
1. ✅ 地板价计算准确性
2. ✅ 价格差异计算 (百分比和绝对值)
3. ✅ 过期时间设置
4. ✅ 多链支持 (Ethereum, Base, Sepolia)
5. ✅ 错误处理

## 参考资源

- [OpenSea API v2 文档](https://docs.opensea.io/)
- [OpenSea SDK 文档](https://github.com/ProjectOpenSea/opensea-js)
- [Alchemy NFT API](https://docs.alchemy.com/reference/nft-api-quickstart)
- [Reservoir 关闭公告](https://twitter.com/reservoir0x/status/1912207186941313091)

## 问题追踪

### 已解决:
- ✅ listCommand 使用 OpenSea SDK 创建 listing
- ✅ 通过合约地址获取 collection slug
- ✅ 地板价获取和计算

### 待解决:
- 🔄 Top collections 数据源
- 🔄 Trending collections 数据源

---

**最后更新:** 2025-10-18
**更新人:** AI Assistant
