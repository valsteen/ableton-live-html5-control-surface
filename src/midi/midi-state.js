/* jshint -W097 */
"use strict";

import { iomidi } from 'io';

export var NOTES = [
    {'note': 'C', 'sharp': false},
    {'note': 'C', 'sharp': true},
    {'note': 'D', 'sharp': false},
    {'note': 'D', 'sharp': true},
    {'note': 'E', 'sharp': false},
    {'note': 'F', 'sharp': false},
    {'note': 'F', 'sharp': true},
    {'note': 'G', 'sharp': false},
    {'note': 'G', 'sharp': true},
    {'note': 'A', 'sharp': false},
    {'note': 'A', 'sharp': true},
    {'note': 'B', 'sharp': false}
];

var registry = {};

class ChannelClass {
    constructor(channel) {
        this.channel = channel;
        this.observers = new Set();
        this.notes = new Map();
        this.activeMidiStates = new Map();
        this.deletedNotes = new Map(); // helps an observer to redraw only what is needed
        this.inUse = false; // indicates the user is currently using the channel via a controller

        for (var i = 0; i < 128; ++i) {
            var midiState = MidiState({key: i, channel: channel});

            this.notes.set(i, midiState);

            if (midiState.active) {
                this.activeMidiStates.set(midiState.key, midiState);
            }

            Object.observe(midiState, (changes) => {
                this.deletedNotes.clear();
                var done = new Set();
                var lastActivatedNote = null;
                for (var change of changes) {
                    if (change.name === "active") {
                        if (change.object.active) {
                            if (!change.oldValue) {
                                lastActivatedNote = change.object;
                                this.activeMidiStates.set(change.object.key, change.object);
                            }
                        } else {
                            if (change.oldValue) {
                                this.deletedNotes.set(change.object.key, change.object);
                                this.activeMidiStates.delete(change.object.key);
                            }
                        }
                    }
                }

                if (this.mono && lastActivatedNote) {
                    for (let midiState of this.activeMidiStates.values()) {
                        if (midiState !== lastActivatedNote) {
                            midiState.deactivate("channel");
                        }
                    }
                }

                for (var observer of this.observers) {
                    observer(changes);
                }
            });
        }
    }

    observe(cb) {
        this.observers.add(cb);
    }

    unobserve(cb) {
        this.observers.remove(cb);
    }

    stopNotes() {
        iomidi.emit('message', [175 + this.channel, 123, 0]);
        for (var midiState of this.activeMidiStates.values()) {
            midiState.deactivate("channel");
        }
    }
}

var channels = {};

export function Channel(channel) {
    if (!channels[channel]) {
        channels[channel] = new ChannelClass(channel);
    }
    return channels[channel];
}

class MidiStateClass {
    constructor(obj) {
        Object.assign(this, obj);

        if (!this.isControl && !this.isPitchBend) {
            this.active = false;
        }

        if (this.velocity === undefined) {
            this.velocity = 0;
        }

        this.name = this.note + (this.sharp ? '#' : '') + this.octave;

        Object.observe(this, dispatch);
    }

    get isKey() {
        return !this.isControl && !this.isPitchBend;
    }

    get code() {
        if (this.active === true || this.active === false) {
            if (!this.active) {
                return 127 + this.channel;
            } else {
                return 143 + this.channel;
            }
        } else if (this.isControl) {
            return 175 + this.channel;
        } else if (this.isPitchBend) {
            return 223 + this.channel;
        }
    }

    activate(value, modifier) {
        if (this.isKey) {
            if (!this.active || this.value !== value) {
                this.value = value;
                this.active = true;
                this.lastModifier = modifier;
            }
        } else {
            if (this.value !== value) {
                this.value = value;
                this.lastModifier = modifier;
            }
        }
        iomidi.emit('message', this.midiMessage);
    }

    deactivate(modifier) {
        if (this.isKey) {
            if (this.active) {
                this.value = 0;
                this.active = false;
                this.lastModifier = modifier;
            }
        } else {
            if (this.value !== 0) {
                this.value = 0;
                this.lastModifier = modifier;
            }
        }
        iomidi.emit('message', this.midiMessage);
    }

    pitchbend(value) {
        iomidi.emit('message', [223 + this.channel, value[0], value[1]]);
    }

    aftertouch(value) {
        iomidi.emit('message', [207 + this.channel, value, 0]);
    }

    get value() {
        return this.velocity; // could change for other controls
    }

    set value(value) {
        this.velocity = value;
    }

    get midiMessage() {
        return [this.code, this.key || 0, this.velocity];
    }

    get note() {
        var res = NOTES[this.key % 12];
        return res ? res.note : "-";
    }

    get octave() {
        return Math.floor(this.key / 12) - 2;
    }

    get sharp() {
        var res = NOTES[this.key % 12];
        return res ? (res.sharp ? "#" : "") : "";
    }

    toString() {
        return this.name;
    }
}

function dispatch(changes) {
    var changeset = new Set(changes.map(x => x.object));
    for (var observer of MidiState.observers) {
        observer(changeset);
    }
}

export function MidiState(obj) {
    // obj must contain isControl, key, channel
    obj.id = (obj.isControl ? "control:" : obj.isPitchBend ? "pitchbend:" : "note:") + (obj.key || "0") + ":" + obj.channel;
    var found = registry[obj.id];

    if (!found) {
        var midiState = new MidiStateClass(obj);
        registry[midiState.id] = midiState;

        return midiState;
    } else {
        if (obj.active !== undefined) {
            found.active = obj.active;
        }
        found.key = obj.key; // relevant for pitchbend
        if (obj.velocity !== undefined) {
            found.velocity = obj.velocity;
        }
        return found;
    }
}

MidiState.observers = [];

MidiState.addObserver = function (observer) {
    MidiState.observers.push(observer);
};

MidiState.fromMidiMessage = function (value) {
    var code = value[0], key = value[1], velocity = value[2];
    var obj;

    if (code > 127 && code < 144) {
        obj = {
            isControl: false,
            isPitchBend: false,
            channel: code - 127,
            active: false
        };
    } else if (code > 143 && code < 160) {
        obj = {
            isControl: false,
            isPitchBend: false,
            channel: code - 143,
            active: true
        };
    } else if (code > 175 && code < 192 && key != 123) {
        obj = {
            isControl: true,
            isPitchBend: false,
            channel: code - 175
        };
    } else if (code > 223 && code < 240) {
        obj = {
            isControl: false,
            isPitchBend: true,
            channel: code - 223
        };
    } else {
        // unknown, return nothing
        return;
    }
    obj.key = key;
    obj.velocity = velocity;

    return MidiState(obj);
};


MidiState.fromNote = function (note, channel) {
    if (channel === undefined) {
        channel = 1;
    }

    var noteindex = NOTES.findIndex(n => n.note == note[0] && n.sharp == (note[0] === '#'));
    var octave = parseInt(note[note.length - 1]) + 2;
    return MidiState({key: (octave - 2) * 12 + noteindex, channel: channel, isControl: false, isPitchBend: false});
};


export default MidiState;
