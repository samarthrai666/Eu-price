/**
 *    This is a copy from https://github.com/SalesforceCommerceCloud/sitegenesis/blob/master/app_storefront_core/cartridge/templates/default/product/components/standardprice.isml
 *    A tiny bit cleaner then having it in template
**/
module.exports = function(PriceModel) {
    /*
        Sets a variable "StandardPrice" in the dictionary based on passed PriceModel.
        This is used to show a crossed-out price on product detail pages.

        The "Standard Price" for a product is the price contained in the "list
        pricebook". Since the Demandware system does not currently have concept
        of pricebook types, the list pricebook determined the top-level pricebook,
        which is a pricebook that does not have a parentPriceBook.  Price will be 
        equal to NOT_AVAILABLE if there is no such price book or if the price book
        defines no price for the product.
    */

    var StandardPrice = dw.value.Money.NOT_AVAILABLE;

    if (!empty(PriceModel)) {
        if (!PriceModel.getPrice().available) {
            StandardPrice = dw.value.Money.NOT_AVAILABLE;
        } else {
            var priceBook = PriceModel.priceInfo.priceBook;
    
            while (priceBook.parentPriceBook) {
                priceBook = priceBook.parentPriceBook ? priceBook.parentPriceBook : priceBook; 
            }
    
            StandardPrice = PriceModel.getPriceBookPrice(priceBook.ID);
        }
    }
    
    if (!StandardPrice.equals(dw.value.Money.NOT_AVAILABLE) && !session.getCurrency().getCurrencyCode().equals(StandardPrice.getCurrencyCode())) {
        var StandardPrice = dw.value.Money.NOT_AVAILABLE;
    }

    return StandardPrice;
}
