var net = require('net');
var debug = require('debug');
var debuglive = debug("webmidi:debuglive");
var Promise = require('bluebird');
var byline = require('byline');
var stream = require('stream');

var REQUEST_PORT = 5553;
var UPDATE_PORT = 5552;

var requestSocket = new net.Socket();
requestSocket.setNoDelay();
requestSocket.on('error', function () {});
requestSocket.on('close', function (e) {
    setTimeout(function () {
        requestSocket.connect({port: REQUEST_PORT, host: '127.0.0.1'});
    }, 1000);
});

var updateSocket = new net.Socket();
updateSocket.setNoDelay();
updateSocket.on('error', function () {});
updateSocket.on('close', function (e) {
    setTimeout(function () {
        updateSocket.connect({port: UPDATE_PORT, host: '127.0.0.1'});
    }, 1000);
});

var updateStream = new byline.LineStream();
updateSocket.pipe(updateStream);

requestSocket.on("connect", function () {
    var stream = byline.createStream(requestSocket);

    stream.on('data', function (data) {
        data = JSON.parse(data.toString('utf8'));
        if (requests[data.messageId]) {
            requests[data.messageId].resolve(data);
            delete requests[data.messageId];
        }
    });
});

requestSocket.connect({port: REQUEST_PORT, host: '127.0.0.1'});
updateSocket.connect({port: UPDATE_PORT, host: '127.0.0.1'});

var requests = {};

function request(data) {
    var promise = new Promise(function (resolve, fail) {
        requests[data.messageId] = {resolve: resolve, fail: fail};
    });

    promise.timeout(30000).catch(function (err) {
        var resolve = requests[data.messageId].resolve;
        delete requests[data.messageId];
        resolve({messageId: data.messageId, error: err.toString()});
    });

    requestSocket.write(JSON.stringify(data) + "\n");
    return promise;
}

module.exports = {
    updateStream: updateStream,
    request: request
};
