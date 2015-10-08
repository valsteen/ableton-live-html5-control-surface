import { inject, DOMBoundary, customAttribute, bindable } from 'aurelia-framework';

@customAttribute('visible')
@inject(Element)
export class Visible {
    constructor(element) {
        this.element = element;
    }

    valueChanged(newValue) {
        if (newValue) {
            this.element.classList.remove('invisible');
        } else {
            this.element.classList.add('invisible');
        }
    }
}