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
        output.openVirtualPort("WebAPI");
        this.output = output;

        var input = new midi.input();
        input.openVirtualPort("WebAPI");
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

function request() {
    MidiManager.sendMidi([240, 247]);
}

MidiManager.request = request;
module.exports = MidiManager;
