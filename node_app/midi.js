var debug = require('debug');
var debugmidi = debug("webmidi:midi");
var Q = require('q');
var midi = require('midi');

var MidiManager = {
    sendMidi: function (data, name) {
        var output ;
        if (name) {
            output = this.getVirtualPort(name).output;
        } else {
            output = this.output;
        }
        output.sendMessage(data);
    },
    getVirtualPort: function (name) {
        if (!this.virtualPorts[name]) {
            var obj = {};
            obj.output = new midi.output();
            obj.output.openVirtualPort(name);

            obj.input = new midi.input();
            obj.input.openVirtualPort(name);
            obj.input.ignoreTypes(false, false, false);

            obj.input.on('message', function (deltaTime, message) {
                for (var cb of MidiManager.subscribers) {
                    cb(deltaTime, message, name);
                }
            });
            this.virtualPorts[name] = obj;
        }
        return this.virtualPorts[name];
    },
    setUp: function () {
        this.subscribers = [];
        this.virtualPorts = {};

        var output = new midi.output();
        var isWin = /^win/.test(process.platform);
        
        if (!isWin) {
            output.openVirtualPort("WebAPI");
        } else {
            for (var i=0;i<output.getPortCount();++i) {
                if (output.getPortName(i) === "WebAPI in") { // "in" is named from live's perspecive.
                    output.openPort(i);
                    break;
                }
                if (i >= output.getPortCount()) {
                    throw "Please install loopmidi and name a device 'WebAPI in'";
                }       
            }
        }
        this.output = output;

        var input = new midi.input();
        if (!isWin) {
            input.openVirtualPort("WebAPI");
        } else {
            for (var i=0;i<input.getPortCount();++i) {
                if (input.getPortName(i) === "WebAPI out") { // "out" is named from live's perspecive.
                    input.openPort(i);
                    break;
                }
                if (i >= input.getPortCount()) {
                    throw "Please install loopmidi and name a device 'WebAPI out'";
                }
            }
        }

        input.ignoreTypes(false, false, false);
        this.nodeinput = input;

        this.nodeinput.on('message', function (deltaTime, message) {
            for (var cb of MidiManager.subscribers) {
                cb(deltaTime, message);
            }
        });

        this.input = {
            on: function (type, cb) {
                if (type !== "message") {
                    throw "Only message is accepted";
                }
                MidiManager.subscribers.push(cb);
            }
        };
    }
};
MidiManager.setUp();

module.exports = MidiManager;
