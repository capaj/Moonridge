module.exports = function(config) {
    config.set({
        // base path, that will be used to resolve files and exclude
        basePath: '../',

        // testing framework to use (jasmine/mocha/qunit/...)
        frameworks: ['jasmine'],

        // list of files / patterns to load in the browser
        files: [
			'e2e-smoketest/bower_components/jquery/dist/jquery.min.js',
			'e2e-smoketest/bower_components/angular/angular.js',
			'e2e-smoketest/bower_components/angular-animate/angular-animate.js',
			'e2e-smoketest/bower_components/angular-mocks/angular-mocks.js',
			'js/bootstrap.min.js',
			'e2e-smoketest/test_ctrl.js',
			'built/moonridge-angular-client.js',
			'client/moonridge-angular-mock.js',
			'e2e-smoketest/test.js'],

        // list of files / patterns to exclude
        exclude: [],

        // web server port
        port: 8079,

        // level of logging
        // possible values: LOG_DISABLE || LOG_ERROR || LOG_WARN || LOG_INFO || LOG_DEBUG
        logLevel: config.LOG_INFO,

        // Start these browsers, currently available:
        // - Chrome
        // - ChromeCanary
        // - Firefox
        // - Opera
        // - Safari (only Mac)
        // - PhantomJS
        // - IE (only Windows)
        browsers: ['PhantomJS']
        //    browsers: ['Chrome','Safari','Firefox','Opera','ChromeCanary'],

    });
};