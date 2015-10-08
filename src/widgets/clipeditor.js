/* jshint -W097 */
"use strict";

import { inject, useShadowDOM, DOMBoundary, customElement, bindable, useView } from 'aurelia-framework';
import Hammer from 'hammer';
import {LiveClipSlot} from 'live/index';
import Q from 'q';

import { selectable, unselectable } from 'utils/unselectable';
import { NOTES, MidiState, Channel } from 'midi/midi-state';
import { getScale } from 'midi/scale';
import live from 'live/index';


@customElement('clipeditor')
@useShadowDOM()
@inject(DOMBoundary)
export default
class ClipEditor {
    @bindable clipslot;
    @bindable scale = getScale("C Chromatic");
    @bindable quantization = 1;
    @bindable rows;
    @bindable mono;

    constructor(domBoundary) {
        this.domBoundary = domBoundary;
        this.scaleY = 1;
        this.scaleX = 1;
        this.translateX = 0;
        this.translateY = 0;

        Object.observe(this, (changes) => {
            if (changes.findIndex(x => ["scaleX", "scaleY", "translateX", "translateY"].indexOf(x.name) > -1) > -1) {
                this.translateY = Math.max(
                    Math.min(
                        this.translateY,
                        (-this.noteHeight * (this.rows / 2) * (1 - this.scaleY)) / this.scaleY
                    ),
                    (-this.notesBox.height + this.noteHeight * this.rows + // container height - one octave
                    (this.noteHeight * (this.rows / 2) * (1 - this.scaleY)) / this.scaleY));

                requestAnimationFrame((function () {
                    var styleX = "scaleX(" + this.scaleX + ") translateX(" + this.translateX + "px)";
                    var styleY = "scaleY(" + this.scaleY + ") translateY(" + this.translateY + "px)";
                    this.$notesContainer[0].style.transform = styleX + " " + styleY;
                    this.$labelsContainer[0].style.transform = styleY;
                }).bind(this));
            }
        });

        this.noteElements = new Set();

        /* tame initialization issues */
        this.scaleDeferred = Q.defer();
        this.scaleReady = this.scaleDeferred.promise;
        this.clipslotDeferred = Q.defer();
        this.clipslotReady = this.clipslotDeferred.promise;
        this.attachedDeferred = Q.defer();
        this.attachedPromise = this.attachedDeferred.promise;
    }

    rowsChanged() {
        this.scaleChanged();
    }

    scaleChanged(newValue, oldValue) {
        if (!this.rows) {
            this.rows = this.scale.intervals.length;
        }
        this.attachedPromise.then(() => this.clipslotReady).then(() => this.clipslot.getTrack()).then(track => track.getNoteNames()).then((notes) => {
            this.notes = Array.from(notes.values()).filter((note) => {
                return this.scale.intervals.indexOf((note.key + 12 - this.scale.rootNote) % 12) !== -1 && note.key >= this.scale.rootNote;
            }).sort((x, y) => y.key - x.key);

            var middlePitch;
            if (oldValue && oldValue.name !== newValue.name && this.noteHeight !== undefined) {
                middlePitch = this.pitchAtPosition(0, this.box.height / 2 + this.box.top, oldValue);
            }

            return Q.all([this.attachedPromise, Q.delay(200)]).then(() => { // wait for notes to be drawn
                this.noteHeight = Math.floor(this.clipViewPortHeight / this.rows);
                this.pitches = new Map(this.$notesContainer.find(".pitch").map((i, element) => {
                    return [[this.notes[i].key, element]];
                }).toArray());
            }).then(() => Q.delay(200)).then(() => { // let noteHeight affect the layout
                this.labelsBox = this.$labelsContainer[0].getBoundingClientRect();
                this.notesBox = this.$notesContainer[0].getBoundingClientRect();
                this.clipViewPortWidth = this.box.width - this.labelsBox.width;

                if (middlePitch !== undefined) {
                    let row;
                    while (middlePitch < 127) {
                        row = this.scale.indexForKey.get(middlePitch);
                        if (row !== undefined) {
                            break;
                        }
                        ++middlePitch;
                    }
                    this.translateY = -(this.notes.length - this.rows / 2 - row) * this.noteHeight;
                }

                this.updateClip();
                this.scaleDeferred.resolve();
            });
        }).done();
    }

    drawNote(note) {
        var pitchElement = this.pitches.get(note.pitch);
        if (!pitchElement) {
            // not part of the scale
            return;
        }
        var startPixel = (note.start - this.clipslot.clip.loop_start) * this.beatWidth;
        var widthPixel = (note.length * this.beatWidth);
        var element = document.createElement("div");
        element.setAttribute("class", "note");
        element.style.left = startPixel + "px";
        element.style.width = widthPixel + "px";
        element.style.backgroundColor = 'rgb(' + (208 - note.velocity) + ',' + (208 - note.velocity) + ",255)";

        note.element = element;

        pitchElement.appendChild(element);

        var mc = new Hammer.Manager(element, {
            recognizers: [
                [Hammer.Tap, {time: 200, taps: 1, threshold: 200, event: "delete"}],
                [Hammer.Pan, {direction: Hammer.DIRECTION_VERTICAL, event: 'changePitch'}],
                [Hammer.Pan, {direction: Hammer.DIRECTION_HORIZONTAL, threshold: 1, event: 'move'}]
            ]
        });
        mc.get('changePitch').requireFailure('delete');
        mc.get('move').requireFailure('delete');
        mc.get('changePitch').recognizeWith("move");

        note.remove = () => {
            this.clipslot.removeNote(note);
            if (note.element.parentElement) {
                note.element.parentElement.removeChild(element);
            }
            this.noteElements.delete(note);
        };

        this.noteElements.add(note); // helper for swipe left

        mc.on("changePitch", (ev) => {
            var newPitch = this.pitchAtPosition(ev.pointers[0].pageX, ev.pointers[0].pageY);
            if (note.pitch !== newPitch) {
                this.clipslot.updateNote(note, newPitch).done();
                pitchElement.removeChild(element);
                pitchElement = this.pitches.get(newPitch);
                pitchElement.appendChild(element);
            }
        });

        var scheduledStartTime = null;
        var scheduledDuration = null;
        var scheduledVelocity = null;

        var updateNote = (startTime, duration, velocity) => {
            let isScheduled = scheduledStartTime !== null || scheduledDuration !== null;
            scheduledStartTime = startTime;
            scheduledDuration = duration;
            scheduledVelocity = velocity;

            if (!isScheduled) {
                requestAnimationFrame(() => {
                    scheduledStartTime = scheduledStartTime !== null ? scheduledStartTime : note.start;
                    scheduledDuration = scheduledDuration || (note.length);
                    scheduledVelocity = scheduledVelocity || note.velocity;
                    element.style.left = ((scheduledStartTime - this.clipslot.clip.loop_start) * this.beatWidth) + "px";
                    element.style.width = (scheduledDuration * this.beatWidth) + "px";
                    element.style.backgroundColor = 'rgb(' + (208 - scheduledVelocity) + ',' + (208 - scheduledVelocity) + ",255)";
                    this.clipslot.updateNote(note, note.pitch, scheduledStartTime, scheduledDuration, scheduledVelocity).done();
                    scheduledStartTime = null;
                    scheduledDuration = null;
                    scheduledVelocity = null;
                });
            }
        };

        var timeOffset = null;
        var lastSnap = null;
        var snapWaitUntil = null;

        mc.on("move movestart moveend", (ev) => {
            if (ev.pointers.length !== 1 || ev.target != element) {
                return;
            }
            if (ev.type === "movestart") {
                timeOffset = this.timeAtPosition(ev.pointers[0].pageX) - note.start;
                this.clipslot.begin_gesture();
            }

            if (ev.type === "move") {
                if (ev.isFinal) {
                    return;
                }
                let newTime = this.timeAtPosition(ev.pointers[0].pageX) - timeOffset;

                if (Math.abs(ev.velocityX) > 0.10) {
                    snapWaitUntil = null;
                }

                var snapTime = (new Date()).getTime();
                if (snapWaitUntil && snapTime < snapWaitUntil) {
                    return;
                }
                snapWaitUntil = null;

                var snapCandidate = Math.round(newTime / this.quantization) * this.quantization;
                if (Math.abs(ev.velocityX) < 0.05 &&
                    snapCandidate !== lastSnap &&
                    note.start !== newTime &&
                    ((note.start > newTime) === (note.start > snapCandidate)) // snap only in the same direction as the move
                ) {
                    newTime = lastSnap = snapCandidate;
                    snapWaitUntil = snapTime + 500;
                }

                if (newTime < 0) newTime = 0;
                updateNote(newTime, null);
            }

            if (ev.type === "moveend") {
                this.clipslot.end_gesture();
                timeOffset = null;
                lastSnap = null;
            }
        });

        note.resize = (function (pointer, from) {
            let velocity = Math.round(Math.max(0, Math.min(127, 127 * (1 - (pointer.pageY - this.box.top) / this.box.height))));
            var time = this.timeAtPosition(pointer.pageX);
            if (pointer.pageX > from) {
                updateNote(null, time - note.start, velocity);
            } else {
                timeOffset = this.timeAtPosition(from) - time;
                updateNote(time, note.start - time + note.length, velocity);
            }
        }).bind(this);
    }

    updateMarks() {
        this.marks = [];
        for (var i = 0; i < (this.clipslot.clip.loop_end - this.clipslot.clip.loop_start) * 24; i += 6) { // sixteenths
            this.marks.push({
                position: this.clockWidth * i,
                type: (i % 96 === 0 ? "bar" : (i % 24 === 0 ? "beat" : "sixteenth"))
            });
        }
    }

    clipObserver(changes) {
        var attributes = new Set(changes.map((x) => x.name));
        if (attributes.has("playing_position")) {
            this.cursor.style.left = ((this.clipslot.clip.playing_position - this.clipslot.clip.loop_start) * this.beatWidth) + "px";
        }
        if (attributes.has("notes")) {
            this.scheduleUpdateClip();
        }
    }

    scheduleUpdateClip() {
        if (this.scheduleUpdateClipTimeout) {
            // if we are already waiting, wait again
            clearTimeout(this.scheduleUpdateClipTimeout);
        }
        this.scheduleUpdateClipTimeout = setTimeout(() => {
            this.scheduleUpdateClipTimeout = null;
            this.updateClip();
        }, 2);
    }

    updateClip() {
        Q.all([this.scaleReady, this.clipslot.ready]).then(() => {
            if (this.notesInUse || this.notesContainerInUse || this.scheduleUpdateClipTimeout) {
                // may be glitchy if several updates are incoming, see how it goes.
                return;
            }
            this.$notesContainer.find('.note').remove(); // dangerous if updating while editing
            this.barWidth = this.clipViewPortWidth / ((this.clipslot.clip.loop_end - this.clipslot.clip.loop_start) / 4); // so viewport always display the entire clip
            this.beatWidth = this.barWidth / 4;
            this.clockWidth = this.beatWidth / 24;
            var highest = -Infinity;
            var lowest = Infinity;
            this.noteElements.clear();

            for (var note of this.clipslot.clip.notes) {
                if (note.pitch < lowest) {
                    lowest = note.pitch;
                }
                if (note.pitch > highest) {
                    highest = note.pitch;
                }
                this.drawNote(note);
            }

            if (this.translateY === 0) {
                if (lowest === Infinity) {
                    lowest = this.rows * 2;
                }
                if (highest === -Infinity) {
                    lowest = this.rows * 3;
                }

                let lowestPosition;

                while (lowest < 128 && !lowestPosition) {
                    lowestPosition = this.scale.indexForKey.get(lowest);
                    if (lowestPosition) {
                        break;
                    }
                    ++lowest;
                }

                if (lowestPosition) {
                    this.translateY = -(this.notes.length - this.rows - lowestPosition + 1) * this.noteHeight;
                }
            }

            this.updateMarks();
        }).done();
    }

    clipslotChanged() {
        if (this.clipslot) {
            if (typeof this.clipslot === "string") {
                this.clipslot = new LiveClipSlot(this.clipslot);
            }
            this.clipslot.ready.then(() => {
                Object.observe(this.clipslot.clip, (changes) => this.clipObserver(changes));
                this.attachedPromise.then(() => {
                    this.updateClip();
                });
                this.clipslotDeferred.resolve();
            });
        }
    }

    attached() {
        this.cursor = $(this.domBoundary).find("#cursor")[0];
        this.$notesContainer = $(this.domBoundary).find("#notes");
        this.$labelsContainer = $(this.domBoundary).find("#labels");
        this.container = $(this.domBoundary).find("#container")[0];
        this.box = this.container.getBoundingClientRect();
        this.clipViewPortHeight = this.box.height;

        this.hammerSetup();
        this.attachedDeferred.resolve();
        this.scaleChanged();
    }

    pitchAtPosition(x, y, scale) {
        if (scale) {
            return scale.keyForIndex.get(scale.indexForKey.size - this.rowAtPosition(y - this.box.top));
        } else {
            let note = this.notes[this.rowAtPosition(y - this.box.top) - 1];
            if (note) {
                return note.key;
            }
        }
    }

    rowAtPosition(y) {
        return Math.ceil(((y - (this.rows / 2) * this.noteHeight) / this.scaleY - this.translateY) / this.noteHeight + (this.rows / 2));
    }

    positionForRow(row) {
        return ((row + 1 - this.rows / 2) * this.noteHeight + this.translateY) * this.scaleY + (this.rows / 2) * this.noteHeight;
    }

    timeAtPosition(x) {
        return ((x - this.notesBox.left) / this.scaleX - this.translateX) / this.beatWidth + this.clipslot.clip.loop_start;
    }

    quantizationChanged() {
        if (this.quantization !== null) {
            this.quantization = this.quantization.valueOf(); // transform key/value pair in pure value
        }
    }

    addNote(note) {
        if (this.mono) {
            for (let noteElement of this.getNotesAtPosition(null, note.start, note.length)) {
                noteElement.remove();
            }
        }
        this.clipslot.addNote(note);
        this.drawNote(note);
    }

    getNotesAtPosition(pitch, startTime, duration) {
        let notesAtPosition = [];
        for (let noteElement of this.noteElements.values()) {
            if ((pitch === null || noteElement.pitch === pitch) &&
                noteElement.start >= startTime &&
                (noteElement.start < (startTime + duration))) {
                notesAtPosition.push(noteElement);
            }
        }
        return notesAtPosition;
    }

    hammerSetup() {
        var notesContainer = this.$notesContainer[0];
        var labelsContainer = this.$labelsContainer[0];

        var mc = new Hammer.Manager(notesContainer, {
            recognizers: [
                [Hammer.Pinch],
                [Hammer.Pan, {direction: Hammer.DIRECTION_ALL}]
            ]
        });

        var mcLabels = new Hammer.Manager(labelsContainer, {
            recognizers: [
                [Hammer.Tap, {time: 200, threshold: 200, pointers: 1, event: "lock"}],
                [Hammer.Pan, {direction: Hammer.DIRECTION_ALL}]
            ]
        });

        mcLabels.get("lock").recognizeWith("pan");

        this.readonly = false;

        mcLabels.on("lock", (ev) => {
            this.readonly = !this.readonly;
        });

        /* draw/erase notes by swiping or tapping */

        var addRemoveMode = false;
        var addRemoved = false; // flag that says if something happened during this session. if not, we want to add a note
        var lastFingerPosition = new Map();
        var sessionStart;
        mc.on("hammer.input", (ev) => {
            if (!this.readonly) {
                return;
            }

            if (ev.isFirst) {
                if (ev.target.className == "pitch") {
                    addRemoveMode = true;
                }
                this.notesContainerInUse = true; // use for preventing incoming updates

                addRemoved = false;
                lastFingerPosition = new Map();
                sessionStart = Date.now();
            }

            var notesAtPosition = [];
            var pitch;
            var startTime;

            if (addRemoveMode) {
                // clean up last known position
                var fingersNotFound = new Set(Object.keys(lastFingerPosition));
                for (let pointer of ev.pointers) {
                    fingersNotFound.delete(pointer.identifier);

                    pitch = this.pitchAtPosition(pointer.pageX, pointer.pageY);
                    startTime = Math.floor(this.timeAtPosition(pointer.pageX, pointer.pageY) / this.quantization) * this.quantization;
                    notesAtPosition = this.getNotesAtPosition(pitch, startTime, this.quantization);
                    if (!lastFingerPosition.has(pointer.identifier)) {
                        lastFingerPosition.set(pointer.identifier, pointer.pageX);
                        continue;
                    }

                    if (lastFingerPosition.get(pointer.identifier) < pointer.pageX) {
                        // adding
                        if (notesAtPosition.length === 0) {
                            let note = {
                                pitch: pitch,
                                start: startTime,
                                length: this.quantization,
                                velocity: 100
                            };
                            this.addNote(note);
                            addRemoved = true;
                        }
                    } else if (lastFingerPosition.get(pointer.identifier) > pointer.pageX) {
                        // removing
                        for (let noteItem of notesAtPosition.values()) {
                            noteItem.remove();
                            addRemoved = true;
                        }
                    }

                    lastFingerPosition.set(pointer.identifier, pointer.pageX);
                }

                for (let fingerIndex of fingersNotFound) {
                    lastFingerPosition.delete(fingerIndex);
                }
            }

            if (ev.isFinal) {
                if (!addRemoved && Math.abs(ev.deltaX) < 20 && Math.abs(ev.deltaY) < 20 && (Date.now() - sessionStart) < 500) {
                    if (addRemoveMode && notesAtPosition.length === 0) {
                        let note = {
                            pitch: pitch,
                            start: startTime,
                            length: this.quantization,
                            velocity: 100
                        };
                        this.addNote(note);
                    } else {
                        // we clicked on a note, so we didn't compute the position at that point
                        pitch = this.pitchAtPosition(ev.center.x, ev.center.y);
                        startTime = Math.floor(this.timeAtPosition(ev.center.x, ev.center.y) / this.quantization) * this.quantization;
                        notesAtPosition = [];
                        for (let noteElement of this.noteElements.values()) {
                            if (noteElement.pitch === pitch &&
                                noteElement.start >= startTime &&
                                (noteElement.start < (startTime + this.quantization))) {
                                notesAtPosition.push(noteElement);
                            }
                        }
                        for (let noteItem of notesAtPosition.values()) {
                            noteItem.remove();
                        }
                    }
                }

                addRemoveMode = false;

                this.notesContainerInUse = false;
            }
        });

        /* note start/length/velocity */

        var originalReadonly = null;
        var from;
        mc.on("hammer.input", (ev) => {
            if (ev.isFirst) {
                let note;
                if (ev.target.className == "note") {
                    for (note of this.noteElements.values()) {
                        if (note.element === ev.target) {
                            this.resizeNote = note.resize;
                            break;
                        }
                    }
                }
                if (!note) {
                    return;
                }

                originalReadonly = this.readonly;
                this.readonly = true;
                this.resizeNote = note.resize;

                this.notesInUse = true;
            }

            if (this.resizeNote) {
                var pointer = ev.pointers.find(x => x.target.className === "pitch");
                if (ev.pointers.length > 1) {
                    from = ev.pointers[0].pageX;
                }
                if (pointer) {
                    this.resizeNote(pointer, from);
                }
            }

            if (ev.isFinal) {
                if (originalReadonly !== null) {
                    this.readonly = originalReadonly;
                }
                originalReadonly = null;
                this.resizeNote = null;

                this.notesInUse = false;
            }
        });

        var previousScaleY;
        var previousScaleX;
        mc.on("pinchstart pinchin pinchout", (ev) => {
            if (!this.readonly) {
                if (ev.type === "pinchstart") {
                    previousScaleY = this.scaleY;
                    previousScaleX = this.scaleX;
                }

                if (ev.offsetDirection & 24) {
                    this.scaleY = Math.max(previousScaleY * ev.scale, 0.25);
                }
                if (ev.offsetDirection & 6) {
                    this.scaleX = Math.max(previousScaleX * ev.scale, 1); // can't go below 1, as original view is the whole clip
                }
            }
        });

        var translateYOrigin = null;
        var translateXOrigin = null;

        var pan = ev => {
            if (ev.type === "panstart") {
                translateXOrigin = this.translateX;
                translateYOrigin = this.translateY;
            }
            if (translateYOrigin !== null) {
                this.translateY = translateYOrigin + ev.deltaY;
            }
            if (translateXOrigin !== null) {
                this.translateX =
                    Math.max(
                        Math.min(
                            translateXOrigin + (ev.deltaX / this.scaleX),
                            0
                        ),
                        this.clipViewPortWidth - this.clipViewPortWidth * this.scaleX // clipViewPortWidth is the whole clip duration at 1x zoom
                    );
            }
            if (ev.isFinal) {
                translateXOrigin = null;
                translateYOrigin = null;
            }
        };

        mc.on("panstart pan", (ev) => {
            if (!this.readonly) {
                pan(ev);
            }
        });

        let pitchNotesMoved;
        let pitchMoveFrom;
        mcLabels.on("hammer.input", (ev) => {
            if (ev.isFirst) {
                this.clipslot.begin_gesture();
                // panstart is apparently fired when we are already outside the pitch we want to move
                pitchMoveFrom = this.pitchAtPosition(ev.center.x, ev.center.y);
                pitchNotesMoved = this.getNotesAtPosition(pitchMoveFrom, this.clipslot.clip.loop_start, this.clipslot.clip.loop_end - this.clipslot.clip.loop_start);
                if (pitchNotesMoved.length) {
                    $(this.pitches.get(pitchMoveFrom)).addClass("selected");
                }
            }
            if (ev.isFinal) {
                this.clipslot.end_gesture();
                $(this.pitches.get(pitchMoveFrom)).removeClass("selected");
            }
        });
        mcLabels.on("pan panend", (ev) => {
            let pitch = this.pitchAtPosition(ev.center.x, ev.center.y);
            if (pitchNotesMoved.length && pitchNotesMoved[0].pitch != pitch) {
                let toPitchElement = this.pitches.get(pitch);

                $(this.pitches.get(pitchMoveFrom)).removeClass("selected");
                $(toPitchElement).addClass("selected");

                for (let note of pitchNotesMoved) {
                    this.clipslot.updateNote(note, pitch);
                    if (note.element.parentNode) {
                        note.element.parentNode.removeChild(note.element);
                    }
                    toPitchElement.appendChild(note.element);
                }
                pitchMoveFrom = pitch;
            }
        });
    }
}