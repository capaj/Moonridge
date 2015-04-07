System.config({
  "paths": {
    "*": "*.js",
    "github:*": "jspm_packages/github/*.js",
    "Moonridge-test/*": "lib/*.js"
  }
});

System.config({
  "map": {
    "angular": "github:angular/bower-angular@1.3.15",
    "angular-animate": "github:angular/bower-angular-animate@1.3.5",
    "css": "github:systemjs/plugin-css@0.1.0",
    "github:urish/angular-moment": "github:urish/angular-moment@0.8.2",
    "jquery": "github:components/jquery@2.1.1",
    "socket.io-client": "/socket.io/socket.io",
    "text": "github:systemjs/plugin-text@0.0.2",
    "traceur": "github:jmcriffey/bower-traceur@0.0.87",
    "traceur-runtime": "github:jmcriffey/bower-traceur-runtime@0.0.87",
    "github:angular/bower-angular-animate@1.3.5": {
      "angular": "github:angular/bower-angular@1.3.15"
    }
  }
});

