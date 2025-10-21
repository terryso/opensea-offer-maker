import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { KeyManager, ALGORITHM, ENCRYPTION_KEY } from '../utils/keyManager.js';
import enquirer from 'enquirer';
import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';
import { createDecipheriv } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { prompt } = enquirer;

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const oldKeysFile = path.join(currentDirPath, '../../.keys');

export const keyCommand = new Command('key')
  .description('Manage private keys');

keyCommand
  .command('add')
  .description('Add a new private key')
  .argument('[name]', 'Name for the key (optional)')
  .option('--debug', 'Enable debug logging')
  .action(async (name, options) => {
    try {
      if (options.debug) {
        logger.setLevel(LogLevel.DEBUG);
      }

      // 如果没有提供名称，询问用户
      if (!name) {
        const response = await prompt({
          type: 'input',
          name: 'keyName',
          message: 'Enter a name for this key:',
          default: 'default'
        });
        name = response.keyName;
      }

      const response = await prompt([{
        type: 'password',
        name: 'privateKey',
        message: 'Enter your private key:'
      }]);

      let privateKey = response.privateKey.trim();
      logger.debug('Initial private key length:', privateKey.length);

      // 移除所有空格和特殊字符
      privateKey = privateKey.replace(/[\s\n\r\t]/g, '');
      logger.debug('After removing whitespace, length:', privateKey.length);

      // 如果私钥以 0x 开头，移除它
      if (privateKey.toLowerCase().startsWith('0x')) {
        privateKey = privateKey.slice(2);
        logger.debug('Removed 0x prefix, new length:', privateKey.length);
      }

      // 移除所有非十六进制字符
      privateKey = privateKey.replace(/[^0-9a-fA-F]/g, '');
      logger.debug('After removing non-hex characters, length:', privateKey.length);

      // 如果长度超过64，截取最后64个字符
      if (privateKey.length > 64) {
        privateKey = privateKey.slice(-64);
        logger.debug('After trimming to 64 chars, length:', privateKey.length);
      }

      // 如果长度不64，在前面补零
      if (privateKey.length < 64) {
        privateKey = privateKey.padStart(64, '0');
        logger.debug('After padding with zeros, length:', privateKey.length);
      }

      // 验证是否是有效的64位十六进制字符串
      if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
        logger.debug('Invalid characters in private key');
        logger.debug('Current private key length:', privateKey.length);
        logger.debug('First invalid character at:', privateKey.search(/[^0-9a-fA-F]/));
        throw new Error('Invalid private key format. Must be a 64-character hex string');
      }

      // 添加 0x 前缀
      privateKey = '0x' + privateKey;

      // 验证是否是有效的以太坊私钥
      try {
        const wallet = new ethers.Wallet(privateKey);
        logger.info(`Wallet address: ${wallet.address}`);
      } catch (error) {
        logger.debug('Ethers validation error:', error.message);
        throw new Error('Invalid Ethereum private key');
      }

      const result = await KeyManager.encryptKey(privateKey, name);
      logger.info('Private key added successfully!');
      logger.info(`Name: ${result.name}`);
      logger.info(`Address: ${result.address}`);

    } catch (error) {
      logger.error('Failed to add key:', error.message);
      if (error.stack && options.debug) {
        logger.debug('Error stack:', error.stack);
      }
      process.exit(1);
    }
  });

keyCommand
  .command('list')
  .description('List all stored keys')
  .action(async () => {
    try {
      const keys = await KeyManager.listKeys();
      if (keys.length === 0) {
        logger.info('No keys stored');
        return;
      }

      logger.info('Stored keys:');
      keys.forEach(key => {
        logger.info(`${key.isActive ? '* ' : '  '}${key.name} (${key.address})`);
      });
    } catch (error) {
      logger.error('Failed to list keys:', error.message);
      process.exit(1);
    }
  });

keyCommand
  .command('use')
  .description('Set active key')
  .argument('<name>', 'Name of the key to use')
  .action(async (name) => {
    try {
      const result = await KeyManager.setActiveKey(name);
      logger.info(`Now using key: ${result.name} (${result.address})`);
    } catch (error) {
      logger.error('Failed to set active key:', error.message);
      process.exit(1);
    }
  });

keyCommand
  .command('remove')
  .description('Remove a stored key')
  .argument('<name>', 'Name of the key to remove')
  .action(async (name) => {
    try {
      await KeyManager.removeKey(name);
      logger.info(`Key "${name}" removed successfully`);
    } catch (error) {
      logger.error('Failed to remove key:', error.message);
      process.exit(1);
    }
  });

keyCommand
  .command('test')
  .description('Test key decryption')
  .argument('[name]', 'Name of the key to test (uses active key if not specified)')
  .option('--debug', 'Enable debug logging')
  .action(async (name, options) => {
    try {
      if (options.debug) {
        logger.setLevel(LogLevel.DEBUG);
      }

      const key = await KeyManager.decryptKey(name);
      const wallet = new ethers.Wallet(key);
      logger.info('Key decrypted successfully!');
      const maskedKey = `${key.slice(0, 6)}...${key.slice(-4)}`;
      logger.info(`Key: ${maskedKey}`);
      logger.info(`Address: ${wallet.address}`);
    } catch (error) {
      logger.error('Failed to decrypt key:', error.message);
      if (error.stack && options.debug) {
        logger.debug('Error stack:', error.stack);
      }
      process.exit(1);
    }
  });

keyCommand
  .command('migrate')
  .description('Migrate old private key to new format')
  .option('--debug', 'Enable debug logging')
  .action(async (options) => {
    try {
      if (options.debug) {
        logger.setLevel(LogLevel.DEBUG);
      }

      // 检查旧的私钥文件
      let oldKey;
      try {
        const data = await fs.readFile(oldKeysFile, 'utf8');
        const oldData = JSON.parse(data);

        // 只处理有效的加密数据
        if (oldData.encryptedKey && oldData.authTag && oldData.iv) {
          const iv = Buffer.from(oldData.iv, 'hex');
          const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
          decipher.setAuthTag(Buffer.from(oldData.authTag, 'hex'));
          let decrypted = decipher.update(oldData.encryptedKey, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          oldKey = decrypted;
        } else {
          throw new Error('Invalid old key format');
        }
      } catch (error) {
        logger.debug('No old key file found or invalid format');
        throw new Error('No old key found to migrate');
      }

      if (!oldKey) {
        throw new Error('No old key found to migrate');
      }

      // 添加为新格式的默认密钥
      const result = await KeyManager.encryptKey(oldKey, 'default');
      logger.info('Old key migrated successfully!');
      logger.info(`Name: ${result.name}`);
      logger.info(`Address: ${result.address}`);
      logger.info('\nYou can now use the following commands to manage your keys:');
      logger.info('  key list    - List all stored keys');
      logger.info('  key use     - Switch between keys');
      logger.info('  key add     - Add new keys');
      logger.info('  key remove  - Remove keys');

    } catch (error) {
      logger.error('Migration failed:', error.message);
      if (error.stack && options.debug) {
        logger.debug('Error stack:', error.stack);
      }
      process.exit(1);
    }
  });
