import { ethers } from 'ethers';
import { logger } from '../utils/logger.js';
import enquirer from 'enquirer';
const { prompt } = enquirer;

/**
 * 购买指定NFT
 * @param {Object} sdk - OpenSea SDK实例
 * @param {string} contractAddress - NFT合约地址
 * @param {string} tokenId - Token ID
 * @param {Object} wallet - 钱包实例
 * @param {Object} openseaApi - OpenSea API实例
 * @param {Object} options - 选项参数
 * @returns {Promise<string>} 交易hash
 */
export async function buySpecificNFT(sdk, contractAddress, tokenId, wallet, openseaApi, options = {}) {
    try {
        const walletAddress = await wallet.getAddress();

        logger.info(`Fetching listing for NFT ${contractAddress} #${tokenId}...`);

        // 获取NFT的listing
        const listing = await openseaApi.getListingByTokenId(contractAddress, tokenId);

        if (!listing) {
            throw new Error(`No active listing found for NFT ${contractAddress} #${tokenId}`);
        }

        // 从 API 返回的数据结构中提取价格
        const priceValue = listing.price?.current?.value || listing.current_price || '0';
        const priceInETH = parseFloat(ethers.formatEther(priceValue));
        const seller = listing.protocol_data?.parameters?.offerer || listing.maker?.address || listing.maker_address || 'Unknown';

        logger.debug(`Found listing: ${priceInETH} ETH from seller: ${seller}`);

        // 验证价格是否在最高价格限制内
        if (options.maxPrice) {
            validatePrice(priceInETH, options.maxPrice);
        }

        // 估算 gas 费用
        const estimatedGas = await estimateGasFee(wallet.provider);

        // 显示购买确认（除非跳过确认）
        if (!options.skipConfirm) {
            await confirmPurchase({
                type: 'Specific NFT',
                contractAddress,
                tokenId,
                price: priceInETH,
                seller,
            }, estimatedGas);
        }

        // 检查余额是否足够
        await checkSufficientBalance(wallet, priceInETH, estimatedGas);

        logger.info(`Purchasing NFT ${contractAddress} #${tokenId} for ${priceInETH} ETH...`);

        // 执行购买
        const transactionHash = await sdk.fulfillOrder({
            order: listing.order || listing,
            accountAddress: walletAddress,
            domain: 'opensea-offer-maker',
        });

        logger.info(`✅ Purchase successful!`);
        logger.info(`Transaction hash: ${transactionHash}`);

        return transactionHash;
    } catch (error) {
        logger.error('Failed to buy specific NFT:', error.message);
        throw error;
    }
}

/**
 * 购买地板NFT
 * @param {Object} sdk - OpenSea SDK实例
 * @param {string} collectionSlug - Collection slug
 * @param {Object} wallet - 钱包实例
 * @param {Object} openseaApi - OpenSea API实例
 * @param {Object} options - 选项参数
 * @returns {Promise<string>} 交易hash
 */
export async function buyFloorNFT(sdk, collectionSlug, wallet, openseaApi, options = {}) {
    try {
        const walletAddress = await wallet.getAddress();

        logger.info(`Fetching floor listings for collection: ${collectionSlug}...`);

        // 获取地板NFT列表（获取20个以确保有足够的选择）
        const response = await openseaApi.getBestListings(collectionSlug, 20);
        const listings = response.listings || [];

        if (!listings || listings.length === 0) {
            throw new Error(`No active listings found for collection: ${collectionSlug}`);
        }

        logger.debug(`Found ${listings.length} listings`);

        // 找出最低价格
        const prices = listings.map(l => {
            const priceStr = l.price?.current?.value || l.current_price || '0';
            return parseFloat(ethers.formatEther(priceStr));
        });
        const minPrice = Math.min(...prices);

        logger.debug(`Floor price: ${minPrice} ETH`);

        // 过滤出最便宜的那批NFT
        const cheapestListings = listings.filter((l, index) => {
            const priceStr = l.price?.current?.value || l.current_price || '0';
            const price = parseFloat(ethers.formatEther(priceStr));
            return price === minPrice;
        });

        logger.debug(`Found ${cheapestListings.length} NFTs at floor price`);

        // 选择排序靠后的那个（按照用户的策略）
        const selectedListing = cheapestListings[cheapestListings.length - 1];
        const selectedPrice = minPrice;

        // 获取NFT详细信息
        const nftInfo = {
            contractAddress: selectedListing.protocol_data?.parameters?.offer?.[0]?.token || 'Unknown',
            tokenId: selectedListing.protocol_data?.parameters?.offer?.[0]?.identifierOrCriteria || 'Unknown',
            seller: selectedListing.protocol_data?.parameters?.offerer || selectedListing.maker?.address || 'Unknown',
        };

        logger.info(`Selected NFT: ${nftInfo.contractAddress} #${nftInfo.tokenId}`);
        logger.info(`Price: ${selectedPrice} ETH`);
        logger.info(`Seller: ${nftInfo.seller}`);

        // 验证价格是否在最高价格限制内
        if (options.maxPrice) {
            validatePrice(selectedPrice, options.maxPrice);
        }

        // 估算 gas 费用
        const estimatedGas = await estimateGasFee(wallet.provider);

        // 显示购买确认（除非跳过确认）
        if (!options.skipConfirm) {
            await confirmPurchase({
                type: 'Floor NFT',
                collection: collectionSlug,
                contractAddress: nftInfo.contractAddress,
                tokenId: nftInfo.tokenId,
                price: selectedPrice,
                seller: nftInfo.seller,
            }, estimatedGas);
        }

        // 检查余额是否足够
        await checkSufficientBalance(wallet, selectedPrice, estimatedGas);

        logger.info(`Purchasing floor NFT from collection ${collectionSlug}...`);

        // 执行购买
        const transactionHash = await sdk.fulfillOrder({
            order: selectedListing.order || selectedListing,
            accountAddress: walletAddress,
            domain: 'opensea-offer-maker',
        });

        logger.info(`✅ Purchase successful!`);
        logger.info(`Transaction hash: ${transactionHash}`);
        logger.info(`NFT: ${nftInfo.contractAddress} #${nftInfo.tokenId}`);

        return transactionHash;
    } catch (error) {
        logger.error('Failed to buy floor NFT:', error.message);
        throw error;
    }
}

/**
 * 验证价格是否在最高价格限制内
 * @param {number} actualPrice - 实际价格
 * @param {number} maxPrice - 最高可接受价格
 * @throws {Error} 如果价格超过最高限制
 */
export function validatePrice(actualPrice, maxPrice) {
    const maxPriceNum = parseFloat(maxPrice);
    if (actualPrice > maxPriceNum) {
        throw new Error(
            `Price ${actualPrice} ETH exceeds maximum acceptable price ${maxPriceNum} ETH`
        );
    }
    logger.debug(`Price validation passed: ${actualPrice} ETH <= ${maxPriceNum} ETH`);
}

/**
 * 格式化 gas 费用显示
 * @param {number} gasInETH - Gas 费用（ETH）
 * @returns {string} 格式化的字符串
 */
function formatGasFee(gasInETH) {
    // 如果 gas 费用很小（< 0.0001 ETH），主要显示 gwei，附带显示 ETH
    if (gasInETH < 0.0001) {
        const gasInGwei = gasInETH * 1e9;
        return `~${gasInGwei.toFixed(2)} gwei (${gasInETH.toFixed(9)} ETH)`;
    }
    // 否则以 ETH 显示
    return `${gasInETH.toFixed(6)} ETH`;
}

/**
 * 显示购买确认信息并等待用户确认
 * @param {Object} nftInfo - NFT信息
 * @param {number} estimatedGas - 预估的 gas 费用（ETH）
 * @throws {Error} 如果用户取消购买
 */
export async function confirmPurchase(nftInfo, estimatedGas) {
    console.log('\n' + '='.repeat(50));
    console.log('PURCHASE CONFIRMATION');
    console.log('='.repeat(50));
    console.log(`Type: ${nftInfo.type}`);
    if (nftInfo.collection) {
        console.log(`Collection: ${nftInfo.collection}`);
    }
    console.log(`Contract: ${nftInfo.contractAddress}`);
    console.log(`Token ID: ${nftInfo.tokenId}`);
    console.log(`Price: ${nftInfo.price} ETH`);
    console.log(`Estimated Gas: ${formatGasFee(estimatedGas)}`);
    console.log(`Total (approx): ${(nftInfo.price + estimatedGas).toFixed(6)} ETH`);
    console.log(`Seller: ${nftInfo.seller}`);
    console.log('='.repeat(50));
    console.log('⚠️  Note: This will execute a real transaction on the blockchain.');
    console.log('='.repeat(50) + '\n');

    const response = await prompt({
        type: 'confirm',
        name: 'confirmed',
        message: 'Do you want to proceed with this purchase?',
        initial: false,
    });

    if (!response.confirmed) {
        throw new Error('Purchase cancelled by user');
    }

    logger.debug('Purchase confirmed by user');
}

/**
 * 估算交易的 gas 费用
 * @param {Object} provider - Provider 实例
 * @returns {Promise<number>} 预估的 gas 费用（ETH）
 */
export async function estimateGasFee(provider) {
    try {
        // 获取当前的 gas 价格
        const feeData = await provider.getFeeData();

        // 在 Base 链上，fulfillOrder 交易通常需要约 200,000 - 300,000 gas
        // 我们使用 300,000 作为保守估计
        const estimatedGasLimit = 300000n;

        // 使用 maxFeePerGas（EIP-1559）或 gasPrice（legacy）
        const gasPrice = feeData.maxFeePerGas || feeData.gasPrice;

        // 计算预估的 gas 费用
        const estimatedGasFee = gasPrice * estimatedGasLimit;
        const estimatedGasFeeInETH = parseFloat(ethers.formatEther(estimatedGasFee));

        logger.debug(`Estimated gas fee: ${estimatedGasFeeInETH} ETH`);
        logger.debug(`Gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);
        logger.debug(`Gas limit: ${estimatedGasLimit}`);

        return estimatedGasFeeInETH;
    } catch (error) {
        logger.error('Failed to estimate gas fee:', error.message);
        // 如果估算失败，返回一个保守的默认值（Base 链通常很便宜）
        return 0.002;
    }
}

/**
 * 检查钱包余额是否足够
 * @param {Object} wallet - 钱包实例
 * @param {number} requiredAmount - 所需金额（ETH）
 * @param {number} estimatedGas - 预估的 gas 费用（ETH）
 * @throws {Error} 如果余额不足
 */
export async function checkSufficientBalance(wallet, requiredAmount, estimatedGas) {
    const balance = await wallet.provider.getBalance(wallet.address);
    const balanceInETH = parseFloat(ethers.formatEther(balance));

    // 添加 20% 的 buffer 以应对 gas 价格波动
    const gasWithBuffer = estimatedGas * 1.2;
    const totalRequired = requiredAmount + gasWithBuffer;

    logger.debug(`Wallet balance: ${balanceInETH} ETH`);
    logger.debug(`Required: ${requiredAmount} ETH (price) + ${gasWithBuffer.toFixed(6)} ETH (gas + buffer) = ${totalRequired.toFixed(6)} ETH`);

    if (balanceInETH < totalRequired) {
        throw new Error(
            `Insufficient balance: ${balanceInETH} ETH < ${totalRequired.toFixed(6)} ETH (${requiredAmount} ETH + ${gasWithBuffer.toFixed(6)} ETH gas)`
        );
    }

    logger.debug('Balance check passed');
}

export default {
    buySpecificNFT,
    buyFloorNFT,
    validatePrice,
    checkSufficientBalance,
    estimateGasFee,
};
