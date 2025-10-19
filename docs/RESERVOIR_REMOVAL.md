# Reservoir SDK 移除记录

## 概述
由于 Reservoir API 已经不再支持 NFT 相关功能,本次更新完全移除了项目中对 Reservoir SDK 的依赖及相关功能。

## 变更内容

### 1. 依赖移除
- **package.json**: 移除 `@reservoir0x/reservoir-sdk` 依赖

### 2. 删除的文件

#### 服务层
- `src/services/reservoirApi.js` - Reservoir API 服务类
- `src/services/scanService.js` - 扫描服务(依赖 Reservoir API)

#### 命令层
- `src/commands/scanCommand.js` - 扫描命令
- `src/commands/trendingCommand.js` - 趋势命令

#### 测试文件
- `src/__tests__/reservoirApi.test.js` - Reservoir API 测试
- `src/__tests__/scanService.test.js` - 扫描服务测试
- `src/__tests__/commands/scanCommand.test.js` - 扫描命令测试
- `src/__tests__/commands/trendingCommand.test.js` - 趋势命令测试

### 3. 配置文件更新

#### src/config.js
- 移除 `RESERVOIR_API_KEY` 导出
- 移除 `RESERVOIR_API_BASE_URLS` 配置

#### src/cli.js
- 移除 `scanCommand` 和 `trendingCommand` 的导入
- 移除这两个命令的注册

#### src/commands/index.js
- 移除 `scanCommand` 和 `trendingCommand` 的导出

## 受影响的功能

以下命令已被移除:
- `opensea-offer scan` - 扫描收藏品寻找交易机会
- `opensea-offer trending` - 查看趋势收藏品

## 环境变量清理

可以从 `.env` 文件中移除以下环境变量(如果存在):
```
RESERVOIR_API_KEY=your_api_key_here
```

## 测试结果

所有剩余测试通过:
- 测试套件: 16 passed
- 测试用例: 378 passed
- 无失败测试

## 后续建议

如果需要类似的扫描和趋势分析功能,可以考虑:
1. 使用 OpenSea API 的相关端点(如果有)
2. 集成其他 NFT 数据提供商
3. 自建数据分析服务

## 迁移日期
2025-01-19
