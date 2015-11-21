#!/usr/bin/env node

var config = require('config');

var winston = require('winston');
var stripAnsi = require('strip-ansi');

winston.add(winston.transports.File, { filename: 'log/login.log', colorize: false });

winston.info("Fetching authentication credentials...");

var Antigate = require('antigate');
var ag = new Antigate(config.antigate.api_key);

var Spooky = require('spooky');

var fs = require('fs');

if (fs.existsSync('./data/cookies.txt')) {
    fs.unlinkSync('./data/cookies.txt');
}
if (fs.existsSync('./data/captcha.jpg')) {
    fs.unlinkSync('./data/captcha.jpg');
}
if (fs.existsSync('./data/captcha.txt')) {
    fs.unlinkSync('./data/captcha.txt');
}

var spooky = new Spooky({
    child: {
        transport: 'http',
        port: config.port
    },
    casper: {
        logLevel: 'info',
        verbose: false
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

            this.emit('captcha_captured');

            this.log('Waiting for 30 seconds for antigate...', 'info');
            this.wait(30000, function() {

                this.log('30 seconds finished, continuing...', 'info');

            });

        });

    }]);

    spooky.then([{
        password: config.aliexpress.password
    }, function () {

        var fs = require('fs');

        if (!fs.exists('./data/captcha.txt')) {
            die("CAPTCHA not found.");
        }

        var captcha = fs.read('./data/captcha.txt');
        fs.remove('./data/captcha.txt');

        this.log("Filling CAPTCHA: " + captcha, 'info');

        this.sendKeys("#fm-login-checkcode", captcha);
        this.sendKeys("#fm-login-password", password, {keepFocus: true});
        this.sendKeys("#fm-login-password", this.page.event.key.Enter, {keepFocus: true});

        this.waitForUrl('http://www.aliexpress.com/', function() {

            if (this.visible('span.account-unsigned')) {
                die("Login failed.");
            } else {

                this.log("Saving cookies...", 'info');

                var fs = require('fs');
                var cookies = JSON.stringify(phantom.cookies);
                fs.write('./data/cookies.txt', cookies, 644);

            }

        }, undefined, 30000);

    }]);

    spooky.run();

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

spooky.on('captcha_captured', function () {

    winston.info('Sending CAPTCHA to antigate...');
    ag.processFromFile('./data/captcha.jpg', function(error, text, id) {

        if (fs.existsSync('./data/captcha.jpg')) {
            fs.unlinkSync('./data/captcha.jpg');
        }

        if (error) {
            throw error;
        } else {

            winston.info('Received CAPTCHA from antigate: ' + text);
            require('fs').writeFileSync('./data/captcha.txt', text, 'utf8');

        }

    });

});
