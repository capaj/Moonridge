System.config({
  "paths": {
    "*": "*.js",
    "github:*": "jspm_packages/github/*.js"
  }
});

System.config({
  "map": {
    "angular": "github:angular/bower-angular@1.3.5",
    "angular-animate": "github:angular/bower-angular-animate@1.3.5",
    "css": "github:systemjs/plugin-css@0.1.0",
    "github:urish/angular-moment": "github:urish/angular-moment@0.8.2",
    "jquery": "github:components/jquery@2.1.1",
    "socket.io-client": "/socket.io/socket.io",
    "text": "github:systemjs/plugin-text@0.0.2",
    "github:angular/bower-angular-animate@1.3.5": {
      "angular": "github:angular/bower-angular@1.3.5"
    }
  }
});

