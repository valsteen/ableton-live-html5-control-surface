/* jshint -W097 */
"use strict";

import { inject, useShadowDOM, DOMBoundary, customElement, bindable, useView } from 'aurelia-framework';
import { selectable, unselectable } from 'utils/unselectable';
import Promise from 'bluebird';
import live from 'live/index';


@customElement('automationeditor')
@useShadowDOM()
@inject(DOMBoundary)
export default
class AutomationEditor {
    @bindable clipslot;
    @bindable parameter;
    @bindable quantization = 0.125;
    @bindable min = 0;
    @bindable max = 127;
    @bindable inUse;

    constructor(domBoundary) {
        this.domBoundary = domBoundary;

        this.attachedPromise = new Promise((resolve, reject) => {
            this.attachedDeferred = {'resolve': resolve, 'reject': reject};
        });

        this.clipslotReady = new Promise((resolve, reject) => {
            this.clipslotDeferred = {'resolve': resolve, 'reject': reject};
        });
        this.parameterReady = new Promise((resolve, reject) => {
            this.parameterDeferred = {'resolve': resolve, 'reject': reject};
        });
        this.ready = Promise.all([this.parameterReady, this.clipslotReady]);

        this.values = {};

        window.automationeditor = this;
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

    parameterChanged() {
        if (this.parameter) {
            this.parameter.ready.then(() => {
                this.parameterDeferred.resolve();
            });
        }
    }

    clipslotChanged() {
        if (this.clipslot) {
            this.clipslot.ready.then(() => {
                this.clipslotDeferred.resolve();
                Object.observe(this.clipslot.clip, (changes) => {
                    var attributes = new Set(changes.map((x) => x.name));
                    if (attributes.has("playing_position")) {
                        this.cursor.style.left = ((this.clipslot.clip.playing_position - this.clipslot.clip.loop_start) * this.beatWidth) + "px";
                    }
                });

                this.barWidth = this.box.width / ((this.clipslot.clip.loop_end - this.clipslot.clip.loop_start) / 4); // so viewport always display the entire clip
                this.beatWidth = this.barWidth / 4;
                this.clockWidth = this.beatWidth / 24;
                this.updateMarks();

                return this.reset_envelope();
            }).done();
        }
    }

    reset_envelope() {
        return this.ready.then(() => {
            return Promise.all([
                this.clipslot.clip.call("clear_envelope", this.parameter.liveObject),
                this.clipslot.clip.call("automation_envelope", this.parameter.liveObject)
            ]).spread((_, envelope) => {
                this.automation_envelope = envelope;
                return envelope;
            });
        });
    }

    attached() {
        this.canvas = $(this.domBoundary).find("canvas")[0];
        var $host = $(this.domBoundary.host);
        this.canvas.height = $host.height();
        this.canvas.width = $host.width();
        this.cursor = $(this.domBoundary).find("#cursor")[0];
        this.container = $(this.domBoundary).find("#container")[0];
        this.box = this.container.getBoundingClientRect();

        this.touchSetup();
        this.attachedDeferred.resolve();
    }

    valueAtPosition(y) {
        return Math.min(Math.max(this.min, ((this.box.bottom - y) / this.box.height) * (this.max - this.min) + this.min), this.max);
    }

    timeAtPosition(x) {
        return Math.round(((x - this.box.left) / this.beatWidth + this.clipslot.clip.loop_start) / this.quantization) * this.quantization;
    }

    quantizationChanged() {
        this.ready.then(() => this.reset_envelope()).then(() => {
            this.values = {};
            for (var i = 0; i <= (this.clipslot.clip.loop_end - this.clipslot.clip.loop_start); i += this.quantization) {
                this.values[i] = 63.5;
            }
            this.draw();
        }).done();
    }

    drawValue(time) {
        let getX = (time) => {
            return time / (this.clipslot.clip.loop_end - this.clipslot.clip.loop_start) * this.canvas.width;
        };

        let getY = (value) => {
            return (127 - value) / 127 * this.canvas.height;
        };

        var context = this.canvas.getContext("2d");
        context.strokeStyle = "#000";
        context.fillStyle = "#000";

        var shape = new Path2D();

        if (time > 0) {
            let previousTime = time > 0 ? time - this.quantization : 0;
            context.clearRect(getX(previousTime), 0, this.quantization * this.beatWidth, this.box.height);
            shape.moveTo(getX(previousTime), getY(this.values[previousTime]));
        }
        shape.lineTo(getX(time), getY(this.values[time]));

        if (time < this.clipslot.clip.loop_end - this.clipslot.clip.loop_start) {
            shape.lineTo(getX(time + this.quantization), getY(this.values[time + this.quantization]));
            context.clearRect(getX(time), 0, this.quantization * this.beatWidth, this.box.height);
        }
        context.stroke(shape);
    }

    draw() {
        for (let time = 0; time <= (this.clipslot.clip.loop_end - this.clipslot.clip.loop_start); time += this.quantization) {
            this.drawValue(time);
        }
    }

    inUseChanged() {
        if (this.inUse) {
            unselectable();
        } else {
            selectable();
        }
    }

    touchSetup() {
        let touchHandler = (ev) => {
            if (ev.type.indexOf("touch") === 0 || (ev.type === "mousedown" || (ev.type === "mousemove" && ev.buttons !== 0))) {
                var touches;

                if (!ev.touches) {
                    touches = [ev];
                } else {
                    //touches = ev.touches;
                    touches = Array.from(ev.touches).filter((touch) => touch.target === this.domBoundary.host);
                }

                for (var touch of touches) {
                    let time = this.timeAtPosition(touch.pageX);
                    let value = this.valueAtPosition(touch.pageY);
                    this.values[time] = value;
                    this.drawValue(time);
                    this.automation_envelope.call('insert_step', time, 0, value);
                }

                this.inUse = !ev.isFinal;
            }
        };

        this.domBoundary.host.addEventListener("touchstart", touchHandler, true);
        this.domBoundary.host.addEventListener("touchmove", touchHandler, true);
        this.domBoundary.host.addEventListener("touchend", touchHandler, true);
        this.domBoundary.host.addEventListener("mousedown", touchHandler, true);
        this.domBoundary.host.addEventListener("mouseup", touchHandler, true);
        this.domBoundary.host.addEventListener("mousemove", touchHandler, true);
    }
}