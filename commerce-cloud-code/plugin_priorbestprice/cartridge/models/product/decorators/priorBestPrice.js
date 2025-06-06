'use strict';

const Money = require('dw/value/Money');

const historyLookup = require('*/cartridge/scripts/pricehistory/lookup.js');
const DefaultPrice = require('*/cartridge/models/price/default');
const RangePrice = require('*/cartridge/models/price/range');

/**
 * Product Decorator for Prior Best Price Display Logic
 * Defined as dedicated decoarator (vs extension of price decorator) so it can be easily used on PLP, PDP and Cart
 *
 * @param {object} object The Object (product) to decorate
 * @param {dw.catalog.ProductSearchHit} searchHit Search hit of the product in question
 */
module.exports = function addPriorBestPrice(object, searchHit) {
    Object.defineProperty(object, 'priorBestPrice', {
        enumerable: true,
        value: (function () {
            if(searchHit.priceRange) {
                // Handle Price Range: Load min and max Best Price
                let minPriceAmount = null;
                let maxPriceAmount = null;

                searchHit.representedProductIDs.toArray().forEach(function(productId) {
                    let priorBestPriceAmount = historyLookup.getPriorBestPrice(productId);

                    if(priorBestPriceAmount === null) {
                        return;
                    }
                    
                    if(!minPriceAmount || priorBestPriceAmount < minPriceAmount) {
                        // Remember Min Price found
                        minPriceAmount = priorBestPriceAmount;
                    }

                    if(!maxPriceAmount || priorBestPriceAmount > maxPriceAmount) {
                        // Remember Max Price found
                        maxPriceAmount = priorBestPriceAmount;
                    }   
                });

                if(maxPriceAmount === null || minPriceAmount === null) {
                    return null;
                }

                let currencyCode = historyLookup.getCurrencyCode();
                    
                if(maxPriceAmount > minPriceAmount) {
                    // Best Price is also a Price Range
                    let minPrice = new Money(minPriceAmount, currencyCode);
                    let maxPrice = new Money(maxPriceAmount, currencyCode);
                    return new RangePrice(minPrice, maxPrice);
                } else  {
                    // Only single Best Price
                    let price = new Money(minPriceAmount, currencyCode);
                    return new DefaultPrice(price);
                }
            } else {
                // Handle standard (single) price
                let product = searchHit.firstRepresentedProduct;
                let priorBestPrice = historyLookup.getPriorBestPrice(product.getID());

                if(!priorBestPrice) {
                    return null;
                }

                let currencyCode = historyLookup.getCurrencyCode();
                let price = new Money(priorBestPrice, currencyCode);
                
                return new DefaultPrice(price);
            }
        }())
    });
};
