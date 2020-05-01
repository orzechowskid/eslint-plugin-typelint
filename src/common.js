const parseComment = require('comment-parser');
const scan = require('scope-analyzer');

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
 * @property {"Program"} type
 * @property {Node[]} comments
 */

/**
 * @typedef {object} CommentNode
 * @property {Comment} parsed
 * @property {"Block"|"Line"} type
 * @property {string} value
 */

/**
 * @typedef {object} Comment
 * @property {string} source
 * @property {object[]} tags
 */

/** @type {Map<string, ProgramNode>} */
const astCache = {};

/** @type {Map<string,Type>} */
const Primitives = {
    boolean: new Set([ typeof true ]),
    function: new Set([ typeof function x() {} ]),
    number: new Set([ typeof 1 ]),
    object: new Set([ typeof {} ]),
    string: new Set([ typeof `` ]),
    undefined: new Set([ typeof undefined ])
};

/**
 * @param {string} operator
 * @param {string|Type} left
 * @param {string|Type} right
 * @return {Type}
 */
function combineTypesForOperation(operator, left, right) {
    if (!left) {
        return right;
    } else if (!right) {
        return left;
    }

    if (left instanceof Set) {
        return new Set(
            [ ...left ].reduce(
                (a, t) => ([ ...a, ...combineTypesForOperation(operator, t, right) ]),
                []
            ));
    } else if (right instanceof Set) {
        return new Set(
            [ ...right ].reduce(
                (a, t) => ([ ...a, ...combineTypesForOperation(operator, left, t) ]),
                []
            ));
    }

    /* https://2ality.com/2019/10/type-coercion.html */
    switch (operator) {
        case `+`:
            return (left === `string` || right === `string`)
                ? Primitives.string
                : Primitives.number;

        default:
            return Primitives.number;
    }
}

/**
 * @param {Context} context
 * @return {CommentNode[]}
 */
function getCommentNodesForContext(context) {
    return astCache[context.getFilename()].comments;
}

/**
*
*/
function getCommentNodeFor(node, context) {
    const commentEndLine = node.loc.start.line - 1;

    return getCommentNodesForContext(context)
        .find((c) => c.loc.end.line === commentEndLine);
}

function getCommentNodeForTypedef(typedef, context) {
    return getCommentNodesForContext(context)
        .find((c) => c.parsed.tags.find((t) => t.tag === `typedef` && t.name === typedef));
}

/**
 * @param {CommentNode} node
 * @return {Comment}
 */
function getCommentFromCommentNode(node) {
    return node
        ? node.parsed
        : undefined;
}

/**
 * @param {Node} node
 * @return {Node}
 */
function getFunctionDeclarationNodeFor(node) {
    let declaredFunction = node;

    while (declaredFunction && declaredFunction.type !== `FunctionDeclaration`) {
        declaredFunction = declaredFunction.parent;
    }

    return declaredFunction;
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Set<string>}
 */
function getTypeForNode(node, context) {
    switch (node.type) {
        case `BinaryExpression`: {
            const leftTypes = getTypeForNode(node.left, context);
            const rightTypes = getTypeForNode(node.right, context);

            return  combineTypesForOperation(node.operator, leftTypes, rightTypes);
        }

        case `CallExpression`: {
            const callExpIdBinding = scan.getBinding(node.callee);

            return
            const functionDeclComment =
                  getCommentNodeFor(callExpIdBinding.definition.parent, context);

            return getReturnTypeForCommentNode(functionDeclComment);
        }

        case `ConditionalExpression`: {
            const leftTypes = getTypeForNode(node.consequent, context);
            const rightTypes = getTypeForNode(node.alternate, context);

            return new Set([ ...leftTypes, ...rightTypes ]);
        }

        case `FunctionDeclaration`:
            return new Set([ `function` ]);

        case `Identifier`: {
            const idBinding = scan.getBinding(node);

            return idBinding.definition
                ? getTypeForNode(idBinding.definition.parent, context)
                : new Set([ `undefined` ]);
        }

        case `Literal`:
            return new Set([ `${typeof node.value}` ]);

        case `MemberExpression`:
            // get comment for node.object
            // get type of property for node.property
            return undefined;

        case `ObjectExpression`:
            return getTypeForCommentNode(getCommentNodeFor(node, context));

        case `ReturnStatement`:
            return getTypeForNode(node.argument, context);

        case `TemplateLiteral`:
            return new Set([ `string` ]);

        case `UnaryExpression`:
            switch (node.operator) {
                case `!`:
                    return Primitives.boolean;

                case `+`:
                    return Primitives.number;

                default:
                    return Primitives.object;
            }

        case `VariableDeclarator`: {
            const comment = getCommentNodeFor(node, context);

            return comment
                ? getTypeForCommentNode(comment)
                : getTypeForNode(node.init, context);
        }

        default:
            console.error(`no data for ${node.type}`);
            return new Set([]);
    }
}

/**
 * @param {Node} node
 * @return {Expression}
 */
function getExpressionForObjectNode(node) {
    if (!node || node.type !== `ObjectExpression`) {
        return;
    }

    return node.properties.reduce(
        (e, p) => Object.assign(e, {
            [p.key.name]: p.value.type === `ObjectExpression`
                ? getExpressionForObjectNode(p.value)
                : Primitives[typeof p.value.value]
        }),
        {}
    );
}

/**
 * @param {object} value
 * @return {boolean}
 */
function valueMatchesTypeExpression(value, type) {
    if (!type) {
        return false;
    }

    return [ ...type ].some(function _valueMatch(t) {
        if (Primitives[t]) {
            return typeof value === t;
        }
    });
}

function getExpressionForCommentNode(commentNode, context) {
    return commentNode.parsed.tags
        .filter((tag) => tag.tag === `property`)
        .reduce(
            (expr, tag) => {
                const tagTypes = tag.type.split(`|`);

                return Object.assign(expr, {
                    [tag.name]: new Set(
                        tagTypes.map(
                            (tt) => Primitives[tt]
                                ? tt
                                : getExpressionForCommentNode(getCommentNodeForTypedef(tt, context))
                        )
                    )
                });
            },
            {}
        );
}

/**
 * @param {Type} type
 * @param {Context} context
 * @return {Expression}
 */
function getExpressionForType(type, context) {
    return new Set(
        [ ...type ]
            .map((t) => {
                if (Primitives[t]) {
                    return Primitives[t];
                }

                const programNode = astCache[context.getFilename()];
                const scope = scan.scope(programNode);
                const commentNode = getCommentNodeForTypedef(t, context)

                return commentNode
                    ? getExpressionForCommentNode(commentNode, context)
                    : undefined;
            })
            .filter(Boolean)
    );
}

/**
 * @param {CommentNode} node
 * @return {Type}
 */
function getReturnTypeForCommentNode(node) {
    const tag = node.parsed.tags.find((t) => (t.tag === `return` || t.tag === `returns`));

    return tag
        ? new Set(tag.type.split(`|`))
        : undefined;
}

/**
 * @param {CommentNode} node
 * @return {Type}
 */
function getTypeForCommentNode(node) {
    if (!node) {
        return undefined;
    }

    const tag = node.parsed.tags.find((t) => t.tag === `type`);

    return tag
        ? new Set(tag.type.split(`|`))
        : undefined;
}

/**
 * @param {Type} t1
 * @param {Type} t2
 * @return {boolean}
 */
function typeIncludesType(t1, t2) {
    if (!t1 || !t2) {
        return false;
    }

    return t1 === t2 || [ ...t2 ].every((t) => t1.has(t));
}

/**
 * @param {Type} type
 * @return {string}
 */
function typeToString(type) {
    if (!type) {
        return `??`;
    }

    const types = [ ...type ].join(`|`);

    return type.inferred
        ? `inferred<${types}>`
        : types;
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type}
*/
function getReturnTypeForContainingFunction(node, context) {
    const functionDeclaration = getFunctionDeclarationNodeFor(node);
    const comment = getCommentNodeFor(functionDeclaration, context);

    /* not much we can do if the function isn't doc'd */
    // potential future enhancement: find all ReturnStatement nodes in this function and
    // attempt to infer all possible return types?
    return comment
        ? getReturnTypeForCommentNode(comment)
        : undefined;
}

/**
 * @param {Context} context
 * @return {undefined|function(Node):void}
 */
function visitProgram(context) {
    if (astCache[context.getFilename()]) {
        return;
    }

    /**
     * @param {ProgramNode} programNode
     * @sideEffects
     */
    return function _visitProgram(programNode) {
        programNode.comments.forEach((c) => {
            c.parsed = parseComment(`/*${c.value}*/`)[0];
        });

        scan.createScope(programNode, []);
        scan.crawl(programNode);

        astCache[context.getFilename()] = programNode;
    };
}

/**
 * @param {any} obj
 * @param {Type} type
 * @param {Context} context
 * @return {boolean}
 * @example
 * ```
     objectIsOfType(true, Set([ 'boolean', 'string' ]), <context>) === true
 * ```
 */
function objectIsOfType(obj, type, context) {
    function _match(value, allowedType) {
        if (!allowedType) {
            return false;
        }

        if (value instanceof Set && allowedType instanceof Set) {
            return typeIncludesType(allowedType, value);
        }

        /* object def */

        const objectKeys = Object.keys(value);
        const typeKeys = Object.keys(allowedType);

        return objectKeys.length === typeKeys.length
            && objectKeys.every((k) => _match(value[k], allowedType[k]));
    }

    return [ ...type ].some((t) => _match(obj, t));
}

function getFunctionDeclarationNodeForCall(node) {
    if (!node || node.type !== `CallExpression`) {
        return;
    }

    const calledFunctionBinding = scan.getBinding(node.callee);

    if (!calledFunctionBinding.definition) {
        return;
    }

    return calledFunctionBinding.definition.parent;
}

function getArgumentsForCalledFunction(node, context) {
    if (node.type !== `CallExpression`) {
        return;
    }

    const calledFunctionBinding = scan.getBinding(node.callee);
    const calledFunctionNode = calledFunctionBinding.definition.parent;
    const comment = getCommentNodeFor(calledFunctionNode, context);

    return comment.parsed.tags.filter((t) => t.tag === `param`);
}

/**
 * @param {Tag} tag
 * @return {Type}
 */
function tagToType(tag) {
    return tag
        ? new Set(tag.type.toLowerCase().split(`|`))
        : undefined;
}

module.exports = {
    getArgumentsForCalledFunction,
    getCommentNodeFor,
    getExpressionForObjectNode,
    getExpressionForType,
    getFunctionDeclarationNodeFor,
    getFunctionDeclarationNodeForCall,
    getReturnTypeForCommentNode,
    getReturnTypeForContainingFunction,
    getTypeForNode,
    objectIsOfType,
    Primitives,
    tagToType,
    typeIncludesType,
    typeToString,
    valueMatchesTypeExpression,
    visitProgram
};
