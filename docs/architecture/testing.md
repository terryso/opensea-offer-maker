# 测试策略

## 测试理念

### 测试方法
- **方法**：测试后置（实现后编写测试）- 非 TDD
- **覆盖率目标**：80%（当前约 60%）
- **测试金字塔**：主要是单元测试，部分集成测试，无 E2E 测试

### 当前状态
**⚠️ 存在的问题**：
- 集成测试在 CI 中已禁用
- 关键模块未测试（OfferStrategy、KeyManager）
- 无 E2E 命令测试

## 测试类型和组织

### 单元测试

#### 基本信息
- **框架**：Jest ^29.7.0
- **文件约定**：`*.test.js` 在 `src/__tests__/` 目录
- **位置**：`src/__tests__/`
- **模拟库**：Jest 内置 mocks
- **覆盖率要求**：80%（理想目标）

#### 运行命令
```bash
npm test                    # 运行所有单元测试
npm run test:coverage       # 带覆盖率报告
npm run test:watch          # 监视模式
```

#### AI 代理要求
生成测试时应：
- 为所有公共方法生成测试
- 覆盖边缘情况和错误条件
- 遵循 AAA 模式（Arrange, Act, Assert）
- 模拟所有外部依赖（fetch、ethers.js）

#### 示例测试结构

```javascript
describe('OpenSeaApi', () => {
  let api;
  let mockFetch;

  beforeEach(() => {
    global.fetch = mockFetch = jest.fn();
    api = new OpenSeaApi('test-api-key', 'https://api.test');
  });

  describe('fetchWithRetry', () => {
    it('should retry on failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'test' })
        });

      const result = await api.fetchWithRetry('test-url', {}, 3, 10);

      expect(result).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        api.fetchWithRetry('test-url', {}, 3, 10)
      ).rejects.toThrow('Network error');

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getCollectionOffers', () => {
    it('should return empty array for 404', async () => {
      mockFetch.mockResolvedValueOnce({ status: 404 });

      const result = await api.getCollectionOffers('test-collection');

      expect(result).toEqual({ offers: [] });
    });

    it('should throw on 401', async () => {
      mockFetch.mockResolvedValueOnce({ status: 401 });

      await expect(
        api.getCollectionOffers('test-collection')
      ).rejects.toThrow('Invalid API key');
    });
  });
});
```

### 集成测试

#### 基本信息
- **范围**：真实 API 调用以测试实际集成行为
- **位置**：`src/__tests__/*.integration.test.js`
- **测试基础设施**：
  - **OpenSea API**：需要真实 API 密钥（来自环境）
  - **Alchemy RPC**：需要真实 API 密钥
  - **区块链**：对测试网络的只读调用

#### 当前状态
**⚠️ 在 CI 中已禁用**（`publish.yml` 中 `if: false`）

#### 运行命令
```bash
npm run integration         # 运行所有集成测试
npm run test:opensea        # 仅 OpenSea 集成测试
npm run test:opensea:debug  # 带调试输出
```

#### 示例集成测试

```javascript
describe('OpenSeaApi Integration', () => {
  let api;

  beforeAll(() => {
    api = new OpenSeaApi(
      process.env.OPENSEA_API_KEY,
      'https://api.opensea.io'
    );
  });

  it('should fetch real collection offers', async () => {
    const result = await api.getCollectionOffers('azuki');

    expect(result).toHaveProperty('offers');
    expect(Array.isArray(result.offers)).toBe(true);
  }, 10000);  // 10秒超时

  it('should fetch collection stats', async () => {
    const stats = await api.getCollectionStats('azuki');

    expect(stats).toHaveProperty('total');
    expect(stats.total).toHaveProperty('floor_price');
  }, 10000);
});
```

### E2E 测试

#### 当前状态
**⚠️ 未实现**

#### 需求
- 命令级测试执行完整 CLI 流程
- 挑战：需要真实 API 密钥和可能的区块链交易

#### 建议的实现

```javascript
// 未来可能的 E2E 测试框架
describe('CLI E2E Tests', () => {
  it('should create collection offer end-to-end', async () => {
    // 1. 设置测试环境
    // 2. 执行 CLI 命令
    // 3. 验证结果
    // 4. 清理（取消出价）
  });
});
```

## 测试数据管理

### 策略
- **单元测试**：模拟数据
- **集成测试**：真实 API
- **Fixtures**：当前无（应为常见 API 响应添加）
- **Factories**：未使用
- **清理**：不需要（无数据库，无持久状态）

### 建议的 Fixtures 结构

```javascript
// src/__tests__/fixtures/opensea-responses.js
export const mockCollectionOffers = {
  offers: [
    {
      order_hash: '0x123...',
      price: { current: { value: '500000000000000000' } },
      maker: { address: '0xabc...' }
    }
  ]
};

export const mockCollectionStats = {
  total: {
    floor_price: 0.8,
    volume: 1234.56,
    sales: 100
  }
};
```

## 持续测试

### CI 集成
- **平台**：GitHub Actions
- **触发**：标签推送时运行单元测试
- **流程**：发布前 `npm test`
- **PR 测试**：未配置

### 测试覆盖率
```bash
npm run test:coverage
```

生成覆盖率报告到 `coverage/` 目录。

### 存在的问题
**⚠️ 主要差距**：
- 集成测试未在 CI 中运行
- 无性能测试
- 无安全测试（应添加依赖扫描）

## 模拟策略

### 何时模拟

**应该模拟**：
- 外部 API 调用（OpenSea、Reservoir、Alchemy）
- 文件系统操作（KeyManager）
- 区块链交易
- 时间相关函数（Date.now、setTimeout）

**不应模拟**：
- 纯函数和工具
- 简单的数据转换
- 内部业务逻辑

### 模拟示例

#### 模拟 fetch
```javascript
beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('should fetch data', async () => {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: 'test' })
  });

  const result = await api.fetchData();
  expect(result).toEqual({ data: 'test' });
});
```

#### 模拟 ethers.js
```javascript
jest.mock('ethers', () => ({
  Wallet: jest.fn().mockImplementation(() => ({
    address: '0x1234567890123456789012345678901234567890',
    signTransaction: jest.fn()
  })),
  parseUnits: jest.fn(value => BigInt(value) * BigInt(10 ** 18)),
  formatUnits: jest.fn(value => (Number(value) / 10 ** 18).toString())
}));
```

#### 模拟文件系统
```javascript
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn()
}));

import { readFile } from 'fs/promises';

it('should read keys file', async () => {
  readFile.mockResolvedValueOnce(JSON.stringify({ keys: [] }));

  const keys = await keyManager.listKeys();
  expect(keys).toEqual([]);
});
```

## 测试最佳实践

### 编写好的测试

**DO（应该做）**：
- 每个测试一个断言概念
- 使用描述性的测试名称
- 遵循 AAA 模式（Arrange, Act, Assert）
- 测试边缘情况
- 测试错误情况
- 使用 beforeEach/afterEach 清理

**DON'T（不应做）**：
- 依赖测试执行顺序
- 在测试间共享状态
- 在单元测试中进行真实 API 调用
- 测试实现细节
- 复制生产代码

### 测试命名约定

```javascript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do something when condition', () => {
      // 测试
    });

    it('should throw error when invalid input', () => {
      // 测试
    });

    it('should handle edge case: empty input', () => {
      // 测试
    });
  });
});
```

## 需要测试的关键领域

### 优先级 1 - 安全关键
1. **KeyManager**
   - 密钥加密/解密
   - 密钥存储格式
   - 错误处理

### 优先级 2 - 核心功能
2. **OfferStrategy**
   - 自动竞价逻辑
   - 价格计算
   - 地板价限制

3. **OfferService**
   - 出价创建
   - 余额验证
   - 错误处理

### 优先级 3 - API 集成
4. **OpenSeaApi**
   - 所有端点
   - 重试逻辑
   - 错误处理

5. **ReservoirApi**
   - 集合查询
   - 分页
   - 链特定 URL

## 改进建议

### 短期（1-2 周）
1. 为 KeyManager 添加单元测试
2. 为 OfferStrategy 添加单元测试
3. 在 CI 中启用集成测试
4. 添加测试 fixtures

### 中期（1-2 月）
1. 实现 E2E 测试框架
2. 达到 80% 代码覆盖率
3. 添加性能测试
4. 自动化覆盖率检查

### 长期（3-6 月）
1. 添加突变测试
2. 实现视觉回归测试（如有 UI）
3. 添加负载测试
4. 持续改进测试基础设施

## 运行测试的配置

### package.json 脚本
```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathIgnorePatterns=integration",
    "test:coverage": "node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage --testPathIgnorePatterns=integration",
    "test:watch": "node --experimental-vm-modules node_modules/jest/bin/jest.js --watch --testPathIgnorePatterns=integration",
    "integration": "node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=integration",
    "test:opensea": "node --experimental-vm-modules node_modules/jest/bin/jest.js src/__tests__/openseaApi.integration.test.js",
    "test:opensea:debug": "DEBUG=true node --experimental-vm-modules node_modules/jest/bin/jest.js src/__tests__/openseaApi.integration.test.js"
  }
}
```

### jest.config.js
```javascript
export default {
  testEnvironment: 'node',
  transform: {},  // 使用原生 ES modules
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'  // 支持 .js 扩展名
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.integration.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### ⚠️ 注意事项
Jest 需要 `--experimental-vm-modules` 标志以支持 ES Modules。
