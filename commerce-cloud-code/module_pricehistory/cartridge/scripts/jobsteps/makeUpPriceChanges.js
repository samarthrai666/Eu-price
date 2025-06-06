'use strict';

/**
 * Job Step Type that calculates random price changes
 * 
 *  - Covers ~25% of all products (search hits) per job run
 *  - Throws the dice to generate +/- 5-30% price changes
 */


const Site = require('dw/system/Site');
const File = require('dw/io/File');
const FileWriter = require('dw/io/FileWriter');
const Currency = require('dw/util/Currency');
const StringUtils = require('dw/util/StringUtils');
const Logger = require('dw/system/Logger');

let log;
let configs;

/**
 * Generates and returns a Pricebook Header String
 * 
 * @param {string} priceBookId 
 * @param {string} currency 
 * @returns {string}
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
 * Returns a Pricebook Footer string
 * 
 * @returns {String}
 */
function getPriceBookFooter() {
    return `        </price-tables>
    </pricebook>
</pricebooks>`;
}


/**
 * Generates a Price Table entry for Product IDs, setting the given price amount
 * 
 * @param {string} price Target Price
 * @param {string} productsToWrite List of Product IDs to generate the entries for
 * @returns {string}
 */
function getPriceXml(price, productsToWrite) {
    let output = '';

    productsToWrite.forEach(function (productID) {
        output += `
                    <price-table product-id="${productID}">
                        <amount quantity="1">${price}</amount>
                    </price-table>` + `\n`;
    });

    return output;
}

/**
 * Loads Pricebooks based on Job Configuration
 * 
 *  - useSitePriceBooks: Get all Pricebooks from current Site
 *  - specificPriceBooks: CSV list of Pricebook IDs to cover
 * 
 * @param {array} params Job Parameters
 * @returns {dw.catalog.Pricebook[]} Relevant Pricebooks, empty array if none found
 */
function getRelevantPricebooks(params) {
    const PriceBookMgr = require('dw/catalog/PriceBookMgr');
    
    let relevantPricebooks = [];
    let pricebookIDs = [];

    // "Use Site Pricebooks" enabled?
    if (params['Use Site Pricebooks'] === true) {
        relevantPricebooks = PriceBookMgr.getSitePriceBooks().toArray();

        relevantPricebooks.map(pricebook => {
            pricebookIDs.push(pricebook.getID());
        });

        log.debug('Using Site Pricebooks');
    }
    
    // "Specific Pricebooks" configured?
    if (!empty(params['Specific Pricebooks'])) {
        const priceBookList =  params['Specific Pricebooks'].split(',');

        priceBookList.forEach(pricebookID => {
            let cleanPricebookID = pricebookID.trim();

            // Check if the pricebook exists
            let pricebook = PriceBookMgr.getPriceBook(cleanPricebookID);

            if (pricebook !== null) {
                if(pricebookIDs.indexOf(pricebook.getID()) === -1) {
                    // prevent duplicate entries
                    relevantPricebooks.push(pricebook);
                    pricebookIDs.push(pricebook.getID());
                }
                
                log.debug(`Found specific Pricebook "${pricebookID}"`);
            } else {
                log.warn(`Could not find Pricebook "${pricebookID}"`);
            }
        });
    }

    log.info('Found Pricebooks: ' + pricebookIDs.join(', '));

    return relevantPricebooks;
}


/**
 * Triggers Product Search and returns search hits
 * 
 * @returns {dw.catalog.}
 */
function getProductSearchHits() {
    const ProductSearchModel = require('dw/catalog/ProductSearchModel');
    const ProductSearchHit = require('dw/catalog/ProductSearchHit');

    const searchModel = new ProductSearchModel();
    searchModel.setCategoryID('root');
    // exclude bundles and sets
    searchModel.addHitTypeRefinement(ProductSearchHit.HIT_TYPE_SIMPLE, ProductSearchHit.HIT_TYPE_PRODUCT_MASTER, ProductSearchHit.HIT_TYPE_VARIATION_GROUP)
    // we are only interested in products with price
    searchModel.setPriceMin(0.01);
    // if a product is temporarily out of stock
    searchModel.setOrderableProductsOnly(false);
    searchModel.search();
    
    return searchModel.productSearchHits;
}

/**
 * Calculates a random price change for the given amount
 * 
 * @param {float} priceAmonut 
 * @returns {float}
 */
function randomizePrice(priceAmonut) {
    // add or subtract?
    var operation = Math.random() > 0.5 ? 1 : -1;

    let threshold = 0;

    // We want more than 5%
    while(threshold < 0.05) {
        // Result is something between -0.5 and +0.5
        var threshold = Math.random() - 0.5

        // We only want +/- 30%
        threshold = threshold * 2 * 0.3
    }

    // Sum is the original price times threshold, operation determins between "up or down"
    let sum = priceAmonut * threshold * operation;

    // New Price = Old Price + Sum (which can be negative)
    let result = parseFloat(priceAmonut) + parseFloat(sum);

    // We only need cents :)
    return result.toFixed(2);
}


/**
 * Run the Price Randomizer Job
 * 
 * @param {Object} params - execution parameters
 *
 * @return {dw.system.Status} Exit status for a job run
 */
var run = function (params) {
    const Status = require('dw/system/Status');

    log = Logger.getLogger('job.randompricing');
    const pricebooks = getRelevantPricebooks(params);

    if(pricebooks.length === 0) {
        log.error('No pricebooks found to generate prices for.');
        return new Status(Status.ERROR);
    }

    // String used to attach the current timestamp to output filenames
    const todayString = StringUtils.formatCalendar(Site.current.calendar,'yyyyMMddHHmmss_S');

    // List of configurations to write: One pricebook + file writer each
    const outputList = [];

    pricebooks.forEach(pricebook => {
        // Opens a File Writer for each Pricebook, collect the results in a list for reuse

        let directoryPath = File.IMPEX + File.SEPARATOR + 'src' + File.SEPARATOR + 'pricebook';
        let directory = new File(directoryPath);
        directory.mkdirs();

        let outputFilename = directoryPath + File.SEPARATOR + pricebook.getID() + '_update_' + todayString + '.xml';
        let outputFile = new File(outputFilename);
        let outputFileWriter = new FileWriter(outputFile, 'UTF-8', false);

        let header = getPriceBookHeader(pricebook.getID(), pricebook.getCurrencyCode());
        outputFileWriter.write(header);

        outputList.push({
            pricebook: pricebook,
            fileWriter: outputFileWriter
        });
    });

    const searchHits = getProductSearchHits();

    while (searchHits.hasNext()) {
        let hit = searchHits.next();
        let random = Math.random();

        // We only want to update ~25% of all products
        if(random > 0.25) {
            continue;
        }

        let sourceProducts = [];
        let targetProductIDs = [];

        let isPriceRange = hit.minPrice.value !== hit.maxPrice.value;

        if(isPriceRange) {
            sourceProducts = hit.getRepresentedProducts().toArray();
            targetProductIDs = [];
        } else {
            sourceProducts = [hit.getFirstRepresentedProduct()];
            targetProductIDs = hit.getRepresentedProductIDs().toArray();
        }

        outputList.forEach(config => {
            sourceProducts.forEach(product => {
                let priceModel = product.getPriceModel();
                let priceBookPrice = priceModel.getPriceBookPrice(config.pricebook.getID());

                // 0 price won't change
                if(priceBookPrice.getValue() === 0) {
                    return;
                }

                let newPrice = randomizePrice(priceBookPrice.getValue());

                let output;

                if(!empty(targetProductIDs)) {
                    output = getPriceXml(newPrice, targetProductIDs);
                } else {
                    output = getPriceXml(newPrice, [product.getID()]);
                }
                
                config.fileWriter.write(output);
            });
        });
    };

    let footer = getPriceBookFooter();

    outputList.forEach(config => {
        config.fileWriter.write(footer);
        config.fileWriter.flush();
        config.fileWriter.close();
    });

    return new Status(Status.OK);
};

exports.Run = run;
