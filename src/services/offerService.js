import { ethers } from "ethers";
import { WETH_ABI } from "../config.js";
import { logger } from "../utils/logger.js";

export class OfferService {
    constructor(sdk, chainConfig) {
        if (!sdk) {
            throw new Error('SDK is required');
        }
        if (!chainConfig || !chainConfig.wethAddress) {
            throw new Error('Chain config with WETH address is required');
        }
        this.sdk = sdk;
        this.provider = sdk.provider;
        this.chainConfig = chainConfig;

        // 验证 WETH 地址
        if (!ethers.isAddress(this.chainConfig.wethAddress)) {
            throw new Error(`Invalid WETH address: ${this.chainConfig.wethAddress}`);
        }

        // 创建 WETH 合约实例
        this.wethContract = new ethers.Contract(
            this.chainConfig.wethAddress,
            WETH_ABI,
            this.sdk.wallet || this.provider  // 优先使用 wallet，否则使用 provider
        );

        logger.debug('WETH contract initialized:', {
            address: this.chainConfig.wethAddress,
            provider: this.provider ? 'yes' : 'no',
            wallet: this.sdk.wallet ? 'yes' : 'no'
        });
    }

    // Core business logic
    validateBalance(balanceInWETH, offerAmount) {
        if (parseFloat(balanceInWETH) < parseFloat(offerAmount)) {
            throw new Error("Insufficient WETH balance");
        }
        return true;
    }

    validateCollectionOffer(collectionSlug) {
        if (!collectionSlug) {
            throw new Error("Collection slug is required for collection offer");
        }
        return true;
    }

    validateIndividualOffer(tokenAddress, tokenId) {
        if (!tokenAddress || !tokenId) {
            throw new Error("Token address and token ID are required for individual offer");
        }
        return true;
    }

    // External dependencies
    async getWETHBalance(wethContract, walletAddress) {
        const balance = await wethContract.balanceOf(walletAddress);
        const balanceInWETH = ethers.formatUnits(balance, 18);
        logger.debug(`WETH Balance: ${balanceInWETH}`);
        return balanceInWETH;
    }

    async createCollectionOffer(params) {
        const { 
            collectionSlug, 
            offerAmount, 
            expirationMinutes = 60, 
            traitType, 
            traitValue,
            walletAddress
        } = params;

        if (!walletAddress) {
            throw new Error('Wallet address is required for creating collection offer');
        }

        try {
            this.validateCollectionOffer(collectionSlug);
            
            logger.debug('Creating collection offer:', {
                collectionSlug,
                offerAmount,
                walletAddress,
                wethAddress: this.wethContract.target
            });

            const balanceInWETH = await this.getWETHBalance(this.wethContract, walletAddress);
            this.validateBalance(balanceInWETH, offerAmount);

            const response = await this.sdk.createCollectionOffer({
                collectionSlug: collectionSlug.toLowerCase(),
                accountAddress: walletAddress,
                amount: offerAmount,
                expirationTime: Math.floor(Date.now() / 1000) + (expirationMinutes * 60),
                paymentTokenAddress: this.chainConfig.wethAddress,
                traitType,
                traitValue,
            });

            const orderHash = response.order_hash || 
                             response?.orderHash || 
                             response?.order?.orderHash || 
                             'Unknown';

            this.logCollectionOfferDetails(response, collectionSlug, orderHash);
            return orderHash;
        } catch (error) {
            logger.error('Failed to create collection offer:', error);
            throw error;
        }
    }

    async createIndividualOffer(params) {
        const { 
            tokenAddress, 
            tokenId, 
            offerAmount, 
            expirationMinutes = 60,
            wethContract = new ethers.Contract(this.chainConfig.wethAddress, WETH_ABI, this.provider),
            walletAddress = this.chainConfig.walletAddress
        } = params;

        this.validateIndividualOffer(tokenAddress, tokenId);
        const balanceInWETH = await this.getWETHBalance(wethContract, walletAddress);
        this.validateBalance(balanceInWETH, offerAmount);

        const response = await this.sdk.createOffer({
            asset: {
                tokenAddress,
                tokenId,
            },
            accountAddress: walletAddress,
            startAmount: offerAmount,
            expirationTime: Math.floor(Date.now() / 1000) + (expirationMinutes * 60),
            paymentTokenAddress: wethContract.address,
        });

        console.log(`Successfully created an individual NFT offer with orderHash: ${response.orderHash}`);
        return response.orderHash;
    }

    logCollectionOfferDetails(response, collectionSlug, orderHash) {
        console.log(`Successfully created a collection offer for: ${collectionSlug}`);
        console.log('Offer Details:');
        console.log(`- Collection Slug: ${response.criteria.collection.slug}`);
        console.log(`- Contract Address: ${response.criteria.contract.address}`);
        
        const priceInWETH = ethers.formatUnits(response.price.value, response.price.decimals);
        console.log(`- Price: ${priceInWETH} ${response.price.currency}`);
        
        console.log(`- Order Hash: ${orderHash}`);
        console.log(`- Chain: ${response.chain}`);
    }
}

export default OfferService; 