array-sugar
============

Tired of not having a last property on array in Javascript? Tired of not having contains method?
This little script solves those by adding a bit of sugar allowing you to do:
```javascript    
     Array.range(1,3)       instead      [1, 2, 3];
     array.contains(o)      instead      array.indexOf(o) != -1
     array.remove(o)        instead      array.splice(array.indexOf(o), 1) //remove returns true when o was removed
     array.clear()          instead      array.length = 0
     array.isEmpty          instead      array.length == 0
     array.first            instead      array[0]
     array.last             instead      array[array.length-1]
```
Usable in any environment that supports Object.defineProperty(oldest would probably be IE9).

Available through npm and bower, just require(or include in index.html) and you should be good to go.

    npm install array-sugar
    bower install array-sugar

Tests via nodeunit included.

#known incompatibilities
Angular ngSanitize module in version 1.2.0-rc2 in it's method assigns to arr.last and this collides with our 'last' getter.
So beware, I have created a pull request so that ngSanitize doesn't break, but who knows when it is going to be merged. For now, use ngSanitize from my fork:
[compatible ngSanitize](https://github.com/capaj/angular.js/blob/master/src/ngSanitize/sanitize.js)

Missing any sugar? Please do submit a pull or feature request.
