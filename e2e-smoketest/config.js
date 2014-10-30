System.config({
  "paths": {
    "*": "*.js",
    "github:*": "jspm_packages/github/*.js"
  }
});

System.config({
  "map": {
    "angular": "github:angular/bower-angular@^1.3.0",
    "jquery": "github:components/jquery@^2.1.1",
    "angular-animate": "github:angular/bower-angular-animate@^1.3.0",
    "github:urish/angular-moment": "github:urish/angular-moment@^0.8.2",
    "github:angular/bower-angular-animate@1.3.0": {
      "angular": "github:angular/bower-angular@^1.3.0"
    }
  }
});

System.config({
  "versions": {
    "github:angular/bower-angular": "1.3.0",
    "github:components/jquery": "2.1.1",
    "github:angular/bower-angular-animate": "1.3.0",
    "github:urish/angular-moment": "0.8.2"
  }
});

