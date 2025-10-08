# 错误处理策略

## 总体方法

### 错误模型
- **错误类型**：JavaScript Error 对象，带自定义消息
- **异常层次**：无正式层次结构，使用错误消息和代码
- **错误传播**：不一致（见技术债务）
  - 命令层：通常捕获并 `process.exit(1)`
  - 服务层：混合使用 throw、return null 和仅日志
  - 策略层：错误时返回 null，继续运行

## 日志标准

### 日志库
- **库**：自定义 logger (`src/utils/logger.js`) - 简单的 console 封装
- **格式**：彩色控制台输出，无结构化日志
- **级别**：
  - `INFO`：正常操作消息（绿色）
  - `DEBUG`：详细调试信息（灰色）- 使用 `--debug` 标志启用
  - `ERROR`：错误消息（红色）

### 必需上下文
- **关联 ID**：无（未实现）
- **服务上下文**：隐式（日志消息中包含模块名）
- **用户上下文**：相关时包含钱包地址

**⚠️ 日志不一致**：部分模块直接使用 `console.log` 而不是 logger

## 错误处理模式

### 外部 API 错误

#### 重试策略
- **重试次数**：3 次尝试
- **延迟**：1 秒（在 fetchWithRetry 中硬编码）
- **断路器**：未实现
- **超时配置**：无显式超时（使用 fetch 默认值）

#### 错误转换
- 404 → 返回空数组（不视为错误）
- 401 → 抛出 "Invalid API key"（不重试）
- 其他错误 → 抛出带 HTTP 状态和详情

#### 示例代码

来源：`src/services/openseaApi.js:10-54`

```javascript
async fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, ...);
      if (response.status === 404) return { offers: [] };
      if (response.status === 401) throw new Error('Invalid API key');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 业务逻辑错误

#### 自定义异常
- **状态**：无自定义异常类
- **面向用户的错误**：通过 logger.error() 直接显示错误消息
- **错误代码**：未实现（使用错误消息）

#### 示例代码

来源：`src/services/offerService.js:112-120`

```javascript
try {
  // 业务逻辑
} catch (error) {
  logger.error('Failed to create collection offer:', error);
  throw error;  // 传播到命令层
}
```

### 数据一致性

#### 事务策略
- **区块链事务**：原子性（内置）
- **补偿逻辑**：未实现（出价无法轻易取消）
- **幂等性**：未强制（重试时可能创建重复出价）

**⚠️ 自动竞价边缘情况**：如果在重试期间出价被接受，工具可能创建重复出价

## 常见错误场景

### API 密钥问题
- **症状**：401 错误
- **处理**：立即抛出，提示检查 `.env` 文件
- **恢复**：用户更新 API 密钥

### 余额不足
- **症状**：交易失败
- **处理**：验证余额后抛出错误
- **恢复**：用户充值 WETH

### 网络问题
- **症状**：fetch 超时或网络错误
- **处理**：重试 3 次后抛出
- **恢复**：用户检查网络连接

### 私钥解密失败
- **症状**：KeyManager 抛出错误
- **处理**：捕获并显示友好消息
- **恢复**：用户检查 `.keys` 文件或重新添加密钥

## 错误处理最佳实践

### 对于命令层
```javascript
try {
  // 调用服务
  const result = await service.doSomething();
  logger.info('Success:', result);
} catch (error) {
  logger.error('Operation failed:', error.message);
  process.exit(1);
}
```

### 对于服务层
```javascript
async doSomething() {
  try {
    const data = await externalApi.fetch();
    return processData(data);
  } catch (error) {
    logger.error('Service error:', error);
    throw error;  // 传播给调用者
  }
}
```

### 对于工具层
```javascript
function utilityFunction(input) {
  if (!input) {
    throw new Error('Invalid input');  // 快速失败
  }
  return processInput(input);
}
```

## 需要改进的地方

### 当前问题
1. **错误处理不一致**
   - 三种不同模式：throw、return null、process.exit
   - 需要标准化策略

2. **日志不一致**
   - 部分模块使用 console.log
   - 应统一使用 logger

3. **无结构化日志**
   - 难以解析和分析
   - 考虑添加 JSON 日志选项

4. **无错误码**
   - 依赖错误消息字符串
   - 应添加标准错误码

### 改进建议
1. 定义标准错误处理策略文档
2. 创建自定义 Error 类
3. 添加结构化日志支持
4. 实现错误码系统
5. 添加更多错误恢复逻辑
