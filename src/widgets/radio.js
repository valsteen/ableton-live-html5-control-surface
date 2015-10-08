import { inject, useShadowDOM, DOMBoundary, customElement, bindable } from 'aurelia-framework';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';
import { NOTES, MidiState } from 'midi/midi-state';

// use for chords. To retest ...
export class CompoundControl {
    // is "active" only when all its controls are active
    constructor(name, controls) {
        this.name = name;
        this.controls = controls;

        var update = (function () {
            // note: this just marks the CompoundCountrol for visual feedback
            // to deactivate all the subcontrols, deactivate() must be called
            var active = controls.findIndex(x => !x.active) === -1;
            if (this.active != active) {
                this.active = active;
            }
        }).bind(this);

        for (var control of controls) {
            Object.observe(control, update);
        }

        update();
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
    }

    toString() {
        return this.name;
    }
}

export class ChordControl extends CompoundControl {
    constructor(name, controls, velocity) {
        super(name, controls);
        this.velocity = velocity;
    }
    activate() {
        for (var control of this.controls) {
            control.activate(this.velocity, this.name);
        }
    }

    deactivate() {
        for (var control of this.controls) {
            control.deactivate(this.velocity, this.name);
        }
    }
}

export class RadioControl {
    // a compound control that deactivates all other controls when one is activated
    constructor(controls) {
        this.controls = controls;
    }

    activateControl(control) {
        if (control.active) {
            return;
        }
        for (let subControl of this.controls) {
            if (this.retrigger || subControl !== control) {
                subControl.deactivate();
            }
        }

        control.activate();
    }
}

@customElement('radio')
@useShadowDOM()
@inject(DOMBoundary)
class Radio {
    // [{control: ... label: ...}, ...]
    @bindable controls;
    @bindable hold = false; // if hold is false, leaving button deactivates everything. If true, the activated control must be touched again
    @bindable columns ; // will arrange in rows if exceeds the width
    @bindable gesturecontrol;

    constructor(domBoundary) {
        this.domBoundary = domBoundary;
    }

    controlsChanged() {
        this.radioControl = new RadioControl(this.controls);
        this.rows = Math.ceil(this.controls.length/this.columns);
        var buttonHeight = 100/this.rows + "%";
        this.buttonstyle = "width: " + (100/this.columns) + "%; height: " + buttonHeight ;
    }

    attached() {
        var mc = new Hammer(this.domBoundary.host);
        var box = this.domBoundary.host.getBoundingClientRect();

        var singleTouchDisabling; // keep track of tap to disable when holding
        var previous = null ;
        mc.on("hammer.input", (ev) => {
            if (ev.isFirst && this.gesturecontrol) {
                this.gesturecontrol.begin_gesture();
            }
            if (ev.isFinal && this.gesturecontrol) {
                this.gesturecontrol.end_gesture();
            }
            var x = ev.pointers[0].pageX - box.left;
            var y = ev.pointers[0].pageY - box.top;

            var row = Math.floor(y/(box.height/this.rows));
            var column = Math.floor(x/(box.width/this.columns));
            let index = null;

            if (!(row >= this.rows || column >= this.columns || row < 0 || column < 0)) {
                index = column + row * this.columns;

                if (index !== previous) {
                    if (previous === null && this.controls[index].active) {
                        singleTouchDisabling = index;
                    } else {
                        singleTouchDisabling = null;
                    }
                    this.radioControl.activateControl(this.controls[index]);
                }
            }

            if (ev.isFinal) {
                previous = null;
                if (!this.hold) {
                    for (let control of this.controls) {
                        control.deactivate();
                    }
                } else if (singleTouchDisabling) {
                    this.controls[singleTouchDisabling].deactivate();
                }
            } else {
                previous = index;
            }
        });
    }
}

export { Radio };
