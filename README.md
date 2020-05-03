# eslint-plugin-typelint
JSDoc-based typechecking plugin for eslint

# Why?
I like typed code, and I don't like the idea of introducing [a new syntax and a new toolchain](https://www.typescriptlang.org/) to support it in Javascript.  This [eslint](https://eslint.org/) plugin is an attempt to reconcile those two facts.  It works by examining [JSDoc](https://jsdoc.app/) comments attached to your variables and functions, to (attempt to) make sure you're not accidentally using the wrong datatype.

This plugin is not, and will never be, a complete replacement for TypeScript.  But if all you want is to avoid some basic type-related footguns then it's probably good enough.

here are some examples:

```javascript
/**
 * @param {boolean} myBool
 * @return {string}
 */
function booleanIsTrue(myBool) {
  return myBool : "yes" : "no";
}


booleanIsTrue(1);
// eslint message:
// "type boolean expected for parameter 0 in call to booleanIsTrue but number provided"


booleanIsTrue();
// eslint message:
// "1 argument expected in call to booleanIsTrue but 0 provided"


/** @type {number} */
const x = booleanIsTrue(true);
// eslint message:
// "can't assign type string to variable of type number"


/** @type {string} */
const y = booleanIsTrue(true);
// correctly-typed, so no eslint message! 🎉


const z = booleanIsTrue(false);
// also no eslint message, since `z` has no declared type 🤔


/**
 * @param {boolean} myBool
 * @return {string|undefined}
 */
function booleanIsDefinitelyTrue(myBool) {
    return !!myBool;
    // eslint message:
    // "string|undefined specified but boolean returned"
}


/**
 * @param {boolean} myBool
 * @return {string|undefined}
 */
function booleanIsKindaTrue(myBool) {
  return myBool ? "yes" : undefined;
}

/** @type {string} */
const v = booleanIsKindaTrue(true);
// eslint message:
// "can't assign type string|undefined to variable of type string"


/**
 * @typedef {object} Foo
 * @property {string} name
 * @property {number} value
 */

/** @type {Foo} */
const myFoo = { name: 'foo', value: true };
// eslint message:
// "can't assign non-matching object literal to variable of type Foo"
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

Some rules have configuration options available.  Check their respective documentation files for more details.

# Bugs
probably lots!

you can file an issue [here](https://github.com/orzechowskid/eslint-plugin-typelint/issues) if something doesn't work the way you think it should, or even better: open a pull request [here](https://github.com/orzechowskid/eslint-plugin-typelint/pulls).

# License
MIT
