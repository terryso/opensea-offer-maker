/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

import {
  calculateFeeBreakdown,
  formatFeeBreakdown,
  hasCreatorFees,
  getEffectiveCreatorFeePercent
} from '../../../listing/shared/fees.js';

// Mock logger to avoid console output in tests
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.unstable_mockModule('../../../utils/logger.js', () => ({
  logger: mockLogger
}));

describe('Listing Shared Fees', () => {
  const mockOpenseaApi = {
    getCollectionFees: jest.fn()
  };

  const collectionSlug = 'test-collection';
  const listingPrice = 1.0; // 1 ETH

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateFeeBreakdown', () => {
    test('should calculate fees with creator royalties', async () => {
      const mockFeeInfo = {
        openseaFeePercent: 1.0,
        requiredCreatorFeePercent: 2.5,
        optionalCreatorFeePercent: 1.0,
        hasRequiredCreatorFees: true,
        hasOptionalCreatorFees: true
      };

      mockOpenseaApi.getCollectionFees.mockResolvedValue(mockFeeInfo);

      const result = await calculateFeeBreakdown(listingPrice, collectionSlug, { openseaApi: mockOpenseaApi }, true);

      expect(result.openseaFeePercent).toBe(1.0);
      expect(result.openseaFeeAmount).toBe(0.01); // 1% of 1 ETH
      expect(result.requiredCreatorFeePercent).toBe(2.5);
      expect(result.requiredCreatorFeeAmount).toBe(0.025); // 2.5% of 1 ETH
      expect(result.optionalCreatorFeePercent).toBe(1.0);
      expect(result.optionalCreatorFeeAmount).toBe(0.01); // 1% of 1 ETH
      expect(result.creatorFeePercent).toBe(3.5); // 2.5 + 1.0
      expect(result.creatorFeeAmount).toBe(0.035); // 0.025 + 0.01
      expect(result.totalFeePercent).toBe(4.5); // 1.0 + 3.5
      expect(result.totalFeeAmount).toBeCloseTo(0.045, 6); // 0.01 + 0.035
      expect(result.netProceeds).toBe(0.955); // 1.0 - 0.045
      expect(result.hasRequiredCreatorFees).toBe(true);
      expect(result.hasOptionalCreatorFees).toBe(true);
      expect(result.hasCreatorFees).toBe(true);
      expect(result.payOptionalRoyalties).toBe(true);
      expect(result.feeInfo).toBe(mockFeeInfo);
    });

    test('should calculate fees without optional creator royalties', async () => {
      const mockFeeInfo = {
        openseaFeePercent: 1.0,
        requiredCreatorFeePercent: 2.5,
        optionalCreatorFeePercent: 1.0,
        hasRequiredCreatorFees: true,
        hasOptionalCreatorFees: true
      };

      mockOpenseaApi.getCollectionFees.mockResolvedValue(mockFeeInfo);

      const result = await calculateFeeBreakdown(listingPrice, collectionSlug, { openseaApi: mockOpenseaApi }, false);

      expect(result.creatorFeePercent).toBe(2.5); // Only required
      expect(result.creatorFeeAmount).toBe(0.025); // Only required
      expect(result.totalFeePercent).toBe(3.5); // 1.0 + 2.5
      expect(result.totalFeeAmount).toBe(0.035); // 0.01 + 0.025
      expect(result.netProceeds).toBe(0.965); // 1.0 - 0.035
      expect(result.payOptionalRoyalties).toBe(false);
    });

    test('should handle collection with only required fees', async () => {
      const mockFeeInfo = {
        openseaFeePercent: 1.0,
        requiredCreatorFeePercent: 2.5,
        optionalCreatorFeePercent: 0,
        hasRequiredCreatorFees: true,
        hasOptionalCreatorFees: false
      };

      mockOpenseaApi.getCollectionFees.mockResolvedValue(mockFeeInfo);

      const result = await calculateFeeBreakdown(listingPrice, collectionSlug, { openseaApi: mockOpenseaApi });

      expect(result.creatorFeePercent).toBe(2.5);
      expect(result.optionalCreatorFeeAmount).toBe(0);
      expect(result.hasOptionalCreatorFees).toBe(false);
      expect(result.hasCreatorFees).toBe(true);
    });

    test('should handle collection with no creator fees', async () => {
      const mockFeeInfo = {
        openseaFeePercent: 1.0,
        requiredCreatorFeePercent: 0,
        optionalCreatorFeePercent: 0,
        hasRequiredCreatorFees: false,
        hasOptionalCreatorFees: false
      };

      mockOpenseaApi.getCollectionFees.mockResolvedValue(mockFeeInfo);

      const result = await calculateFeeBreakdown(listingPrice, collectionSlug, { openseaApi: mockOpenseaApi });

      expect(result.creatorFeePercent).toBe(0);
      expect(result.creatorFeeAmount).toBe(0);
      expect(result.totalFeePercent).toBe(1.0);
      expect(result.netProceeds).toBe(0.99); // 1.0 - 0.01
      expect(result.hasCreatorFees).toBe(false);
    });

    test('should fallback to default when API fails', async () => {
      mockOpenseaApi.getCollectionFees.mockRejectedValue(new Error('API Error'));

      const result = await calculateFeeBreakdown(listingPrice, collectionSlug, { openseaApi: mockOpenseaApi });

      expect(result.openseaFeePercent).toBe(1.0);
      expect(result.openseaFeeAmount).toBe(0.01);
      expect(result.creatorFeePercent).toBe(0);
      expect(result.totalFeePercent).toBe(1.0);
      expect(result.netProceeds).toBe(0.99);
      expect(result.feeInfo).toBe(null);
      expect(result.hasCreatorFees).toBe(false);
    });

    test('should fallback to default when fee info is null', async () => {
      mockOpenseaApi.getCollectionFees.mockResolvedValue(null);

      const result = await calculateFeeBreakdown(listingPrice, collectionSlug, { openseaApi: mockOpenseaApi });

      expect(result.openseaFeePercent).toBe(1.0);
      expect(result.creatorFeePercent).toBe(0);
      expect(result.feeInfo).toBe(null);
      expect(result.hasCreatorFees).toBe(false);
    });

    test('should handle zero listing price', async () => {
      const mockFeeInfo = {
        openseaFeePercent: 1.0,
        requiredCreatorFeePercent: 2.5,
        optionalCreatorFeePercent: 0,
        hasRequiredCreatorFees: true,
        hasOptionalCreatorFees: false
      };

      mockOpenseaApi.getCollectionFees.mockResolvedValue(mockFeeInfo);

      const result = await calculateFeeBreakdown(0, collectionSlug, { openseaApi: mockOpenseaApi });

      expect(result.openseaFeeAmount).toBe(0);
      expect(result.creatorFeeAmount).toBe(0);
      expect(result.totalFeeAmount).toBe(0);
      expect(result.netProceeds).toBe(0);
    });
  });

  describe('formatFeeBreakdown', () => {
    test('should format fee breakdown with creator fees', () => {
      const feeBreakdown = {
        openseaFeePercent: 1.0,
        openseaFeeAmount: 0.01,
        creatorFeePercent: 2.5,
        creatorFeeAmount: 0.025,
        totalFeePercent: 3.5,
        totalFeeAmount: 0.035,
        netProceeds: 0.965,
        hasCreatorFees: true
      };

      const result = formatFeeBreakdown(feeBreakdown);

      expect(result).toContain('📊 Fee Breakdown:');
      expect(result).toContain('OpenSea Fee: 1% (0.010000 ETH)');
      expect(result).toContain('Creator Royalties: 2.5% (0.025000 ETH)');
      expect(result).toContain('Total Fees: 3.5% (0.035000 ETH)');
      expect(result).toContain('🧾 Net Proceeds: 0.965000 ETH');
    });

    test('should format fee breakdown without creator fees', () => {
      const feeBreakdown = {
        openseaFeePercent: 1.0,
        openseaFeeAmount: 0.01,
        creatorFeePercent: 0,
        creatorFeeAmount: 0,
        totalFeePercent: 1.0,
        totalFeeAmount: 0.01,
        netProceeds: 0.99,
        hasCreatorFees: false
      };

      const result = formatFeeBreakdown(feeBreakdown);

      expect(result).toContain('📊 Fee Breakdown:');
      expect(result).toContain('OpenSea Fee: 1% (0.010000 ETH)');
      expect(result).not.toContain('Creator Royalties:');
      expect(result).toContain('Total Fees: 1% (0.010000 ETH)');
      expect(result).toContain('🧾 Net Proceeds: 0.990000 ETH');
    });
  });

  describe('hasCreatorFees', () => {
    test('should return true when collection has required creator fees', () => {
      const feeInfo = {
        hasRequiredCreatorFees: true,
        hasOptionalCreatorFees: false
      };

      expect(hasCreatorFees(feeInfo)).toBe(true);
    });

    test('should return true when collection has optional creator fees', () => {
      const feeInfo = {
        hasRequiredCreatorFees: false,
        hasOptionalCreatorFees: true
      };

      expect(hasCreatorFees(feeInfo)).toBe(true);
    });

    test('should return true when collection has both fee types', () => {
      const feeInfo = {
        hasRequiredCreatorFees: true,
        hasOptionalCreatorFees: true
      };

      expect(hasCreatorFees(feeInfo)).toBe(true);
    });

    test('should return false when collection has no creator fees', () => {
      const feeInfo = {
        hasRequiredCreatorFees: false,
        hasOptionalCreatorFees: false
      };

      expect(hasCreatorFees(feeInfo)).toBe(false);
    });

    test('should return false when fee info is null', () => {
      expect(hasCreatorFees(null)).toBeFalsy();
    });

    test('should return false when fee info is undefined', () => {
      expect(hasCreatorFees(undefined)).toBeFalsy();
    });
  });

  describe('getEffectiveCreatorFeePercent', () => {
    test('should calculate effective fee with optional royalties', () => {
      const feeInfo = {
        requiredCreatorFeePercent: 2.5,
        optionalCreatorFeePercent: 1.0
      };

      const result = getEffectiveCreatorFeePercent(feeInfo, true);
      expect(result).toBe(3.5); // 2.5 + 1.0
    });

    test('should calculate effective fee without optional royalties', () => {
      const feeInfo = {
        requiredCreatorFeePercent: 2.5,
        optionalCreatorFeePercent: 1.0
      };

      const result = getEffectiveCreatorFeePercent(feeInfo, false);
      expect(result).toBe(2.5); // Only required
    });

    test('should handle zero optional fees', () => {
      const feeInfo = {
        requiredCreatorFeePercent: 2.5,
        optionalCreatorFeePercent: 0
      };

      const result = getEffectiveCreatorFeePercent(feeInfo, true);
      expect(result).toBe(2.5);
    });

    test('should handle zero required fees', () => {
      const feeInfo = {
        requiredCreatorFeePercent: 0,
        optionalCreatorFeePercent: 1.0
      };

      const result = getEffectiveCreatorFeePercent(feeInfo, true);
      expect(result).toBe(1.0);
    });

    test('should return 0 when fee info is null', () => {
      const result = getEffectiveCreatorFeePercent(null, true);
      expect(result).toBe(0);
    });

    test('should return 0 when fee info is undefined', () => {
      const result = getEffectiveCreatorFeePercent(undefined, true);
      expect(result).toBe(0);
    });
  });
});