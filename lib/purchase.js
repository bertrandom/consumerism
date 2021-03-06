var config = require('config');
var winston = require('winston');
var Spooky = require('spooky');

var Promise = require('bluebird');

var Antigate = require('antigate');
var ag = new Antigate(config.antigate.api_key);

var fs = require('fs');

var captchaBase64 = '';

var purchase = {

    purchaseProduct: function(productUrl, cookies) {

        winston.info('Purchasing: ' + productUrl);

        if (fs.existsSync('./data/captcha.jpg')) {
            fs.unlinkSync('./data/captcha.jpg');
        }

        return new Promise(function (resolve, reject) {

            var spooky = new Spooky({
                child: {
                    transport: 'http',
                    port: config.port
                },
                casper: {
                    logLevel: 'info',
                    verbose: true,
                    viewportSize: {
                        width: 1600, 
                        height: 950
                    }
                }
            }, function (err) {

                if (err) {
                    e = new Error('Failed to initialize SpookyJS');
                    e.details = err;
                    throw e;
                }

                spooky.start();

                spooky.on('captcha_triggered', function(msg) {
                    spooky.destroy();
                    winston.error(msg);
                    reject(new Error(msg));
                });

                spooky.on('signed_out', function(msg) {
                    spooky.destroy();
                    winston.error(msg);
                    reject(new Error(msg));
                });

                spooky.on('timed_out', function(msg) {
                    spooky.destroy();
                    winston.error(msg);
                    reject(new Error(msg));
                });

                spooky.on('price_is_too_damn_high', function(msg) {
                    spooky.destroy();
                    winston.error(msg);
                    reject(new Error(msg));
                });

                spooky.on('purchase_complete', function() {
                    spooky.destroy();
                    resolve();
                });

                spooky.on('captcha_captured', function () {

                    if (!fs.existsSync('./data/captcha.jpg')) {
                        return;
                    }

                    winston.info('Sending CAPTCHA to antigate...');

                    ag.processFromFile('./data/captcha.jpg', function(error, text, id) {
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

                            spooky.then([{
                                captcha: text,
                                expMonth: config.aliexpress.cc.exp_month,
                                expYear: config.aliexpress.cc.exp_year
                            }, function () {

                                this.log("Filling CAPTCHA: " + captcha, 'info');

                                var prefix = new Date().toISOString();

                                var paths = {
                                    product: "screenshots/" + prefix + "-product.jpg",
                                    full: "screenshots/" + prefix + "-full.jpg",
                                    thumbnail: "screenshots/" + prefix + "-thumbnail.jpg",
                                    confirmation: "screenshots/" + prefix + "-confirmation.jpg"
                                };

                                if (this.exists('#captcha-input')) {

                                    this.sendKeys("#captcha-input", captcha);

                                    this.click('#place-order-btn');

                                    this.waitForUrl(/checkout\.htm/, function() {

                                        // <button type="submit" id="j-paynow" class="i-button" seed="pay-jPaynow" smartracker="on">Pay Now</button>
                                        this.click('#j-paynow');


                                        //  https://icashier.alipay.com/payment/payment-result.htm?orderId=xxx&requestId=xxx&from=icashier&signData=xxx&paymentMethod=FASTPAY&securityId=xxx

                                        // <div class="i-result-content">
                                        //   <i class="i-result-icon i-iconfont i-iconfont-success"></i>
                                        //   <h2>Thank you for your payment! We have received your payment.</h2>
                                        //   <p>Thank you for shopping with AliExpress! Click below to see your Order List.</p>
                                        //   <p class="i-result-link">
                                        //        <a href="https://ilogin.alipay.com/loginToAliexpress.htm?goto=http%3A%2F%2Ftrade.aliexpress.com%2Forder_list.htm">Back to AliExpress</a>
                                        //   </p>
                                        // </div>

                                        this.waitForUrl(/payment-result\.htm/, function() {

                                            this.log(this.getCurrentUrl(), 'info');
                                            this.log('purchase complete', 'info');

                                            this.capture(paths.confirmation, undefined, {
                                                format: 'jpg',
                                                quality: 90
                                            });

                                            this.emit('purchase_complete');

                                        }, function() {

                                            this.capture(paths.confirmation, undefined, {
                                                format: 'jpg',
                                                quality: 90
                                            });
                                            this.log(this.getCurrentUrl(), 'info');

                                            this.page.switchToChildFrame(0);

                                            this.sendKeys("#cardMonth", expMonth);
                                            this.sendKeys("#cardYear", expYear);
                                            this.click('#submitBtn');

                                            this.waitForUrl(/payment-result\.htm/, function() {

                                                this.log(this.getCurrentUrl(), 'info');
                                                this.log('purchase complete', 'info');

                                                this.capture(paths.confirmation, undefined, {
                                                    format: 'jpg',
                                                    quality: 90
                                                });

                                                this.emit('purchase_complete');

                                            }, function() {

                                                this.log(this.getHTML(), 'info');
                                                this.log(this.getCurrentUrl(), 'info');

                                                this.emit('timed_out', 'Did not pass alipay verification, payment result did not show up.');

                                            }, 10000);

                                            // this.log(this.getHTML(), 'info');
                                            // this.log(this.getCurrentUrl(), 'info');

                                            // this.emit('timed_out', 'Clicked pay now, payment result did not show up.');

                                        }, 10000);

                                    }, function() {

                                        this.capture(paths.confirmation, undefined, {
                                            format: 'jpg',
                                            quality: 90
                                        });
                                        this.log(this.getHTML(), 'info');
                                        this.log(this.getCurrentUrl(), 'info');
                                        this.emit('timed_out', 'Clicked place order, alipay checkout did not show up.');

                                    }, 10000);

                                } else {

                                    this.sendKeys("input.qp-captcha-text", captcha);

                                    this.click("#shortcut-payment-btn");

                                    this.waitForUrl(/payOnlineSuccess/, function() {

                                        this.log('purchase complete', 'info');

                                        this.capture(paths.confirmation, undefined, {
                                            format: 'jpg',
                                            quality: 90
                                        });

                                        this.emit('purchase_complete');

                                    }, function() {

                                        this.capture(paths.confirmation, undefined, {
                                            format: 'jpg',
                                            quality: 90
                                        });

                                        this.emit('timed_out', 'Pay now click timed out');

                                    }, 10000);

                                }

                            }]);

                            spooky.run();

                        }

                    });

                });             

                spooky.then([{
                    cookies: cookies,
                    productUrl: productUrl
                }, function() {

                    phantom.cookies = cookies;

                    this.userAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.86 Safari/537.36');

                    this.open(productUrl).then(function() {

                        if (this.visible('span.account-unsigned')) {
                            this.emit('signed_out', 'Not signed-in. There is an issue with the cookies, please extract new ones.');
                            return;
                        }

                        this.evaluate(function() {
                            document.body.bgColor = 'white';
                        });

                        this.log("opened product page", "info");

                        this.waitForSelector('span.total-price', function() {

                            var price = 0.00;

                            var priceRaw = this.fetchText('span.total-price');
                            var priceMatch = priceRaw.match(/([0-9\.])+/);

                            if (priceMatch) {
                                price = parseFloat(priceMatch[0]);
                            }

                            this.log('fetched initial price ' + price.toFixed(2), 'info');

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

                                    this.log('selecting option ' + id, 'info');

                                    this.click("#" + id);

                                    priceRaw = this.fetchText('span.total-price');
                                    priceMatch = priceRaw.match(/([0-9\.])+/);

                                    if (priceMatch) {
                                        price = parseFloat(priceMatch[0]);
                                    }

                                    this.log('updated price ' + price.toFixed(2), 'info');

                                    if (price > 0 && price <= 1.00) {
                                        break;
                                    }

                                }

                            }

                            if (price == 0 || price > 1.00) {

                                this.emit('price_is_too_damn_high', 'Price is out of bounds after trying all options.');
                                return;

                            }

                            var prefix = new Date().toISOString();

                            var paths = {
                                product: "screenshots/" + prefix + "-product.jpg",
                                full: "screenshots/" + prefix + "-full.jpg",
                                thumbnail: "screenshots/" + prefix + "-thumbnail.jpg",
                                confirmation: "screenshots/" + prefix + "-confirmation.jpg"
                            };

                            this.log('capturing screenshots', 'info');
                            this.log(paths, 'info');

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

                            this.log('save product thumbnail URL ' + this.getElementAttribute('a.ui-image-viewer-thumb-frame img', 'src'), 'info');

                            // if (casper.cli.options['dry-run']) {

                            //  logMessage("dry run, completing without purchasing");
                            //  this.exit();
                            //  return;

                            // }

                            this.log('pressing buy now', 'info');

                            // Press the Buy Now button
                            this.click("#buy-now");

                            this.waitForSelector("#shortcut-payment-form", function() {

                                this.log('pressing pay now', 'info');

                                if (this.exists("img.qp-checkcode-img")) {

                                    this.wait(5000, function() {

                                        this.captureSelector('./data/captcha.jpg', 'img.qp-checkcode-img');
//                                      this.emit('captcha_captured');

                                    });

                                } else {

                                    this.click("#shortcut-payment-btn");

                                    this.waitForUrl(/payOnlineSuccess/, function() {

                                        this.log('purchase complete', 'info');

                                        this.capture(paths.confirmation, undefined, {
                                            format: 'jpg',
                                            quality: 90
                                        });

                                        this.emit('purchase_complete');

                                    }, function() {

                                        this.capture(paths.confirmation, undefined, {
                                            format: 'jpg',
                                            quality: 90
                                        });

                                        this.emit('timed_out', 'Pay now click timed out');

                                    }, 10000);

                                }

                            }, function() {

                                // http://shoppingcart.aliexpress.com/order/confirm_order.htm?objectId=xxx&from=aliexpress&countryCode=US&shippingCompany=Other&promiseId=&itemCondition=&aeOrderFrom=main_detail&quantity=1&skuAttr=14:29

                                this.waitForUrl(/confirm_order\.htm/, function() {
                                    
                                    if (this.exists('#captcha-image')) {

                                        this.log('captcha exists', 'info');
                                        this.captureSelector('./data/captcha.jpg', '#captcha-image');

                                    } else {

                                        this.click('#place-order-btn');

                                        this.waitForUrl(/checkout\.htm/, function() {

                                            // <button type="submit" id="j-paynow" class="i-button" seed="pay-jPaynow" smartracker="on">Pay Now</button>
                                            this.click('#j-paynow');


                                            //  https://icashier.alipay.com/payment/payment-result.htm?orderId=xxx&requestId=xxx&from=icashier&signData=xxx&paymentMethod=FASTPAY&securityId=xxx

                                            // <div class="i-result-content">
                                            //   <i class="i-result-icon i-iconfont i-iconfont-success"></i>
                                            //   <h2>Thank you for your payment! We have received your payment.</h2>
                                            //   <p>Thank you for shopping with AliExpress! Click below to see your Order List.</p>
                                            //   <p class="i-result-link">
                                            //        <a href="https://ilogin.alipay.com/loginToAliexpress.htm?goto=http%3A%2F%2Ftrade.aliexpress.com%2Forder_list.htm">Back to AliExpress</a>
                                            //   </p>
                                            // </div>

                                            this.waitForUrl(/payment-result\.htm/, function() {

                                                this.log(this.getCurrentUrl(), 'info');
                                                this.log('purchase complete', 'info');

                                                this.capture(paths.confirmation, undefined, {
                                                    format: 'jpg',
                                                    quality: 90
                                                });

                                                this.emit('purchase_complete');

                                            }, function() {

                                                this.capture(paths.confirmation, undefined, {
                                                    format: 'jpg',
                                                    quality: 90
                                                });
                                                this.log(this.getHTML(), 'info');
                                                this.log(this.getCurrentUrl(), 'info');
                                                this.emit('timed_out', 'Clicked pay now, payment result did not show up.');

                                            }, 10000);

                                        }, function() {

                                            this.capture(paths.confirmation, undefined, {
                                                format: 'jpg',
                                                quality: 90
                                            });
                                            this.log(this.getHTML(), 'info');
                                            this.log(this.getCurrentUrl(), 'info');
                                            this.emit('timed_out', 'Clicked place order, alipay checkout did not show up.');

                                        }, 10000);

                                    }

                                }, function() {

                                    this.capture(paths.confirmation, undefined, {
                                        format: 'jpg',
                                        quality: 90
                                    });
                                    this.log(this.getHTML(), 'info');
                                    this.log(this.getCurrentUrl(), 'info');
                                    this.emit('timed_out', 'Clicked buy now, dialog did not show up and confirm order screen did not show up.');

                                }, 10000);

                            }, 10000);

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

            spooky.on('log', function (log) {
                winston.log(log.level, log.message);
            });

        });

    }

};

module.exports = purchase;