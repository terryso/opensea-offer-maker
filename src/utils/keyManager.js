import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_FILE = path.join(__dirname, '../../.keys');
const ALGORITHM = 'aes-256-gcm';

// 使用固定的盐值来生成密钥
const SALT = Buffer.from('opensea-offer-maker-salt', 'utf8');
const PASSWORD = 'opensea-offer-maker-password';

// 使用 scrypt 生成固定的 32 字节密钥
const ENCRYPTION_KEY = scryptSync(PASSWORD, SALT, 32);

export class KeyManager {
    static async encryptKey(privateKey) {
        try {
            // 验证私钥格式
            if (!privateKey.startsWith('0x')) {
                privateKey = '0x' + privateKey;
            }
            
            // 验证是否是有效的以太坊私钥
            try {
                new ethers.Wallet(privateKey);
            } catch (error) {
                throw new Error('Invalid Ethereum private key');
            }

            const iv = randomBytes(16);
            const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
            let encrypted = cipher.update(privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();

            const data = {
                encryptedKey: encrypted,
                authTag: authTag.toString('hex'),
                iv: iv.toString('hex')
            };

            await fs.writeFile(KEYS_FILE, JSON.stringify(data));
            return true;
        } catch (error) {
            throw new Error('Failed to encrypt key: ' + error.message);
        }
    }

    static async decryptKey() {
        try {
            const data = JSON.parse(await fs.readFile(KEYS_FILE, 'utf8'));
            const iv = Buffer.from(data.iv, 'hex');
            const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
            decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
            let decrypted = decipher.update(data.encryptedKey, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            // 验证解密后的私钥
            if (!decrypted.startsWith('0x')) {
                decrypted = '0x' + decrypted;
            }
            
            // 验证是否是有效的以太坊私钥
            try {
                new ethers.Wallet(decrypted);
            } catch (error) {
                throw new Error('Decrypted key is invalid');
            }

            return decrypted;
        } catch (error) {
            throw new Error('Failed to decrypt key: ' + error.message);
        }
    }

    static async isKeyStored() {
        try {
            await fs.access(KEYS_FILE);
            return true;
        } catch {
            return false;
        }
    }
} 