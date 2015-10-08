/* jshint -W097 */
"use strict";
import {NOTES as SCALE_NOTES} from 'midi/scale';
import Promise from 'bluebird';

export var NOTES = SCALE_NOTES.map(x => x.replace(/ /, ""));

function pair(label, value) {
    return {toString: () => label, valueOf: () => value};
}

function pairArray() {
    var array = [];
    for (var i = 0; i < arguments.length; ++i) {
        array.push(pair(arguments[i], i));
    }
    return array;
}

function LabelledPairArray() {
    var array = [];
    for (var i = 0; i < arguments.length; i += 2) {
        array.push(pair(arguments[i], arguments[i + 1]));
    }
    return array;
}

export var arpegiatorLabels = pairArray(
    'Up',
    'Down',
    'UpDown',
    'DownUp',
    'Up & Down',
    'Down & Up',
    'Converge',
    'Diverge',
    'Con & Diverge',
    'Pinky Up',
    'Pinky UpDown',
    'Thumb Up',
    'Thumb UpDown',
    'Play Order',
    'Chord Trigger',
    'Random',
    'Random Other',
    'Random Once'
);

export var quantizationLabels = LabelledPairArray('1/32', 0.125, '1/16', 0.25, '1/8', 0.5, '1/4', 1, '1/2', 2, '1', 4);
