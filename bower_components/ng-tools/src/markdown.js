//----------------------------------------------------------------------------------------------------------------------
// A directive for rendering markdown in AngularJS, shamelesly copied from https://bitbucket.org/morgul/angular-markdown
//
// Written by John Lindquist (original author). Modified by Jonathan Rowny (ngModel support).
// Adapted by Christopher S. Case
//
// Taken from: http://blog.angularjs.org/2012/05/custom-components-part-1.html
//
// @module angular.markdown.js
//----------------------------------------------------------------------------------------------------------------------

angular.module("ngTools").directive('markdown', function()
{
    var converter = new Showdown.converter();

    return {
        restrict: 'E',
        require: '?ngModel',
        link:  function(scope, element, attrs, model)
        {
            // Check for extensions
            var extAttr = attrs['extensions'];
            var callPrettyPrint = false;
            if(extAttr)
            {
                var extensions = [];

                // Convert the comma separated string into a list.
                extAttr.split(',').forEach(function(val)
                {
                    // Strip any whitespace from the beginning or end.
                    extensions.push(val.replace(/^\s+|\s+$/g, ''));
                });

                if(extensions.indexOf('prettify') >= 0)
                {
                    callPrettyPrint = true;
                } // end if

                // Create a new converter.
                converter = new Showdown.converter({extensions: extensions});
            } // end if

            // Check for option to strip whitespace
            var stripWS = attrs['strip'];
            stripWS = String(stripWS).toLowerCase() == 'true';

            // Check for option to translate line breaks
            var lineBreaks = attrs['lineBreaks'];
            lineBreaks = String(lineBreaks).toLowerCase() == 'true';

            var render = function()
            {
                var htmlText = "";
                var val = "";

                // Check to see if we're using a model.
                if(attrs['ngModel'])
                {
                    if (model.$modelValue)
                    {
                        val = model.$modelValue;
                    } // end if
                }
                else
                {
                    val = element.text();
                } // end if

                if(stripWS)
                {
                    val = val.replace(/^[ /t]+/g, '').replace(/\n[ /t]+/g, '\n');
                } // end stripWS

                if (lineBreaks) {
                    val = val.replace(/&#10;/g, '\n');
                } // end lineBreaks

                // Compile the markdown, and set it.
                htmlText = converter.makeHtml(val);
                element.html(htmlText);

                if(callPrettyPrint)
                {
                    prettyPrint();
                } // end if
            };

            if(attrs['ngModel'])
            {
                scope.$watch(attrs['ngModel'], render);
            } // end if

            render();
        } // end link
    }
}); // end markdown directive
