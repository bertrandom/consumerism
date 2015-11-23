var config = require('config');
var winston = require('winston');

var Antigate = require('antigate');
var ag = new Antigate(config.antigate.api_key);

var Spooky = require('spooky');

var captchaBase64 = '';

var login = {

	getCredentials: function() {

		return new Promise(function (resolve, reject) {

			var spooky = new Spooky({
			    child: {
			        transport: 'http',
			        port: config.port
			    },
			    casper: {
			        logLevel: 'info',
			        verbose: true
			    }
			}, function (err) {

			    if (err) {
			        e = new Error('Failed to initialize SpookyJS');
			        e.details = err;
			        throw e;
			    }

			    spooky.start('https://login.aliexpress.com/');

			    spooky.on('store_image_data', function(imageData) {
			    	winston.info('Saving base64 encoded version of CAPTCHA...');
			    	captchaBase64 = imageData;
			    });

			    spooky.then([{
			        email: config.aliexpress.email
			    }, function () {

			        this.page.switchToFrame("alibaba-login-box");

			        this.sendKeys("#fm-login-id", email, {keepFocus: true});
			        this.sendKeys("#fm-login-id", this.page.event.key.Tab);

			        this.waitUntilVisible('#fm-login-checkcode-img', function() {

			            var imageData = this.captureBase64('png', {
			                top: 340,
			                left: 645,
			                width: 110,
			                height: 40
			            });

			            this.emit('store_image_data', imageData);

			        });

			    }]);

			    spooky.run(function() {
			        this.emit('captcha_captured');
			    });

			});

			spooky.on('error', function (e, stack) {
			    winston.error(e);

			    if (stack) {
			        winston.error(stack);
			    }
			});

			spooky.on('log', function (log) {
				winston.log(log.level, log.message);
			});

			// var agSimulate = function(input, cb) {

			//     setTimeout(function() {
			//         cb(null, 'asdf', 1);
			//     }, 3000);

			// };

			spooky.on('captcha_captured', function () {

			    winston.info('Sending CAPTCHA to antigate...');

			   	ag.process(captchaBase64, function(error, text, id) {
			    // agSimulate(captchaBase64, function(error, text, id) {

			        if (error) {
		            	spooky.destroy();
			        	reject(error);
			        } else {

			            winston.info('Received CAPTCHA text from antigate: ' + text);

			            spooky.start();

			            spooky.on('timed_out', function() {
			            	spooky.destroy();
			            	reject(new Error("Timed out"));
			            });

			            spooky.on('got_credentials', function(cookies) {
			            	spooky.destroy();
			            	resolve(cookies);
			            });

			            spooky.then([{
			                password: config.aliexpress.password,
			                captcha: text
			            }, function () {

			                this.log("Filling CAPTCHA: " + captcha, 'info');

			                this.sendKeys("#fm-login-checkcode", captcha);
			                this.sendKeys("#fm-login-password", password, {keepFocus: true});
			                this.sendKeys("#fm-login-password", this.page.event.key.Enter, {keepFocus: true});

			                this.waitForUrl('http://www.aliexpress.com/', function() {

			                    if (this.visible('span.account-unsigned')) {
			                        this.die("Login failed.");
			                    } else {

			                        this.log("Saving cookies...", 'info');
			                        this.emit('got_credentials', phantom.cookies);

			                    }

			                }, function() {

			                    this.echo("Timed out");
			                    this.emit("timed_out");

			                }, 10000);

			            }]);

			            spooky.run();

			        }

			    });

			});

		});

	}

};

module.exports = login;