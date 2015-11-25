#!/usr/bin/env node

// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/* global console, process */
/* eslint no-console: [0] */
/* eslint no-process-exit: [0] */
'use strict';

var EXIT_CODES = require('./exit-codes');

module.exports = Logger;

function Logger() {
    var self = this;
    self.exitCode = 0;
}

Logger.prototype.log = function log(message) {
    // We only want valid response objects on stdout
    console.error(message);
};

Logger.prototype.error = function error(err) {
    var self = this;

    if (typeof err === 'string') {
        console.error(err);
        return;
    }

    console.log(JSON.stringify({
        ok: false,
        name: err.name,
        message: err.message,
        isError: true,
        isErrorFrame: err.isErrorFrame || false,
        errorCode: err.errorCode,
        type: err.type,
        fullType: err.fullType
    }));

    console.error(err.name + ': ' + err.message);

    if (err.message.lastIndexOf('no peer available', 0) === 0) {
        console.error('This likely means that the service you are trying to reach ' +
            'is not advertising to Hyperbahn.');
    }

};

Logger.prototype.response = function response(res, opts) {
    var self = this;

    if (!res.ok) {
        self.exitCode = self.exitCode | EXIT_CODES.RESPONSE_NOT_OK;
    }

    if (opts.raw) {
        process.stdout.write(res.body);
    } else {
        console.log(JSON.stringify(res));
    }
};

Logger.prototype.exit = function exit() {
    var self = this;
    process.exit(self.exitCode);
};
