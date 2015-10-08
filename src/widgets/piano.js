/* jshint -W097 */
"use strict";

import { inject, useShadowDOM, DOMBoundary, customElement, bindable, useView } from 'aurelia-framework';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';
import { NOTES, MidiState, Channel } from 'midi/midi-state';
import { getScale } from 'midi/scale';
import Q from 'q';

class PianoBase {
    constructor(domBoundary) {
        this.attachedDeferred = Q.defer();
        this.boundDeferred = Q.defer();
        this.domBoundary = domBoundary;

        this.isAttached = this.attachedDeferred.promise;
        this.isBound = this.boundDeferred.promise;
        this.ready = Q.all([this.isAttached, this.isBound]);
    }

    baseoctaveChanged() {
        this.isAttached.then(this.draw.bind(this)).done();
    }

    noteChanged(midiState) {
        this.drawKey(midiState);
    }

    drawKey(midiState) {
        var noteOrder = "CDEFGAB";
        var context = this.canvas.getContext("2d");

        context.strokeStyle = "#000";
        context.fillStyle = "#000";

        var noteWidth = this.canvas.width / this.octaves / 7;
        var noteHeight = this.canvas.height;

        if (!midiState.sharp) {
            var shape = new Path2D();
            var baseX = (midiState.octave - this.baseoctave) * 7 * noteWidth + noteWidth * noteOrder.indexOf(midiState.note);
            var lineTo = (x, y) => shape.lineTo(baseX + noteWidth * x, noteHeight * y);
            var moveTo = (x, y) => shape.moveTo(baseX + noteWidth * x, noteHeight * y);

            if ("CF".indexOf(midiState.note) > -1) {
                lineTo(0.75, 0);
                lineTo(0.75, 0.6);
                lineTo(1, 0.6);
                lineTo(1, 1);
                lineTo(0, 1);
                lineTo(0, 0);
            } else if ("DGA".indexOf(midiState.note) > -1) {
                moveTo(0.25, 0);
                lineTo(0.75, 0);
                lineTo(0.75, 0.6);
                lineTo(1, 0.6);
                lineTo(1, 1);
                lineTo(0, 1);
                lineTo(0, 0.6);
                lineTo(0.25, 0.6);
                lineTo(0.25, 0);
            } else {
                moveTo(0.25, 0);
                lineTo(0.25, 0.6);
                lineTo(0, 0.6);
                lineTo(0, 1);
                lineTo(1, 1);
                lineTo(1, 0);
                lineTo(0.25, 0);
            }
            shape.closePath();

            if (midiState.active) {
                context.fillStyle = "#33F";
                context.fill(shape);
            } else {
                context.fillStyle = "#FFF";
                context.fill(shape);
                context.stroke(shape);
            }

        } else {
            if (midiState.active) {
                context.fillStyle = "#33F";
            }

            context.fillRect(
                (midiState.octave - this.baseoctave) * 7 * noteWidth + noteWidth * noteOrder.indexOf(midiState.note) + noteWidth * 0.75,
                0,
                noteWidth / 2,
                noteHeight * 0.6
            );
        }
    }

    draw() {
        this.ready.then(() => {
            for (var note of this.channel.notes.values()) {
                if (note.octave >= this.baseoctave && note.octave < (this.baseoctave + this.octaves)) {
                    this.drawKey(note);
                }
            }
        }).done();
    }

    channelChanged() {
        if (this.channel) {
            this.boundDeferred.resolve();
            this.channel.observe((changes) => {
                var done = new Set();
                for (var change of changes) {
                    if (done.has(change.object)) {
                        continue;
                    }
                    if (this.feedback || change.object.lastModifier === this.name || change.object.lastModifier === "channel") {
                        this.noteChanged(change.object);
                    }
                    done.add(change.object);
                }
            });
        }

    }

    bind(context) {
        this.trackChanged();
        this.channelChanged();
    }

    trackChanged() {
        if (this.track) {
            this.track.ready.then(() => {
                this.channel = this.track.channel;
                this.boundDeferred.resolve();
            }).done();
        }
    }

    attached() {
        // since views are dynamic we have timing problems when fetching viewport. Do this hack meanwhile.
        this.canvas = $(this.domBoundary).find("canvas")[0];
        var $host = $(this.domBoundary.host);
        $(this.canvas).css({height: "100%", width: "100%"});
        this.canvas.height = $host.height();
        this.canvas.width = $host.width();
        this.box = this.domBoundary.host.getBoundingClientRect();
        this.margin = this.box.width / this.octaves / 7 / 2;

        (this.track ? this.track.ready : Q()).then(this.draw.bind(this)).done();

        this.hammerSetup();

        this.attachedDeferred.resolve();
    }

    getNotesAtPosition(x, y) {
        var whites = [0, 2, 4, 5, 7, 9, 11];
        var blacks = [1, 3, null, 6, 8, 10, null];

        x = x - this.box.left;
        y = y - this.box.top;
        var octave = Math.floor(x / (this.box.width / this.octaves));
        x = x % (this.box.width / this.octaves);

        if (y > this.box.height * 0.6) {
            return [{key: whites[Math.floor(x / (this.box.width / this.octaves / 7))] + octave * 12 + (this.baseoctave + 2) * 12}];
        }
        var value = blacks[Math.floor((x - this.margin) / (this.box.width / this.octaves / 7))];
        if (value !== null && value !== undefined) {
            return [{key: value + octave * 12 + (this.baseoctave + 2) * 12}];
        }
        return [];
    }

    hammerSetup() {
        this.pressedkeys = new Set();
        this.scheduledSwitchOff = new Map(); // for "hold" - deactivate on leave
        this.activeKeysCount = 0; // for "inUse" in hold

        let noteStates = new Map(); // for modulation

        var touchHandler = (ev) => {
            var isOff = ev.type === "touchend" || ev.type === "mouseup" || ev.buttons === 0;
            var isOn = ev.type === "touchstart" || (ev.type === "mousedown" || (ev.type === "mousemove" && ev.buttons !== 0));
            var currentpressedkeys = new Set();

            var touches;
            var changedTouches;
            if (!ev.touches) {
                touches = [ev];
                changedTouches = [ev];
            } else {
                touches = Array.from(ev.touches).filter((touch) => touch.target === this.domBoundary.host);
                changedTouches = Array.from(ev.changedTouches).filter((touch) => touch.target === this.domBoundary.host);
                ev.preventDefault(); // don't trigger a mouse event
            }


            for (let i = 0; i < touches.length; ++i) {
                let touch = touches[i];
                let notes = this.getNotesAtPosition(touch.pageX, touch.pageY, touch.radiusX, touch.radiusY, noteStates);
                for (let note of notes) {
                    currentpressedkeys.add(this.channel.notes.get(note.key));
                }
            }

            if (isOff) {
                for (let i = 0; i < changedTouches.length; ++i) {
                    let touch = changedTouches[i];
                    for (let note of this.getNotesAtPosition(touch.pageX, touch.pageY, touch.radiusX, touch.radiusY)) {
                        currentpressedkeys.delete(this.channel.notes.get(note.key));
                    }
                }
            }

            if (this.hold) {
                var leftKeys = new Set(this.pressedkeys);
                for (let element of currentpressedkeys) {
                    leftKeys.delete(element);
                }

                for (let element of leftKeys) {
                    // used to deactivate keys on leave
                    if (this.scheduledSwitchOff.has(element) ||
                            // same number of fingers, means we swiped from a key we activated
                            // and we want to activate only one key per tap
                        currentpressedkeys.size === this.pressedkeys.size
                    ) {
                        if (Date.now() - this.scheduledSwitchOff.get(element) < 200 || currentpressedkeys.size === this.pressedkeys.size) {
                            this.activeKeysCount -= 1;
                            element.deactivate(this.name);
                        }
                        this.scheduledSwitchOff.delete(element);

                    }
                }

                var toSwitchOn = new Set(currentpressedkeys);

                for (let element of currentpressedkeys) {
                    let state = noteStates.get(element.key);
                    if (state !== undefined && state.modulation !== undefined) {
                        state.modulation.apply(element);
                    }
                }

                for (let element of this.pressedkeys) {
                    toSwitchOn.delete(element);
                }

                for (let element of toSwitchOn) {
                    if (element.active) {
                        this.scheduledSwitchOff.set(element, Date.now());
                    } else {
                        this.activeKeysCount += 1;
                        element.activate(this.value, this.name);
                    }
                }

                this.pressedkeys = currentpressedkeys;
                this.inUse = this.activeKeysCount !== 0;
                return;
            }

            var removedKeys = new Set(this.pressedkeys);
            for (let element of currentpressedkeys) {
                removedKeys.delete(element);
            }


            for (let element of removedKeys) {
                element.deactivate(this.name);
                noteStates.delete(element.key);
            }

            // don't send message to already pressed keys
            var toAdd = new Set(currentpressedkeys);
            for (let element of this.pressedkeys) {
                toAdd.delete(element);
            }

            for (let element of toAdd) {
                element.activate(this.value, this.name);
            }

            for (let element of currentpressedkeys) {
                let state = noteStates.get(element.key);
                if (state !== undefined && state.modulation !== undefined) {
                    state.modulation.apply(element);
                }
            }

            this.pressedkeys = currentpressedkeys;

            this.inUse = this.pressedkeys.size !== 0;
        };

        this.domBoundary.host.addEventListener("touchstart", touchHandler, true);
        this.domBoundary.host.addEventListener("touchmove", touchHandler, true);
        this.domBoundary.host.addEventListener("touchend", touchHandler, true);
        this.domBoundary.host.addEventListener("mousedown", touchHandler, true);
        this.domBoundary.host.addEventListener("mouseup", touchHandler, true);
        this.domBoundary.host.addEventListener("mousemove", touchHandler, true);
    }
}

@customElement('piano')
@useShadowDOM()
@inject(DOMBoundary)
export default
class Piano extends PianoBase {
    @bindable track
    @bindable feedback
    @bindable channel
    @bindable baseoctave
    @bindable octaves = 3
    @bindable value = 100
    @bindable name = "piano";
}


@customElement('strings')
@useView('widgets/canvas.html')
@useShadowDOM()
@inject(DOMBoundary)
export class Strings extends PianoBase {
    @bindable track
    @bindable channel
    @bindable feedback
    @bindable baseoctave
    @bindable columns = 12
    @bindable value = 100
    @bindable scale = getScale("C Chromatic");
    @bindable name = "Strings";
    @bindable modulation;
    @bindable hold;

    constructor(domBoundary) {
        super(domBoundary);
        //this.modulation = this.pitchbend;
    }

    pitchbend(origin, newvalue) {
        let pitchbend = Math.min(Math.max((newvalue-origin) * 8192, -8192), 8191) + 8192;
        return function() {
            this.pitchbend([pitchbend & 0x7F, pitchbend >> 7]);
        };
    }

    aftertouch(origin, newvalue) {
        return function() {
            this.aftertouch(newvalue*127);
        };
    }

    drawKey(midiState) {
        let column = this.scale.indexForKey.get(midiState.key) - this.scale.indexForKey.get(this.basenote);
        if (column >= this.columns || column < 0) {
            return;
        }

        var context = this.canvas.getContext("2d");
        var left = this.noteWidth * column;

        if (midiState.active) {
            context.fillStyle = "#999999";
        } else if ((midiState.key - this.scale.rootNote) % 12 === 0) {
            context.fillStyle = "#33F";
        } else {
            context.fillStyle = "#FFF";
        }

        // set note background
        context.fillRect(left, 0, this.noteWidth, this.canvas.height);

        context.strokeStyle = "#000";
        context.fillStyle = "#000";

        context.beginPath();
        context.lineWidth = 2;
        var shape = new Path2D();
        shape.moveTo(this.noteWidth * column + this.noteWidth / 2, 0);
        shape.lineTo(this.noteWidth * column + this.noteWidth / 2, this.canvas.height);
        context.strokeStyle = "#000";
        context.stroke(shape);
    }

    scaleChanged() {
        this.draw();
    }

    baseoctaveChanged() {
        this.basenote = (this.baseoctave + 2) * 12;
        this.draw();
    }

    bind(context) {
        super.bind(context);
        this.baseoctaveChanged();
    }

    draw() {
        this.ready.then(() => {
            this.noteWidth = Math.floor(this.canvas.width / this.columns);

            let basenoteIndex = this.scale.indexForKey.get(this.basenote);

            for (let i = 0; i < this.columns; ++i) {
                let key = this.scale.keyForIndex.get(basenoteIndex + i);
                let note = this.channel.notes.get(key);
                this.drawKey(note);
            }
        }).done();
    }

    getNotesAtPosition(x, y, radiusX, radiusY, previousStates) {
        x = x - this.box.left;

        radiusX = radiusX / 2;
        radiusY = radiusY / 2;

        let noteAtPosition = (x, y) => {
            if (isNaN(x) || isNaN(y)) {
                // radius is NaN on desktop
                return;
            }
            var column = x / this.noteWidth;

            if (Math.abs(column - Math.floor(x / this.noteWidth) - 0.5) > 0.4) {
                return;
            }

            let key = this.scale.keyForIndex.get(this.scale.indexForKey.get(this.basenote) + Math.floor(column));
            let modulation;

            if (previousStates) {
                let previousState = previousStates.get(key);
                if (previousState && this.modulation) {
                    modulation = this.modulation((this.canvas.height-previousState.y) / this.canvas.height, (this.canvas.height-y) / this.canvas.height);
                    y = previousState.y;
                }
            }
            let result = {key: key, y: y};
            if (modulation !== undefined) {
                result.modulation = modulation;
            }

            if (previousStates) {
                previousStates.set(key, result);
            }
            return result;
        };

        let notes = [];
        let keys = new Set();

        for (let coordinates of [[x, y], [x, y + radiusY], [x, y - radiusY], [x + radiusX, y], [x - radiusX, y]]) {
            var note = noteAtPosition.apply(this, coordinates);
            if (note !== undefined && !keys.has(note.key)) {
                keys.add(note.key);
                notes.push(note);
            }
        }
        return notes;
    }
}

@customElement('harpejii')
@useView('widgets/canvas.html')
@useShadowDOM()
@inject(DOMBoundary)
export class Harpejii extends PianoBase {
    @bindable track
    @bindable channel
    @bindable feedback
    @bindable baseoctave
    @bindable rows = 12
    @bindable columns = 12
    @bindable value = 100
    @bindable scale // TODO
    @bindable name = "Harpejii";

    drawKey(midiState) {
        for (let column = 0; column < this.columns; ++column) {
            let position = midiState.key - column * 2 - (this.baseoctave + 2) * 12 - 9;
            if (position >= this.rows) {
                continue; // not yet there
            }
            if (position < 0) {
                break; // not there anymore
            }

            position = this.rows - position - 1; // convert to inverted vertical scale

            var context = this.canvas.getContext("2d");

            var width = this.noteWidth;
            var height = this.noteHeight;
            var left = this.noteWidth * column;
            var top = position * this.noteHeight;

            if (midiState.active) {
                context.fillStyle = "#33F";
            } else {
                context.fillStyle = "#FFF";
            }

            context.fillRect(left + 1, top + 1, width - 1, height - 1);

            context.strokeStyle = "#000";

            context.rect(
                this.noteWidth * column + 1,
                position * this.noteHeight + 1,
                this.noteWidth - 1,
                this.noteHeight - 1
            );

            context.fillStyle = "#000";

            context.beginPath();
            context.lineWidth = 1;
            var shape = new Path2D();
            shape.moveTo(this.noteWidth * column, position * this.noteHeight + 0.5);
            shape.lineTo(this.noteWidth * column + this.noteWidth, position * this.noteHeight + 0.5);
            context.strokeStyle = "#CCC";
            context.stroke(shape);

            context.beginPath();
            context.lineWidth = 2;
            shape = new Path2D();
            shape.moveTo(this.noteWidth * column + this.noteWidth / 2, position * this.noteHeight);
            shape.lineTo(this.noteWidth * column + this.noteWidth / 2, position * this.noteHeight + this.noteHeight);
            context.strokeStyle = "#000";
            context.stroke(shape);

        }
    }

    draw() {
        if (!this.canvas) {
            return; // not yet attached
        }

        this.noteWidth = Math.floor(this.canvas.width / this.columns);
        this.noteHeight = Math.floor(this.canvas.height / this.rows);

        let basenote = ((this.baseoctave + 2) * 12 + 9);

        for (var note of this.channel.notes.values()) {
            if (note.key >= basenote && note.key < (basenote + this.rows + (this.columns - 1) * 2)) {
                this.drawKey(note);
            }
        }
    }

    getNotesAtPosition(x, y, radiusX, radiusY) {
        x = x - this.box.left;
        y = y - this.box.top;

        // radius is not correctly reported. these are my extrapolation on a tab s.
        radiusX = radiusX * 10;
        radiusY = radiusY * 10;

        let noteAtPosition = (x, y) => {
            if (isNaN(x) || isNaN(y)) {
                // radius is NaN on desktop
                return;
            }
            var column = x / this.noteWidth;

            if (Math.abs(column - Math.floor(x / this.noteWidth) - 0.5) > 0.2) {
                return;
            }
            column = Math.floor(column);
            let row = Math.floor(y / this.noteHeight);
            return {key: this.rows - 1 + (this.baseoctave + 2) * 12 + column * 2 + 9 - row};
        };

        let keys = new Set();
        let notes = [];
        for (let coordinates of [[x, y], [x, y + radiusY], [x, y - radiusY], [x + radiusX, y], [x - radiusX, y]]) {
            var note = noteAtPosition.apply(this, coordinates);
            if (note !== undefined && !notes.has(note.key)) {
                keys.add(key);
                notes.push(note);
            }
        }
        return notes;
    }
}


@customElement('pad')
@useShadowDOM()
@inject(DOMBoundary)
@useView('widgets/pad.html')
export class Pad extends PianoBase {
    @bindable track
    @bindable channel
    @bindable feedback
    @bindable baseoctave = 3;
    @bindable rows = 12;
    @bindable columns = 12;
    @bindable value = 100;
    @bindable scale = getScale("C Chromatic");
    @bindable factor = 3;
    @bindable name = "pad";
    @bindable hold = false;

    constructor(domBoundary) {
        super(domBoundary);
        this.initWebWorker();
    }

    scaleChanged() {
        (this.track ? this.track.ready : Q()).then(this.draw.bind(this)).done();
        this.basenote = ((this.baseoctave + 2) * 12 + this.scale.rootNote);
    }

    baseoctaveChanged() {
        this.basenote = ((this.baseoctave + 2) * 12 + this.scale.rootNote);
        super.baseoctaveChanged();
    }

    bind(context) {

        (this.track ? this.track.getHasDrumPads() : Q(false)).then((hasDrumPads) => {
            if (hasDrumPads) {
                this.factor = this.rows;
            }
            this.draw();
            this.basenote = ((this.baseoctave + 2) * 12 + this.scale.rootNote);
        }).done();

        return super.bind(context);
    }

    initWebWorker() {
        this.padWebWorker = new Worker("/dist/widgets/webworkers/piano.js");
        this.padWebWorker.onmessage = (event) => {
            requestAnimationFrame(() => {
                let ctx = this.canvas.getContext('2d');
                for (var command of event.data.commands) {
                    if (command[0] === 'set') {
                        ctx[command[1][0]] = command[1][1];
                    } else {
                        ctx[command[0]].apply(ctx, command[1]);
                    }
                }
            });
        };
    }

    drawKey(midiStates) {
        if (!midiStates.values) {
            midiStates = new Map([[midiStates.key, midiStates]]);
        }

        this.padWebWorker.postMessage({
            method: "draw",
            parameters: {
                scaleIntervals: this.scale.intervals,
                basenote: this.basenote,
                midiStates: Array.from(midiStates)
            }
        });
    }

    draw() {
        this.ready.then(() => this.track ? this.track.getNoteNames() : Promise.cast(this.channel.notes)).then((noteNames) => {
            this.noteWidth = Math.floor(this.canvas.width / this.columns);
            this.noteHeight = Math.floor(this.canvas.height / this.rows);
            this.padWebWorker.postMessage({
                method: "update",
                parameters: {
                    rows: this.rows,
                    columns: this.columns,
                    noteWidth: this.noteWidth,
                    factor: this.factor,
                    noteHeight: this.noteHeight,
                    noteNames: Array.from(noteNames.entries())
                }
            });
            this.drawKey(this.channel.notes);
        }).done();
    }

    getNotesAtPosition(x, y, radiusX, radiusY) {
        x = x - this.box.left;
        y = y - this.box.top;


        let noteAtPosition = (x, y) => {
            if (isNaN(x) || isNaN(y) || x < 0 || y < 0) { /* x happens to be negative probably because finger is still pressed but left the controller surface */
                // radius is NaN on desktop
                return;
            }
            let column = x / this.noteWidth;

            column = Math.floor(column);
            let row = this.rows - Math.floor(y / this.noteHeight);
            let position = (row - 1) * this.factor + column;
            let octave = Math.floor(position / this.scale.intervals.length);
            let noteValue = this.scale.intervals[position % this.scale.intervals.length];
            return this.basenote + octave * 12 + noteValue;
        };

        var key = noteAtPosition(x, y);
        if (key === undefined) {
            return [];
        }
        return [{key: key}];
    }
}