import { inject, useShadowDOM, DOMBoundary, customElement, bindable } from 'aurelia-framework';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';
import BaseControl from 'widgets/basecontrol';

// TODO : broken after refactoring. Widget has a cool look but is not the best option

@customElement('fader')
@useShadowDOM()
@inject(DOMBoundary)
class Fader extends BaseControl {
    @bindable control;
    @bindable min = 0;
    @bindable max = 127;
    @bindable release;
    @bindable pressobject;
    @bindable pressvalue = 100;

    constructor(domBoundary) {
        super(domBoundary)
        this.name = "fader"
    }

    setPosition () {
        // TODO widget height is ignored, apparently
        this.$faderWidget.css("top", ((this.max - this.value - this.min) / (this.max - this.min)) * this.height - (this.widgetHeight / 2));
    }

    get box() {
        if (!this._box) {
            this._box = this.$faderLine[0].getBoundingClientRect();
            // this isn't great but first value we get is wrong, until layout has stabilized.
            // next thing would be to listen to layout change via dynamic adding
            setTimeout(() => {
                this._box = this.$faderLine[0].getBoundingClientRect();
            }, 1000);
        }
        return this._box;
    }

    get widgetBox() {
        this._widgetBox = this.$faderWidget[0].getBoundingClientRect();
        setTimeout(() => {
            this._widgetBox = this.$faderWidget[0].getBoundingClientRect();
        }, 1000);
        return this._widgetBox;
    }

    get top() {
        return this.box.top;
    }

    get height() {
        return this.box.height;
    }

    get widgetHeight() {
        return this.widgetBox.height;
    }

    attached() {
        this.$faderLine = $(this.domBoundary).find(".line");
        this.$faderWidget = $(this.domBoundary).find(".widget");

        super.attached();
    }

    hammerSetup() {
        var mc = new Hammer.Manager(this.element, {
            recognizers: [
                [Hammer.Pan, { direction: Hammer.DIRECTION_VERTICAL }],
                [Hammer.Press, { time: 5 }]
            ]
        });

        var updateValue = (ev) => {
            var pointer = ev.pointers[0];
            this.value = this.max - (pointer.pageY - this.top) / this.height * (this.max - this.min) + this.min;
            this.control.activate(this.value, this.name);
            // user is currently touching the control
            this.inUse = !ev.isFinal ;
        };

        mc.on("hammer.input", (ev) => {
            // still not sure how to catch all release events
            this.inUse = !ev.isFinal;
            if (!this.inUse) {
                mc.stop(true);
            }
        })
        mc.on("press", updateValue);
        mc.on("pan", updateValue);
    }
}

export default Fader;
