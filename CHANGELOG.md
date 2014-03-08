#0.3.16 -> 0.4.0
    changed injection of Moonridge model into a controller, before model was/were on scope, now you will get them via DI

#0.3.15 -> 0.3.16
    default backend option introduced

#0.3.12 -> 0.3.12
    fixed non working sorting queries with dots
    fixed a problem when eventemitter listener limit was hit on promises by calling the functions synchronously when resolved already

#0.3.7 -> 0.3.8
    fixed IE8 problems