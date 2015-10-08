var debug = require('debug');
var debugzmq = debug("webmidi:zmq");
var zmq = require('zmq');
var Q = require('q');

var rtcInSocket = new zmq.Socket('push');
var rtcOutSocket = new zmq.Socket('pull');

rtcInSocket.connect("tcp://127.0.0.1:5560");
rtcOutSocket.connect("tcp://127.0.0.1:5561");

module.exports = {
    send: rtcInSocket.send.bind(rtcInSocket),
    receiver: rtcOutSocket
};
