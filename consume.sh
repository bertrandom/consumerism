#!/bin/bash
URL=$(./get-random-product.js)
casperjs purchase.js --dry-run --web-security=false --url=$URL