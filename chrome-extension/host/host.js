#!/usr/local/bin/node
var zmq = require('zmq');
var util = require('util');

var serverInSocket = new zmq.Socket('pull');
serverInSocket.bind("tcp://127.0.0.1:5560");

var serverOutSocket = new zmq.Socket('push');
serverOutSocket.bind('tcp://127.0.0.1:5561');

var nativeMessage = require('chrome-native-messaging');

var input = new nativeMessage.Input();
var output = new nativeMessage.Output();

process.stdin.pipe(input);
output.pipe(process.stdout);

input.on('data', function (msg) {
    if (msg[1] === "offer") {
        serverOutSocket.send(JSON.stringify({method: msg[1], parameters: msg[2]}));
    } else if (msg[1] === "midi") {
        if (msg[2].name) {
            serverOutSocket.send(JSON.stringify({bytes: msg[2].notes, name: msg[2].name}));
        } else {
            serverOutSocket.send(JSON.stringify({bytes: msg[2]}));
        }
    } else {
        msg[2].method = msg[1];
        liveOutSocket.send([msg[0], JSON.stringify(msg[2])]);
        serverOutSocket.send('{"bytes":[240,247]}'); // interrupt-like signaling to Live
    }
});

serverInSocket.on('message', function (msg) {
    output.write(msg.toString('utf8'));
});

var liveInSocket = new zmq.Socket('pull');
liveInSocket.connect("tcp://127.0.0.1:5554");

var liveOutSocket = new zmq.Socket('push');
liveOutSocket.connect("tcp://127.0.0.1:5553");

liveInSocket.on('message', function (message) {
    output.write(message.toString('utf8'));
});