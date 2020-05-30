/* eslint-env jest */

const {
    doTest
} = require('./utils');

const lintOptions = {
    "plugins": [
        "@orzechowskid/typelint"
    ],
    rules: {
        "@orzechowskid/typelint/function-args-length-must-match": [ "error" ]
    }
};

describe(`when calling a function`, function() {
    describe(`when the function expects no arguments but was called with some anyway`, function() {
        const source = `

function foo() {
  return;
}

foo(1, 'gorp');

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`function foo expects no arguments but was called with 2`);
        });
    });

    describe(`when the number of arguments matches the number of arguments in the function signature`, function() {
        const source = `

function foo(x, y, z) {
  return x + y + z;
}

const a = foo(1, 2, 3);

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

    describe(`when the number of arguments is fewer than the number of arguments in the function signature`, function() {
        const source = `

function foo(x, y, z) {
  return x + y + z;
}

var a = foo(1, 2);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`function foo expects 3 arguments but was called with 2`);
        });
    });

    describe(`when the number of arguments is greater than the number of arguments in the function signature`, function() {
        const source = `

function foo(x, y, z) {
  return x + y + z;
}

/** @type {number|undefined} */
var q = 1;

var a = foo(1, 2, q, 4);

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`function foo expects 3 arguments but was called with 4`);
        });
    });
});
