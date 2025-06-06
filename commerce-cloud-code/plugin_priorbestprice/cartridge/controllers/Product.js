'use strict';

/**
 * @namespace Product
 */

var productController = module.superModule;
var server = require('server');

server.extend(productController);

/**
 * Product-Variation : This endpoint is called when all the product variants are selected
 * @name Base/Product-Variation
 * @function
 * @memberof Product
 * @param {querystringparameter} - pid - Product ID
 * @param {querystringparameter} - quantity - Quantity
 * @param {querystringparameter} - dwvar_<pid>_color - Color Attribute ID
 * @param {querystringparameter} - dwvar_<pid>_size - Size Attribute ID
 * @param {category} - non-sensitive
 * @param {returns} - json
 * @param {serverfunction} - get
 */
server.append('Variation', function (req, res, next) {
    const product = res.viewData.product;

    /**
     * Product is getting added to the Price Context, so priceHelper can load the prior-best-price
     */
    const context = {
        price: product.price,
        product: product
    };

    const priceHelper = require('*/cartridge/scripts/helpers/pricing');
    res.viewData.product.price.html = priceHelper.renderHtml(priceHelper.getHtmlContext(context));

    res.json({
        product: res.viewData.product,
        resources: res.viewData.resources
    });

    next();
});

module.exports = server.exports();
