var config = require('config');

var Antigate = require('antigate');
var ag = new Antigate(config.antigate.api_key);

var Spooky = require('spooky');
var stripAnsi = require('strip-ansi');

var fs = require('fs');

var login = {

	getCredentials: function(winston) {

		return new Promise(function (resolve, reject) {

			if (fs.existsSync('./data/cookies.txt')) {
			    fs.unlinkSync('./data/cookies.txt');
			}

			if (fs.existsSync('./data/captcha.jpg')) {
			    fs.unlinkSync('./data/captcha.jpg');
			}

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

			    spooky.then([{
			        email: config.aliexpress.email
			    }, function () {

			        this.page.switchToFrame("alibaba-login-box");

			        this.sendKeys("#fm-login-id", email, {keepFocus: true});
			        this.sendKeys("#fm-login-id", this.page.event.key.Tab);

			        this.waitUntilVisible('#fm-login-checkcode-img', function() {

			            this.capture('./data/captcha.jpg', {
			                top: 340,
			                left: 645,
			                width: 110,
			                height: 40
			            }, {
			                format: 'jpg',
			                quality: 100
			            });

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

			spooky.on('console', function (line) {
			    winston.info(stripAnsi(line));
			});

			// var agSimulate = function(input, cb) {

			//     setTimeout(function() {
			//         cb(null, 'asdf', 1);
			//     }, 3000);

			// };

			spooky.on('captcha_captured', function () {

			    winston.info('Sending CAPTCHA to antigate...');

			   	ag.processFromFile('./data/captcha.jpg', function(error, text, id) {
			    // agSimulate('./data/captcha.jpg', function(error, text, id) {

			        if (fs.existsSync('./data/captcha.jpg')) {
			            fs.unlinkSync('./data/captcha.jpg');
			        }

			        if (error) {
			            throw error;
			        } else {

			            winston.info('Received CAPTCHA from antigate: ' + text);

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

			                        var fs = require('fs');
			                        var cookies = JSON.stringify(phantom.cookies);
			                        fs.write('./data/cookies.txt', cookies, 644);
			                        this.emit('got_credentials', cookies);

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