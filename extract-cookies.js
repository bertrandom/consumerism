#!/usr/bin/env node

var fs = require('fs');
var winston = require('winston');
var chrome = require('chrome-cookies-secure');

chrome.getCookies('http://www.aliexpress.com/', "curl", function(err, cookies) {

	winston.log('info', 'writing cookies to data/cookies.txt');
	fs.writeFileSync('data/cookies.txt', cookies);

});
