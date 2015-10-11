var debug = require('debug');
var zmq = require('zmq');
var debugzmq = debug("webmidi:zmq");
var Promise = require('bluebird');

var liveInSocket = new zmq.Socket('pull');
var liveOutSocket = new zmq.Socket('push');
var liveSubSocket = new zmq.Socket('sub');

liveInSocket.connect("tcp://127.0.0.1:5554");
liveOutSocket.connect("tcp://127.0.0.1:5553");
liveSubSocket.connect("tcp://127.0.0.1:5552");
liveSubSocket.subscribe("");

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

    liveOutSocket.send(JSON.stringify(data));
    return promise;
}

liveInSocket.on('message', function (data) {
    data = JSON.parse(data.toString('utf8'));
    if (requests[data.messageId]) {
        requests[data.messageId].resolve(data);
        delete requests[data.messageId];
    }
});

module.exports = {
    subscriber: liveSubSocket,
    request: request
};
