/**
 * @typedef Baz
 * @property {number} count
 * @property {boolean} isAwesome
 */

/**
 * @typedef {object} Foobar
 * @property {string|boolean} name
 * @property {number} count
 */

/**
 * @typedef {object} AAAAAAAAAAAA
 * @property {boolean} isGood
 * @property {number} howGood
 */

/**
 * @param {string|number} a
 * @param {number} b
 * @return {Foobar|Bazwoz|boolean}
 */
function x(a, b) {
    return { name: 'true', count: 123 };
}

x('true', `123`);
