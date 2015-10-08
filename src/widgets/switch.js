import { inject, useShadowDOM, DOMBoundary, customElement, bindable } from 'aurelia-framework';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';
import { NOTES, MidiState } from 'midi/midi-state';


@customElement('switch')
@useShadowDOM()
@inject(DOMBoundary) class Switch {
    @bindable label;
    @bindable pushbutton;
    @bindable inUse;
    @bindable active;

    constructor(domBoundary) {
        this.domBoundary = domBoundary;
    }

    activeChanged() {
        if (this.active) {
            this.$button.addClass("active");
        } else {
            this.$button.removeClass("active");
        }
    }

    attached() {
        this.$button = $(this.domBoundary).find("div");

        var mc = new Hammer.Manager(this.$button[0], {
            recognizers: [
                [Hammer.Press, {time: 1, threshold: 1}]
            ]
        });

        // need to refactor to pure dom listener ; "press" is no more received when touching pad control at the same time
        mc.on("hammer.input", (ev) => {
            if (ev.isFirst) {
                this.inUse = true;
                this.active = !this.active;
            }

            if (ev.isFinal) {
                if (this.pushbutton) {
                    this.active = false;
                }
                this.inUse = false;
            }
        });
    }
}

export { Switch };
