var request = require('request');
var cheerio = require('cheerio');
var Promise = require("bluebird");
var qs = require('querystring');
var rateLimit = require('function-rate-limit');
var weighted = require('weighted');
var random = require("random-js")();

var weights = require('../data/weights.json');
var categories = require('../data/categories.json');

var searchParams = {
    shipCountry: 'us',
    shipFromCountry: '',
    shipCompanies: '',
    SearchText: '',
    minPrice: '',
    maxPrice: '1',
    minQuantity: '',
    maxQuantity: '',
    isFreeShip: 'y',
    isFavorite: 'n',
    isRtl: 'yes',
    isOnSale: 'n',
    isBigSale: 'n',
    similar_style: 'n',
    similar_style_id: '',
    g: 'n',
    needQuery: 'y' 
};

var rlRequest = rateLimit(6, 1000, request);

var aliexpress = {

    getCategories: function() {

        return new Promise(function (resolve, reject) {

            rlRequest({url: 'http://www.aliexpress.com/all-wholesale-products.html'}, function (err, response, body) {

                $ = cheerio.load(body);

                var outputCategories = [];

                $('div.item ul.sub-item-cont li a').each(function(index, link) {

                    var category = {};

                    category.section = $(this).closest('div.item').find('h3.big-title a').text();

                    var url = $(this).attr('href');

                    category.url = url;

                    var match = url.match(/\/category\/([0-9]+)\//);
                    if (match && match[1]) {
                        category.id = match[1];
                    }

                    category.name = $(this).text();

                    outputCategories.push(category);

                });

                resolve(outputCategories);

            });

        });

    },

    getTotalResults: function(category) {

        var params = searchParams;
        params.CatId = category.id;

        var searchUrl = category.url + '?' + qs.stringify(params);

        return new Promise(function (resolve, reject) {

            rlRequest({url: searchUrl}, function (err, response, body) {

                $ = cheerio.load(body);

                var rawCount = $('strong.search-count').text();
                var count = parseInt(rawCount.replace(',',''), 10);

                console.log(category.section + ' - ' + category.name + ' - ' + count);
                resolve(count);

            });

        });

    },

    setWeights: function() {

        var total = 0;
        var categoryId;
        var category;
        var totalResults;

        for (categoryId in categories) {

            category = categories[categoryId];

            totalResults = category.totalResults;

            if (totalResults > 10512) {
                totalResults = 10512;
            }

            total += totalResults;

        }

        var totalWeight = 0;

        for (categoryId in categories) {

            category = categories[categoryId];

            if (category.totalResults > 0) {

                var weight = category.totalResults / total;
                category.weight = weight;
                totalWeight += weight;

            }

        }

    },

    getRandomCategory: function() {

        var categoryId = weighted.select(weights);
        var category = categories[categoryId];
        return category;

    },

    getRandomProduct: function(category) {

        var totalResults = category.totalResults;

        // Aliexpress can only paginate up to 292 pages (36 per page)
        if (totalResults > 10512) {
            totalResults = 10512;
        }

        var productIndex = random.integer(0, totalResults - 1);

        var page = Math.floor(productIndex / 36);

        var offset = productIndex % 36;

        var splitUrl = (category.url.match(/(.*)(\.html)$/));

        var url = splitUrl[1] + '/' + page + splitUrl[2];

        var params = searchParams;
        params.CatId = category.id;

        var searchUrl = url + '?' + qs.stringify(params);

        return new Promise(function (resolve, reject) {

            rlRequest({url: searchUrl}, function (err, response, body) {

                $ = cheerio.load(body);

                var products = [];

                var found = false;

                $('ul#list-items li.list-item a.product').each(function(index, link) {

                    if (index == offset) {

                        found = true;

                        var product = {};
                        product.url = $(this).attr('href');
                        product.title = $(this).text();
                        
                        return resolve(product);

                    }

                });

                if (!found) {
                    return reject("Product index not found");
                }
                
            });

        });

    }

};

module.exports = aliexpress;
