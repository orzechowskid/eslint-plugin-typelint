# eslint-plugin-typelint
JSDoc-based typechecking plugin for eslint

# Why?
I like typed code, and I don't like the idea of introducing [a new syntax and a new toolchain](https://www.typescriptlang.org/) to support it in Javascript.  This [eslint](https://eslint.org/) plugin is an attempt to reconcile those two facts.  It works by examining [JSDoc](https://jsdoc.app/) comments attached to your variables and functions, to (attempt to) make sure you're not accidentally using the wrong datatype.

This plugin is not, and will never be, a complete replacement for TypeScript.  But if all you want is to avoid some basic type-related footguns then it's probably good enough.

# Example

```javascript
/**
 * @param {boolean} myBool
 * @return {string}
 */
function booleanIsTrue(myBool) {
  return myBool : "yes" : "no";
}

/** @type {number} */
const x = booleanIsTrue(true);
// eslint message:
// "can't assign type string to variable of type number"

/** @type {string} */
const y = booleanIsTrue(true);
// correctly-typed, so no eslint message! 🎉

const z = booleanIsTrue(false);
// also no eslint message, since `z` has no declared type 🤔 (you should fix that!)
```

# Installation
this plugin requires [eslint](https://github.com/eslint/eslint), so be sure to install that too if you're not already using it:
```bash
$ npm install --save-dev eslint @orzechowskid/eslint-plugin-typelint
```
it's highly recommended that you use [eslint-plugin-jsdoc](https://github.com/gajus/eslint-plugin-jsdoc) as well, to ensure your type definitions are well-formed:
```bash
$ npm install --save-dev eslint-plugin-jsdoc
```

# Configuration
add one or more `typelint` rules to your eslint config file:

```javascript
module.exports = {
  "plugins": [
    "jsdoc",
    "@orzechowskid/typelint"
  ],
  "parserOptions": {
    "ecmaFeatures": {
      "impliedStrict": true
    },
    "ecmaVersion": 8,
    "loc": true
  },
  "rules": {
    "@orzechowskid/typelint/assignment-types-must-match": [ "error" ]
  }
};
```

# Available rules
### assignment-types-must-match
#### Description
ensures that the types on the left-hand and right-hand sides of a statement match when initializing or assigning to a variable
#### Options
none
#### Examples
```javascript
// does not pass - attempting to assign a number to a variable declared as a boolean

/** @type {boolean} */
const myBoolean = 123;


// does not pass - variable declared as a boolean but function's return value is a string

/** @type {boolean} */
const myBoolean = someFunctionReturningAString();


// does not pass - variable declared as boolean but actual runtime value is either boolean or undefined

/** @type {boolean} */
const myBoolean = someTest ? true : undefined;


// passes

/** @type {boolean} */
const myBoolean = someTest ? true : false;


// passes

/** @type {boolean} */
const myBoolean = someFunctionReturningABoolean();


// passes

/** @type {boolean|undefined} */
const myBoolean = someTest ? true : undefined;
```

### function-args-length-must-match
#### Description
ensures that a function is always called with the number of parameters it expects.
#### Options
none
#### Examples
```javascript
/**
 * @param {number} a
 * @param {number} b
 * @return {number}
 */
function myFunction(a, b) {
  return a ^ b;
}


// does not pass - function expects 2 arguments but was only given 1
const myNum = myFunction(10);


// does not pass - function expects 2 arguments but was given 3
const myNum = myFunction(10, 7, 12);


// passes
const myNum = myFunction(10, 7);
```

### function-args-types-must-match
#### Description
ensures that a function's arguments match the types documented in its JSDoc block
#### Options
##### ignoreTrailingUndefineds
when set to `true`, this rule will not type-check any implicit parameters to the function call (where an 'implicit parameter' is what you get when e.g. calling `myFun(x, y)` with only one arg.  the value `y` will be set to `undefined`).  Default: `false`
#### Examples
```javascript
/**
 * @param {string} name
 * @param {number} value
 * @return {string}
 */
 function appendValue(name, value) {
   return `${name}: ${value}`;
 }
 
 
 // does not pass - the first parameter should be a string
 const myStr = appendValue(123, 'Alice');
 
 
 // does not pass by default - the implicit second parameter is of type undefined
 const myStr = appendValue('Alice');
 
 
 // passes
 const myStr = appendValue('Alice', 123);
 
 
 // passes if the `ignoreTrailingUndefineds` option is set to true
 const myStr = appendValue('Alice');
```
### function-return-type-must-match
#### Description
ensures that a function returns the value it says it will return in its documentation
#### Options
none
### Examples
```javascript
// does not pass - function says it returns a string but it actually returns a boolean
/**
 * @param {any} obj
 * @return {string}
 */
function toString(obj) {
  return !!obj.toString();
}


// does not pass - object literal does not match typedef
/**
 * @typedef {object} MyRecord
 * @property {string} name
 * @property {number} age
 */
 
 /**
  * @return {MyRecord}
  */
function getRecord() {
  return {
    name: 'Bob',
    age: 'none of your business'
  };
}


// passes
/**
 * @param {any} obj
 * @return {string}
 */
function toString(obj) {
  return obj ? obj.toString() : 'does not exist';
}


// passes
function getRecord() {
  return {
    name: 'Bob',
    age: 71
  };
}
```

# Bugs
probably lots!  I'm not necessarily proud of this code!

you can file an issue [here](https://github.com/orzechowskid/eslint-plugin-typelint/issues) if something doesn't work the way you think it should, or even better: open a pull request [here](https://github.com/orzechowskid/eslint-plugin-typelint/pulls).

# License
MIT
