import { ethers } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import https from 'https';
import http from 'http';
import zlib from 'zlib';
import { URL } from 'url';
import { logger } from './logger.js';

// 用于跟踪是否已经注册过代理
let proxyRegistered = false;

/**
 * 配置 ethers.js 的全局代理支持
 * 这样 opensea-js SDK 内部的 FetchRequest 也会使用代理
 */
export function setupEthersProxy() {
    if (proxyRegistered) {
        logger.debug('Proxy already registered, skipping...');
        return;
    }

    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';

    if (!proxyUrl) {
        logger.debug('No proxy configured');
        return;
    }

    try {
        const httpsAgent = new HttpsProxyAgent(proxyUrl);

        // 注册自定义的 URL 获取处理器，使其支持代理
        ethers.FetchRequest.registerGetUrl(async (req) => {
            const url = req.url;
            const parsedUrl = new URL(url);

            const startTime = Date.now();
            logger.debug(`[Proxy] Starting request: ${url}`);

            return new Promise((resolve, reject) => {
                const options = {
                    method: req.hasBody() ? 'POST' : 'GET',
                    headers: {},
                    agent: httpsAgent,
                };

                // 复制所有请求头
                const reqHeaders = req.headers;
                for (const [key, value] of Object.entries(reqHeaders)) {
                    options.headers[key] = value;
                }

                if (req.hasBody()) {
                    options.headers['Content-Type'] = 'application/json';
                    // 获取 body 内容
                    const bodyContent = req.body;
                    if (bodyContent) {
                        // 如果是 Uint8Array，计算长度
                        if (bodyContent instanceof Uint8Array) {
                            options.headers['Content-Length'] = bodyContent.length.toString();
                        }
                    }
                }

                const protocol = parsedUrl.protocol === 'https:' ? https : http;

                const request = protocol.request(url, options, (response) => {
                    const chunks = [];

                    response.on('data', (chunk) => {
                        chunks.push(chunk);
                    });

                    response.on('end', () => {
                        try {
                            let rawBody = Buffer.concat(chunks);
                            const headers_lowercase = {};

                            for (const [key, value] of Object.entries(response.headers)) {
                                headers_lowercase[key.toLowerCase()] = value;
                            }

                            const duration = Date.now() - startTime;
                            logger.debug(`[Proxy] Response received in ${duration}ms: status=${response.statusCode}, body=${rawBody.length}b, encoding=${headers_lowercase['content-encoding']}`);

                            // 处理压缩的响应
                            const processBody = (buffer) => {
                                const encoding = headers_lowercase['content-encoding'];

                                if (encoding === 'gzip') {
                                    return zlib.gunzipSync(buffer);
                                } else if (encoding === 'deflate') {
                                    return zlib.inflateSync(buffer);
                                } else if (encoding === 'br') {
                                    return zlib.brotliDecompressSync(buffer);
                                }

                                return buffer;
                            };

                            const body = processBody(rawBody);

                            logger.debug(`Decompressed body length: ${body.length}`);

                            // 如果响应失败，显示响应体内容
                            if (response.statusCode >= 400) {
                                logger.error(`HTTP Error ${response.statusCode}:`, body.toString('utf8').substring(0, 500));
                            }

                            resolve({
                                statusCode: response.statusCode,
                                statusMessage: response.statusMessage,
                                headers: headers_lowercase,
                                body: new Uint8Array(body),
                            });
                        } catch (error) {
                            logger.error('Error processing response:', error);
                            reject(error);
                        }
                    });

                    response.on('error', (error) => {
                        logger.error('Response error:', error);
                        reject(error);
                    });
                });

                // 设置超时时间：OpenSea API 使用 120 秒，其他请求使用 60 秒
                const isOpenSeaAPI = url.includes('api.opensea.io');
                const timeout = isOpenSeaAPI ? 120000 : 60000;

                if (isOpenSeaAPI) {
                    logger.info(`[Proxy] Intercepting OpenSea API request with 120s timeout: ${url}`);
                }

                request.setTimeout(timeout, () => {
                    const duration = Date.now() - startTime;
                    logger.error(`[Proxy] Request timeout after ${duration}ms for ${url}`);
                    request.destroy();
                    reject(new Error(`Request timeout after ${duration}ms`));
                });

                request.on('error', (error) => {
                    const duration = Date.now() - startTime;
                    logger.error(`[Proxy] Request error after ${duration}ms for ${url}:`, error.message);
                    reject(error);
                });

                if (req.hasBody()) {
                    const bodyContent = req.body;
                    if (bodyContent instanceof Uint8Array) {
                        request.write(Buffer.from(bodyContent));
                    } else {
                        request.write(bodyContent);
                    }
                }

                request.end();
            });
        });

        proxyRegistered = true;
        logger.info(`✅ Proxy configured for ethers.js: ${proxyUrl}`);
    } catch (error) {
        logger.error('Failed to setup proxy:', error.message);
        throw error;
    }
}
