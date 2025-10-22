import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SUPPORTED_CHAINS } from '../constants/chains.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const CONFIG_FILE = path.join(currentDirPath, '../../.config');

export class ConfigManager {
  // Allow dependency injection for testing
  static _fs = fs;
  static _configFile = CONFIG_FILE;

  /**
     * 获取默认链配置
     * @returns {Promise<string|null>} 返回默认链名称，如果未配置返回 null
     */
  static async getDefaultChain() {
    try {
      const data = await this._fs.readFile(this._configFile, 'utf8');
      const config = JSON.parse(data);
      return config.defaultChain || null;
    } catch {
      // 配置文件不存在或无效
      return null;
    }
  }

  /**
     * 设置默认链
     * @param {string} chain - 链名称 (ethereum, base, sepolia)
     * @returns {Promise<{chain: string}>}
     */
  static async setDefaultChain(chain) {
    // 验证链名称
    if (!SUPPORTED_CHAINS[chain]) {
      const validChains = Object.keys(SUPPORTED_CHAINS).join(', ');
      throw new Error(`Invalid chain: ${chain}. Supported chains: ${validChains}`);
    }

    try {
      // 读取现有配置
      let config = {};
      try {
        const data = await this._fs.readFile(this._configFile, 'utf8');
        config = JSON.parse(data);
      } catch {
        // 配置文件不存在，使用空对象
      }

      // 更新默认链
      config.defaultChain = chain;

      // 保存配置
      await this._fs.writeFile(this._configFile, JSON.stringify(config, null, 2));
      return { chain };
    } catch (error) {
      throw new Error('Failed to set default chain: ' + error.message);
    }
  }

  /**
     * 获取所有支持的链
     * @returns {Array<{name: string, wethAddress: string}>}
     */
  static getSupportedChains() {
    return Object.entries(SUPPORTED_CHAINS).map(([name, config]) => ({
      name,
      wethAddress: config.wethAddress
    }));
  }
}
