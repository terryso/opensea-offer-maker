import dotenv from 'dotenv';

dotenv.config();

export const {
    OPENSEA_API_KEY,
    ALCHEMY_API_KEY,
    PRIVATE_KEY,
    CACHE_EXPIRY_HOURS
} = process.env; 