import { inject, useShadowDOM, DOMBoundary, customElement, bindable, useView } from 'aurelia-framework';
import BaseXY from 'widgets/basexy';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';


@customElement('pan-select')
@useShadowDOM()
@inject(DOMBoundary)
export class PanSelect {
    @bindable choices;
    @bindable height;
    @bindable width;
    @bindable previewcount = 2;
    @bindable side = "right";
    @bindable inUse = false;
    @bindable selected;

    constructor(domBoundary) {
        this.domBoundary = domBoundary;
    }

    sideChanged() {
        this.sideIsVertical = this.side === "left" || this.side === "right" || this.side === "vertical";
        this.sideIsHorizontal = this.side === "top" || this.side === "bottom" || this.side === "horizontal";
        this.sideIsTop = this.side === "top";
        this.sideIsBottom = this.side === "bottom";
        this.sideIsRight = this.side === "right";
        this.sideIsLeft = this.side === "left";
    }

    attached() {
        if (!this.height) {
            this.height = window.innerHeight / 12 - 5;
        }
        if (!this.width) {
            this.width = window.innerWidth / 12 - 5;
        }
        this.selectBox = $(this.domBoundary).find(".selected")[0];
        this.choicesBox = $(this.domBoundary).find(".choices")[0];
        this.$scrollBox = $(this.domBoundary).find(".scroll");
        this.hammerSetup();
        this.selectedChanged(); // makes sure CSS margin is set to initial selection
    }

    choicesChanged() {
        this.selectedChanged();
    }

    selectedChanged() {
        if (this.choices && this.selected !== null) {
            this.floatPosition = this.choices.findIndex(x => this.selected == x);
        }
    }

    get position() {
        let position = Math.round(this._floatPosition);
        if (position >= this.choices.length) {
            position = this.choices.length -1 ;
        } else if (position < 0) {
            position = 0;
        }
        return position;
    }

    get floatPosition() {
        return this._floatPosition;
    }

    set floatPosition(value) {
        if (value < 0 || this.choices.length === 0) {
            value = 0;
        } else if (value >= this.choices.length) {
            value = this.choices.length - 1;
        }

        this._floatPosition = value;

        if (this.$scrollBox) {
            if (this.sideIsVertical) {
                this.$scrollBox.css({"margin-top": (this.previewcount - this.position) * (this.height - 1)});
            } else {
                this.$scrollBox.css({"margin-left": (this.previewcount - this.position) * (this.width - 1)});
            }
        }

        this.selected = this.choices[this.position];
    }

    hammerSetup() {
        var selectHammer = new Hammer.Manager(this.selectBox, {
            recognizers: [
                [Hammer.Pan, {
                    direction: this.sideIsVertical ? Hammer.DIRECTION_VERTICAL : Hammer.DIRECTION_HORIZONTAL,
                    threshold: this.sideIsVertical ? this.height / 4 : this.width / 4
                }],
                [Hammer.Press, {
                    time: 10
                }]
            ]
        });

        selectHammer.get('pan').recognizeWith(selectHammer.get('press'));

        var startMove = () => {
            if (!this.inUse) {
                lastDeltaSelect = 0;
                lastDeltaTap = 0;
                unselectable();
                this.inUse = true;
            }
        };

        var endMove = () => {
            lastDeltaSelect = 0;
            this.inUse = false;
            tapHammer.stop(true);
            selectHammer.stop(true);
        };

        selectHammer.on("pressup panend pancancel", (ev) => {
            endMove();
        });

        var lastDeltaSelect = 0;
        selectHammer.on("hammer.input", (ev) => {
            // when another element covers the target it seems we never receive the "pressup"
            // as a workaround we catch "isFinal"
            if (ev.isFinal) {
                endMove();
            }
        });

        selectHammer.on("press panstart", (ev) => {
            startMove();
        });

        if (this.sideIsVertical) {
            selectHammer.on("panup pandown", (ev) => {
                startMove();
                this.floatPosition -= (ev.deltaY - lastDeltaSelect) / this.height;
                lastDeltaSelect = ev.deltaY;
            });
        } else {
            selectHammer.on("panleft panright", (ev) => {
                startMove();
                this.floatPosition -= (ev.deltaX - lastDeltaSelect) / this.width;
                lastDeltaSelect = ev.deltaX;
            });
        }

        // the other finger can "take over", in which case the overlay stays there
        // until we tap or leave all fingers

        var tapHammer = new Hammer.Manager(this.choicesBox, {
            recognizers: [
                [Hammer.Tap, {
                    time: 1000,
                    threshold: 5
                }],
                [Hammer.Pan, {
                    direction: this.sideIsVertical ? Hammer.DIRECTION_VERTICAL : Hammer.DIRECTION_HORIZONTAL,
                    threshold: this.sideIsVertical ? this.height / 4 : this.width / 4
                }]
            ]
        });
        tapHammer.get('pan').recognizeWith(tapHammer.get('tap'));

        tapHammer.on("tap", (ev) => {
            this.floatPosition = $(ev.target).closest(".choice").index();
            endMove();
        });

        var lastDeltaTap = 0;
        if (this.sideIsVertical) {
            tapHammer.on("panup pandown", (ev) => {
                if (lastDeltaTap === undefined) {
                    // grace period, skip ( see hammer.input )
                    return;
                }
                this.floatPosition -= (ev.deltaY - lastDeltaTap) / this.height;
                lastDeltaTap = ev.deltaY;
            });
        } else {
            tapHammer.on("panleft panright", (ev) => {
                if (lastDeltaTap === undefined) {
                    // grace period, skip ( see hammer.input )
                    return;
                }
                this.floatPosition -= (ev.deltaX - lastDeltaTap) / this.width;
                lastDeltaTap = ev.deltaX;
            });
        }

        tapHammer.on("pressup panend pancancel", (ev) => {
            lastDeltaTap = 0;
            tapHammer.stop(true);
        });

        tapHammer.on("hammer.input", (ev) => {
            if (ev.isFinal) {
                // super annoying bug, sometimes pressup is not there, so we need hammer.input
                // but if we just stop the event, tap is never recognized.
                // if we set lastDeltaTap = 0, a pan may be fired just after, triggering a strange jump.
                // solution is to ignore pan for 200ms after a final event
                lastDeltaTap = undefined;
                setTimeout(
                    () => {
                        lastDeltaTap = 0;
                    }, 200
                );
            }
        });

    }
}
