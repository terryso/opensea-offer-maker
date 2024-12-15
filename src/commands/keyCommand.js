import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { KeyManager } from '../utils/keyManager.js';
import enquirer from 'enquirer';
import { ethers } from 'ethers';
const { prompt } = enquirer;

export const keyCommand = new Command('key')
    .description('Manage private key encryption');

keyCommand
    .command('setup')
    .description('Setup encrypted private key')
    .option('--debug', 'Enable debug logging')
    .action(async (options) => {
        try {
            if (options.debug) {
                logger.setLevel(LogLevel.DEBUG);
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
            
            // 如果长度不足64，在前面补零
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

            await KeyManager.encryptKey(privateKey);
            logger.info('Private key encrypted and stored successfully');

        } catch (error) {
            logger.error('Failed to setup key:', error.message);
            if (error.stack) {
                logger.debug('Error stack:', error.stack);
            }
            process.exit(1);
        }
    });

keyCommand
    .command('test')
    .description('Test key decryption')
    .option('--debug', 'Enable debug logging')
    .action(async (options) => {
        try {
            if (options.debug) {
                logger.setLevel(LogLevel.DEBUG);
            }

            const key = await KeyManager.decryptKey();
            const wallet = new ethers.Wallet(key);
            logger.info('Key decrypted successfully!');
            // 只显示前6个字符和后4个字符，中间用...代替
            const maskedKey = `${key.slice(0, 6)}...${key.slice(-4)}`;
            logger.info(`Key: ${maskedKey}`);
            logger.info(`Wallet address: ${wallet.address}`);
        } catch (error) {
            logger.error('Failed to decrypt key:', error.message);
            if (error.stack && options.debug) {
                logger.debug('Error stack:', error.stack);
            }
            process.exit(1);
        }
    }); 