var historyLookup = require('*/cartridge/scripts/pricehistory/lookup.js');

/**
 * product_search - modifyGETResponse hook
 * @param {Object} searchResponse response document
 */
exports.modifyGETResponse = function (searchResponse) {
    if (searchResponse && searchResponse.count > 0) {
        var hits = searchResponse.hits.toArray();

        hits.forEach(function (hit) {
            if (!hit.represented_product) {
                return;
            }

            if (hit.product_type.bundle || hit.product_type.set) {
                return;
            }

            let historicBestPrice = historyLookup.getPriorBestPrice(hit.represented_product.id);

            if(historicBestPrice) {
                hit.c_priorBestPrice = historicBestPrice;
            }
        });
    }
};

