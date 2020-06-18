/* eslint-env jest */

const {
    doTest
} = require('./utils');

const lintOptions = {
    "plugins": [
        "@orzechowskid/typelint"
    ],
    rules: {
        "@orzechowskid/typelint/assignment-types-must-match": [ "error" ]
    }
};

describe(`when initializing a variable`, function() {
    describe(`when the identifier is untyped`, function() {
        const source = `

const x = 3;

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

    describe(`when the assignment value is incompatible with the inferred type`, function() {
        const source = `

/** @type {number} */
let x = 3;

const y = true;

x = y;

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't assign type boolean to variable of type number`);
        });
    });

    describe(`when the value is of the declared type`, function() {
        const source = `

/** @type {number} */
var x = 3;

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

    describe(`when the value is one of the multiple declared types`, function() {
        const source = `

/** @type {number|undefined} */
var x = 123;

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

    describe(`when the value is not of the declared type`, function() {
        const source = `

/** @type {number} */
var x = <span>hello</span>;

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type number with value of type JSXElement`);
        });
    });

    describe(`when the value is none of the multiple declared types`, function() {
        const source = `

/** @type {number|undefined} */
var x = true;

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type number|undefined with value of type boolean`);
        });
    });

    describe(`when value type is a superset of identifier type`, function() {
        const source = `

/** @type {number|undefined} */
var y = 123;

/** @type {number} */
var x = y;

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type number with value of type number|undefined`);
        });
    });

    describe(`when the value is a return value of a function and of the declared type`, function() {
        const source = `

/** @return {number} */
function foo() { return 123; }

/** @type {number} */
var x = foo();

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

    describe(`when the value is a return value of a method`, function() {
        const source = `
/** @type {number} */
var x = foo.bar();

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

    describe(`when the value is a return value of a function but not of the declared type`, function() {
        const source = `

/** @return {boolean} */
function foo() { return true; }

/** @type {number} */
var x = foo();

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type number with value of type boolean`);
        });
    });

    describe(`when the value is an object literal of the declared type`, function() {
        const source = `

/**
 * @typedef {object} Record
 * @property {string} name
 * @property {number} value
 */

/**
 * @typedef {object} ExtendedRecord
 * @property {Record} data
 * @property {string} department
 */

/** @type {ExtendedRecord} */
var x = { data: { name: 'alice', value: 123 }, department: 'finance' };

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

    describe(`when the value is an object literal not of the declared type`, function() {
        const source = `

/**
 * @typedef {object} Record
 * @property {string} name
 * @property {number} value
 */

/**
 * @typedef {object} ExtendedRecord
 * @property {Record} data
 * @property {string} department
 */

/** @type {ExtendedRecord} */
var x = { data: { name: 'alice', value: undefined }, department: 'finance' };

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type ExtendedRecord with value of type (object literal)`);
        });
    });

    describe(`when the value comes from a conditional expression and the variable is typed appropriately`, function() {
        const source = `

/** @type {string|undefined} */
let x;

x = barf ? 'gross!' : undefined;

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

    describe(`when the value comes from a conditional expression and the variable is not typed appropriately`, function() {
        const source = `

/** @type {string} */
let x;

x = barf ? 'gross!' : undefined;

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't assign type string|undefined to variable of type string`);
        });
    });
});

describe(`when assigning to an existing variable`, function() {
    describe(`when the identifier is untyped`, function() {
        const source = `

let x;

x = 3;

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

    describe(`when the assignment value is untyped`, function() {
        const source = `

function foo() {
  return true;
}

/** @type {number} */
const x = foo();

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

    describe(`when the value is of the declared type`, function() {
        const source = `

/** @type {number} */
var x;

x = 3;

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

    describe(`when the value is not of the declared type`, function() {
        const source = `

/** @type {number} */
var x;

x = 'definitely not a number';

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't assign type string to variable of type number`);
        });
    });

    describe(`when the value is a return value of a function and of the declared type`, function() {
        const source = `

/** @return {number} */
function foo() { return 123; }

/** @type {number} */
var x;

x = foo();

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

    describe(`when the value is a return value of a function but not of the declared type`, function() {
        const source = `

/** @return {boolean} */
function foo() { return true; }

/** @type {number} */
var x;

x = foo();

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't assign type boolean to variable of type number`);
        });
    });

    describe(`when the value is an object literal of the declared type`, function() {
        const source = `

/**
 * @typedef {object} Record
 * @property {string} name
 * @property {number} value
 */

/**
 * @typedef {object} ExtendedRecord
 * @property {Record} data
 * @property {string} department
 */

/** @type {ExtendedRecord} */
var x;

x = { data: { name: 'alice', value: 123 }, department: 'finance' };

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

    describe(`when the value is an object literal not of the declared type`, function() {
        const source = `

/**
 * @typedef {object} Record
 * @property {string} name
 * @property {number} value
 */

/**
 * @typedef {object} ExtendedRecord
 * @property {Record} data
 * @property {string} department
 */

/** @type {ExtendedRecord} */
var x;

x = { data: { name: 'alice', value: undefined }, department: 'finance' };

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't assign type (object literal) to variable of type ExtendedRecord`);
        });
    });

    describe(`when the value comes from a conditional expression and the variable is typed appropriately`, function() {
        const source = `

/** @type {string|undefined} */
let x = barf ? 'gross!' : undefined;

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

    describe(`when the value comes from a conditional expression and the variable is not typed appropriately`, function() {
        const source = `

/** @type {string} */
let x = barf ? 'gross!' : undefined;

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type string with value of type string|undefined`);
        });
    });

    describe(`when initializing to an object property of an incorrect type`, function() {
        const source = `

/**
 * @typedef {object} Thing
 * @property {string} name
 * @property {number} value
 */

/** @type {Thing} */
const myThing = {
  name: 'alice',
  value: 123
};

/** @type {boolean} */
const x = myThing.name;

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type boolean with value of type string`);
        });
    });

    describe(`when initializing to an object property of the correct type`, function() {
        const source = `

/**
 * @typedef {object} Thing
 * @property {string} name
 * @property {number} value
 */

/** @type {Thing} */
const myThing = {
  name: 'alice',
  value: 123
};

/** @type {string} */
const x = myThing.name;

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

    describe(`when the value comes from a class instantiation and the variable is not typed appropriately`, function() {
        const source = `

class Foo { }

/** @type {string} */
const x = new Foo();

`;

        let result = null;

        beforeEach(async function() {
            result = await doTest(source, lintOptions);
        });

        it(`should show a message`, function() {
            expect(result[0].message)
                .toEqual(`can't initialize variable of type string with value of type Foo`);
        });
    });
});
