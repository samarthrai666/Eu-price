var describe   = require('mocha').describe;
var it         = require('mocha').it;
var chai       = require("chai");
var sinon      = require("sinon");
var sinonChai  = require("sinon-chai");
var expect     = chai.expect;
var proxyquire = require('proxyquire').noCallThru();

chai.use(sinonChai);

require('dw-api-mock/demandware-globals');

const HISTORYMGR_MODULE_PATH = process.cwd() + '/commerce-cloud-code/module_pricehistory/cartridge/scripts/pricehistory/HistoryMgr';
const DAYS_TO_KEEP = 30;

/**
 * (Basic) DW Calendar Mock, covering logic used by HistoryMgr
 * 
 * @param {Date} date 
 */
const CalendarMock = function(date) {
    this.date = date || new Date();
    this.DAY_OF_YEAR = 'DAY_OF_YEAR';
}

CalendarMock.prototype.parseByFormat = function(string, format) {
    if(format !== 'yyyyMMdd') {
        throw new Error('Mock only supports HistoryMgr format!');
    }

    let date = new Date(this.date);

    date.setDate(Number(string.substring(6,8)));
    date.setMonth(Number(string.substring(4,6)) - 1);
    date.setFullYear(Number(string.substring(0,4)));

    if(date.toString() === 'Invalid Date') {
        throw new Error('Calendar would throw this Exception as well');
    }

    this.date = date;
}

CalendarMock.prototype.add = function(type, amount) {
    if(type !== CalendarMock.DAY_OF_YEAR) {
        throw new Error('Mock only supports DAY_OF_YEAR');
    }

    this.date.setDate(this.date.getDate() + amount);
}

CalendarMock.prototype.before = function(calendar) {
    return this.date < calendar.date;
}

const StringUtilsMock = {
    formatCalendar: function(input) {
        return '16990315';
    }
}

const SiteMock = {
    getCurrent: function() {
        return {
            getCalendar: function() {
                return null;
            }
        }
    }
}

/**
 * Helper function to converts a Date to the HistoryMgr Format
 * (It's condensed to YYYYMMDD)
 * 
 * @param {Date} date 
 * @returns {string}
 */
function formatDate(date) {
    let dayString = date.getDate().toString();

    if(dayString.length < 2) {
        dayString = '0' + dayString;
    }

    let monthString = (date.getMonth() + 1).toString();

    if(monthString.length < 2) {
        monthString = '0' + monthString;
    }

    return date.getFullYear().toString() + monthString + dayString;
}

// HistoryMgr Tests
describe('HistoryMgr', function () {
    // Proxied class skipping all Calendar operations, allows for fake dates (that are not cleaned up)
    const HistoryMgrPlain = proxyquire(HISTORYMGR_MODULE_PATH, {
        'dw/util/StringUtils': StringUtilsMock,
        'dw/system/Site': SiteMock
    });

    // This one includes the Calendar mocks
    const HistoryMgrFull = proxyquire(HISTORYMGR_MODULE_PATH, {
        'dw/util/Calendar': CalendarMock,
        'dw/util/StringUtils': StringUtilsMock,
        'dw/system/Site': SiteMock
    });

    describe('#Constructor', () => {
        let data = {'19700101': 0.01};
        let dataString = JSON.stringify(data);
        let mgrInstance = new HistoryMgrPlain(dataString);

        it('should return an instance', () => {
            expect(mgrInstance instanceof HistoryMgrPlain).to.be.true;
        });

        it('should represent the passed payload', () => {
            expect(mgrInstance.getSize()).to.equal(dataString.length);
            expect(mgrInstance.getJson()).to.equal(dataString);
        });
    });

    describe('#ParseDateEntry', () => {
        let data = {'19700101': 0.01};
        let dataString = JSON.stringify(data);
        let mgrInstance = new HistoryMgrFull(dataString);

        it('should correctly parse a valid date', () => {
            const welcomeMcFly = '20151021'
            let cal = mgrInstance.parseDateEntry(welcomeMcFly);

            expect(cal.date.getFullYear()).to.equal(2015);
            expect(cal.date.getMonth()).to.equal(9);
            expect(cal.date.getDate()).to.equal(21);
        });

        it('should detect invalid dates and return null', () => {
            let cal = mgrInstance.parseDateEntry('INVALID');
            expect(cal).to.be.null;

            let cal2 = mgrInstance.parseDateEntry('Dec 24th 0000');
            expect(cal).to.be.null;
        });
    });

    describe('#getLatestPrice', () => {
        it('should return the latest price for single entry', () => {
            let data = {'16990101': 0.01};
            let dataString = JSON.stringify(data);
            let mgrInstance = new HistoryMgrPlain(dataString);

            expect(mgrInstance.getLatestPrice()).to.equal(0.01);
        });

        it('should return the latest price for multiple entries', () => {
            let data = {'16990101': 0.01, '16991010': 0.05, '17010315': 0.02};
            let dataString = JSON.stringify(data);
            let mgrInstance = new HistoryMgrPlain(dataString);

            expect(mgrInstance.getLatestPrice()).to.equal(0.02);
        });

        it('should cover unsorted entries', () => {
            let data = {'16990101': 0.01, '17010315': 0.02, '16991010': 0.05};
            let dataString = JSON.stringify(data);
            let mgrInstance = new HistoryMgrPlain(dataString);

            expect(mgrInstance.getLatestPrice()).to.equal(0.02);
        });
    });

    describe('#removeOutdatedEntries', () => {
        it('should properly remove outdated entries', () => {
            let completelyOutdated = new Date();
            completelyOutdated.setDate(completelyOutdated.getDate() - DAYS_TO_KEEP - 2);

            let justOutdated = new Date();
            justOutdated.setDate(justOutdated.getDate() - DAYS_TO_KEEP - 1);

            let data = {}
            data[formatDate(completelyOutdated)] = 0.01;
            data[formatDate(justOutdated)] = 0.02;

            let dataString = JSON.stringify(data);
            
            let mgrInstance = new HistoryMgrFull(dataString);
            mgrInstance.removeOutdatedEntries();

            let resultingValues = Object.values(mgrInstance.priceHistoryObj);

            expect(resultingValues).to.not.contain(0.01);
            expect(resultingValues).to.contain(0.02);
        });

        it('should leave valid entries untouched', () => {
            // This one can be deleted
            let readyForCleanup = new Date();
            readyForCleanup.setDate(readyForCleanup.getDate() - DAYS_TO_KEEP - 1);

            // This one should stay in (validity reaching inti the 30 day period)
            let outdatedButValid = new Date();
            outdatedButValid.setDate(outdatedButValid.getDate() - DAYS_TO_KEEP);

            // This one should also stay in
            let notOutdated = new Date();
            notOutdated.setDate(notOutdated.getDate() - DAYS_TO_KEEP + 2);

            let data = {}

            // Properly add the formatted days
            data[formatDate(readyForCleanup)] = 0.01;
            data[formatDate(outdatedButValid)] = 0.02;
            data[formatDate(notOutdated)] = 0.03;

            let dataString = JSON.stringify(data);
            
            // Create Object instance
            let mgrInstance = new HistoryMgrFull(dataString);
            mgrInstance.removeOutdatedEntries();

            let resultingValues = Object.values(mgrInstance.priceHistoryObj);

            expect(resultingValues).to.not.contain(0.01);
            expect(resultingValues).to.contain(0.02);
            expect(resultingValues).to.contain(0.03);
        });
    });

    describe('#removeInvalidEntries', () => {
        it('should remove invalid entries while leaving valid ones intact', () => {
            let data = {
                '16990101': 0.03, 
                'INVALID': 0.01, 
                '16991010': 'INVALID', 
                '16991011': 0.08
            };

            let dataString = JSON.stringify(data);
            let mgrInstance = new HistoryMgrFull(dataString);

            mgrInstance.removeInvalidEntries();
            let resultingValues = Object.values(mgrInstance.priceHistoryObj);

            expect(resultingValues).to.contain(0.03);
            expect(resultingValues).to.not.contain(0.01);
            expect(resultingValues).to.not.contain('INVALID');
            expect(resultingValues).to.contain(0.08);
        });
    });

    describe('#addPrice', () => {
        let data = {
            '16990101': 0.01,
            '16990110': 0.02,
            '16990230': 0.03
        }

        it('should add valid prices', () => {
            let dataString = JSON.stringify(data);

            let mgrInstance = new HistoryMgrPlain(dataString);
            mgrInstance.addPrice(0.04);

            expect(mgrInstance.getLatestPrice()).to.equal(0.04);
        });

        it('should skip invalid and 0 amount prices', () => {
            let dataString = JSON.stringify(data);

            let mgrInstance = new HistoryMgrPlain(dataString);
            mgrInstance.addPrice(null);
            mgrInstance.addPrice('onety-one');
            mgrInstance.addPrice();
            mgrInstance.addPrice(0);

            // Latest Price should not have changed
            expect(mgrInstance.getLatestPrice()).to.equal(0.03);

            // Ensure nothing was added to the data object
            let resultingKeys = Object.keys(mgrInstance.priceHistoryObj);
            expect(resultingKeys.length).to.equal(3);
        });

        it('should skip prices identical to the latest one', () => {
            let dataString = JSON.stringify(data);

            let mgrInstance = new HistoryMgrPlain(dataString);
            mgrInstance.addPrice(0.03);

            let resultingKeys = Object.keys(mgrInstance.priceHistoryObj);

            expect(resultingKeys.length).to.equal(3);
        });
    });

    describe('#removeOverhead', () => {
        it('should not delete anything if max size is not reached', () => {
            let data = {
                '16990101': 0.01,
                '16990102': 0.02,
                '16990103': 0.03,
                '16990104': 0.02,
                '16990105': 0.04,
                '16990106': 0.03,
                '16990107': 0.02,
                '16990108': 0.03,
                '16990109': 0.04,
                '16990110': 0.04,
                '16990111': 0.04,
                '16990112': 0.04,
                '16990113': 0.04,
                '16990114': 0.04,
                '16990115': 0.04,
                '16990116': 0.1,
            }

            let dataString = JSON.stringify(data);

            let initialLength = dataString.length;

            let mgrInstance = new HistoryMgrPlain(dataString);
            mgrInstance.removeOverhead();

            let resultingData = JSON.stringify(mgrInstance.priceHistoryObj);
            
            expect(resultingData.length).to.equal(initialLength);
        });

        it('should only delete as many entries as necessary', () => {
            let data = {
                '16990101': 0.01,
                '16990102': 0.02,
                '16990103': 0.03, // This one should be deleted (oldest unrelevant price)
                '16990104': 0.02,
                '16990105': 0.04,
                '16990106': 0.03,
                '16990107': 0.02,
                '16990108': 0.03,
                '16990109': 0.04,
                '16990110': 0.05,
                '16990111': 0.04,
                '16990112': 0.03,
                '16990113': 0.04,
                '16990114': 0.08,
                '16990115': 0.04,
                '16990116': 0.1,
                '16990117': 0.08,
            }

            let dataString = JSON.stringify(data);

            let mgrInstance = new HistoryMgrPlain(dataString);
            mgrInstance.removeOverhead();

            let resultingKeys = Object.keys(mgrInstance.priceHistoryObj);

            expect(resultingKeys).to.not.contain('16990103');
            expect(resultingKeys.length).to.equal(16);
        });

        it('should delete multiple entries if necessary', () => {
            let data = {
                '16990101': 0.01,
                '16990102': 0.02,
                '16990103': 0.03, // This entry should get deleted
                '16990104': 0.02,
                '16990105': 0.04, // This one should be deleted as well
                '16990106': 0.03, // ...and this one too
                '16990107': 0.02,
                '16990108': 0.03,
                '16990109': 0.04,
                '16990110': 0.05,
                '16990111': 0.04,
                '16990112': 0.03,
                '16990113': 0.04,
                '16990114': 0.08,
                '16990115': 0.04,
                '16990116': 0.1,
                '16990117': 0.08,
                '16990118': 0.07,
                '16990119': 0.06,
            }

            let dataString = JSON.stringify(data);

            let mgrInstance = new HistoryMgrPlain(dataString);
            mgrInstance.removeOverhead();

            let resultingKeys = Object.keys(mgrInstance.priceHistoryObj);

            expect(resultingKeys).to.not.contain('16990103');
            expect(resultingKeys).to.not.contain('16990105');
            expect(resultingKeys).to.not.contain('16990106');
            expect(resultingKeys.length).to.equal(16);
        });

        it('should end up in an error if no proper shrinking is possible', () => {
            let data = {
                '16990101': 0.01,
                '16990102': 0.02,
                '16990103': 0.03,
                '16990104': 0.04,
                '16990105': 0.05,
                '16990106': 0.06,
                '16990107': 0.07,
                '16990108': 0.08,
                '16990109': 0.09,
                '16990110': 0.10,
                '16990111': 0.11,
                '16990112': 0.12,
                '16990113': 0.13,
                '16990114': 0.14,
                '16990115': 0.15,
                '16990116': 0.16,
                '16990117': 0.17,
            }

            let dataString = JSON.stringify(data);

            let mgrInstance = new HistoryMgrPlain(dataString);
            sinon.spy(mgrInstance, 'handleOverflow');

            mgrInstance.removeOverhead();
            
            expect(mgrInstance.handleOverflow).to.have.been.called;
            expect(mgrInstance.getJson()).to.equal('"Dataset too large!"');
        });
    });
});