// 必须在所有 import 之前初始化全局代理
import { bootstrap } from 'global-agent';

// 设置代理环境变量（如果未设置）
if (!process.env.GLOBAL_AGENT_HTTP_PROXY) {
    const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:7890';
    process.env.GLOBAL_AGENT_HTTP_PROXY = proxyUrl;
    console.log(`[Global Agent] Setting proxy to: ${proxyUrl}`);
}

// 启用全局代理（拦截所有 http/https 请求）
bootstrap();
console.log('[Global Agent] Bootstrap completed');

import { Command } from 'commander';
import {
    offerCommand,
    autoOfferCommand,
    checkOffersCommand,
    scanCommand,
    trendingCommand,
    listCommand,
    buyCommand,
    swapCommand,
    sendCommand,
    keyCommand,
    balanceCommand,
    chainCommand
} from './commands/index.js';
import { setupEthersProxy } from './utils/proxySetup.js';

// 配置代理支持（必须在初始化任何 SDK 之前）
// 包含了代理配置和 OpenSea API 的 120 秒超时设置
setupEthersProxy();

const program = new Command();

program
    .name('opensea-offer-maker')
    .description('OpenSea offer creation tool')
    .version('1.0.0')
    .addCommand(offerCommand)
    .addCommand(autoOfferCommand)
    .addCommand(checkOffersCommand)
    .addCommand(scanCommand)
    .addCommand(trendingCommand)
    .addCommand(listCommand)
    .addCommand(buyCommand)
    .addCommand(swapCommand)
    .addCommand(sendCommand)
    .addCommand(keyCommand)
    .addCommand(balanceCommand)
    .addCommand(chainCommand);

program.parse(process.argv); 