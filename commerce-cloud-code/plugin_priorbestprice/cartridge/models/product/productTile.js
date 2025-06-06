'use strict';

const priorBestPriceDecorator = require('*/cartridge/models/product/decorators/priorBestPrice.js');

/**
 * Decorate product with product tile information
 * @param {Object} product - Product Model to be decorated
 * @param {dw.catalog.Product} apiProduct - Product information returned by the script API
 * @param {string} productType - Product type information
 *
 * @returns {Object} - Decorated product model
 */
module.exports = function productTile(product, apiProduct, productType) {
    product = module.superModule(product, apiProduct, productType);

    var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
    var productSearchHit = productHelper.getProductSearchHit(apiProduct);
    
    priorBestPriceDecorator(product, productSearchHit);

    return product;
};
