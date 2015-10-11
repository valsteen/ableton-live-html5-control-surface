import io from 'socket.io-client';

var url = window.location.protocol + "//" + window.location.host + "/";
var opts = {transports: ["websocket"]};

export var iorequest = io(url, opts);
export var ioevents = io(url + 'events', opts);
export var iomidi = io(url + 'midi', {transports: ["websocket"], forceNew: true});