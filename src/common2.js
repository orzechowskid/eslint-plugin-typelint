const fs = require('fs');

const parseComment = require('comment-parser');
const {
    default: parseFile
} = require('eslint-module-utils/parse');
const {
    default: resolve
} = require('eslint-module-utils/resolve');
const scan = require('scope-analyzer');

const {
    getComments
} = require('./astUtils');

/**
 * @typedef {object} FileInfo
 * @property {Node} programNode
 * @property {Comment[]} comments
 */

/**
 * @typedef {Set<string|object>} Type
 * @property {Set<string|object>} [expression]
 * @property {boolean} [inferred]
 */

/** @type {object<string,Type>} */
const Primitives = {
    boolean: new Set([ typeof true ]),
    function: new Set([ typeof function x() {} ]),
    number: new Set([ typeof 1 ]),
    object: new Set([ typeof {} ]),
    string: new Set([ typeof `` ]),
    undefined: new Set([ typeof undefined ])
};

/** @type {object.<string, FileInfo>} */
const fileInfoCache = {};

/** @type {Type} */
const TYPE_SELF = new Set();

/**
 * @param {ProgramNode} programNode
 * @param {Context} context
 * @mutates
 */
function buildMetadataForAST(programNode, context) {
    scan.createScope(programNode, []); // todo: any global variables here?
    scan.crawl(programNode);

    const comments = getComments(programNode)
        .map((c) => Object.assign(
            { loc: c.loc },
            parseComment(`/*${c.value}*/`)[0]
        ));

    fileInfoCache[context.getFilename()] = {
        comments,
        programNode
    };
}

/**
 * @param {Context} context
 */
function loadAST(context) {
    const filename = context.getFilename();

    if (fileInfoCache[filename]) {
        return;
    }

    const fileContents = fs.readFileSync(filename).toString();
    const programNode = parseFile(filename, fileContents, context);

    buildMetadataForAST(programNode, context);
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
 * @return {Context}
 */
function getExternalContextForImport(node, context) {
    const importDeclaration = node.type === `ImportDeclaration`
        ? node
        : node.parent;
    const importPath = importDeclaration.source.value;
    const modulePath = resolve(importPath, context);
    const newContext = {};

    for (let i in context) {
        newContext[i] = context[i];
    }

    newContext.getFilename = () => modulePath;

    loadAST(newContext);

    return newContext;
}

/**
 * @param {string} importStatement
 * @return {object}
 */
function getInfoFromJsdocImport(importStatement) {
    const match = /^import\((.*)\)\.(.*)$/.exec(importStatement);

    return match
        ? { path: match[1].slice(1, -1), typedef: match[2] }
        : {};
}

/**
 * @param {string} importStatement
 * @param {Context} context
 * @return {Context}
 */
function getExternalContextForJsdocImport(importStatement, context) {
    if (!importStatement) {
        return;
    }

    const {
        path: importPath
    } = getInfoFromJsdocImport(importStatement);
    const modulePath = resolve(importPath, context);
    const newContext = {};

    for (let i in context) {
        newContext[i] = context[i];
    }

    newContext.getFilename = () => modulePath;

    loadAST(newContext);

    return newContext;
}

/**
 * @param {Context} context
 * @return {ProgramNode}
 */
function getProgramNodeForContext(context) {
    if (!context || !fileInfoCache[context.getFilename()]) {
        return;
    }

    return fileInfoCache[context.getFilename()].programNode;
}

/**
 * @param {Context} context
 * @return {Comment[]}
 */
function getCommentsForContext(context) {
    if (!context || !fileInfoCache[context.getFilename()]) {
        return;
    }

    return fileInfoCache[context.getFilename()].comments;
}

/**
 * @param {string} typedef
 * @param {Context} context
 * @return {Comment}
 */
function findCommentForTypedef(typedef, context) {
    if (!typedef || !context) {
        return;
    }

    return getCommentsForContext(context)
        .find(
            (c) => c.tags.find((t) => t.tag === `typedef` && t.name === typedef)
        );
}

/**
 * @param {string} importStatement
 * @param {Context} context
 * @return {Comment}
 */
function getCommentForJsdocImport(importStatement, context) {
    if (!importStatement) {
        return;
    }

    const {
        typedef
    } = getInfoFromJsdocImport(importStatement);

    return findCommentForTypedef(typedef, context);
}

/**
 * @param {string} typeString
 * @return {Type}
 */
function newTypeFromString(typeString) {
    // todo: this does not correctly handle e.g. object.<number|string>
    return new Set(typeString.split(`|`));
}

/**
 * @param {string} typedef
 * @param {Context} context
 * @return {string}
 * @mutates
 */
function loadTypeExpression(typedef, context, typeManifest) {
    const comment = findCommentForTypedef(typedef, context);
    const typeKey = `${context.getFilename()}:${typedef}`;

    if (typeManifest[typeKey]) {
        /* we already know about this typedef */
        return typeKey;
    } else if (!comment) {
        /* undocumented type */
        return typeKey;
    }

    /* placeholder so we don't infinitely recurse when resolving things like linked lists */
    typeManifest[typeKey] = typedef;
    typeManifest[typeKey] = _getTypeExpressionFromComment(
        comment,
        context,
        typeManifest
    );

    return typeKey;
}

/**
 * @param {string} importStatement
 * @param {Context} context
 * @return {string}
 * @mutates
 */
function loadExternalTypeExpression(importStatement, context, typeManifest) {
    const {
        path: importPath,
        typedef
    } = getInfoFromJsdocImport(importStatement);
    const typeKey = `${resolve(importPath, context)}:${typedef}`;

    if (typeManifest[typeKey]) {
        /* we already know about this type */
        return;
    }

    const externalContext = getExternalContextForJsdocImport(
        importStatement,
        context
    );
    const externalComment = getCommentForJsdocImport(
        importStatement,
        externalContext
    );

    /* placeholder so we don't infinitely recurse when resolving things like linked lists */
    typeManifest[typeKey] = typedef;
    typeManifest[typeKey] = _getTypeExpressionFromComment(
        externalComment,
        externalContext,
        typeManifest
    );

    return typeKey;
}

function _getTypeExpressionFromComment(comment, context, typeManifest) {
    return comment.tags.reduce(
        (e, t) => Object.assign(e, {
            [t.name]: new Set(t.type.split(`|`).map(
                (tt) => {
                    if (tt.startsWith(`import(`)) {
                        /* type defined in some other file */
                        return loadExternalTypeExpression(
                            tt,
                            context,
                            typeManifest
                        );
                    } else if (!Primitives[tt]) {
                        /* type defined in this file */
                        return loadTypeExpression(tt, context, typeManifest);
                    }

                    /* a primitive */
                    return tt;
                }
            ))
        }),
        {}
    );
}

/**
 * @param {Comment} comment
 * @param {Context} context
 * @return {TypeExpression}
 */
function getTypeExpressionFromComment(type, comment, context) {
    if (!comment) {
        return;
    }

    const typeManifest = {};
    const typeExpression = new Set([ ...type ].map(
        (t) => _getTypeExpressionFromComment(t, comment, context, typeManifest)
    ));

    return {
        expression: typeExpression,
        types: typeManifest
    };
}

/**
 * @param {Comment} comment
 * @param {Context} context
 * @return {Type}
 */
function getTypeFromComment(comment, context) {
    const tag = comment.tags.find(
        (t) => t.tag === `return` || t.tag === `returns` || t.tag === `typedef` || t.tag === `type`
    );

    if (!tag) {
        return;
    }

    const visitedTypedefs = {};
    const type = new Set(tag.type.split(`|`).map(
        (t) => {
            if (Primitives[t]) {
                return t;
            }

            let typedefKey = null;

            if (t.startsWith(`import(`)) {
                const externalContext = getExternalContextForJsdocImport(t, context);
                const externalComment = getCommentForJsdocImport(t, externalContext);
                const {
                    importPath,
                    typedef
                } = getInfoFromJsdocImport(t);
                const modulePath = resolve(importPath, context);

                typedefKey = `${modulePath}:${typedef}`;
            } else {
                const comment = findCommentForTypedef(t, context);

                typedefKey = `${context.getFilename()}:${t}`;
            }

            return typedefKey;
        }
    ));
    console.log(`me:`, type);
    console.log(`mah types:`, visitedTypedefs);

    return new Set(
        tag.type.split(`|`).map(
            (t) => {
                if (t.startsWith(`import(`)) {
                    const externalContext = getExternalContextForJsdocImport(t, context);
                    const externalComment = getCommentForJsdocImport(t, externalContext);

                    const x = getTypeFromComment(externalComment, externalContext);

                    return [ ...x ][0];
                } else {
                    return t;
                }
            }
        )
    );
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Comment}
 */
function getJsdocAtNode(node, context) {
    if (!node || !context) {
        return;
    }

    return getCommentsForContext(context)
        .find(
            (c) => c.loc.end.line === node.loc.start.line - 1 // todo: configurable?
        );
}

function getExternalDeclarationForImportSpecifier(node, context) {
    const importedSymbol = node.imported.name;

    const programNode = getProgramNodeForContext(context);
    const exportDecl = programNode.body
        .reduce(
            (e, n) => {
                if (e) { return e; }

                if (n.type === `ExportDefaultDeclaration`
                    && n.declaration.name === importedSymbol) {
                    return n.declaration;
                } else if (n.type === `ExportNamedDeclaration`) {
                    return n.specifiers.find(
                        (s) => s.local.name === importedSymbol
                    );
                }

                return e;
            },
            null
        );

    return exportDecl.local;
}

/**
 * @param {Context}
 * @return {function(Node):void}
 */
function visitProgramNode(context) {
    return function _visitProgramNode(programNode) {
        buildMetadataForAST(programNode, context);
    }
}

function getTypeAtNode(node, context) {
    if (!node || !context) {
        return;
    }

    let binding = null;

    switch (node.type) {
        case `CallExpression`:
            binding = scan.getBinding(node.callee);

            break;
        case `Identifier`:
            if (node.name === `undefined`) {
                return new Set([ `undefined` ]);
            }

            binding = scan.getBinding(node);

            break;
        case `Literal`:
            switch (node.value) {
                case null:
                case undefined:
                    return new Set([ `${node.value}` ]);
                default:
                    return Primitives[typeof node.value];
            }

            break;
        case `ObjectExpression`:
            /* */

            return Primitives.object;
        case `VariableDeclarator`:
            binding = scan.getBinding(node.id);

            break;
        default:
            binding = scan.getBinding(node);
    }

    if (!binding.definition.parent) {
        return;
    }

    if (binding.definition.parent.type === `ImportSpecifier`) {
        const externalContext = getExternalContextForImport(
            binding.definition.parent,
            context
        );
        const externalExportDeclaration = getExternalDeclarationForImportSpecifier(
            binding.definition.parent,
            externalContext
        );

        return getTypeAtNode(externalExportDeclaration, externalContext);
    }

    const comment = getJsdocAtNode(binding.definition.parent, context);
    const type = getTypeFromComment(comment, context);
    console.log(`resolved type:`, type);
    const expr = getTypeExpressionFromComment(type, comment, context);
    console.log(`resolved expr:`, expr);

    return getTypeFromComment(comment, context);
}

module.exports = {
    getTypeAtNode,
    typeIncludesType,
    typeToString,
    visitProgramNode
};
