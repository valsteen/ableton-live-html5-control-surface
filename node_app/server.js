var debug = require('debug');
var express = require('express');
var bodyParser = require('body-parser');
var Promise = require('bluebird');

var zmq = require('./zmq');

var debugmidi = debug("webmidi:midi");
var debugzmq = debug("webmidi:zmq");
var debugrtc = debug("webmidi:rtc");

var RTC = (function () {
    var deferredInstances = [];
    var subscribers = [];

    zmq.receiver.on('message', function (msg) {
        var data = JSON.parse(msg.toString('utf8'));
        if (data.method === "offer") {
            var deferredInstance ;
            while (true) {
                deferredInstance = deferredInstances.shift();
                if (!deferredInstance) {
                    return;
                }
                if (deferredInstance.createdAt + 10000 > Date.now()) {
                    break;
                }
                // otherwise, consider it as an old request to drop.
            }

            deferredInstance.deferred.resolve([data.parameters.offer, data.parameters.id]);
        } else {
            for (var i = 0; i < subscribers.length; ++i) {
                subscribers[i](data.bytes, data.name);
            }
        }
    });

    return {
        getOfferPromise: function () {
            var deferred = Promise.defer();
            zmq.send(JSON.stringify({method: 'offer'}));
            deferredInstances.push({deferred: deferred, createdAt: Date.now()});
            return deferred.promise;
        },
        cancel: function (id) {
            zmq.send(JSON.stringify({method: 'cancel', parameters: {id: id}}));
        },
        answer: function (answer, id) {
            zmq.send(JSON.stringify({method: 'answer', parameters: {answer: answer, id: id}}));
        },
        subscribe: function (cb) {
            subscribers.push(cb);
        },
        send: function (clientId, method, parameters) {
            zmq.send(JSON.stringify({
                method: 'send',
                parameters: {clientId: clientId, method: method, parameters: parameters}
            }));
        },
        broadcast: function (method, parameters) {
            zmq.send(JSON.stringify({
                method: 'broadcast',
                parameters: {'method': method, parameters: parameters}
            }));
        }
    };
})();

// rtc bridge may be out of sync, make it reset its queue
zmq.send(JSON.stringify({method: 'reset'}));


var app = express();
var port = process.env.PORT || 3000;
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({
    extended: true
})); // for parsing application/x-www-form-urlencoded

var http = require('http');
var server = http.createServer(app);
server.listen(port);
var midi = require("./midi");

app.get('/rtc/offer', function (req, res) {
    RTC.getOfferPromise().spread(function (offer, id) {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({'id': id, offer: offer}));
    });
});

app.post('/rtc/answer', function (req, res) {
    RTC.answer(req.body.answer, req.body.id);
    res.send("ok");
});

app.post('/rtc/cancel', function (req, res) {
    RTC.cancel(req.body.id);
    res.send("ok");
});

// set the static files location
app.use('/', express.static(__dirname + "/.."));

RTC.subscribe(function (bytes, name) {
    debugrtc(bytes, name);
    if (name) {
        midi.sendMidi(bytes, name);
    } else {
        for (var i = 0; i < bytes.length; i += 100) {
            midi.sendMidi(bytes.slice(i, i + 100));
        }
    }
});

midi.input.on('message', function (deltaTime, message, name) {
    if (!message.length) {
        // already consumed
        return;
    }
    if (!name) {
        debugmidi(deltaTime, message);
        RTC.broadcast('midi', message);
    } else {
        debugmidi(deltaTime, message, name);
        RTC.broadcast('midi', {notes: message, name: name});
    }
});

exports = module.exports = app;

// https support
var fs = require('fs');
var privateKey = fs.readFileSync('/private/etc/apache2/server.key', 'utf8');
var certificate = fs.readFileSync('/private/etc/apache2/server.crt', 'utf8');
var credentials = {key: privateKey, cert: certificate};
var https = require('https');
var httpsServer = https.createServer(credentials, app);
httpsServer.listen(4430);