/* eslint-env jest */

const {
    doTest
} = require('./utils');

const lintOptions = {
    "plugins": [
        "@orzechowskid/typelint"
    ],
    rules: {
        "@orzechowskid/typelint/function-args-types-must-match": [ "error" ]
    }
};

describe(`when calling a function`, function() {
    describe(`when the function lacks a definition`, function() {
        const source = `

var a = foo(1, 'hello', true);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`when the function parameters are untyped`, function() {
        const source = `

/**
 * @returns {boolean} z
 */
function foo(x, y, z) {
  return x + y + z;
}

var a = foo(1, 'hello', true);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`handles inline comments`, function() {
        const source = `

var a = foo(/*inline=*/ 'comment');

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`handles calls to built-in methods`, function() {
        const source = `

var a = foo.map(bar);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`when the types of each argument matches the types of each argument in the function signature`, function() {
        const source = `

/**
 * @param {number} x
 * @param {string|undefined} y
 * @param {boolean} z
 */
function foo(x, y, z) {
  return x + y + z;
}

var a = foo(1, 'hello', true);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`when the types of each argument matches the types of each argument in the arrow function signature`, function() {
        const source = `

/**
 * @param {number} x
 * @param {string|undefined} y
 * @param {boolean} z
 */
const foo = (x, y, z) => {
  return x + y + z;
}

var a = foo(1, 'hello', true);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`when an arrow function evaluates to a call with the correct signature`, function() {
        const source = `

/**
 * @param {number} x
 * @param {string|undefined} y
 * @param {boolean} z
 */
const foo = (x, y, z) => {
  return x + y + z;
}

const bar = () => foo(1, 'two', false);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`when an arrow function with a function type evaluates to a call with the correct signature`, function() {
        const source = `

/** @type {function(number,(string|undefined),boolean)} */
const foo = (x, y, z) => {
  return x + y + z;
}

const bar = () => foo(1, 'two', false);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`when the types of an argument does not match the type of an argument in the function signature`, function() {
        const source = `

/**
 * @param {number} x
 * @param {string|undefined} y
 * @param {boolean} z
 */
function foo(x, y, z) {
  return x + y + z;
}

var a = foo(1, 2, 3);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`type (string|undefined) expected for argument 1 in call to foo but number provided`);
        });
    });

    describe(`when an argument corresponding to a parameter with a default is omitted`, function() {
        const source = `

/**
 * @param {number} x
 * @param {string|undefined} y
 * @param {boolean} [z=true]
 */
function foo(x, y, z = true) {
  return x + y + z;
}

var a = foo(1, 'two');

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });

    describe(`when calling a function and giving it fewer parameters than it expects`, function() {
        const source = `

/**
 * @param {number} x
 * @param {string|undefined} y
 * @param {boolean} z
 */
function foo(x, y, z) {
  return x + y + z;
}

var a = foo(1, 'two');

`;

        describe(`when 'ignoreTrailingUndefineds' is true`, function() {
            const myLintOptions = Object.assign({}, lintOptions, {
                rules: {
                    "@orzechowskid/typelint/function-args-types-must-match": [ "error", {
                        ignoreTrailingUndefineds: true
                    }]
                }
            });
            let result = null;

            beforeEach(async function() {
                result = await doTest(source, myLintOptions);
            });

            it(`should not show a message`, function() {
                expect(result)
                    .toEqual([]);
            });
        });

        describe(`when 'ignoreTrailingUndefineds' is false`, function() {
            let result = null;

            beforeEach(async function() {
                result = await doTest(source, lintOptions);
            });

            it(`should show a message`, function() {
                expect(result[0].message)
                    .toEqual(`type boolean expected for argument 2 in call to foo but undefined implicitly provided`);
            });
        });
    });

    describe(`when arguments are expected but not present`, function() {
        const source = `

/**
 * @param {number} foo
 * @param {boolean} bar
 * @return {string}
 */
function myFunc(foo, bar) {
  return foo + bar;
}

/** @type {string} */
const v = myFunc();

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`type number expected for argument 0 in call to myFunc but undefined implicitly provided`);
        });
    });
});
