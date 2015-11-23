#!/usr/bin/env node

var winston = require('winston');
var Promise = require('bluebird');

var login = require('./lib/login');
var purchase = require('./lib/purchase');
var ae = require('./lib/aliexpress');

var winston = require('winston');

winston.add(winston.transports.File, { filename: 'log/consumerism.log', colorize: false });

var getRandomProduct = function() {

    return new Promise(function(resolve, reject) {

        var category;

        category = ae.getRandomCategory();

        winston.log('info', 'selecting random category', category);

        ae.getRandomProduct(category).then(function(product) {
            winston.log('info', 'selecting random product', product);
            resolve(product);
        });

    });

};

var buyRandomProduct = function(cookies) {

    return new Promise(function(resolve, reject) {

        getRandomProduct().then(function(product) {

            purchase.purchaseProduct(product.url, cookies).then(function(price) {
                resolve(price);
            }).catch(function(e) {
                reject(e);
            });

        });

    });

};

var PromiseRetryer = require('promise-retryer')(Promise);

PromiseRetryer.run({
    delay: 1000,
    maxRetries: 5,
    promise: function (attempt) {
        winston.info('Login attempt #' + attempt);
        return login.getCredentials();
    }
}).then(
    function (cookies) {

        // var cookies = JSON.parse(require('fs').readFileSync('./data/cookies.txt'));

        PromiseRetryer.run({
            delay: 1000,
            maxRetries: 5,
            promise: function (attempt) {
                winston.info('Purchase attempt #' + attempt);
                return buyRandomProduct(cookies);
            }
        }).then(
            function () {
                winston.info('Purchase complete.');
            },
            function (error) {
                winston.error('Failed to purchase.', error);
            }
        );

    },
    function (error) {
        winston.error('Failed to login.', error);
    }
);