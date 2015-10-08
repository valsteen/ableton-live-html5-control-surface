import { inject, useShadowDOM, DOMBoundary, customElement, bindable } from 'aurelia-framework';
import BaseXY from 'widgets/basexy';

@customElement('xy')
@useShadowDOM()
@inject(DOMBoundary)
export default
class XY extends BaseXY {
    @bindable x;
    @bindable y;
    @bindable z;
    @bindable inUse;

    constructor(domBoundary) {
        super(domBoundary);
        this.widgetWidth = 30;
        this.widgetHeight = 30;
    }

    attached() {
        super.attached();
        this.guide = $(this.domBoundary).find(".guide")[0];
        this.guide.width = this.width;
        this.guide.height = this.height;
    }

    drawZone() {
        this.bounds.width = this.width;
        this.bounds.height = this.height;

        var context = this.bounds.getContext('2d');
        context.beginPath();
        context.fillStyle = "rgba(230, 230, 230, 0.5)";
        context.fillRect(0, 0, this.width, this.height);
        context.strokeStyle = "rgba(150, 150, 150, 0.5)";

        for (let i = 0; i <= this.width; i += this.width / 8) {
            context.moveTo(i, 0);
            context.lineTo(i, this.height);
        }
        for (let i = 0; i <= this.height; i += this.height / 8) {
            context.moveTo(0, i);
            context.lineTo(this.height, i);
        }
        context.stroke();
        context.closePath();
    }

    xChanged() {
        super.xChanged();
        this.drawGuides();
    }

    yChanged() {
        super.yChanged();
        this.drawGuides();
    }

    inUseChanged(value) {
        super.inUseChanged(value);
        $(this.guide).css({"display": this.inUse ? "block" : "none"});
    }

    drawGuides() {
        if (this.inUse) {
            var context = this.guide.getContext('2d');
            context.beginPath();
            context.clearRect(0, 0, this.width, this.height);
            context.strokeStyle = "rgba(50, 50, 50, 0.5)";


            context.moveTo(this.widgetWidth / 2 + (this.width - this.widgetWidth) * this.x, 0);
            context.lineTo(this.widgetWidth / 2 + (this.width - this.widgetWidth) * this.x, this.height);

            context.moveTo(0, this.widgetHeight / 2 + (this.height - this.widgetHeight) * (1 - this.y));
            context.lineTo(this.width, this.widgetHeight / 2 + (this.height - this.widgetHeight) * (1 - this.y));

            context.stroke();
            context.closePath();
        }
    }
}