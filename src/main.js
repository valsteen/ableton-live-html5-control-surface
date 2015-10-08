export function configure(aurelia) {
    aurelia.use
        .standardConfiguration()
        .developmentLogging()
        .plugin('aurelia-animator-css')
        .plugin('hammer.js')
        .feature('widgets');
    aurelia.start().then(a => a.setRoot());
}