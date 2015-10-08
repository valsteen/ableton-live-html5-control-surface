import { MODES } from 'midi/scale';
import { NOTES, arpegiatorLabels, quantizationLabels } from 'widgets/utils';
import {LiveParameter, LiveSong, LiveTrack, get, LiveClipSlot} from 'live/index';
import {Strings} from 'widgets/piano';

export class LivePage {
    getLiveObject(path) {
        var classes = {
            'DeviceParameter': LiveParameter,
            'Track': LiveTrack,
            'Song': LiveSong,
            'ClipSlot': LiveClipSlot
        };

        return get(path).then(obj => {
            if (classes[obj.type]) {
                obj = new classes[obj.type](obj);
                return obj.ready.then(() => obj);
            } else {
                return obj;
            }
        });
    }

    constructor() {
        this.modes = Array.from(Object.keys(MODES));
        this.modes.push("Chromatic");
        this.notes = NOTES;
        this.modulations = {aftertouch: Strings.prototype.aftertouch};

        this.quantizationLabels = quantizationLabels;
        this.arpegiatorLabels = arpegiatorLabels;
    }
}