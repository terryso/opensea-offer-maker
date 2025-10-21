import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ethers } from 'ethers';

// 导出加密参数
export const ALGORITHM = 'aes-256-gcm';
export const SALT = Buffer.from('opensea-offer-maker-salt', 'utf8');
export const PASSWORD = 'opensea-offer-maker-password';
export const ENCRYPTION_KEY = scryptSync(PASSWORD, SALT, 32);

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const KEYS_FILE = path.join(currentDirPath, '../../.keys');

export class KeyManager {
  static async encryptKey(privateKey, name = 'default') {
    try {
      // 验证私钥格式
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }

      // 验证是否是有效的以太坊私钥
      const wallet = new ethers.Wallet(privateKey);
      const address = await wallet.getAddress();

      const iv = randomBytes(16);
      const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
      let encrypted = cipher.update(privateKey, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      // 读取现有的密钥数据
      let keys = {};
      try {
        const data = await fs.readFile(KEYS_FILE, 'utf8');
        keys = JSON.parse(data);
      } catch (error) {
        // 文件不存在或无效，使用空对象
      }

      // 检查是否已经有活动的密钥
      const hasActiveKey = Object.values(keys).some(k => k.isActive);

      // 添加或更新密钥
      keys[name] = {
        encryptedKey: encrypted,
        authTag: authTag.toString('hex'),
        iv: iv.toString('hex'),
        address,
        // 只有在没有任何密钥时，第一个添加的密钥才设为活动状态
        isActive: !hasActiveKey && Object.keys(keys).length === 0
      };

      await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2));
      return { name, address };
    } catch (error) {
      throw new Error('Failed to encrypt key: ' + error.message);
    }
  }

  static async decryptKey(name = null) {
    try {
      const keys = JSON.parse(await fs.readFile(KEYS_FILE, 'utf8'));

      // 如果没有指定名称，使用活动的密钥
      if (!name) {
        const activeKey = Object.entries(keys).find(([, k]) => k.isActive);
        if (!activeKey) {
          throw new Error('No active key found');
        }
        name = activeKey[0];
      }

      if (!keys[name]) {
        throw new Error(`Key "${name}" not found`);
      }

      const keyData = keys[name];
      const iv = Buffer.from(keyData.iv, 'hex');
      const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
      decipher.setAuthTag(Buffer.from(keyData.authTag, 'hex'));
      let decrypted = decipher.update(keyData.encryptedKey, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt key: ' + error.message);
    }
  }

  static async listKeys() {
    try {
      const keys = JSON.parse(await fs.readFile(KEYS_FILE, 'utf8'));
      return Object.entries(keys)
      // 过滤掉无效的密钥数据
        .filter(([name, data]) =>
          data &&
                    data.encryptedKey &&
                    data.address &&
                    typeof data.isActive === 'boolean'
        )
        .map(([name, data]) => ({
          name,
          address: data.address,
          isActive: data.isActive
        }));
    } catch (error) {
      return [];
    }
  }

  static async setActiveKey(name) {
    try {
      const keys = JSON.parse(await fs.readFile(KEYS_FILE, 'utf8'));
      if (!keys[name]) {
        throw new Error(`Key "${name}" not found`);
      }

      // 将所有密钥设为非活动状态
      for (const key of Object.values(keys)) {
        key.isActive = false;
      }

      // 将指定密钥设为活动状态
      keys[name].isActive = true;

      await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2));
      return { name, address: keys[name].address };
    } catch (error) {
      throw new Error('Failed to set active key: ' + error.message);
    }
  }

  static async removeKey(name) {
    try {
      const keys = JSON.parse(await fs.readFile(KEYS_FILE, 'utf8'));
      if (!keys[name]) {
        throw new Error(`Key "${name}" not found`);
      }

      delete keys[name];

      // 如果删除的是活动密钥，且还有其他密钥，则设置第一个密钥为活动状态
      const remainingKeys = Object.keys(keys);
      if (remainingKeys.length > 0) {
        keys[remainingKeys[0]].isActive = true;
      }

      await fs.writeFile(KEYS_FILE, JSON.stringify(keys, null, 2));
    } catch (error) {
      throw new Error('Failed to remove key: ' + error.message);
    }
  }

  static async isKeyStored() {
    try {
      const keys = JSON.parse(await fs.readFile(KEYS_FILE, 'utf8'));
      return Object.keys(keys).length > 0;
    } catch {
      return false;
    }
  }
}
