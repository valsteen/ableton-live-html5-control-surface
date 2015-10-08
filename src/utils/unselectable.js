export function unselectable() {
    $("body").attr('unselectable', 'on')
        .css({
            '-moz-user-select': '-moz-none',
            '-moz-user-select': 'none',
            '-o-user-select': 'none',
            '-khtml-user-select': 'none',
            '-webkit-user-select': 'none',
            '-ms-user-select': 'none',
            'user-select': 'none'
        }).bind('selectstart', function () {
            return false;
        });

    $('body').bind('touchmove', function (e) {
        e.preventDefault()
    })
}

export function selectable() {
    $("body").removeAttr('unselectable')
        .css({
            '-moz-user-select': '',
            '-moz-user-select': '',
            '-o-user-select': '',
            '-khtml-user-select': '',
            '-webkit-user-select': '',
            '-ms-user-select': '',
            'user-select': ''
        }).unbind("selectstart");
    $('body').unbind('touchmove')
}
