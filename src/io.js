import io from 'socket.io-client';

var url = window.location.protocol + "//" + window.location.host + "/" ;

export var iorequest = io(url);
export var ioevents = io(url + 'events');
export var iomidi = io(url + 'midi', { forceNew: true });