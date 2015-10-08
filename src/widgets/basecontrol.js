import { inject, useShadowDOM, DOMBoundary, customElement, bindable } from 'aurelia-framework';
import Hammer from 'hammer';
import jQuery from 'jquery';
import { selectable, unselectable } from 'utils/unselectable';


export default class BaseControl {
    constructor(domBoundary) {
        this.domBoundary = domBoundary;
        this.element = domBoundary.host;
    }

    attached() {
        this.hammerSetup();
    }

    inUseChanged(on) {
        if (!on) {
            selectable();
            document.exitPointerLock();
        } else {
            unselectable();
            this.element.requestPointerLock();
        }
    }

    valueChanged() {
        this.value = Math.max(Math.min(1, this.value), 0);
    }
}
