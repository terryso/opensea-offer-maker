# List命令交互模式优化

## 概述

List命令的交互模式（`--interactive`）经过全面优化，提供更加流畅和直观的用户体验。现在支持完整的交互式流程：选择合集 → 选择NFT → 设置价格。

## 功能说明

### 完整交互流程

1. **第一步：选择合集**
   - 系统会按合集对NFT进行分组
   - 显示每个合集及其包含的NFT数量
   - 合集列表按字母顺序排序
   - 用户选择要操作的合集

2. **第二步：选择NFT**
   - 在选定的合集内，显示该合集的所有NFT
   - 显示NFT名称、合约地址和Token ID
   - 用户选择具体要上架的NFT

3. **第三步：设置价格**（可选交互）
   - 如果命令行未提供价格参数，系统会交互式询问
   - 选择定价策略：
     - **绝对价格**：直接输入ETH价格（如 0.1）
     - **地板价差价**：基于地板价的差价（如 +0.1, -5%）
     - **利润金额**：基于购买价的固定利润（如 +0.01 ETH）
     - **利润百分比**：基于购买价的百分比利润（如 +10%）
   - 系统会自动获取并显示相关参考价格（地板价或购买价）

### 特殊情况处理

- **单一合集**：如果钱包中所有NFT都属于同一个合集，会自动跳过合集选择步骤，直接进入NFT选择
- **分页显示**：当选项超过20个时，自动启用分页，每页显示15个选项

## 使用示例

### 完全交互模式（推荐）
```bash
# 不提供任何价格参数，完全交互式操作
npm start -- list --interactive

# 或使用简写
npm start -- list -i
```

### 部分交互模式
```bash
# 提前指定价格，只交互选择NFT
npm start -- list --interactive --price 0.1

# 使用地板价差价
npm start -- list -i --floor-diff +0.1

# 使用利润百分比
npm start -- list -i --profit-percent 10
```

## 交互流程示例

### 完整流程演示

```
📦 Found 45 NFTs in cache.
📚 Found 3 collections. Select a collection first:

> Bored Ape Yacht Club (20 NFTs)
  Mutant Ape Yacht Club (15 NFTs)
  Azuki (10 NFTs)

[用户选择 Bored Ape Yacht Club]

🎨 Select an NFT from Bored Ape Yacht Club (20 NFTs):

> BAYC #1234 | 0xBC4C...A09f:1234
  BAYC #5678 | 0xBC4C...A09f:5678
  BAYC #9012 | 0xBC4C...A09f:9012
  ...

[用户选择 BAYC #1234]

✅ Selected: BAYC #1234 from Bored Ape Yacht Club
📍 Contract: 0xBC4C...A09f, Token ID: 1234

💰 Choose pricing strategy:

> Absolute price (e.g., 0.1 ETH)
  Floor price difference (e.g., +0.1, -5%)
  Profit margin over purchase price (e.g., +0.01 ETH)
  Profit percentage over purchase price (e.g., +10%)

[用户选择 Floor price difference]

📊 Fetching floor price...
Current floor price: 15.5 ETH

? Enter price difference (e.g., +0.1, -0.1, +10%, -5%): -5%

[系统计算并显示确认信息]
```

## 优势

1. **更好的组织性**：按合集分组，便于快速定位
2. **减少滚动**：不需要在长列表中滚动查找
3. **清晰的层级**：先选择大类，再选择具体项，最后设置价格
4. **智能优化**：单一合集时自动跳过第一步
5. **灵活定价**：
   - 看到NFT后再决定价格，更加合理
   - 自动获取并显示参考价格（地板价/购买价）
   - 支持多种定价策略，满足不同需求
6. **完全可选**：可以选择完全交互模式，也可以预先指定部分参数

## 技术实现

- 使用 `Map` 数据结构按合集名称分组NFT
- 交互式价格输入支持所有定价策略
- 智能参考价格获取：根据定价策略自动获取地板价或购买价
- 输入验证：确保用户输入格式正确
- 保持向后兼容：不影响非交互模式和预先指定价格的用法
- 完善的错误处理：用户可以在任何步骤取消操作

## 相关命令

- `cache refresh`：刷新NFT缓存
- `cache filter`：管理忽略的合集
- `cache status`：查看缓存状态
