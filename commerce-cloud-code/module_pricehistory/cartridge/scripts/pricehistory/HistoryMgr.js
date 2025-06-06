'use strict';

const Logger = require('dw/system/Logger').getLogger('bestprice.historymgr');

const DAYS_TO_KEEP = 30;
const MAX_SIZE = 256;

/**
 * Business Logic class for the Onmibus directive
 * 
 * Covering logic to update and read Price History entries
 * 
 * JSON Format:
 *  - Key = Start date (!) of the price
 *  - Value = Price amount
 * 
 * Example:
 * {
 *  '19700101': 9.99,
 *  '19700102': 8.49,
 *  '19700115': 9.99
 * }
 * 
 * @param {string} priceHistoryJson The price history to work with
 * @param {string} [productId] The Product ID related to the price history. For logging purposes only.
 * @param {number} [daysToKeep] Amount of days to keep an entry in price history
 */
function HistoryMgr(priceHistoryJson, productId, daysToKeep) {
    this.priceHistoryJson = priceHistoryJson;
    this.priceHistoryObj = {};
    this.productId = productId || '(unknown)';
    this.daysToKeep = daysToKeep || DAYS_TO_KEEP;
    
    if(!empty(this.priceHistoryJson)) {
        try {
            this.priceHistoryObj = JSON.parse(this.priceHistoryJson);
        } catch(e) {
            // We can't do anything about it really, let's throw a proper, controlled Exception
            Logger.warn('Invalid Price History JSON for Product ' + this.productId + ': ' + priceHistoryJson);
        }
    }

    /**
     * Write-Back function to store updated price history 
     * 
     * @param {Object} priceHistory 
     */
    this.update = function update(priceHistory) {
        this.priceHistoryObj = priceHistory;
    }

    /**
     * Date String Parser
     * 
     * @param {string} dateString 
     * @returns {dw.util.Calendar} "now" if parsing failed
     */
    this.parseDateEntry = function parseDateEntry(dateString) {
        const Calendar = require('dw/util/Calendar');
        let then = new Calendar(new Date(0));

        try {
            then.parseByFormat(dateString, 'yyyyMMdd');
        } catch (e) {
            // we control these, so the only entry non parseable could be aditional info
            let msg = 'Cannot parse price history entry field for Product ' + this.productId;
            msg += '; Error: ' + e;
            Logger.warn(msg);

            then = null;
        }

        return then;
    }

    /**
     * Clones the current Price History 
     * Needed to avoid call-by-reference issues
     * 
     * @returns {object} The current Price History Object
     */
    this.getClone = function getClone() {
        return Object.assign({}, this.priceHistoryObj);
    }

    /**
     * Calculates the expected size of the resulting Price Info entry
     * 
     * @returns {number}
     */
    this.getSize = function getSize() {
        return JSON.stringify(this.priceHistoryObj).length;
    }

    /**
     * Loads the latest (newest) price
     * 
     * @returns {number} The latest price
     */
    this.getLatestPrice = function getLatestPrice() {
        let latestPrice = 0;
        let dates = Object.keys(this.priceHistoryObj);

        let latestDate = dates.pop();

        if(!empty(latestDate)) {
            latestPrice = this.priceHistoryObj[latestDate];
        }

        return latestPrice;
    }

    /**
     * Read the to-be-displayed Best Price from the history
     * 
     * Covers/skips outdated entries
     * 
     * @returns {number|null} The "best price" or null if none found
     */
    this.getDisplayAmount = function getDisplayAmount() {
        this.removeOutdatedEntries();
        this.removeInvalidEntries();

        let lowestPrice = null;

        Object.keys(this.priceHistoryObj).forEach(date => {
            let currentPrice = this.priceHistoryObj[date];

            if(!lowestPrice || currentPrice < lowestPrice) {
                lowestPrice = currentPrice;
            }
        });

        return lowestPrice;
    }

    /**
     * Deletes entries where either the date or the value are invalid
     * 
     */
    this.removeInvalidEntries = function removeInvalidEntries() {
        let deletionCandidates = [];

        Object.keys(this.priceHistoryObj).forEach(key => {
            let date = this.parseDateEntry(key);

            if(!date) {
                deletionCandidates.push(key);
                return;
            }

            let value = Number(this.priceHistoryObj[key]);

            if(Number.isNaN(value)) {
                deletionCandidates.push(key);
            }
        });

        if(deletionCandidates.length === 0) {
            // Nothing to delete
            return;
        }

        let newPriceInfo = this.getClone();

        deletionCandidates.forEach(key => {
            delete newPriceInfo[key];
        });

        this.update(newPriceInfo);
    }

    /**
     * Function to remove outdated entries from the Price history
     * based on "days to keep"
     * 
     *  - if there is an "outdated" entry, but no outdated follow-up, we need to keep it
     *  - we can only delete outdated entries if their "valid to" is older than the validity
     */
    this.removeOutdatedEntries = function removeOutdatedEntries() {
        let newPriceInfo = this.getClone();
        let daysToKeep = this.daysToKeep;

        let lastValidFrom = null;
        let validToEntries = {};

        Object.keys(newPriceInfo).forEach(validFrom => {
            let isValid = !!this.parseDateEntry(validFrom);

            if(!isValid) {
                return;
            }

            // We store the "valid to" date for each entry
            if(!lastValidFrom) {
                // First Iteration
                lastValidFrom = validFrom;
            } else {
                // "valid to" is the current "valid from" date (+1 day)
                validToEntries[validFrom] = lastValidFrom;
                lastValidFrom = validFrom;
            }
        });

        // Calculate "last possible valid to date"
        const Calendar = require('dw/util/Calendar');
        let firstRelevantDay = new Calendar(new Date());

        /**
         * One day needs to be added to {today minus daysToKeep}
         * Because we use the "valid from" date of the follow-up price
         */
        firstRelevantDay.add(Calendar.DAY_OF_YEAR, daysToKeep * -1 + 1);

        // Delete actually outdated entries (based on "valid to")
        Object.keys(validToEntries).forEach(validTo => {
            var validToDate = this.parseDateEntry(validTo);

            if (validToDate.before(firstRelevantDay)) {
                let validFrom = validToEntries[validTo];
                delete newPriceInfo[validFrom]
            }
        });

        this.update(newPriceInfo);
    }

    /**
     * Deletes "unnecessary" entries
     * 
     * Idea: We can delete a higher price whenever a lower price follows later
     * 
     *  - traverse backwards
     *  - remember current price ("reference price")
     *  - if we find a price higher than reference: delete
     *  - if we find a lower price: use as reference from now on
     *  - continue until end of (reversed) list
     */
    this.removeOverhead = function removeOverhead() {
        if(this.getSize() <= MAX_SIZE) {
            // No need to clean up
            return;
        }

        let newPriceInfo = this.getClone();
        let deletionCandidates = [];

        let reverseKeys = Object.keys(newPriceInfo).reverse();

        // Prepare initial "reference price"
        let firstEntry = reverseKeys.shift();
        let referencePrice = newPriceInfo[firstEntry];

        reverseKeys.forEach(date => {
            let currentPrice = newPriceInfo[date];

            if(currentPrice > referencePrice) {
                // Higher Price? Mark for deletion
                deletionCandidates.push(date);
            }

            if(currentPrice < referencePrice) {
                // (New) reference price: Remember and continue with next entry
                referencePrice = currentPrice;
            }
        });

        // Delete overhead, oldest entries first
        deletionCandidates = deletionCandidates.reverse();

        // Only delete if we have candidates left, and only if the size is too large
        while(this.getSize() > MAX_SIZE && deletionCandidates.length > 0) {
            let date = deletionCandidates.shift();
            
            delete newPriceInfo[date];
            this.update(newPriceInfo);
        }

        if(this.getSize() > MAX_SIZE) {
            // Impossible to shrink below MAX_SIZE without side effects
            newPriceInfo = this.handleOverflow(newPriceInfo);
            this.update(newPriceInfo)
        }
    }

    /**
     * Adds today's price to the PriceHistory (if different to the latest one)
     * 
     * @param {float} priceValue Value of the price that should be added
     */
    this.addPrice = function addPrice(priceValue) {
        const value = new Number(priceValue);

        if(Number.isNaN(value) || value.valueOf() === 0) {
            return;
        }

        const latestPrice = this.getLatestPrice();

        if(latestPrice === priceValue) {
            return;
        }

        const StringUtils = require('dw/util/StringUtils');
        const Site = require('dw/system/Site');

        const siteCalendar = Site.getCurrent().getCalendar();

        const today = StringUtils.formatCalendar(siteCalendar, 'YYYYMMdd');
        this.priceHistoryObj[today] = priceValue;
        
        this.cleanup();
    }

    /**
     * Converts the Price History to a JSON String
     * 
     * @returns {string}
     */
    this.getJson = function getJson() {
        this.priceHistoryJson = JSON.stringify(this.priceHistoryObj);

        return this.priceHistoryJson;
    }

    /**
     * Cleanup mechanisms
     * 
     *  - deletes invalid entries
     *  - deletes outdated entries
     *  - tries to remove unnecessary entries if resulting string is too long
     */
    this.cleanup = function cleanup() {
        this.removeInvalidEntries();
        this.removeOutdatedEntries();
        this.removeOverhead();
    }

     /**
     * Gets Called if MAX_SIZE is exceeded but there is no more way to shrink the dataset without data loss
     * 
     * Put your own custom logic for this case here if desired.
     * 
     * @param {string} json The Payload that cannot be shrinked further
     * @returns {string} result JSON (which might be invalid!)
     */
    this.handleOverflow = function handleOverflow(json) {
        // Log an Error containing the original JSON string
        let msg = 'Price History Overflow! Unable to shrink below max size. Product ID: ' + this.productId;
        msg +='; Payload: ' + this.priceHistoryJson;
        Logger.error(msg);

        // Invalidate Price History
        return 'Dataset too large!';
    }
}

module.exports = HistoryMgr;
