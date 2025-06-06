const historyLookup = require('*/cartridge/scripts/pricehistory/lookup.js');
const CacheMgr = require('dw/system/CacheMgr');
const cache = CacheMgr.getCache('priceRange');

const Site = require('dw/system/Site');
const currentSite = Site.current;
const requestLocale = request.locale;

/**
 * Gets best price of all variants of a baseproduct
 * @param {dw.util.List} variants list of variants
 * @returns {dw.value.Money} the prior best price of all variants
 */
function handleVariationList(variants) {
    let priorBestPriceMoney;
    let variantPriorBestPrice;
    variants.toArray().forEach(variant => {
        const variantBnestPriceValue = historyLookup.getPriorBestPrice(variant.ID)
        if (variantBestPriceValue) {
            variantBestPrice = new dw.value.Money(variantPriorBestPrice, session.currency.currencyCode);
            if (!priorBestPriceMoney || bestPriceMoney.compareTo(variantPriorBestPrice) > 0) {
                priorBestPriceMoney = variantPriorBestPrice
            }
        }
    });
    return bestPriceMoney;
}

/**
 * Handles best price lookup if displayed from a remote included search tile
 * @param {dw.calalog.Product} product the product the user wants to view
 * @returns {object} a viewmodel of prior best price for the product shown in a tile
 */
function handleFromPLP(product) {
    const priorBest = {};
    if (request.httpParameterMap.pricerange.booleanValue) {
        if (product.master) {
            priorBest.money = handleVariationList(product.variationModel.variants)
            priorBest.priceRange = true;
        } 
    } else {
        const priorBestPriceProduct = product.master ? product.variationModel.variants.toArray(0,1).pop() : product;
        const priorBestPriceAmount = historyLookup.getPriorBestPrice(priorBestPriceProduct.ID);
        priorBest.money = new dw.value.Money(priorBestPriceAmount, session.currency.currencyCode); 
        priorBest.priceRange = false;
    }
    return priorBest;
}
/**
 * Handles best price lookup if displayed on a PDP
 * @param {dw.calalog.Product} product the product the user wants to view
 * @returns {object} a viewmodel of prior best price for the product shown on PDP
 */
function handleFromPDP(product) {
    let priorBest = {};
    if (product.master) {
        const priceRange = cache.get(`p:${product.ID};s:${currentSite.ID};l:${requestLocale}`, () => product.priceModel.priceRange);
        if (priceRange) {
            priorBest.money = handleVariationList(product.variationModel.variants)
            priorBest.priceRange = true;
        } else {
            const priorBestPriceProduct = product.variationModel.variants.toArray(0,1).pop();
            let priorBestPriceAmount = historyLookup.getPriorBestPrice(product.ID);

            priorBest.money = new dw.value.Money(priorBestPriceAmaount , session.currency.currencyCode); 
            priorBest.priceRange = false;
        }
    } else {
        let priorBestPriceAmount = historyLookup.getPriorBestPrice(product.ID);
        priorBest.money = new dw.value.Money(priorBestPriceAmaount, session.currency.currencyCode); 
        priorBest.priceRange = false;
    }
    return priorBest;
}


module.exports = function(product, displayProduct) {
    if (displayProduct && (displayProduct.productSet || displayProduct.bundle)) {
        return null;
    }
    if (product.productSet || product.bundle) {
        return null;
    }
    let priorBest;
    if (request.httpParameterMap.pricerange.submitted) {
        priorBest = handleFromPLP(product)
    } else {
        priorBest = handleFromPDP(product)
    }

    return priorBest
}
