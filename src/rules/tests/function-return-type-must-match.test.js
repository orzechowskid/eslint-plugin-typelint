/* eslint-env jest */

const {
    doTest
} = require('./utils');

const lintOptions = {
    "plugins": [
        "@orzechowskid/typelint"
    ],
    rules: {
        "@orzechowskid/typelint/function-return-type-must-match": [ "error" ]
    }
};

describe(`when a function only returns values matching the declared @return type`, function() {
    const source = `

/**
 * @param {number} x
 * @param {number} y
 * @return {number}
 */
function foo(x, y) {
  if (!x || !y) {
    return 0;
  }

  return x + y;
}

var a = foo(1, 2, 3);

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

describe.only(`when a function returns a value not matching the declared @return type`, function() {
    const source = `

/**
 * @param {number} x
 * @param {number} y
 * @return {number}
 */
function foo(x, y) {
  if (!x) {
    return y;
  }

  return true;
}

var a = foo(1, 2);

`;

    let result = null;

    beforeEach(async function() {
        result = await doTest(source, lintOptions);
    });

    it(`should show a message`, function() {
        expect(result[0].message)
            .toEqual(`returning boolean from a function declared to return number`);
    });
});

describe(`when a function implicitly returns undefined`, function() {
    const source = `

/**
 * @return {number}
 */
function foo(x) {
  if (!x) {
    return;
  }

  return x * 2;
}

`;

    let result = null;

    describe(`when 'allowImplicitUndefineds' is false`, function() {
        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`returning an implicit undefined from a function declared to return number`);
        });
    });

    describe(`when 'allowImplicitUndefineds' is true`, function() {
        beforeEach(async function() {
            result = await doTest(source, Object.assign({}, lintOptions, {
                rules: {
                    "@orzechowskid/typelint/function-return-type-must-match": [ "error", {
                        allowImplicitUndefineds: true
                    }]
                }
            }));
        });

        it(`should not show a message`, function() {
            expect(result)
                .toEqual([]);
        });
    });
});

