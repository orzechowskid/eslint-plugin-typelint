const {
    RuleTester
} = require('eslint');

const rule = require('../assignmentTypesMustMatch');
const ruleTester = new RuleTester({
    parserOptions: {
        ecmaVersion: 6
    }
});

ruleTester.run(`typelint/assignment-types-must-match`, rule, {
    valid: [{
        code: `
// literal assignment

/** @type {number} */
const x = 1;

`
    }, {
        code: `
// function return-value assignment

/** @return {string} */
function fn() { return 'hello'; }
/** @type {string} */
const x = fn();

`
    }, {
        code: `
// typedef'd object assignment

/**
 * @typedef {object} Foo
 * @property {string} name
 * @property {number} value
 */

/** @type {Foo} */
const x = { name: 'foo', value: 1 };

`
    }, {
        code: `
// assignment to untyped variable

/** @returns {boolean} */
function myFn() { return true; }

const x = myFn();

`
    }],

    invalid: [{
        code: `
// wrong literal for type

/** @type {number} */
const x = true;
`,
        errors: [{ message: `can't assign type boolean to variable of type number` }]
    }, {
        code: `
// wrong function return-value for type

/** @return {boolean} */
function fn() { return true; }
/** @type {string} */
const x = fn();

`,
        errors: [{ message: `can't assign type boolean to variable of type string` }]
    }, {
        code: `
// typedef'd object assignment

/**
 * @typedef {object} Foo
 * @property {string} name
 * @property {number} value
 */

/** @type {Foo} */
const x = { name: 'foo', value: true };

`,
        errors: [{ message: `can't assign non-matching object literal to variable of type Foo` }]
    }]
});
