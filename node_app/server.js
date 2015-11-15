var debug = require('debug');
var express = require('express');
var bodyParser = require('body-parser');

var live = require('./live');
var midi = require("./midi");

var debugmidi = debug("webmidi:midi");
var debugsockets = debug("webmidi:sockets");

var app = express();
var port = process.env.PORT || 3000;
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({
    extended: true
})); // for parsing application/x-www-form-urlencoded

var http = require('http');
var server = http.createServer(app);
server.listen(port);


// https support -- useful if you want to plugin a midi device and receive sysex messages.
//var fs = require('fs');
//var privateKey = fs.readFileSync('/private/etc/apache2/server.key', 'utf8');
//var certificate = fs.readFileSync('/private/etc/apache2/server.crt', 'utf8');
//var credentials = {key: privateKey, cert: certificate};
//var https = require('https');
//var httpsServer = https.createServer(credentials, app);
//httpsServer.listen(4430);
//var io = require('socket.io')(httpsServer);

var io = require('socket.io')(server);


var fillerInterval = 50 ;

io.on('connection', function (socket) {
    var done = false;
    var fillerTimeout = null;

    socket.on("disconnect", function () {
        done = true;
        if (fillerTimeout) {
            clearTimeout(fillerTimeout);
        }
    });

    function sendFiller() {
        if (!done) {
            socket.send("filler");
            if (Date.now() - socket.conn.lastMidi < 1000) {
                fillerTimeout = setTimeout(sendFiller, fillerInterval);
            }
        }
    }

    socket.conn.startFiller = function () {
        socket.conn.lastMidi = Date.now();
        if (!fillerTimeout) {
            fillerTimeout = setTimeout(sendFiller, fillerInterval);
        }
    };

    socket.conn.on('packetCreate', function (d) {
        if (d.data !== '2["message","filler"]') {
            // we're already sending a packet, so cancel next filler
            if (fillerTimeout) {
                clearTimeout(fillerTimeout);
                fillerTimeout = setTimeout(sendFiller, fillerInterval);
            }
        }
    });

    socket.on('message', function (data) {
        live.request(data).then(
            function (data) {
                socket.send(data);
            }
        );
        midi.sendMidi([240, 247]);
    });
});


// set the static files location
app.use('/', express.static(__dirname + "/.."));

var ioevents = io.of("/events");
var iomidi = io.of("/midi");

iomidi.on('connection', function (socket) {
    socket.on('message', function (data) {
        socket.conn.startFiller();
        socket.send("ack"); // this trick should prevent nagle's algorithm. Some serious profiling is needed to be sure http://stackoverflow.com/a/13406438/34871
        if (!data.notes && data.constructor !== Array) { // tried to send filler packets to force flushing, so data.notes will be not present for them
            return;
        }

        var notes;
        if (data.constructor === Array) {
            notes = data;
        } else {
            notes = data.notes;
        }
        // split in chunks, as node-midi's buffer is limited
        for (var i = 0; i < notes.length; i += 100) {
            midi.sendMidi(notes.slice(i, i + 100), data.name);
        }
    });
});


midi.input.on('message', function (deltaTime, message, name) {
    if (!name) {
        debugmidi(deltaTime, message);
        iomidi.send(message);
    } else {
        debugmidi(deltaTime, message, name);
        iomidi.send({notes: message, name: name});
    }
});

live.updateStream.on('data', function (msg) {
    ioevents.send(msg.toString('utf8'));
});

exports = module.exports = app;
