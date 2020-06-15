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
                .toEqual(`type string|undefined expected for parameter 1 in call to foo but number provided`);
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
                    .toEqual(`type boolean expected for parameter 2 in call to foo but undefined implicitly provided`);
            });
        });
    });
});
