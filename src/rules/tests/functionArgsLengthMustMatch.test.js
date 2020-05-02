const {
    RuleTester
} = require('eslint');

const rule = require('../functionArgsLengthMustMatch');
const ruleTester = new RuleTester({
    parserOptions: {
        ecmaVersion: 6
    }
});

ruleTester.run(`typelint/function-args-length-must-match`, rule, {
    valid: [{
        code: `
// all params present

/**
 * @param {string} foo
 * @param {boolean} bar
 */
function myFn(foo, bar) { }

myFn('hello', true);

`
    }],

    invalid: [{
        code: `
// missing param

/**
 * @param {string} foo
 * @param {boolean} bar
 */
function myFn(foo, bar) { }

myFn('hello');

`,
        errors: [{ message: `2 arguments expected in call to myFn but 1 provided` }]
    }]
});
