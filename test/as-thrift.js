// Copyright (c) 2016 Uber Technologies, Inc.
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

'use strict';

/* jshint maxparams:5 */

var test = require('tape');
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var tcurl = require('../index.js');
var TChannel = require('tchannel');
var TChannelAsThrift = require('tchannel/as/thrift.js');

test('getting an ok response', function t(assert) {

    var serviceName = 'meta';
    var server = new TChannel({
        serviceName: serviceName
    });

    var opts = {isOptions: true};
    var hostname = '127.0.0.1';
    var port;
    var endpoint = 'Meta::health';

    var tchannelAsThrift = TChannelAsThrift({
        entryPoint: path.join(__dirname, '..', 'meta.thrift'),
        allowOptionalArguments: true
    });
    tchannelAsThrift.register(server, endpoint, opts, health);

    function onServerListen() {
        port = server.address().port;
        onListening();
    }

    server.listen(0, hostname, onServerListen);

    function onListening() {
        var cmd = [
            '-p', hostname + ':' + port,
            serviceName,
            endpoint,
            '-t', path.join(__dirname, '..'),
            '-2', JSON.stringify({
                headerName: 'requestHeader'
            })
        ];

        tcurl.exec(cmd, {
            error: function error(err) {
                assert.ifError(err);
            },
            response: function response(res) {
                assert.deepEqual(res.head, {
                    headerName: 'responseHeader'
                }, 'caller receives headers from handler');
                assert.deepEqual(res.body, {
                    ok: true,
                    message: null
                }, 'caller receives thrift body from handler');
            },
            exit: function exit() {
                server.close();
                assert.end();
            }
        });
    }

    function health(options, req, head, body, cb) {
        assert.deepEqual(options, {
            isOptions: true
        }, 'handler receives options through registration');
        assert.deepEqual(head, {
            headerName: 'requestHeader'
        }, 'handler receives request header from CLI');
        assert.deepEqual(body, {}, 'handler receives body from CLI');
        cb(null, {
            ok: true,
            head: {
                headerName: 'responseHeader'
            },
            body: {
                ok: true
            }
        });
    }

});

test('hitting non-existent endpoint', function t(assert) {

    var serviceName = 'meta';
    var server = new TChannel({
        serviceName: serviceName
    });

    var hostname = '127.0.0.1';
    var port;
    var endpoint = 'Meta::health';
    var nonexistentEndpoint = endpoint + 'Foo';

    var tchannelAsThrift = TChannelAsThrift({
        entryPoint: path.join(__dirname, '..', 'meta.thrift')
    });
    tchannelAsThrift.register(server, endpoint, {}, noop);

    function onServerListen() {
        port = server.address().port;
        onListening();
    }

    server.listen(0, hostname, onServerListen);

    function onListening() {
        var cmd = [
            '-p', hostname + ':' + port,
            serviceName,
            nonexistentEndpoint,
            '-t', path.join(__dirname, '..')
        ];

        tcurl.exec(cmd, {
            error: function error(err) {
                assert.equal(err,
                    nonexistentEndpoint + ' endpoint does not exist',
                    'Warned about non-existent endpoint');
            },
            response: function response(res) {
                assert.fail('should be no response');
            },
            exit: function exit(err) {
                server.close();
                assert.end(err);
            }
        });
    }

    function noop() {}

});

test('fails to run for invalid thrift', function t(assert) {

    var serviceName = 'meta';
    var server = new TChannel({
        serviceName: serviceName
    });

    var hostname = '127.0.0.1';
    var port;

    function onServerListen() {
        port = server.address().port;
        onListening();
    }

    server.listen(0, hostname, onServerListen);

    function onListening() {

        var cmd = [
            '-p', [hostname, port].join(':'),
            'no-service',
            'no-endpoint',
            '-t', path.join(__dirname, 'legacy.thrift')
        ];

        tcurl.exec(cmd, {
            errorNo: 0,
            error: function error(err) {
                this['error' + (this.errorNo++)](err);
            },
            error0: function error0(err) {
                assert.equal(err, 'Error parsing Thrift IDL');
            },
            error1: function error1(err) {
                assert.equal(err.message,
                    'every field must be marked optional, ' +
                    'required, or have a default value on Feckless including ' +
                    '"ambiguity" in strict mode', 'expected thrift IDL validation error');
            },
            error2: function error2(err) {
                assert.equal(err, 'Consider using --no-strict to bypass mandatory optional/required fields');
            },
            exit: function exit() {
                assert.equal(this.errorNo, 3, 'expect three error lines');
                server.close();
                assert.end();
            }
        });
    }

});

test('tolerates loose thrift with --no-strict', function t(assert) {

    var serviceName = 'legacy';
    var server = new TChannel({
        serviceName: serviceName
    });

    var hostname = '127.0.0.1';
    var port;

    function onServerListen() {
        port = server.address().port;
        onListening();
    }

    server.listen(0, hostname, onServerListen);

    var tchannelAsThrift = TChannelAsThrift({
        entryPoint: path.join(__dirname, 'legacy.thrift'),
        strict: false
    });
    tchannelAsThrift.register(server, 'Pinger::ping', {}, ping);

    function onListening() {

        var cmd = [
            '-p', [hostname, port].join(':'),
            'legacy',
            'Pinger::ping',
            '--no-strict',
            '-t', path.join(__dirname, 'legacy.thrift')
        ];

        tcurl.exec(cmd, {
            responded: false,
            error: function error(err) {
                assert.ifError(err);
            },
            response: function response(res) {
                assert.deepEquals(res, {
                    ok: true,
                    body: {pong: true},
                    head: {},
                    headers: {as: 'thrift'},
                    typeName: undefined
                }, 'response ok');
                this.responded = true;
            },
            exit: function exit() {
                assert.ok(this.responded, 'response expected');
                server.close();
                assert.end();
            }
        });
    }

});

test('use a thrift include', function t(assert) {

    var serviceName = 'users';
    var server = new TChannel({
        serviceName: serviceName
    });

    var opts = {isOptions: true};
    var hostname = '127.0.0.1';
    var port;
    var endpoint = 'Users::getUser';
    var userName = 'Bob';

    var tchannelAsThrift = TChannelAsThrift({
        entryPoint: path.join(__dirname, 'users.thrift'),
        allowOptionalArguments: true
    });
    tchannelAsThrift.register(server, endpoint, opts, getUser);

    function onServerListen() {
        port = server.address().port;
        onListening();
    }

    server.listen(0, hostname, onServerListen);

    function onListening() {
        var cmd = [
            '-p', hostname + ':' + port,
            serviceName,
            endpoint,
            '[', '--name', userName, ']',
            '-t', path.join(__dirname, 'users.thrift')
        ];

        tcurl.exec(cmd, {
            error: function error(err) {
                       console.log(err);
                assert.ifError(err);
            },
            response: function response(res) {
                assert.deepEqual(res.body, {
                    name: userName
                }, 'caller receives thrift body from handler');
            },
            exit: function exit() {
                server.close();
                assert.end();
            }
        });
    }

    function getUser(options, req, head, body, cb) {
        cb(null, {
            ok: true,
            head: {
            },
            body: {
                name: userName
            }
        });
    }

});

test('getting an ok response with subprocess', function t(assert) {

    var serviceName = 'meta';
    var server = new TChannel({
        serviceName: serviceName
    });

    var opts = {isOptions: true};
    var hostname = '127.0.0.1';
    var port;
    var endpoint = 'Meta::health';

    var tchannelAsThrift = TChannelAsThrift({
        entryPoint: path.join(__dirname, '..', 'meta.thrift')
    });
    tchannelAsThrift.register(server, endpoint, opts, health);

    function health(options, req, head, body, cb) {
        assert.deepEqual(options, {
            isOptions: true
        }, 'handler receives options through registration');
        assert.deepEqual(head, {
            headerName: 'requestHeader'
        }, 'handler receives request header from CLI');
        assert.deepEqual(body, {}, 'handler receives body from CLI');
        cb(null, {
            ok: true,
            head: {
                headerName: 'responseHeader'
            },
            body: {
                ok: true
            }
        });
    }

    function onServerListen() {
        port = server.address().port;
        onListening();
    }

    server.listen(0, hostname, onServerListen);

    function onListening() {
        var cmd = [
            path.join(__dirname, '..', 'index.js'),
            '-p', hostname + ':' + port,
            serviceName,
            endpoint,
            '-t', path.join(__dirname, '..'),
            '--headers', '[', '--headerName', 'requestHeader', ']'
        ];

        var proc = spawn('node', cmd);
        proc.stdout.setEncoding('utf-8');
        proc.stdout.on('data', onStdout);
        proc.stderr.setEncoding('utf-8');
        proc.stderr.on('data', onStderr);
        proc.on('exit', onExit);

        function onStdout(line) {
            var res = JSON.parse(line);
            assert.ok(res.ok, 'should be ok');
            assert.deepEquals(res.head, {headerName: 'responseHeader'}, 'should include response head');
            assert.deepEquals(res.headers, {as: 'thrift'}, 'should be as thrift');
            var trace = parseInt(res.trace, 16);
            assert.ok(trace === trace, 'trace is hexadecimal');
        }

        function onStderr(line) {
            console.error(line);
            assert.fail('no stderr expected');
        }

        function onExit(code) {
            assert.equal(code, 0, 'exits with status 0');
            server.close();
            assert.end();
        }
    }
});

function ping(options, req, head, body, cb) {
    cb(null, {ok: true, head: {}, body: {pong: true}});
}
