var fs = require('fs');
var casper = require("casper").create();

// https://gist.github.com/clochix/5967978
function loadCookies(file) {

  	var cookies = [];
  	if (fs.exists(file)) {

    	cookies = fs.read(file).split("\n");

    	cookies.forEach(function (cookie) {
      	
      		var detail = cookie.split("\t");
      		var newCookie = {
		        'name':   detail[5],
		        'value':  detail[6],
		        'domain': detail[0],
		        'path':   detail[2],
		        'httponly': false,
		        'secure':   false,
		        'expires':  (new Date()).getTime() + 3600 * 24 * 30 /* <- expires in 1 month */
      		};
      	
      		phantom.addCookie(newCookie);

    	});

  	}

  	return cookies;

}

function logMessage(msg, metadata) {

	var line = {
		"level": "info",
		"message": msg,
		"timestamp": new Date().toISOString()
	};

	if (typeof metadata !== 'undefined') {
		for (var key in metadata) {
			line[key] = metadata[key];
		}
	}

	casper.echo(msg);
	fs.write('log/consumerism.log', JSON.stringify(line) + "\n", 'w+');

}

function die(msg) {
	logMessage(msg, {level: "error"});
	casper.die(msg);
}

if (typeof casper.cli.options.url === 'undefined') {
	die("URL not passed. Please pass the product URL with --url=http://www.example.com/");
}

var productUrl = casper.cli.options.url;

var cookies = loadCookies('./data/cookies.txt');

var casper = require("casper").create();

casper.options.viewportSize = {width: 1600, height: 950};

casper.start();

casper.thenOpen(productUrl, function() {

	if (this.visible('span.account-unsigned')) {
		die("Not signed-in. There is an issue with the cookies, please extract new ones.");
	}

	this.evaluate(function() {
		document.body.bgColor = 'white';
	});

    logMessage("opened product page", {title: this.getTitle()});

    this.waitForSelector('span.total-price', function() {

    	var price = 0.00;

	    var priceRaw = this.fetchText('span.total-price');
	    var priceMatch = priceRaw.match(/([0-9\.])+/);

	    if (priceMatch) {
	    	price = parseFloat(priceMatch[0]);
	    }

	    logMessage('fetched initial price', {price: price.toFixed(2)});

	    if (price == 0) {

		    var ids = this.evaluate(function() {
		    	
		    	var skus = document.querySelectorAll('a.sku-value');

		    	var ids = [];

			    for (var i = 0; i < skus.length; i++) {

			    	var element = skus[i];
			    	ids.push(element.id);

			    }

			    return ids;


		    });

		    for (var i = 0; i < ids.length; i++) {

		    	var id = ids[i];

			    logMessage('selecting option', {sku: id});

			    this.click("#" + id);

			    priceRaw = this.fetchText('span.total-price');
			    priceMatch = priceRaw.match(/([0-9\.])+/);

			    if (priceMatch) {
			    	price = parseFloat(priceMatch[0]);
			    }

	    		logMessage('updated price', {price: price.toFixed(2)});

			    if (price > 0 && price <= 1.00) {
			    	break;
			    }

		    }

	    }

	    if (price == 0 || price > 1.00) {

	    	die("Price is out of bounds after trying all options.");
	    	return;

	    }

	    var prefix = new Date().toISOString();

	    var paths = {
	    	product: "screenshots/" + prefix + "-product.jpg",
	    	full: "screenshots/" + prefix + "-full.jpg",
	    	thumbnail: "screenshots/" + prefix + "-thumbnail.jpg",
	    	confirmation: "screenshots/" + prefix + "-confirmation.jpg"
	    };

	    logMessage("capturing screenshots", paths);

		this.capture(paths.product, {
	        top: 0,
	        left: 0,
	        width: 1600,
	        height: 900
	    }, {
        	format: 'jpg',
        	quality: 90
    	});

		this.capture(paths.full, undefined, {
        	format: 'jpg',
        	quality: 90
    	});

		this.captureSelector(paths.thumbnail, 'a.ui-image-viewer-thumb-frame img', {
        	format: 'jpg',
        	quality: 90
    	});

		logMessage("save product thumbnail URL", {url: this.getElementAttribute('a.ui-image-viewer-thumb-frame img', 'src')});

		if (casper.cli.options['dry-run']) {

			logMessage("dry run, completing without purchasing");
			this.exit();
			return;

		}

		logMessage("pressing buy now");

	    // Press the Buy Now button
	    this.click("#buy-now");

	    this.waitForSelector("#shortcut-payment-form", function() {

			logMessage("pressing pay now");
			this.click("#shortcut-payment-btn");

			this.waitForUrl(/payOnlineSuccess/, function() {

				logMessage("purchase complete");

				this.capture(paths.confirmation, undefined, {
		        	format: 'jpg',
		        	quality: 90
		    	});

		    	this.exit();

			});

	    });

    });

});

casper.run();
