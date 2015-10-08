import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';


export default class BaseXY {
    constructor(domBoundary) {
        this.domBoundary = domBoundary;
        this.height = 200;
        this.width = 200;
        this.widgetWidth = 50;
        this.widgetHeight = 50;
    }

    attached() {
        this.bounds = $(this.domBoundary).find(".bounds")[0];
        this.controlShape = $(this.domBoundary).find(".control-shape")[0];
        this.drawZone();
        this.canvasSetup();
        this.hammerSetup();
    }

    inUseChanged() {
        if (this.inUse) {
            unselectable();
        } else {
            selectable();
        }

        this.z = this.inUse;

        $(this.bounds).css("display", this.inUse ? "block" : "none");
    }

    xChanged() {
        $(this.controlShape).css("left", (this.width - this.widgetWidth) * (this.x - 0.5));
    }

    yChanged() {
        $(this.controlShape).css("top", (this.height - this.widgetHeight) * (0.5 - this.y));
    }

    drawZone() {
        this.bounds.width = this.width;
        this.bounds.height = this.height;

        var context = this.bounds.getContext('2d');
        context.beginPath();
        context.fillStyle = "rgba(230, 230, 230, 0.5)";
        context.fillRect(0, 0, this.width, this.height);
        context.closePath();
    }

    canvasSetup() {
        var canvas = this.controlShape;
        canvas.width = this.widgetWidth;
        canvas.height = this.widgetHeight;
        var context = canvas.getContext('2d');
        var centerX = canvas.width / 2;
        var centerY = canvas.height / 2;
        var radius = this.widgetWidth / 2;

        context.beginPath();
        context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        context.fillStyle = '#999';
        context.fill();
        context.closePath();
    }

    hammerSetup() {
        var mc = new Hammer.Manager(this.controlShape, {
            recognizers: [
                [Hammer.Pan, {
                    direction: Hammer.DIRECTION_ALL,
                    threshold: 1
                }],
                [Hammer.Press, {
                    time: 1,
                    threshold: 1
                }]
            ]
        });

        var updateValue = (ev) => {
            var pointer = ev.pointers[0];

            let x = (pointer.pageX - this.box.left + this.width / 2 - this.widgetWidth) / (this.width - this.widgetWidth);
            let y = 1 - (pointer.pageY - this.box.top + this.height / 2 - this.widgetHeight) / (this.height - this.widgetHeight);

            this.x = Math.max(Math.min(1, x), 0);
            this.y = Math.max(Math.min(1, y), 0);

            // user is currently touching the control
            this.inUse = !ev.isFinal;
        };

        mc.on("pan", updateValue);

        mc.on("press", (ev) => {
            // boundingclient changes during page load
            // repeated calls to this are known costly, so do it when starting using it
            this.box = this.domBoundary.host.getBoundingClientRect();
            this.inUse = true;
        });

        mc.on("pressup", (ev) => {
            this.inUse = false;
        });
    }
}
