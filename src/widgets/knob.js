import { inject, useShadowDOM, DOMBoundary, customElement, bindable } from 'aurelia-framework';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';
import BaseControl from 'widgets/basecontrol';

@customElement('knob')
@useShadowDOM()
@inject(DOMBoundary)
class Knob extends BaseControl {
    @bindable inUse = false;
    @bindable value;

    valueChanged() {
        super.valueChanged();
        var canvas = this.canvas;
        canvas.width = 100;
        canvas.height = 100;
        var context = canvas.getContext('2d');
        var centerX = 50;
        var centerY = 50;
        var radius = 45;

        context.beginPath();
        var toRadians = (x) => x/180 * Math.PI + Math.PI/2;
        context.arc(centerX, centerY, radius, toRadians(30), toRadians(330));

        context.lineWidth = 5;
        context.strokeStyle = '#999';
        context.stroke();

        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineWidth = 5;
        context.strokeStyle = '#999';
        var valueToAngle = toRadians(this.value * 300 + 30);
        context.lineTo(Math.cos(valueToAngle) * radius + centerX, Math.sin(valueToAngle) * radius + centerY);
        context.stroke();
    }

    attached() {
        // same distance for horizontal/vertical pan
        this.distance = $(window).height() / 2;
        this.canvas = $(this.domBoundary).find("canvas")[0];
        var $host = $(this.domBoundary.host);

        let size = Math.min($host.height(),$host.width());
        $(this.canvas).css({height: size+"px", width: size+"px"});
        this.canvas.height = size;
        this.canvas.width = size;
        super.attached();
    }

    hammerSetup() {
        var mc = new Hammer.Manager(this.element, {
            recognizers: [
                [Hammer.Pan, { direction: Hammer.DIRECTION_ALL }]
            ]
        });

        var startValue ;
        var startX ;
        var startY;

        mc.on("pan", (ev) => {
            var pointer = ev.pointers[0];

            if (!this.inUse) {
                this.inUse = true;
                startValue = this.value;
                startX = pointer.pageX;
                startY = pointer.pageY;
            }

            var deltaX = (pointer.pageX - startX) / this.distance;
            var deltaY = (startY - pointer.pageY) / this.distance;

            this.value = startValue + deltaX + deltaY ;

            // user is currently touching the control
            this.inUse = !ev.isFinal;
        });

        mc.on("hammer.input", (ev) => {
            // still not sure how to catch all release events
            if (!this.inUse && !ev.isFinal) {
                var pointer = ev.pointers[0];
                startValue = this.value; // prevent side-effect of this event firing before
                startX = pointer.pageX;
                startY = pointer.pageY;
            }
            this.inUse = !ev.isFinal;
            if (!this.inUse) {
                mc.stop(true);
            }
        });
    }

    inUseChanged(on) {
        super.inUseChanged(on);

        if (on) {
            this.mouseListener = (ev) => {
                this.value += (ev.movementX - ev.movementY) / this.distance;
            };
            this.element.addEventListener("mousemove", this.mouseListener);
        } else {
            this.element.removeEventListener("mousemove", this.mouseListener);
        }

    }
}

export default Knob;