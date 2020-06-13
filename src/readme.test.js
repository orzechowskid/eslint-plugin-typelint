/* eslint-env jest */

const {
    doTest
} = require('./rules/tests/utils');

const lintOptions = {
    "plugins": [
        "@orzechowskid/typelint"
    ],
    rules: {
        "@orzechowskid/typelint/assignment-types-must-match": [ "error" ],
        "@orzechowskid/typelint/function-args-length-must-match": [ "error" ],
        "@orzechowskid/typelint/function-args-types-must-match": [ "error" ],
        "@orzechowskid/typelint/function-return-type-must-match": [ "error" ]
    }
};

describe(`example usage`, function() {
    it(`does what it says`, async function() {
        const example1 = `

/**
 * @param {boolean} myBool
 * @return {string}
 */
function booleanIsTrue(myBool) {
  return myBool ? "yes" : "no";
}


/** @type {number} */
const x = booleanIsTrue(true);

`;

        const result1 = await doTest(example1, lintOptions);

        expect(result1[0].message).toEqual(`can't initialize variable of type number with value of type string`);

        const example2 = `

/**
 * @param {boolean} myBool
 * @return {string}
 */
function booleanIsTrue(myBool) {
  return myBool ? "yes" : "no";
}

/** @type {string} */
const y = booleanIsTrue(true);

`;

        const result2 = await doTest(example2, lintOptions);

        expect(result2).toEqual([]);

        const example3 = `

/**
 * @param {boolean} myBool
 * @return {string}
 */
function booleanIsTrue(myBool) {
  return myBool ? "yes" : "no";
}

const z = booleanIsTrue(false);

`;

        const result3 = await doTest(example3, lintOptions);

        expect(result3).toEqual([]);
    });
});
