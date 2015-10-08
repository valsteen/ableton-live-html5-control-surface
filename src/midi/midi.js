export default {
    isInitialized: false,
    listeners: [],
    outputs: {},
    send: function (data, name) {
        if (!this.outputs[name]) {
            console.error("No such device", name);
        } else {
            this.outputs[name].send(data);
        }
    },
    init: function () {
        var self = this;

        if (this.isInitialized) {
            return;
        }

        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess({
                sysex: location.protocol === "https:"
            }).then(midiAccess => {
                var inputs = midiAccess.inputs.values();
                var outputs = midiAccess.outputs.values();

                function dispatch(message, name) {
                    for (let listener of self.listeners) {
                        listener(message, name);
                    }
                }

                var registerListeners = (inputs, outputs) => {
                    var saved_inputs = [];
                    for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
                        if (input.value.name !== "WebAPI") {
                            // each time there is a midi message call the onMIDIMessage function
                            ((name) => {
                                input.value.onmidimessage = (message) => dispatch(message, name);
                            })(input.value.name + ":" + input.value.id);
                        } else {
                            // we are on the same computer as the server
                            this.isLocal = true ;
                        }
                        saved_inputs.push(input);
                    }

                    this.outputs = {};
                    // can't reliably match input/output ports. Falling back on system order
                    for (let input of saved_inputs) {
                        let output = outputs.next();
                        this.outputs[input.value.name + ":" + input.value.id] = output.value;
                    }

                    return saved_inputs;
                };

                var previousInputs = this.inputs = registerListeners(inputs, outputs);

                midiAccess.onstatechange = () => {
                    var inputIterator = previousInputs.entries();
                    for (let input = inputIterator.next(); input && !input.done; input = inputIterator.next()) {
                        input.value.onmidimessage = null;
                    }
                    this.inputs = previousInputs = registerListeners(midiAccess.inputs.values(), midiAccess.outputs.values());
                };
            });
        }
        this.isInitialized = true;
    },
    registerListener: function (listener) {
        this.init();
        this.listeners.push(listener);
    }
};
