System.config({
  "baseURL": "/",
  "transpiler": "babel",
  "babelOptions": {
    "optional": [
      "runtime"
    ]
  },
  "paths": {
    "*": "*.js",
    "github:*": "jspm_packages/github/*.js",
    "Moonridge-test/*": "lib/*.js",
    "npm:*": "jspm_packages/npm/*.js"
  }
});

System.config({
  "map": {
    "angular": "github:angular/bower-angular@1.3.15",
    "angular-animate": "github:angular/bower-angular-animate@1.3.15",
    "babel": "npm:babel-core@5.0.12",
    "babel-runtime": "npm:babel-runtime@5.0.12",
    "core-js": "npm:core-js@0.8.1",
    "css": "github:systemjs/plugin-css@0.1.0",
    "github:urish/angular-moment": "github:urish/angular-moment@0.8.2",
    "jquery": "github:components/jquery@2.1.1",
    "socket.io-client": "/socket.io/socket.io",
    "socket.io-rpc-client": "github:capaj/socket.io-rpc-client@0.8.12",
    "text": "github:systemjs/plugin-text@0.0.2",
    "traceur": "github:jmcriffey/bower-traceur@0.0.87",
    "traceur-runtime": "github:jmcriffey/bower-traceur-runtime@0.0.87",
    "util": "github:jspm/nodelibs-util@0.1.0",
    "github:angular/bower-angular-animate@1.3.15": {
      "angular": "github:angular/bower-angular@1.3.15"
    },
    "github:angular/bower-angular-animate@1.3.5": {
      "angular": "github:angular/bower-angular@1.3.15"
    },
    "github:capaj/socket.io-rpc-client@0.8.12": {
      "bluebird": "npm:bluebird@2.9.24"
    },
    "github:jspm/nodelibs-events@0.1.0": {
      "events-browserify": "npm:events-browserify@0.0.1"
    },
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "github:jspm/nodelibs-util@0.1.0": {
      "util": "npm:util@0.10.3"
    },
    "npm:bluebird@2.9.24": {
      "events": "github:jspm/nodelibs-events@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:core-js@0.8.1": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:events-browserify@0.0.1": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:inherits@2.0.1": {
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:util@0.10.3": {
      "inherits": "npm:inherits@2.0.1",
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});

