/* jshint -W097 */
"use strict";

importScripts('/jspm_packages/system.js', '/config.js');

function PadWorker() {
    var drawCache = new Map();

    var self = {};

    var COMMANDS = ['beginPath', 'fillRect', 'rect', 'stroke', 'closePath', 'set', 'fillText'] ;

    function Commands() {
        var commands = {commands: []};
        function makeFunction(command) {
            return function() {
                let parameters = Array.prototype.slice.call(arguments);
                commands.commands.push([command, parameters]);
            };
        }
        for (let command of COMMANDS) {
            commands[command] = makeFunction(command);
        }
        return commands;
    }

    self.update = function (obj) {
        Object.assign(self, obj);
        this.noteNames = new Map(this.noteNames);
    };

    self.draw = function(parameters) {
        var context = Commands();
        context.set("font", self.noteHeight/4 + "px Arial");
        context.set("textAlign", "center");

        var scaleIntervals = parameters.scaleIntervals;
        var basenote = parameters.basenote;
        var midiStates = new Map(parameters.midiStates);

        var fillStyle;

        for (let _row = 0; _row < self.rows; ++_row) {
            let row = self.rows - _row - 1; // convert to inverted vertical scale

            // first note is this.basenote + row * 3
            let firstKey = _row * (self.factor);

            for (let column = 0; column < self.columns; ++column) {
                let position = firstKey + column;
                let interval = scaleIntervals[position % scaleIntervals.length];
                let octave = Math.floor(position / scaleIntervals.length);

                let key = basenote + interval + octave * 12;
                let midiState = midiStates.get(key);

                if (midiState) {
                    if (midiState.active) {
                        fillStyle = "#999999";
                    } else if ((firstKey + column) % scaleIntervals.length === 0) {
                        fillStyle = "#3333ff";
                    } else {
                        fillStyle = "#ffffff";
                    }

                    if (drawCache.get(row + "-" + column) === fillStyle) {
                        continue; // skip
                    }

                    var left = self.noteWidth * column;
                    var top = row * self.noteHeight;

                    context.beginPath();

                    context.set('fillStyle', fillStyle);
                    context.fillRect(left + 1, top + 1, self.noteWidth - 1, self.noteHeight - 1);

                    context.set('lineWidth', 1);
                    context.set('strokeStyle', "#000");

                    context.rect(
                        left + 0.5,
                        top + 0.5,
                        self.noteWidth - 0.5,
                        self.noteHeight - 0.5
                    );
                    context.stroke();
                    context.closePath();

                    let note = this.noteNames.get(key);
                    if (note && midiState.name !== note.name) {
                        context.set('fillStyle', "#000");
                        context.fillText(note.name.split(" ")[0],left + self.noteWidth / 2, top + self.noteHeight*0.60);
                    }

                    drawCache.set(row + "-" + column, context.fillStyle);
                }
            }
        }
        return context;
    };

    return self;
}

var systemPromise = System.import('core-js');
var padWorker;

var padWorkerPromise = systemPromise.then(() => {
    padWorker = PadWorker();
});

onmessage = function (event) {
    padWorkerPromise.then(() => {
        if (event.data.method == "update") {
            padWorker.update(event.data.parameters);
        } else if (event.data.method == "draw") {
            var commands = padWorker.draw(event.data.parameters);
            postMessage({method: 'commands', commands: commands.commands});
        }
    });
};
