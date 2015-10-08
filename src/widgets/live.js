/* jshint -W097 */
"use strict";

import {customElement, bindable, noView, dynamicOptions } from 'aurelia-framework';
import { getScale } from 'midi/scale';
import { getChords } from 'midi/find-chord';
import { ChordControl } from 'widgets/radio';

class LiveWidget {
    bind(context) {
        this.context = context;
        this.getLiveObject = this.context.getLiveObject(this.path);
    }
}

@customElement('parameter')
@noView()
export class LiveParameter extends LiveWidget {
    @bindable path;
    @bindable value;
    @bindable inUse;

    constructor() {
        super();
        this.ready = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
        });
    }

    valueChanged() {
        if (this.value !== null) {
            this.getLiveObject.then((liveObject) => {
                if (typeof liveObject.value === "number") {
                    let value;
                    if (typeof this.value === "boolean") {
                        value = this.value ? liveObject.max : liveObject.min;
                    } else if (typeof this.value === "number") {
                        value = this.value * (liveObject.max - liveObject.min) + liveObject.min;
                    } else {
                        value = this.value.valueOf();
                    }
                    liveObject.value = value;
                } else {
                    liveObject.value = this.value.valueOf();
                }
            }).done();
        }
    }

    inUseChanged() {
        this.getLiveObject.then((liveObject) => {
            if (this.inUse) {
                liveObject.begin_gesture();
            } else {
                liveObject.end_gesture();
            }
        }).done();
    }

    bind(context) {
        super.bind(context);
        this.getLiveObject.then((liveObject) => {
            this.parameter = liveObject;
            liveObject.ready.then(() => {
                this.resolveReady();
            });

            Object.observe(liveObject, (changes) => {
                if (changes.findIndex(x => x.name === "value") > -1) {
                    let value;
                    if (typeof liveObject.value === "number" && typeof this.value === "number") {
                        value = (liveObject.value - liveObject.min) / (liveObject.max - liveObject.min);
                    } else {
                        value = liveObject.value;
                    }

                    // this avoids to override label/value pair from a pan-select
                    if (this.value != value) {
                        this.value = value;
                    }
                }
            });
            if (typeof liveObject.value === "number") {
                this.value = (liveObject.value - liveObject.min) / (liveObject.max - liveObject.min);
            } else {
                this.value = liveObject.value;
            }
        });
    }
}

@customElement('live-track') // warning: "track" is a html5 tag. Naming a custom tag track will create silent bugs
@noView()
export class LiveTrackWidget extends LiveWidget {
    @bindable path;

    bind(context) {
        super.bind(context);
        this.getLiveObject.then((liveObject) => {
            this.track = liveObject;
        }).done();
    }

    stop() {
        this.getLiveObject.then((liveObject) => liveObject.channel.stopNotes()).done();
    }
}

@customElement('clip-slot')
@noView()
export class LiveClipSlotWidget extends LiveWidget {
    @bindable path;
    @bindable play;

    bind(context) {
        super.bind(context);
        this.getLiveObject.then((liveObject) => {
            this.clipslot = liveObject;

            Object.observe(this.clipslot, (changes) => {
                if (changes.findIndex(x=>x.name === "is_playing") > -1) {
                    this.play = this.clipslot.is_playing;
                }
            });
            this.play = this.clipslot.is_playing;
        }).done();
    }

    playChanged() {
        this.getLiveObject.then((liveObject) => {
            liveObject.play = this.play;
        }).done();
    }
}

@customElement('scale')
@noView()
export class Scale {
    // maybe expose possible modes, rootnote and octaves as well
    @bindable mode;
    @bindable rootnote;

    rootnoteChanged() {
        this.scale = getScale(this.rootnote + " " + this.mode);
    }

    modeChanged() {
        this.scale = getScale(this.rootnote + " " + this.mode);
    }
}

@customElement('song')
@noView()
export class Song extends LiveWidget {
    @bindable path;
    @bindable sessionRecord;

    /* this is redundant code to map widget value to live value, there should be a factory function */
    sessionRecordChanged() {
        this.getLiveObject.then((liveObject) => {
            liveObject.session_record = this.sessionRecord;
        }).done();
    }

    bind(context) {
        super.bind(context);
        this.getLiveObject.then((liveObject) => {
            Object.observe(liveObject, (changes) => {
                if (changes.findIndex(x => x.name === "session_record") > -1) {
                    this.sessionRecord = liveObject.session_record;
                }
            });
            this.sessionRecord = liveObject.session_record;
        });
    }
}

@customElement('radio-controls')
@noView()
export class RadioControls {
    @bindable values;
    @bindable range;

    bind(context) {
        this.context = context;
    }

    attached() {
        let controls = [];
        for (let i = 0; i < this.values.length; ++i) {
            controls.push(((i) => {
                let control = {};
                control.activate = () => {
                    control.active = true;
                };
                control.deactivate = () => {
                    control.active = false;
                };
                control.fixedValue = (this.values[i] + this.range/2) / this.range;
                control.toString = () => {
                    return this.values[i];
                };

                Object.observe(control, () => {
                    if (control.active && this.value !== control.fixedValue) {
                        this.value = control.fixedValue;
                    }
                });
                return control;
            })(i));
        }

        Object.observe(this, (changes) => {
            if (changes.findIndex(x => x.name === "value") > -1) {
                for (let control of controls) {
                    control.active = Math.round(this.value*this.range) === Math.round(control.fixedValue*this.range);
                }
            }
        });

        this.controls = controls;
    }
}

@customElement('chords')
@noView()
export class Chords {
    // TODO a bit messy for now, it has been isolated but not thoroughly refactored

    @bindable track;
    @bindable scale;
    @bindable baseoctave;

    constructor() {
        this.chords = [];
    }

    update() {
        if (this.track === null || this.scale === null || this.baseoctave === null) {
            return;
        }

        this.track.ready.then(() => {
            if (this.scale.mode !== "Major" && this.scale.mode !== "Minor") {
                this.chords = [];
                return;
            }
            var chords = getChords((this.baseoctave + 3) * 12 + this.scale.rootNote, this.scale.mode.toLowerCase());
            var allChordsControls = [];
            for (let inversion = 0; inversion < 3; ++inversion) {
                for (let chord of chords) {
                    allChordsControls.push(new ChordControl(
                        chord[inversion].name,
                        chord[inversion].notes.map(x => this.track.channel.notes.get(x)),
                        100
                    ));
                }
            }
            this.chords = allChordsControls;
        });
    }

    trackChanged() {
        requestAnimationFrame(() => this.update());
    }

    scaleChanged() {
        requestAnimationFrame(() => this.update());
    }

    baseoctaveChanged() {
        requestAnimationFrame(() => this.update());
    }
}