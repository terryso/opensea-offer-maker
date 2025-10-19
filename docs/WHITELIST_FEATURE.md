# 白名单功能说明

## 概述

缓存系统现在支持**白名单**和**黑名单**两种过滤模式:

- **白名单模式**: 当白名单不为空时,只缓存白名单中的合集
- **黑名单模式**: 当白名单为空时,过滤掉黑名单中的合集

**优先级**: 白名单 > 黑名单

**重要**: 白名单和黑名单是**按链(chain)存储**的,每条链都有独立的白名单和黑名单配置。

## 使用方法

### 白名单管理命令

#### 1. 添加合集到白名单
```bash
npm start cache whitelist add <collection-slug> [-r <reason>] [--chain <chain>]
```

示例:
```bash
# 为 ethereum 链添加白名单(默认)
npm start cache whitelist add azuki -r "蓝筹NFT"

# 为 base 链添加白名单
npm start cache whitelist add cryptopunks --chain base
```

#### 2. 从白名单移除合集
```bash
npm start cache whitelist remove <collection-slug> [--chain <chain>]
```

示例:
```bash
npm start cache whitelist remove azuki
npm start cache whitelist remove cryptopunks --chain base
```

#### 3. 查看白名单
```bash
npm start cache whitelist list [--chain <chain>]
```

输出示例:
```
Whitelisted Collections for ethereum (2):
⚠️  Whitelist mode active: Only these collections will be cached

1. azuki
   Reason: 蓝筹NFT
   Added: 2024-01-20 10:30:00

2. cryptopunks
   Reason: 用户指定：有价值
   Added: 2024-01-20 10:31:00
```

#### 4. 清空白名单
```bash
npm start cache whitelist clear [--chain <chain>]
```

清空后会自动切换回黑名单模式。

### 黑名单管理命令

黑名单命令同样支持 chain 选项:

```bash
npm start cache filter add <collection-slug> [-r <reason>] [--chain <chain>]
npm start cache filter remove <collection-slug> [--chain <chain>]
npm start cache filter list [--chain <chain>]
npm start cache filter clear [--chain <chain>]
```

## 工作原理

### 白名单模式 (优先)
当白名单中有合集时:
- ✅ 只缓存白名单中的合集
- ❌ 忽略所有不在白名单中的合集
- ℹ️ 黑名单不生效

### 黑名单模式 (默认)
当白名单为空时:
- ✅ 缓存所有合集
- ❌ 排除黑名单中的合集

## 使用场景

### 场景 1: 只关注特定蓝筹项目
```bash
# 为 ethereum 链添加蓝筹项目到白名单
npm start cache whitelist add azuki --chain ethereum
npm start cache whitelist add cryptopunks --chain ethereum
npm start cache whitelist add bored-ape-yacht-club --chain ethereum

# 刷新缓存,只会缓存这3个合集
npm start cache refresh --chain ethereum
```

### 场景 2: 排除垃圾合集
```bash
# 确保白名单为空
npm start cache whitelist clear --chain ethereum

# 添加垃圾合集到黑名单
npm start cache filter add spam-collection-1 --chain ethereum
npm start cache filter add spam-collection-2 --chain ethereum

# 刷新缓存,会缓存除了这2个合集外的所有NFT
npm start cache refresh --chain ethereum
```

### 场景 3: 不同链使用不同策略
```bash
# ethereum 使用白名单模式,只关注蓝筹
npm start cache whitelist add azuki --chain ethereum
npm start cache whitelist add cryptopunks --chain ethereum

# base 使用黑名单模式,排除垃圾
npm start cache filter add spam-collection --chain base

# 刷新不同链的缓存
npm start cache refresh --chain ethereum
npm start cache refresh --chain base
```

### 场景 4: 从白名单模式切换到黑名单模式
```bash
# 清空白名单即可切换
npm start cache whitelist clear --chain ethereum
```

## 技术实现

### 文件存储
每条链都有独立的白名单和黑名单文件:
- 白名单: `.cache/filters/whitelisted_collections_{chain}.json`
- 黑名单: `.cache/filters/ignored_collections_{chain}.json`

示例:
- `.cache/filters/whitelisted_collections_ethereum.json`
- `.cache/filters/ignored_collections_ethereum.json`
- `.cache/filters/whitelisted_collections_base.json`
- `.cache/filters/ignored_collections_base.json`

### 数据结构
```json
{
  "metadata": {
    "timestamp": 1705728000000,
    "version": "1.0",
    "chain": "ethereum"
  },
  "whitelistedCollections": [
    {
      "collectionSlug": "azuki",
      "reason": "蓝筹NFT",
      "addedAt": 1705728000000
    }
  ]
}
```

### 过滤逻辑
```javascript
// 在 CacheService._filterNFTs() 中
if (whitelistedCollections.length > 0) {
    // 白名单模式: 只保留白名单中的合集
    filtered = nfts.filter(nft => whitelistedSlugs.has(nft.collectionSlug));
} else {
    // 黑名单模式: 排除黑名单中的合集
    filtered = nfts.filter(nft => !ignoredSlugs.has(nft.collectionSlug));
}
```

## 注意事项

1. **按链存储**: 每条链都有独立的白名单和黑名单,互不影响
2. **白名单优先**: 一旦设置了白名单,黑名单将不再生效(针对同一条链)
3. **需要刷新缓存**: 修改白名单或黑名单后,需要运行 `cache refresh` 才能生效
4. **合集标识**: 使用 OpenSea 的 collection slug (如 `azuki`, `cryptopunks`)
5. **大小写敏感**: collection slug 是大小写敏感的
6. **默认链**: 如果不指定 `--chain` 选项,默认使用配置文件中的默认链

## API 参考

### CacheService 方法

```javascript
// 白名单方法
await cacheService.loadWhitelistedCollections(chain)
await cacheService.saveWhitelistedCollections(chain, collections)
await cacheService.addWhitelistedCollection(chain, slug, reason)
await cacheService.removeWhitelistedCollection(chain, slug)
await cacheService.clearWhitelistedCollections(chain)

// 黑名单方法
await cacheService.loadIgnoredCollections(chain)
await cacheService.saveIgnoredCollections(chain, collections)
await cacheService.addIgnoredCollection(chain, slug, reason)
await cacheService.removeIgnoredCollection(chain, slug)
await cacheService.clearIgnoredCollections(chain)

// 过滤方法
await cacheService._filterNFTs(chain, nfts)
```
