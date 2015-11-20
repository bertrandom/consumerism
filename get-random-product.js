#!/usr/bin/env node

var winston = require('winston');
var ae = require('./lib/aliexpress');
var category;

winston.add(winston.transports.File, { filename: 'log/consumerism.log' });
winston.remove(winston.transports.Console);

category = ae.getRandomCategory();

winston.log('info', 'selecting random category', category);

ae.getRandomProduct(category).then(function(product) {
	winston.log('info', 'selecting random product', product);
	process.stdout.write(product.url);
});
