'use strict';

/**
 * Key-Value store for previously found search hits, based on Product ID
 */
const searchHitCache = {};

// Parent Module exports
const overrideExports =  module.superModule;

// Direct reference to overridden function
const getProductSearchHitParent = overrideExports.getProductSearchHit;

/**
 * Per-request caching layer for Product Search Hits, to avoid multiple search queries
 * 
 * @param {dw.catalog.Product} apiProduct - Product instance returned from the API
 * @returns {dw.catalog.ProductSearchHit} - product search hit for a given product
 */
function getProductSearchHit(apiProduct) {
    const productID = apiProduct.getID();

    if(searchHitCache[productID] === undefined) {
        searchHitCache[productID] = getProductSearchHitParent(apiProduct);    
    }

    return searchHitCache[productID];
}

// Set parent module exports and override getProductSearchHit
module.exports = overrideExports;
module.exports.getProductSearchHit = getProductSearchHit;
