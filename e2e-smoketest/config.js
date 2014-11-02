System.config({
  "paths": {
    "*": "*.js",
    "github:*": "jspm_packages/github/*.js"
  }
});

System.config({
  "map": {
    "socket.io-client": "/socket.io/socket.io",
    "github:urish/angular-moment": "github:urish/angular-moment@^0.8.2",
    "text": "github:systemjs/plugin-text@^0.0.2",
    "css": "github:systemjs/plugin-css@^0.1.0",
    "jquery": "github:components/jquery@^2.1.1",
    "angular": "github:angular/bower-angular@^1.3.1",
    "angular-animate": "github:angular/bower-angular-animate@^1.3.1"
  }
});

System.config({
  "versions": {
    "github:angular/bower-angular": "1.3.1",
    "github:angular/bower-angular-animate": "1.3.1",
    "github:components/jquery": "2.1.1",
    "github:systemjs/plugin-css": "0.1.0",
    "github:systemjs/plugin-text": "0.0.2",
    "github:urish/angular-moment": "0.8.2"
  }
});

