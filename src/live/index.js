/* jshint -W097,browser: true, devel: true */
"use strict";

import { Channel } from 'midi/midi-state';
import Promise from 'bluebird';
import { iorequest, ioevents, iomidi } from 'io';

export class LiveParameter { // should inherit from LiveObject and used only for "Parameters"
    constructor(liveObject) {
        this.liveObject = liveObject;
        this.value = 0;
        this.gesture_active = false;
        this.skipQueue = true; // toggle skipQueue if we should prevent the sending of a new value until the previous set command is finished

        let deferrable = Promise.defer(); // dummy deferrable used if no action is queued
        this.queueEmptyPromise = deferrable;
        deferrable.resolve();

        this.ready = Promise.settle([
            liveObject.listen("value", (value) => {
                if (this.gesture_active) {
                    return;
                }
                this.value = value;
                this.active = this.value > 0;
            }),
            this.liveObject.get("value").then((value) => {
                this.value = value;
            }),
            this.liveObject.get('name').then((value) => {
                this.name = value;
            }),
            this.liveObject.get("max").then((value) => {
                this.max = value;
            }),
            this.liveObject.get("min").then((value) => {
                this.min = value;
            })
        ]);

        Object.observe(this, (changes) => {
            if (changes.findIndex(x => x.name === "value") > -1) {
                let gesture_active = this.gesture_active;

                /* in case of last change before releasing */
                let gesture_change = changes.find(x => x.name === "gesture_active");
                if (gesture_change) {
                    gesture_active = gesture_active || gesture_change.oldValue;
                }

                if (liveObject.value !== this.value && gesture_active) {
                    this.publishChanges();
                }
                this.active = this.value > 0;
            }
        });
    }

    valueChanged() {
        this.active = this.value > 0;
    }

    publishChanges() {
        if (this.publishing) {
            // wait for last publish to end
            this.queuedChange = true;
            this.queueEmptyPromise = Promise.defer();
            return;
        }
        this.queuedChange = false; // in case we have new changes while still waiting previous set to finish, call again immediately
        this.publishing = true;
        let finish = () => {
            this.publishing = false;
            this.queueEmptyPromise.resolve();
            if (this.queuedChange) {
                this.publishChanges();
            }
        };

        let setPromise = this.liveObject.set("value", this.value);
        if (this.skipQueue) {
            finish();
            setPromise.done();
        } else {
            setPromise.finally(finish).done();
        }
    }

    toString() {
        return this.name;
    }

    begin_gesture() {
        this.gesture_active = true;

        /* if begin_gesture is used without changing the value, ableton live still plays the automation. Start with a dummy value to actually capture the control */
        if (!(this.min === 0 && this.max === 1)) {
            let dummyValue = this.value + 1;
            if (dummyValue > this.max) {
                dummyValue = this.value - 1;
            }
            return Promise.all([
                this.liveObject.call("begin_gesture"),
                this.liveObject.set("value", dummyValue),
                this.liveObject.set("value", this.value)
            ]).catch(console.info.bind(console));
        } else {
            return this.liveObject.call("begin_gesture");
        }
    }

    end_gesture() {
        if (this.liveObject.value != this.value) {
            // last chance. Value may have changed at the same time gesture has been released
            this.publishChanges();
        }
        return this.queueEmptyPromise.promise.then(() => {
            this.gesture_active = false;
            return this.liveObject.call("end_gesture").catch(console.info.bind(console));
        });
    }
}

var channelTracks = {};

export class LiveSong {
    constructor(liveObject) {
        this.liveObject = liveObject;
        this.ready = this.bind("session_record");
    }

    bind(name) {
        return Promise.settle([
            this.liveObject.listen(name, (value) => {
                this[name] = value;
            }),
            this.liveObject.get(name).then((value) => {
                this[name] = value;
            })
        ]).then(() => {
            Object.observe(this, (changes) => {
                if (changes.findIndex(x => x.name === name) > -1) {
                    if (this[name] !== this.liveObject[name]) {
                        this.liveObject.set(name, this[name]);
                    }
                }
            });
        });
    }
}

export class LiveTrack {
    constructor(liveObject) {
        this.liveObject = liveObject;

        this.ready = Promise.all([
            liveObject.get("current_input_routing"),
            liveObject.get("current_input_sub_routing"),
            liveObject.set("arm", true)
        ]).spread(
            (input_routing, sub_input_routing) => {
                var changes = [];
                var channelNumber = parseInt(sub_input_routing.split(" ")[1]);
                if (isNaN(channelNumber)) {

                    for (channelNumber = 1; channelNumber <= 16; ++channelNumber) {
                        if (channelTracks[channelNumber] === undefined) {
                            break;
                        }
                    }
                    channelTracks[channelNumber] = this;
                    changes.push(liveObject.set("current_input_sub_routing", "Ch. " + channelNumber));
                }

                this.channel = Channel(channelNumber);

                return Promise.all(changes);
            }
        );

        Object.observe(this, (changes) => {
            if (changes.findIndex(x => x.name === "stop") > -1) {
                if (this.stop) {
                    this.channel.stopNotes();
                }
            }
        });
    }

    getHasDrumPads() {
        return this.getNoteNames().then(() => {
            return this.hasDrumPads;
        });
    }

    // gets drum pad names if available, or fallbacks to standard notes names
    getNoteNames() {
        return this.liveObject.list('devices', ["can_have_drum_pads"]).then((devices) => {
            let device = devices.find((device) => device.can_have_drum_pads);
            if (!device) {
                throw "No drum pads";
            }

            return device.list("drum_pads", ["name", "note"]);
        }).then(
            (pads) => {
                this.hasDrumPads = true;
                return new Map(pads.filter(pad => this.channel.notes.get(pad.note).toString() !== pad.name).map(
                    (pad) => [pad.note, {name: pad.name, key: pad.note}]
                ));
            },
            (err) => {
                this.hasDrumPads = false;
                return this.ready.then(() => this.channel.notes);
            }
        );
    }
}

export class LiveClipSlot {
    constructor(liveObject) { // compose with a LiveObject, but we should really extend it
        this.clipslot = liveObject;
        this.notes = [];
        this.queuedChanges = [];
        this.gesture_active = false;

        var updateNotes = () => {
            return this.clip.call("get_notes", this.clip.loop_start, 0, this.clip.loop_end, 128).then((notes) => {
                if (this.queuedChanges.length || this.gesture_active) {
                    // abort if we still have pending changes
                    throw "Rejecting get_notes update, changes pending";
                }
                this.clip.notes = notes.map((note) => {
                    return {
                        pitch: note[0],
                        start: note[1],
                        length: note[2],
                        velocity: note[3],
                        disabled: note[4]
                    };
                });
            });
        };

        // first make sure a clip exists, then fetch all initial values, then we start observing changes
        this.ready = Promise.reduce([
            () => this.get("has_clip"),
            () => {
                if (!this.has_clip) {
                    return this.call("create_clip", 4);
                }
            },
            () => this.get("clip"),
            () => Promise.settle([
                this.clip.set("looping", true),
                this.clip.get("start_marker"),
                this.clip.get("end_marker"),
                this.clip.get("loop_start"),
                this.clip.get("loop_end"),
                this.clip.listen("playing_position"),
                this.clip.listen("loop_start"),
                this.clip.listen("loop_end"),
                this.get("is_playing"),
                this.clip.listen("playing_status", () => this.get("is_playing")),
                this.clip.listen("notes", () => this.queueChange(updateNotes, "updateNotes").done())
            ]),
            () => {
                Object.observe(this.clip, (changes) => {
                    var attributes = new Set(changes.map((x) => x.name));
                    if (attributes.has("loop_end") || attributes.has("loop_start")) {
                        this.queueChange(updateNotes, "updateNotes").done();
                    }
                });
                return updateNotes();
            }
        ], (_, c) => c(_), null).catch((error) => {
            console.error(error);
            throw error;
        });

        Object.observe(this, (changes) => {
            if (changes.find(x => x.name === "play")) {
                if (!this.is_playing && this.play) {
                    this.callPlay();
                } else if (this.is_playing && !this.play) {
                    this.callStop();
                }
            }
            if (changes.find(x => x.name === "is_playing")) {
                this.play = this.is_playing;
            }
        });
    }

    begin_gesture() {
        this.gesture_active = true;
        return Promise.cast();
    }

    end_gesture() {
        this.gesture_active = false;
        return Promise.cast();
    }

    call(attribute) {
        var parameters = Array.prototype.slice.call(arguments, 1);
        parameters.unshift(attribute);
        return this.clipslot.call.apply(this.clipslot, parameters);
    }

    set(attribute, value) {
        return this.clipslot.set(attribute, value);
    }

    get(attribute) {
        return this.clipslot.get(attribute).then((value) => {
            this[attribute.split(".").pop()] = value;
            return value;
        });
    }

    listen(attribute, cb) {
        if (cb === undefined) {
            cb = (value) => {
                this[attribute.split(".").pop()] = value;
            };
        }
        return this.clipslot.listen(attribute, cb);
    }

    applyChanges() {
        let deferrableReady = Promise.defer();
        this.ready = deferrableReady.promise;

        let changes = this.queuedChanges;
        this.applyChangesTimeout = null;
        this.queuedChanges = [];

        let promises = [];

        startBatch();
        for (let change of changes) {
            promises.push(change().then((x) => change.__deferred.resolve(x), (x) => change.__deferred.reject(x)));
        }
        this.promisedChanges = promises;

        Promise.settle(promises).then(deferrableReady.resolve.bind(deferrableReady)).done();
        endBatch();
    }

    queueChange(change, id) {
        var deferred = Promise.defer();
        if (id && this.queuedChanges.findIndex(change => change.__id === id) > -1) {
            deferred.reject(id + " is already queued");
            return deferred.promise;
        }
        change.__id = id;
        change.__deferred = deferred;
        this.queuedChanges.push(change);

        this.ready.then(() => {
            // if many changes are pending this will set/clear the timeout for each one. May be not a problem.
            if (this.applyChangesTimeout) {
                clearTimeout(this.applyChangesTimeout);
            }
            this.applyChangesTimeout = setTimeout(this.applyChanges.bind(this), 20);
        }).done();

        return deferred.promise;
    }

    updateNote(note, pitch, start, length, velocity) {
        if (!this.notesUpdating) {
            this.notesUpdating = new Set();
        }
        if (!this.notesToUpdate) {
            this.notesToUpdate = new Set();
        }

        var original = {pitch: note.pitch, start: note.start, length: note.length, velocity: note.velocity};
        note.pitch = pitch = pitch === undefined ? note.pitch : pitch;
        note.start = start = start === undefined ? note.start : start;
        note.length = length = length === undefined ? note.length : length;
        note.velocity = velocity = velocity === undefined ? note.velocity : velocity;

        if (this.notesUpdating.has(note)) {
            this.notesToUpdate.add(note);
            return Promise.cast();
        }

        this.notesUpdating.add(note);

        return Promise.all([
            // to followup add/removes, add note as it was scheduled, don't take new positions yet
            this.removeNote(original),
            this.addNote({pitch: pitch, start: start, length: length, velocity: velocity})
        ]).then(() => {
            this.notesUpdating.delete(note);
            if (this.notesToUpdate.has(note)) {
                this.notesToUpdate.delete(note);
                // schedule update again. start from the position we just finished setting.
                // then by calling, it will be set again to the new position. Obviously needs refactoring
                var update = {pitch: note.pitch, start: note.start, length: note.length, velocity: note.velocity};
                note.pitch = pitch;
                note.start = start;
                note.length = length;
                note.velocity = velocity;
                return this.updateNote(
                    note, update.pitch, update.start, update.length, update.velocity
                );
            }
        }, () => {
            this.notesUpdating.delete(note);
            this.notesToUpdate.delete(note);
        });
    }

    removeNote(note) {
        return this.queueChange(() => {
            return this.clip.call("remove_notes", note.start, note.pitch, 0.04, 1);
        });
    }

    addNote(note) {
        return this.queueChange(() => {
            return this.clip.call("set_notes", [[note.pitch, note.start, note.length, note.velocity, false]]);
        });
    }

    getTrack() {
        return this.clipslot.get("canonical_parent").then(obj => {
            return new LiveTrack(obj);
        });
    }

    callPlay(position) {
        Promise.all([
            this.clip.set("start_marker", position || this.clip.loop_start),
            this.call("fire")
        ]).done();
    }

    callStop() {
        this.call("stop").done();
    }
}


var mailbox = {}; // promises
var subscriptions = {}; // permanent listeners
var listeners = {}; // Live control specific listeners

function subscribe(method, cb) {
    if (!subscriptions[method]) {
        subscriptions[method] = [];
    }
    subscriptions[method].push(cb);
}

function listen(path, cb) {
    let parts = path.split(".");
    let attribute = parts.pop();
    path = parts.join(".");
    return get(path).then((obj) => {
        return obj.listen(attribute, cb);
    });
}

function distribute(data) {
    if (mailbox[data.messageId]) {
        mailbox[data.messageId].resolve(data);
    }
    delete mailbox[data.messageId];
}

function expect(id) {
    var deferred = Promise.defer();

    mailbox[id] = deferred;

    return deferred.promise.timeout(30000).catch((e) => {
        // consider it lost.
        if (e.constructor === Promise.TimeoutError) {
            mailbox[id].reject(e);
            delete mailbox[id];
        }
        throw e;
    });
}

let batch = false;
let currentBatch;
export function startBatch() {
    currentBatch = [];
    batch = true;
}
export function endBatch() {
    batch = false;
    if (currentBatch.length === 1) {
        iorequest.send(currentBatch[0]);
    } else {
        request("BATCH", {'commands': currentBatch}).then((data) => {
            for (let i = 0; i < data.length; ++i) {
                distribute(data[i]);
            }
        });
    }
}

class LiveObject {
    // TODO merge this as a base class for all Live remote object

    constructor(attributes) {
        Object.assign(this, attributes);
    }

    listen(attribute, cb) {
        if (cb === undefined) {
            cb = (value) => {
                this[attribute] = value;
            };
        }

        if (!listeners[this.id]) {
            listeners[this.id] = {};
        }

        if (!listeners[this.id][attribute]) {
            listeners[this.id][attribute] = [];

            return request("LISTEN", {'id': this.id, 'attribute': attribute}).then(() => {
                listeners[this.id][attribute].push(cb);
            });
        } else {
            listeners[this.id][attribute].push(cb);
            // just return a successful promise
            return Promise.cast();
        }
    }

    get(attribute) {
        return request("GET", {id: this.id, attribute: attribute}).then((value) => {
            this[attribute] = value;
            return value;
        });
    }

    set(attribute, value) {
        this[attribute] = value;
        return request("SET", {id: this.id, attribute: attribute, value: value});
    }

    call(attribute) {
        var parameters = Array.prototype.slice.call(arguments);
        parameters.shift();
        return request("CALL", {id: this.id, attribute: attribute, parameters: parameters});
    }

    list(attribute, attributes) {
        return request("LIST", {id: this.id, attribute: attribute, attributes: attributes});
    }

    toJSON() {
        return {id: this.id};
    }
}

var liveObjects = {};
function getLiveObject(attributes) {
    var liveObject = liveObjects[attributes.id];
    if (!liveObject || liveObject.type !== attributes.type) {
        liveObject = liveObjects[attributes.id] = new LiveObject(attributes);
    } else {
        Object.assign(liveObject, attributes);
    }
    return liveObject;
}

function guid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
}

function request(method, data) {
    let uniqueId = guid();
    let promise = expect(uniqueId).then((message) => {
        if ("error" in message) {
            throw message.error;
        } else {
            if ("result" in message && typeof message.result === "object" && message.result !== null) {
                if ("id" in message.result) {
                    return getLiveObject(message.result);
                } else if (message.result.constructor === Array && message.result.length > 0 && typeof message.result[0] === "object" && "id" in message.result[0]) {
                    return message.result.map(obj => getLiveObject(obj));
                }
            }
            return message.result;
        }
    }).catch((error) => {
        console.error(data, error);
        throw error;
    });

    data.messageId = uniqueId;
    data.method = method;

    if (batch) {
        currentBatch.push(data);
    } else {
        iorequest.send(data);
    }

    return promise;
}

export function get(path) {
    return request("GET", {path: path});
}

function set(path, value) {
    return request("SET", {path: path, value: value});
}

function call(path) {
    var parameters = Array.prototype.slice.call(arguments);
    parameters.shift();
    return request("CALL", {'path': path, parameters: parameters});
}


ioevents.on('message', function (data) {
    data = JSON.parse(data);
    if (listeners[data.id] && listeners[data.id][data.attribute]) {
        for (let listener of listeners[data.id][data.attribute]) {
            listener(data.value);
        }
    }
});

iomidi.on('message', function (data) {
    if (subscriptions.midi) {
        for (let cb of subscriptions.midi) {
            cb(data);
        }
    }
});

iorequest.on('message', distribute);

var liveExports = {
    request: request,
    subscribe: subscribe,
    listen: listen,
    set: set,
    get: get,
    call: call
};


export default liveExports;
