#0.6.0 -> 0.6.2
    Significant changes to the authentication process. I finally realized, that the most common use case is a public
    access to some of the data, rest of the data is accessible only to authenticated and authorized users-best thing
    now is that the authentication can happen any time, even after logging in, so there is no need to reload the whole
    page, like it used to be just to change user's privilige level
#0.5.1 -> 0.5.2
	mr-controller now works only with mr-models attribute. use of mr-model attribute is no longer supported
#0.4.20 -> 0.5.0
	API polished even more, usual usecase somehow simplified, see readme diff for exact changes,
	fixed a bug when some documents might have been lost in the init phase of liveQuery on the client
#0.4.19 -> 0.4.20
	Breaking change- API changed, instead of calling init call just the function that the whole module exports, 
	also createServer is on the returned object as method 'bootstrap'
#0.3.16 -> 0.4.0
    changed injection of Moonridge model into a controller, before model was/were on scope, now you will get them via DI

#0.3.15 -> 0.3.16
    default backend option introduced

#0.3.12 -> 0.3.12
    fixed non working sorting queries with dots
    fixed a problem when eventemitter listener limit was hit on promises by calling the functions synchronously when resolved already

#0.3.7 -> 0.3.8
    fixed IE8 problems