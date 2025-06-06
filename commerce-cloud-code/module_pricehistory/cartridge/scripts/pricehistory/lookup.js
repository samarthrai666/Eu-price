'use strict';

const Locale = require('dw/util/Locale');
const CacheMgr = require('dw/system/CacheMgr');
const PriceBookMgr = require('dw/catalog/PriceBookMgr');

const HistoryMgr = require('*/cartridge/scripts/pricehistory/HistoryMgr')

const cache = CacheMgr.getCache('bestPrice');
const Site = require('dw/system/Site');
const currentSite = Site.current;

/**
 *  returns the pricebook responsible for the sites and countries price 
 */
function getPriceBookId() {
    return cache.get('priceBookForLocale_' + currentSite.ID + request.locale, () => {
        const locale = Locale.getLocale(request.locale);
        const countryId = locale.country;
        if (countryId && PriceBookMgr.getPriceBook(`${currentSite.getID()}-${countryId}-price-history`)) {
            return `${currentSite.getID()}-${countryId}-price-history`;
        } else {
            return `${currentSite.getID()}-default-price-history`;
        }
    });
}

/**
 * Gets the best price stored in price history
 * 
 * @param {string} productId ID of the product to get the best price for
 * @returns {float|null} Amount of the best price or null if none present
 */
function getPriorBestPrice(productId) {
    return cache.get(productId + request.locale, () => {
        const ProductMgr = require('dw/catalog/ProductMgr');
        const product = ProductMgr.getProduct(productId);

        if(!product) {
            return null;
        }

        const priceBookId = getPriceBookId();
        const priceInfoEntry = product.priceModel.getPriceBookPriceInfo(priceBookId);

        if(!priceInfoEntry || !priceInfoEntry.priceInfo) {
            return null;
        }

        let historyMgr = new HistoryMgr(priceInfoEntry.priceInfo, productId);
        let priorBestPrice = historyMgr.getDisplayAmount();

        if(priorBestPrice === null) {
            return null;
        }

        let currentPrice = product.priceModel.minPrice.value;

        // Only return price if different from current one
        return currentPrice !== priorBestPrice ? priorBestPrice : null;
    })
}

/**
 * Gets the Currency Code of the best price
 * 
 * @returns {string} Currency Code
 */
function getCurrencyCode() {
    let priceBookId = getPriceBookId();

    let priceBook = PriceBookMgr.getPriceBook(priceBookId);
    return priceBook.getCurrencyCode();
}

module.exports.getPriorBestPrice = getPriorBestPrice;
module.exports.getCurrencyCode = getCurrencyCode;
