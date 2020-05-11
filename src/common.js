const fs = require('fs');
const path = require('path');

const parseComment = require('comment-parser');
const scan = require('scope-analyzer');
const {
    default: parseFile
} = require('eslint-module-utils/parse');
const {
    default: resolve
} = require('eslint-module-utils/resolve');

const {
    getComments,
    getExportDeclarations,
    getFunctionDeclarationNodeFor,
    getImportDeclarationFor
} = require('./astUtils');

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

/** @type {Type} */
const UNKNOWN_TYPE = new Set([]);

/**
 * @param {Context}
 * @return {ProgramNode}
 */
function getProgramNode(context) {
    if (!context || !astCache[context.getFilename()]) {
        return;
    }

    return astCache[context.getFilename()].ast;
}

function getCommentsForContext(context) {
    if (!context || !astCache[context.getFilename()]) {
        return;
    }

    return astCache[context.getFilename()].comments;
}

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
 * @param {Node} node
 * @param {Context} context
 * @return {CommentNode}
 */
function getCommentNodeFor(node, context) {
    const comments = getCommentsForContext(context);

    // todo: make jsdoc threshold configurable
    return comments.find(
        (c) => (node.loc.start.line >= c.loc.end.line) && (node.loc.start.line - c.loc.end.line < 2)
    );
}

function getExternalCommentNodeFor(importNode, context) {
    const symbolName = importNode.imported.name;
    const importDeclarationNode = getImportDeclarationFor(importNode);
    const importPath = importDeclarationNode.source.value;
    const modulePath = resolve(importPath, context);
    const subContext = getContext(context, modulePath);
    const externalProgramNode = getAST(subContext, modulePath);
    const exportDeclarations = getExportDeclarations(externalProgramNode);
    const exportSpecifierForImport = exportDeclarations.reduce(
        (s, ed) => s || ed.specifiers.find(
            (es) => es.exported.name === symbolName
        ),
        null
    );
    const binding = scan.getBinding(exportSpecifierForImport.local);
    const commentNode = getCommentNodeFor(binding.definition.parent, subContext);
}

function getCommentNodeForTypedef(typedef, context) {
    const programNode = getProgramNode(context);
    //    const comments = getComments(programNode);

    return comments.find(
        (c) => c.tags && c.tags.find((t) => t.tag === `typedef` && t.name === typedef)
    );
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

            if (!callExpIdBinding.definition) {
                return;
            }

            switch (callExpIdBinding.definition.parent.type) {
                case `ImportSpecifier`:
                    console.log(`getting type for import`);
                    return getReturnTypeForCommentNode(
                        getExternalCommentNodeFor(callExpIdBinding.definition.parent, context)
                    );

                default:
                    return getReturnTypeForCommentNode(
                        getCommentNodeFor(callExpIdBinding.definition.parent, context)
                    );
            }
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
            console.log(`binding:`, idBinding);
            if (!idBinding.definition) {
                return new Set([ `undefined` ]);
            } else if (idBinding.definition.parent.type === `FunctionDeclaration`) {
                /* identifier is a function parameter; we don't want to return its type,
                 * we want to return the type of its param */
                return getParamTypeForFunction(idBinding.definition.parent, context, node.name)
                    || UNKNOWN_TYPE;
            } else {
                return getTypeForNode(idBinding.definition.parent, context);
            }
        }

        case `JSXElement`:
            return new Set([ `JSXElement` ]);

        case `Literal`:
            return new Set([ `${typeof node.value}` ]);

        case `MemberExpression`:
            // get comment for node.object
            // get type of property for node.property
            return UNKNOWN_TYPE;

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
            console.log(`comment for variable declarator:`, comment);
            return comment
                ? getTypeForCommentNode(comment)
                : getTypeForNode(node.init, context);
        }

        default:
            return UNKNOWN_TYPE;
    }
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Expression}
 */
function getExpressionForObjectNode(node, context) {
    if (!node || node.type !== `ObjectExpression`) {
        return;
    }

    return node.properties.reduce(
        (e, p) => {
            let propertyValue;

            switch (p.value.type) {
                case `Identifier`:
                    propertyValue = getTypeForNode(p.value, context);

                    break;
                case `ObjectExpression`:
                    propertyValue = getExpressionForObjectNode(p.value, context);

                    break;
                case `TemplateLiteral`:
                    propertyValue = Primitives.string;

                    break;
                default:
                    propertyValue = Primitives[typeof p.value.value];
            }

            return Object.assign(e, {
                [p.key.name]: propertyValue
            });
        },
        {}
    );
}

/**
 * @param {Expression} value
 * @param {Expression} type
 * @return {boolean}
 */
function valueMatchesTypeExpression(value, type) {
    if (!type) {
        return false;
    }

    return [ ...type ].some((t) =>
        Primitives[t]
            ? typeof value === t
            : objectIsOfType(value, type)
    );
}

function getExpressionForCommentNode(commentNode, context) {
    return commentNode.tags
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
 * @param {ProgramNode} programNode
 * @param {Context} context
 * @sideEffects
 */
function _doThingsToProgramNode(programNode, context) {
    const comments = getComments(programNode)
        .map((c) => Object.assign(
            {},
            parseComment(`/*${c.value}*/`)[0],
            { loc: c.loc }
        ));

    scan.createScope(programNode, []);
    scan.crawl(programNode);

    astCache[context.getFilename()] = {
        ast: programNode,
        comments
    };
}

/**
 * @param {Context} currentContext
 * @param {string} modulePath
 * @return {Context}
 */
function getContext(currentContext, modulePath) {
    const newContext = {};

    for (let i in currentContext) {
        newContext[i] = currentContext[i];
    }

    newContext.getFilename = () => modulePath;

    return newContext;
}

/**
 * @param {Context} context
 * @param {string} fsPath
 * @return {ProgramNode}
 */
function getAST(context, fsPath) {
    if (getProgramNode(context)) {
        /* already parsed */
        return getProgramNode(context);
    }

    const fileContents = fs.readFileSync(fsPath).toString();
    const programNode = parseFile(fsPath, fileContents, context);

    _doThingsToProgramNode(programNode, context);

    return programNode;
}

function resolveExternalIdentifier(importNode, context) {
    const importDeclarationNode = getImportDeclarationFor(importNode);
    const importPath = importDeclarationNode.source.value;
    const modulePath = resolve(importPath, context);
    const subContext = getContext(context, modulePath);
    const externalProgramNode = getAST(subContext, modulePath);
    const exportDeclarations = getExportDeclarations(externalProgramNode);
}

function resolveExternalTypedef(importString, context) {
    if (!importString) {
        return;
    }

    const results = /^import\((.*)\)\.(.*)$/.exec(importString);

    if (!results) {
        return;
    }

    const [
        _, importPath, typedef
    ] = results;
    const filePath =
          path.resolve(path.dirname(context.getFilename()), importPath.slice(1, -1));
    const subContext = getContext(context, filePath);

    if (!astCache[filePath]) {
        const fileContents = fs.readFileSync(filePath).toString();
        const programNode = parseFile(filePath, fileContents, context);

        visitProgram(subContext)(programNode);
    }

    const commentNode = getCommentNodeForTypedef(typedef, subContext);

    if (!commentNode) {
        return;
    }

    return getExpressionForCommentNode(commentNode, subContext);
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
                } else if (t.startsWith(`import(`)) {
                    return resolveExternalTypedef(t, context);
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
 * @return {Type}
 */
function getReturnTypeForCommentNode(node) {
    console.log(`getting return type from:`, node);
    const tag = node.tags.find((t) => (t.tag === `return` || t.tag === `returns`));

    if (!tag) {
        return;
    } else if (tag.type.startsWith(`import(`)) {
    } else {
        return new Set(tag.type.split(`|`));
    }
}

/**
 * @param {CommentNode} node
 * @return {Type}
 */
function getTypeForCommentNode(node) {
    if (!node) {
        return undefined;
    }

    const tag = node.tags.find((t) => t.tag === `type`);

    return tag
        ? new Set(tag.type.split(`|`))
        : undefined;
}

/**
 * @param {Node} functionDeclNode
 * @param {Context} context
 * @param {string} paramName
 * @return {Type}
 */
function getParamTypeForFunction(functionDeclNode, context, paramName) {
    if (!functionDeclNode || !paramName) {
        return;
    }

    const comment = getCommentNodeFor(functionDeclNode, context)
    const tag = comment.tags.find((t) => t.tag === `param` && t.name === paramName);

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
 * @return {function(Node):void}
 */
function visitProgram(context) {
    /**
     * @param {ProgramNode} programNode
     */
    return function _visitProgram(programNode) {
        _doThingsToProgramNode(programNode, context);
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

    let {
        callee
    } = node;

    if (callee.type === `MemberExpression`) {
        callee = callee.property;
    }

    const calledFunctionBinding = scan.getBinding(callee);

    if (!calledFunctionBinding || !calledFunctionBinding.definition) {
        return;
    }

    return calledFunctionBinding.definition.parent;
}

function getArgumentsForCalledFunction(node, context) {
    if (node.type !== `CallExpression`) {
        return;
    }

    let {
        callee
    } = node;

    if (callee.type === `MemberExpression`) {
        callee = callee.property;
    }

    const calledFunctionBinding = scan.getBinding(callee);

    if (!calledFunctionBinding || !calledFunctionBinding.definition) {
        return;
    }

    const calledFunctionNode = calledFunctionBinding.definition.parent;
    const comment = getCommentNodeFor(calledFunctionNode, context);

    return comment.tags.filter((t) => t.tag === `param`);
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
