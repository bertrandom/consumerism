#!/bin/bash
./login.js
URL=$(./get-random-product.js)
casperjs purchase.js --web-security=false --url=$URL