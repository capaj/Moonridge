##Typical flow

1. an anonymous user connects(no handshake)
2. on the client side, user obtains an access token(from your API or 3rd party like facebook)
3. client then calls mr.authorize with the token
4. serverside checks the token if it is valid and gets the bearer user from DB
5. resolve the promise for MR.authorize, which updates the user on client

This flow can be seen in the [basic-CRUD](test/basic-CRUD.js) test case.