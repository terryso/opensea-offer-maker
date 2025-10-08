# 数据模型

**注意**：作为 CLI 工具，没有数据库。数据模型表示配置对象和内存结构。

## 链配置

**用途**：定义支持的区块链网络及其参数

**关键属性**：
- `name`: string - 链标识符（'ethereum'、'base'、'sepolia'）
- `chain`: Chain enum - OpenSea SDK 链常量
- `wethAddress`: address - 该链的 WETH 合约地址

**关系**：
- 所有命令通过 `--chain` 参数引用
- CommandUtils 使用它创建适当的提供商
- 代币配置引用这些链

**来源**：`src/config.js:19-35`

## 代币配置

**用途**：定义每条链上支持的代币（ETH、WETH）

**关键属性**：
- `symbol`: string - 代币符号（'ETH'、'WETH'）
- `decimals`: number - 代币小数位数（18）
- `address`: address | null - 合约地址（原生代币为 null）
- `isNative`: boolean - 是否为链的原生货币

**关系**：
- 按链分组
- swap 和 send 命令使用
- 计算金额和余额时引用

**来源**：`src/config/tokens.js`

## 加密密钥存储

**用途**：本地存储多个加密的私钥

**关键属性**：
- `name`: string - 用户友好的密钥名称
- `encryptedKey`: hex string - AES-256-GCM 加密的私钥
- `authTag`: hex string - GCM 认证标签
- `iv`: hex string - 初始化向量
- `address`: address - 以太坊地址（用于显示）
- `isActive`: boolean - 是否为当前活跃密钥

**关系**：
- 每个安装一个活跃密钥
- 支持多个密钥（可以切换）
- 所有交易命令使用

**存储**：`.keys` 文件（JSON 格式，gitignored）

**⚠️ 安全提示**：加密使用源代码中硬编码的盐/密码 - 见技术债务部分

### 存储格式示例

```json
{
  "default": {
    "encryptedKey": "hex_string",
    "authTag": "hex_string",
    "iv": "hex_string",
    "address": "0x...",
    "isActive": true
  },
  "my-wallet": {
    "encryptedKey": "...",
    "authTag": "...",
    "iv": "...",
    "address": "0x...",
    "isActive": false
  }
}
```
