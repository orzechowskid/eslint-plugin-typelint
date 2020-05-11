/**
 * @typedef {Set<string>} Type
 * @property {boolean} inferred
 */

/**
 * @typedef {Map<string,Type|Expression>} Expression
 */

/**
 * @typedef {object} Context
 * @property {function():string} getFilename
 */

/**
 * @typedef {object} Node
 * @property {string} type
 * @property {Node} parent
 */

/**
 * @typedef {object} ProgramNode
 * @property {Node[]} body
 * @property {Node[]} comments
 * @property {"Program"} type
 */

/**
 * @typedef {object} CommentNode
 * @property {"Block"|"Line"} type
 * @property {string} value
 */

/**
 * @typedef {object} Comment
 * @property {string} source
 * @property {object[]} tags
 */
