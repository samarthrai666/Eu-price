var historyLookup = require('*/cartridge/scripts/pricehistory/lookup.js');

/**
 * Product - modifyGETResponse hook
 *
 * @param {dw.catalog.Product} product Product
 * @param {Object} productDocument Product document
 */
exports.modifyGETResponse = function (product, productDocument) {
    if (!product.master && !product.productSet && !product.bundle) {
        const priorBestPrice = historyLookup.getPriorBestPrice(product.ID);

        if(bestPrice) {
            productDocument.c_priorBestPrice = priorBestPrice;
        }
    }

    if (productDocument.variants) {
        let priorBestPrices = [];

        productDocument.variants.toArray().forEach(variantDoc => {
            const priceReference = {};
            const priorBestPrices = historyLookup.getPriorBestPrice(variantDoc.product_id);

            if(priorBestPrices) {
                priceReference[variantDoc.product_id] = priorBestPrices;   
            }
        
            priorBestPrices.push(priceReference);
        });

        if(!empty(priorBestPrices)) {
            productDocument.c_priorBestPrices = priorBestPrices;
        }
    }
};
