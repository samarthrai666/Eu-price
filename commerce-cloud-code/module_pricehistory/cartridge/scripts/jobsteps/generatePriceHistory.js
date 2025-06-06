/**
 * Job Step Type that adds a pricebook history entry for the day the job runs
 */

'use strict';

const Status = require('dw/system/Status');
const Site = require('dw/system/Site');
const File = require('dw/io/File');
const FileWriter = require('dw/io/FileWriter');
const PriceBookMgr = require('dw/catalog/PriceBookMgr');
const Currency = require('dw/util/Currency');
const Calendar = require('dw/util/Calendar');
const StringUtils = require('dw/util/StringUtils');
const PromotionMgr = require('dw/campaign/PromotionMgr');
const Logger = require('dw/system/Logger').getLogger('bestprice.job');

const MIN_API_VERSION = '2207';

let configs;

/**
 * Checks the current Code Compatibility mode
 * 
 * @throws Exception if API version is lower than the minimum supported one
 */
function checkApiVersion() {
    const System = require('dw/system/System');

    if(System.getCompatibilityMode() < MIN_API_VERSION) {
        throw new Error('Code Compatibility mode is not supported. Please upgrade to at least v22.7');
    }
}

/**
 * Get a PromotionPlan that is valid for immediately visible promotions (everybody, not coupon or dource code based)
 * 
 * @param {string} currencyCode the Currency Code to use
 * 
 * @returns {dw.campaign.PromotionPlan} The PromotionPlan
 */
function getGenericPromos(currencyCode) {
    session.setCurrency(Currency.getCurrency(currencyCode));
    const promotionPlan = PromotionMgr.getActivePromotions();
    
    let personalizedPromos = [];
    
    promotionPlan.getPromotions().toArray().forEach(promotion => {
        if (promotion.basedOnCustomerGroups && !promotion.basedOnCoupons && promotion.basedOnSourceCodes) {            
            /**
             * @TODO HOOK IN HERE if you have other generic promotions for customer groups etc. (like Country_ES)
             * 
             * @TODO maybe we can make this a parameter in the job config JSON?
             */ 

            let notForEveryone = promo.customerGroups.toArray().filter(group => group.ID !== 'Everyone');
            if (notForEveryone && notForEveryone.length > 0) {
                personalizedPromos.push(promotion);
            }
        } else {
            personalizedPromos.push(promotion);
        } 
    });

    // Remove all promotions identified as "personalized" from the Promotion Plan
    personalizedPromos.forEach(promotion => promotionPlan.removePromotion(promotion));

    return promotionPlan;
}

/**
 * Country Configuration
 * 
 * Contains the full Context required to process the Price History for each Country
 * 
 * @typedef {Object} CountryConfiguration
 * 
 * @property {Array} books - "Input" Pricebooks for the Country (containing reduced prices)
 * @property {string} priceBookId - Output Pricebook ID (to store price history)
 * @property {string} currency - Currency to Apply
 * @property {dw.campaign.PromotionPlan} promos - "Generic" Promotions found (applicable for "everyone")
 * @property {dw.io.FileWriter} writer - FileWriter for Output XML
 */


/**
 * Initializes the parameter job multiCountryHandling to carry all relevant business object required to detect pricechanges in each country
 * 
 * @returns {CountryConfiguration[]} the list of country configurations
 */
function createCountryConfiguration(params) {
    if (params.multiCountryHandling === 'MULTI_COUNTRY_PRICE_BOOKS') {
        if (!params.countryMapping) {
            throw new Error('Configuration Error! Please configure country mapping')
        }
        configs = JSON.parse(params.countryMapping);
    } else {
        configs = { default: { books: null } }
    }
    const configArray = [];
    const currentSite = Site.getCurrent();

    Object.keys(configs).forEach(countryId => {
        configs[countryId].countryId = countryId;

        // Initialize output price book
        const priceBookId = `${currentSite.getID()}-${countryId}-price-history`;
        configs[countryId].priceBookId = priceBookId;
        
        // Initialize Input Pricebooks + Currency (if configured)
        if (configs[countryId].books) {
            configs[countryId].books = configs[countryId].books.map(id => PriceBookMgr.getPriceBook(id))
            configs[countryId].currency = configs[countryId].books[0].currencyCode;
        } else {
            configs[countryId].currency = currentSite.getDefaultCurrency();
        }

        // Load relevant promotions
        if (params.includePromotions) {
            configs[countryId].promos = getGenericPromos(configs[countryId].currency);
        }
        
        // Initialize output directory
        const directoryPath = `${File.IMPEX}/src/catalog/`;
        const directory = new File(directoryPath);
        directory.mkdirs();

        // Initialize output file
        const fileName = `/pricebook-${priceBookId}-${StringUtils.formatCalendar(currentSite.getCalendar(),'yyyyMMddHHmmss_S')}.xml`;
        const outFile = new File(directoryPath + File.SEPARATOR + fileName);
        outFile.createNewFile();
        
        // Initialize output file Writer
        const writer = new FileWriter(outFile, 'UTF-8', false);
        writer.write(getPriceBookHeader(priceBookId, configs[countryId].currency));
        configs[countryId].writer = writer;
        
        configArray.push(configs[countryId]); 
    });

    return configArray;
}

/**
 * Triggers Product Search and returns search hits relevant for this job execution
 * 
 * @returns {dw.util.Iterator} the search hits
*/
function getProductSearchHits() {
    const ProductSearchModel = require('dw/catalog/ProductSearchModel');
    const ProductSearchHit = require('dw/catalog/ProductSearchHit');
    
    const searchModel = new ProductSearchModel();
    searchModel.setCategoryID('root');
    // exclude bundles and sets
    searchModel.addHitTypeRefinement(ProductSearchHit.HIT_TYPE_SIMPLE, ProductSearchHit.HIT_TYPE_PRODUCT_MASTER, ProductSearchHit.HIT_TYPE_VARIATION_GROUP, ProductSearchHit.HIT_TYPE_SLICING_GROUP)
    // we are only interested in products with price
    searchModel.setPriceMin(0.01);
    // if a product is temporarily out of stock
    searchModel.setOrderableProductsOnly(false);
    searchModel.search();
    
    return searchModel.productSearchHits
}

/**
 *  Returns the first lines of the pricebook import file
 * @returns {string} pricebook import lines
 */
function getPriceBookHeader(priceBookId, currency) {
    return `<?xml version="1.0" encoding="UTF-8"?>
        <pricebooks xmlns="http://www.demandware.com/xml/impex/pricebook/2006-10-31">
        <pricebook>
            <header pricebook-id="${priceBookId}">
                <currency>${currency}</currency>
                <display-name xml:lang="x-default">Historic Prices</display-name>
                <online-flag>true</online-flag>
            </header>    
            <price-tables>
    `;
}

/**
 *  Returns the last lines of the pricebook import file, closing the XML
 */
function getPriceBookFooter(priceBookId, currency) {
    return '</price-tables></pricebook></pricebooks>';

}

/**
 * Returns a price if the product changes its price (e.g. because on Sale / discounted by Promotion)
 * 
 * @param {dw.catalog.Product} product The item to check the price for
 * @param {string} priceBookId The Pricebook ID to load the price history from
 * @param {Array} promos The list of applicable Promotions to check the resulting price from
 * 
 *  @returns {dw.value.Money|null} The changed price, null if none found
 */
function getChangedPrice(product, priceBookId, promos) {
    let actualPrice = product.priceModel.price;
    const productPromos = promos ? promos.getProductPromotions(product) : null;

    if (productPromos && !productPromos.empty) {
        // this assumes the SFRA / SG based promotion callout of the first product promotion being shown on PLP and PDP
        const promoPrice = productPromos.iterator().next().getPromotionalPrice(product);
        actualPrice = promoPrice.available ? promoPrice : actualPrice;
    }

    if (actualPrice.value !== product.priceModel.getPriceBookPrice(priceBookId).value) {
        return actualPrice;
    }

    return null;
}

/**
 *  Writes todays final price into the history pricebook and used priceinfo field to carry past prices
 */
function getPriceHistoryXml(baseProduct, price, productsToWrite, priceBookId, promos, daysToKeep) {
    if (baseProduct.priceModel) {
        const historyEntryInfo = baseProduct.priceModel.getPriceBookPriceInfo(priceBookId);
        const priceInfo = historyEntryInfo ? historyEntryInfo.priceInfo : null;
        const HistoryMgr = require('module_pricehistory/cartridge/scripts/pricehistory/HistoryMgr');
        let priceHistory = new HistoryMgr(priceInfo, baseProduct.getID(), daysToKeep);
        priceHistory.addPrice(price.value);

        return productsToWrite.map(id => `
                <price-table product-id="${id}">
                    <amount quantity="1">${price.value}</amount>
                    <price-info>${priceHistory.getJson()}</price-info>
                </price-table>`
        ).join('\n');
        
    }
}

/**
 * The main executable of this job 
 * 
 * - uses product search to get all products with prices
 * - notes country specific prices of today on a pricebook
 * 
 * @param {Object} params - execution parameters
 * @param {dw.job.JobExecution} stepExecution - execution step scope
 * 
 * @return {dw.system.Status} Exit status for a job run
 */
var run = function (params) {
    checkApiVersion();

    const countryConfigs = createCountryConfiguration(params)
    const daysToKeep = params.daysToKeep;
    const hits = getProductSearchHits();

    while (hits.hasNext()) {
        let hit = hits.next();
        countryConfigs.forEach(countryConfig => {
            // Apply currency
            session.setCurrency(Currency.getCurrency(countryConfig.currency));

            // If books is null, the platform will reapply site pricebooks
            PriceBookMgr.setApplicablePriceBooks(countryConfig.books);

            // If the search hit has no difference of min and max price, we know the price is the same for all variants represented by this hit
            let isPriceRange = hit.minPrice.value !== hit.maxPrice.value;

            if (!isPriceRange) {
                let currentPriceIfDifferent = getChangedPrice(hit.firstRepresentedProduct, countryConfig.priceBookId, countryConfig.promos);

                if (currentPriceIfDifferent) {
                    countryConfig.writer.write(getPriceHistoryXml(hit.firstRepresentedProduct, currentPriceIfDifferent, hit.representedProductIDs.toArray(), countryConfig.priceBookId,countryConfig.promos, daysToKeep));
                }
            } else {
                hit.representedProducts.toArray().forEach(product => {
                    let currentPriceIfDifferent = getChangedPrice(product, countryConfig.priceBookId, countryConfig.promos);

                    if (currentPriceIfDifferent) {
                        countryConfig.writer.write(getPriceHistoryXml(product, currentPriceIfDifferent, [product.ID], countryConfig.priceBookId, countryConfig.promos, daysToKeep));
                    };
                })
            }
        });
    }

    // Close all XML files and the attached writers
    countryConfigs.forEach(countryConfig => {
        countryConfig.writer.write(getPriceBookFooter());
        countryConfig.writer.close();
    });

    return new Status(Status.OK);
};

exports.Run = run;
