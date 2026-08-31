window.MokkoPlayer = function (opts) {
    'use strict';
    return {
        start: function () {
            if (opts.poster) {
                opts.posterEl.style.backgroundImage = 'url(' + opts.poster + ')';
                opts.posterEl.classList.add('on');
            }
        },
        stop: function () {}
    };
};
