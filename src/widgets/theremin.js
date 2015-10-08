import { inject, useShadowDOM, DOMBoundary, customElement, bindable } from 'aurelia-framework';
import BaseXY from 'widgets/basexy';

@customElement('theremin')
@useShadowDOM()
@inject(DOMBoundary)
export default class Theremin extends BaseXY {
    @bindable objectx;
    @bindable objecty;
    @bindable keyx;
    @bindable keyy;
    @bindable note;
}
