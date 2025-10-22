/**
 * Validation utilities
 * Pure functions for validating command options and parameters
 */

/**
 * Validate command line option combinations
 * @param {Object} options - Command options
 * @returns {Object} Validation result
 */
export function validateOptions(options) {
  const errors = [];

  // Validate interactive mode exclusivity
  if (options.interactive && (options.address || options.tokenId)) {
    errors.push('Cannot use --interactive with --address or --token-id. Choose either interactive mode or manual input.');
  }

  // Validate direct mode requirements
  if (!options.interactive) {
    if (!options.address) {
      errors.push('--address is required in direct mode');
    }
    if (!options.tokenId) {
      errors.push('--token-id is required in direct mode');
    }
  }

  // Validate marketplaces
  const marketValidation = validateMarketplaces(options.marketplaces);
  if (!marketValidation.isValid) {
    errors.push(marketValidation.error);
  }

  // Validate pricing parameters (only for non-interactive mode)
  if (!options.interactive) {
    const pricingValidation = validatePricingOptions(options);
    if (!pricingValidation.isValid) {
      errors.push(...pricingValidation.errors);
    }
  }

  // Validate expiration format
  if (options.expiration) {
    const expirationValidation = validateExpirationFormat(options.expiration);
    if (!expirationValidation.isValid) {
      errors.push(expirationValidation.error);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate marketplace options
 * @param {string} marketplacesStr - Comma-separated marketplaces string
 * @returns {Object} Validation result
 */
export function validateMarketplaces(marketplacesStr) {
  const validMarketplaces = ['opensea'];

  if (!marketplacesStr) {
    return {
      isValid: false,
      error: 'Marketplaces cannot be empty'
    };
  }

  const marketplaces = marketplacesStr.toLowerCase().split(',');
  const invalidMarkets = marketplaces.filter(m => !validMarketplaces.includes(m.trim()));

  if (invalidMarkets.length > 0) {
    return {
      isValid: false,
      error: `Invalid marketplaces: ${invalidMarkets.join(', ')}. Only OpenSea is supported.`
    };
  }

  return {
    isValid: true,
    marketplaces: marketplaces.map(m => m.trim())
  };
}

/**
 * Validate pricing option combinations
 * @param {Object} options - Command options
 * @returns {Object} Validation result
 */
export function validatePricingOptions(options) {
  const errors = [];
  const priceOptions = [options.price, options.floorDiff, options.profitMargin, options.profitPercent];
  const providedOptions = priceOptions.filter(opt => opt !== undefined).length;

  if (providedOptions === 0) {
    errors.push('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
  } else if (providedOptions > 1) {
    errors.push('Cannot use multiple pricing options at the same time. Choose only one: --price, --floor-diff, --profit-margin, or --profit-percent');
  }

  // Validate individual pricing option formats
  if (options.floorDiff) {
    const floorDiffValidation = validateFloorDiffFormat(options.floorDiff);
    if (!floorDiffValidation.isValid) {
      errors.push(floorDiffValidation.error);
    }
  }

  if (options.profitMargin) {
    const profitMarginValidation = validateProfitMarginFormat(options.profitMargin);
    if (!profitMarginValidation.isValid) {
      errors.push(profitMarginValidation.error);
    }
  }

  if (options.profitPercent) {
    const profitPercentValidation = validateProfitPercentFormat(options.profitPercent);
    if (!profitPercentValidation.isValid) {
      errors.push(profitPercentValidation.error);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate floor difference format
 * @param {string} floorDiff - Floor difference string (e.g., "+0.1", "-5%")
 * @returns {Object} Validation result
 */
export function validateFloorDiffFormat(floorDiff) {
  if (!floorDiff) {
    return {
      isValid: false,
      error: 'Floor difference cannot be empty'
    };
  }

  const diffMatch = floorDiff.match(/^([+-])(\d*\.?\d*)(%)?$/);
  if (!diffMatch) {
    return {
      isValid: false,
      error: 'Invalid floor-diff format. Use format like "+0.1", "-0.1", "+10%", or "-5%"'
    };
  }

  const [, sign, diffValue] = diffMatch;
  const numericValue = parseFloat(diffValue);

  if (isNaN(numericValue) || numericValue < 0) {
    return {
      isValid: false,
      error: 'Floor difference must be a positive number'
    };
  }

  return {
    isValid: true,
    sign,
    value: numericValue,
    isPercentage: !!diffMatch[3]
  };
}

/**
 * Validate profit margin format
 * @param {string} profitMargin - Profit margin string (e.g., "0.01")
 * @returns {Object} Validation result
 */
export function validateProfitMarginFormat(profitMargin) {
  if (!profitMargin) {
    return {
      isValid: false,
      error: 'Profit margin cannot be empty'
    };
  }

  const margin = parseFloat(profitMargin);
  if (isNaN(margin)) {
    return {
      isValid: false,
      error: 'Invalid profit-margin value. Must be a number (e.g., 0.01)'
    };
  }

  return {
    isValid: true,
    value: margin
  };
}

/**
 * Validate profit percentage format
 * @param {string} profitPercent - Profit percentage string (e.g., "10")
 * @returns {Object} Validation result
 */
export function validateProfitPercentFormat(profitPercent) {
  if (!profitPercent) {
    return {
      isValid: false,
      error: 'Profit percentage cannot be empty'
    };
  }

  const percent = parseFloat(profitPercent);
  if (isNaN(percent)) {
    return {
      isValid: false,
      error: 'Invalid profit-percent value. Must be a number (e.g., 10 for 10%)'
    };
  }

  return {
    isValid: true,
    value: percent
  };
}

/**
 * Validate expiration time format
 * @param {string} expiration - Expiration time string (e.g., "30d", "12h", "45m")
 * @returns {Object} Validation result
 */
export function validateExpirationFormat(expiration) {
  if (!expiration) {
    return {
      isValid: false,
      error: 'Expiration time cannot be empty'
    };
  }

  const match = expiration.match(/^(\d+)([dhm])$/);
  if (!match) {
    return {
      isValid: false,
      error: 'Invalid expiration format. Use format like "30d" (days), "12h" (hours), or "45m" (minutes)'
    };
  }

  const [, amount, unit] = match;
  const numericAmount = parseInt(amount, 10);

  if (numericAmount <= 0) {
    return {
      isValid: false,
      error: 'Expiration time must be greater than 0'
    };
  }

  return {
    isValid: true,
    amount: numericAmount,
    unit
  };
}

/**
 * Validate ETH address format
 * @param {string} address - Ethereum address
 * @returns {Object} Validation result
 */
export function validateEthAddress(address) {
  if (!address) {
    return {
      isValid: false,
      error: 'Address cannot be empty'
    };
  }

  // Basic ETH address validation (0x + 40 hex characters)
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!ethAddressRegex.test(address)) {
    return {
      isValid: false,
      error: 'Invalid Ethereum address format. Must start with 0x followed by 40 hex characters'
    };
  }

  return {
    isValid: true,
    address: address.toLowerCase()
  };
}

/**
 * Validate token ID format
 * @param {string} tokenId - Token ID
 * @returns {Object} Validation result
 */
export function validateTokenId(tokenId) {
  if (!tokenId) {
    return {
      isValid: false,
      error: 'Token ID cannot be empty'
    };
  }

  // Token ID should be a positive integer or hex string
  const intRegex = /^\d+$/;
  const hexRegex = /^0x[a-fA-F0-9]+$/;

  if (!intRegex.test(tokenId) && !hexRegex.test(tokenId)) {
    return {
      isValid: false,
      error: 'Invalid token ID format. Must be a positive integer or hex string (e.g., 123 or 0x7b)'
    };
  }

  return {
    isValid: true,
    tokenId
  };
}
