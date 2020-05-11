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

const Primitives = {
    boolean: `boolean`,
    function: `function`,
    number: `number`,
    object: `object`,
    string: `string`,
    undefined: `undefined`
};

/** @type {object.<string, FileInfo>} */
const fileInfoCache = {};

// /**
//  * @param {ProgramNode} programNode
//  * @param {Context} context
//  * @mutates
//  */
// function buildMetadataForAST(programNode, context) {
//     scan.createScope(programNode, []); // todo: any global variables here?
//     scan.crawl(programNode);

//     const comments = getComments(programNode)
//         .map((c) => Object.assign(
//             { loc: c.loc },
//             parseComment(`/*${c.value}*/`)[0]
//         ));

//     fileInfoCache[context.getFilename()] = {
//         comments,
//         programNode
//     };
// }

// /**
//  * @param {Context} context
//  */
// function loadAST(context) {
//     const filename = context.getFilename();

//     if (fileInfoCache[filename]) {
//         return;
//     }

//     const fileContents = fs.readFileSync(filename).toString();
//     const programNode = parseFile(filename, fileContents, context);

//     buildMetadataForAST(programNode, context);
// }

// function getTypeOfComment(comment) {
//     if (!comment) {
//         return;
//     }

//     const tag = comment.tags.find(
//         (t) => /^((return[s])|(type(def)?))$/.test(t.tag)
//     );

//     return tag.tag;
// }

// /**
//  * @param {string} importStatement
//  * @return {object}
//  */
// function getInfoFromJsdocImport(importStatement) {
//     const match = /^import\((.*)\)\.(.*)$/.exec(importStatement);

//     return match
//         ? { path: match[1].slice(1, -1), typedef: match[2] }
//         : {};
// }

// /**
//  * @param {string} importStatement
//  * @param {Context} context
//  * @return {Context}
//  */
// function getExternalContextForJsdocImport(importStatement, context) {
//     if (!importStatement) {
//         return;
//     }

//     const {
//         path: importPath
//     } = getInfoFromJsdocImport(importStatement);
//     const modulePath = resolve(importPath, context);
//     const newContext = {};

//     for (let i in context) {
//         newContext[i] = context[i];
//     }

//     newContext.getFilename = () => modulePath;

//     loadAST(newContext);

//     return newContext;
// }


// /**
//  * @param {string} typedef
//  * @param {Context} context
//  * @return {Comment}
//  */
// function findCommentForTypedef(typedef, context) {
//     if (!typedef || !context) {
//         return;
//     }

//     return getCommentsForContext(context)
//         .find(
//             (c) => c.tags.find((t) => t.tag === `typedef` && t.name === typedef)
//         );
// }

// /**
//  * @param {string} importStatement
//  * @param {Context} context
//  * @return {Comment}
//  */
// function getCommentForJsdocImport(importStatement, context) {
//     if (!importStatement) {
//         return;
//     }

//     const {
//         typedef
//     } = getInfoFromJsdocImport(importStatement);

//     return findCommentForTypedef(typedef, context);
// }

// /**
//  * @param {Node} node
//  * @param {Context} context
//  * @return {Comment}
//  */
// function getJsdocAtNode(node, context) {
//     if (!node || !context) {
//         return;
//     }

//     return getCommentsForContext(context)
//         .find(
//             (c) => c.loc.end.line === node.loc.start.line - 1 // todo: configurable?
//         );
// }

// function getExpressionForExternalTypedef(importStatement, context, defs) {
//     const {
//         importPath,
//         typedef
//     } = getInfoFromJsdocImport(importStatement);
//     const typedefKey = `${resolve(importPath, context)}:${typedef}`;

//     if (defs[typedefKey]) {
//         return typedefKey;
//     }

//     const externalContext = getExternalContextForJsdocImport(importStatement, context);
//     const externalComment = getCommentForJsdocImport(importStatement, externalContext);

//     /* put a placeholder entry into the scanned-typedefs hash to avoid infinite recursion
//      * while we build the real thing */
//     defs[typedefKey] = typedef;

//     const type = getTypeFromComment(externalComment, externalContext, defs);

//     Object.assign(defs, { [typedefKey]: type });

//     return typedefKey;
// }

// function getExpressionForTypedef(typedef, context, defs) {
//     const typedefKey = `${context.getFilename()}:${typedef}`;

//     if (defs[typedefKey]) {
//         return typedefKey;
//     }

//     const comment = findCommentForTypedef(typedef, context);

//     /* put a placeholder entry into the scanned-typedefs hash to avoid infinite recursion
//      * while we build the real thing */
//     defs[typedefKey] = typedef;

//     const type = getTypeFromComment(comment, context, defs);

//     Object.assign(defs, { [typedefKey]: type });

//     return typedefKey;
// }

// function getExp

// function getTypeFromTypedefComment(typedef, context, defs) {
//     const comment = findCommentForTypedef(typedef, context);
//     console.log(`loading typedef from:`, comment);
//     const typedefKey = `${context.getFilename()}:${typedef}`;

//     if (defs[typedefKey]) {
//         return defs[typedefKey];
//     }

//     const type = new Set(comment.tags.filter((t) => t.tag === `property`).map(
//         (t) => t.split(`|`).map(
//         (t) => {
//             if (Primitives[t]) {
//                 return t;
//             } else if (t.startsWith(`import(`)) {
//                 console.log(`loading external typedef`);
//                 return getExpressionForExternalTypedef(t, context, defs);
//             } else {
//                 console.log(`loading local typedef`);
//                 console.log(`known types:`, Object.keys(defs));
//                 return getTypeFromTypedefComment(t, context, defs);
//             }
//         }
//     ));
//     ));

//     defs[typedefKey] = type;

//     return type;
// }

// function getTypeFromComment(comment, context, defs={}) {
//     const tag = comment.tags.find(
//         (t) => t.tag === `type`
//     );

//     if (!tag) {
//         return;
//     }

//     const type = new Set(tag.type.split(`|`).map(
//         (t) => {
//             if (Primitives[t]) {
//                 return t;
//             } else if (t.startsWith(`import(`)) {
//                 console.log(`loading external typedef`);
//                 return getExpressionForExternalTypedef(t, context, defs);
//             } else {
//                 console.log(`loading local typedef`);
//                 console.log(`known types:`, Object.keys(defs));
//                 return getTypeFromTypedefComment(t, context, defs);
//             }
//         }
//     ));

//     return {
//         defs,
//         type
//     };
// }

// function getTypeAtNode(node, context) {
//     if (!node || !context) {
//         return;
//     }

//     let binding = null;

//     switch (node.type) {
//         case `CallExpression`:
//             binding = scan.getBinding(node.callee);

//             break;
//         case `Identifier`:
//             if (node.name === `undefined`) {
//                 return new Set([ `undefined` ]);
//             }

//             binding = scan.getBinding(node);

//             break;
//         case `Literal`:
//             switch (node.value) {
//                 case null:
//                 case undefined:
//                     return new Set([ `${node.value}` ]);
//                 default:
//                     return Primitives[typeof node.value];
//             }

//             break;
//         case `ObjectExpression`:
//             /* */

//             return Primitives.object;
//         case `VariableDeclarator`:
//             binding = scan.getBinding(node.id);

//             break;
//         default:
//             binding = scan.getBinding(node);
//     }

//     if (!binding.definition.parent) {
//         return;
//     }

//     if (binding.definition.parent.type === `ImportSpecifier`) {
//         const externalContext = getExternalContextForImport(
//             binding.definition.parent,
//             context
//         );
//         const externalExportDeclaration = getExternalDeclarationForImportSpecifier(
//             binding.definition.parent,
//             externalContext
//         );

//         return getTypeAtNode(externalExportDeclaration, externalContext);
//     }

//     const comment = getJsdocAtNode(binding.definition.parent, context);
//     console.log(`jsdoc comment for node:`, comment);
//     let type = null;

//     switch (getTypeOfComment(comment)) {
//         case `type`:
//             type = getTypeFromComment(comment, context);

//             break;
//         case `typedef`:
//             type = getTypeFromTypedefComment(comment, context);
//     }
//     console.log(`resolved type:`, type);
// }


// module.exports = {
//     getTypeAtNode,
//     visitProgramNode
// };


















/**
 * @param {Type} type
 * @return {string}
 */
function typeToString(type) {
    if (!type || !type.type) {
        return `?unknown?`;
    }

    const types = [ ...type.type ]
        .map((t) => t.includes(`:`) ? t.split(`:`)[1] : t)
        .join(`|`);

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
 * @param {string} importStatement
 * @return {object}
 */
function getInfoFromJsdocImport(importStatement) {
    const match = /^import\((.*)\)\.(.*)$/.exec(importStatement);

    return match
        ? { path: match[1].slice(1, -1), typedef: match[2] }
        : {};
}

function findComment(context, predicate) {
    if (!context) {
        return;
    }

    const fileInfo = fileInfoCache[context.getFilename()];

    if (!fileInfo) {
        return;
    }

    return fileInfo.comments.find(predicate);
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

    return findComment(
        context,
        (c) => c.loc.end.line === node.loc.start.line - 1 // todo: configurable?
    );
}

function typeStringToSet(typeString, context, defs) {
    return new Set(typeString.split(`|`).map(
        (t) => {
            if (t.startsWith(`import(`)) {
                /* type defined in some other file */
                return getExternalDefinition(t, context, defs);
            } else if (!Primitives[t]) {
                /* type defined elsewhere in this file */
                return getDefinition(t, context, defs);
            } else {
                /* primitive? */
                return t;
            }
        }
    ));
}

function getReturn(comment, context, defs) {
    const tag = comment.tags.find(
        (t) => t.tag === `return` || t.tag === `returns`
    );

    if (!tag) {
        return;
    }

    return typeStringToSet(tag.type, context, defs);
}

function getType(comment, context, defs) {
    const tag = comment.tags.find(
        (t) => t.tag === `type`
    )

    return typeStringToSet(tag.type, context, defs);
}

function getTypedef(comment, context, defs) {
    if (!comment) {
        return;
    }

    const typedefName = comment.tags.find(
        (t) => t.tag === `typedef`
    ).name;
    const typedef = comment.tags.filter(
        (t) => t.tag === `property`
    ).reduce(
        (td, t) => Object.assign(
            td,
            { [t.name]: typeStringToSet(t.type, context, defs) }
        ),
        {}
    );

    Object.assign(defs, { [typedefName]: typedef });

    return typedef;
}

function getTagNameForType(comment) {
    if (!comment) {
        return;
    }

    const tag = comment.tags.find(
        (t) => /^((return[s]?)|(type(def)?))$/.test(t.tag)
    );

    return tag.tag;
}

function sniffType(comment, context, defs) {
    if (!comment) {
        return;
    }

    let type = null;

    switch (getTagNameForType(comment)) {
        case `return`:
        case `returns`:
            type = getReturn(comment, context, defs);

            break;
        case `type`:
            type = getType(comment, context, defs);

            break;
        case `typedef`:
            type = getTypedef(comment, context, defs);

            break;
    }

    return {
        defs,
        type
    };
}

function getObjectFromObjectExpression(node) {
    if (!node || node.type !== `ObjectExpression`) {
        return;
    }

    return node.properties.reduce(
        (o, p) => {
            let val = null;

            switch (p.value.type) {
                case `Literal`:
                    val = typeof(p.value.value);

                    break;
                case `ObjectExpression`:
                    val = getObjectFromObjectExpression(p.value);

                    break;
                case `TemplateLiteral`:
                    val = `string`;

                    break;
            }

            return Object.assign(o, {
                [p.key.name]: val
            });
        },
        {}
    );
}

function getScopeForNode(node, context) {
    if (!node || !context) {
        return;
    }

    let binding = null;

    switch (node.type) {
        case `CallExpression`:
            binding = scan.getBinding(node.callee);

            break;
        case `Identifier`:
            if (node.name !== `undefined`) {
                binding = scan.getBinding(node);
            }

            break;
        case `VariableDeclarator`:
            binding = scan.getBinding(node.id);

            break;
        default:
            binding = scan.getBinding(node);
    }

    return binding
        ? binding.definition.parent
        : node;
}

function getExternalDeclarationForImportSpecifier(node, context) {
    const importedSymbol = node.imported.name;
    const fileInfo = fileInfoCache[context.getFilename()];

    if (!fileInfo) {
        return;
    }

    const {
        programNode
    } = fileInfo;
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

function determineType(node, context, defs={}) {
    if (node.type === `Literal`) {
        return { defs, type: new Set([ typeof node.value ]) };
    } else if (node.type === `TemplateLiteral`) {
        return { type: new Set([ `string` ]) };
    } else if (node.type === `Identifier` && node.name === `undefined`) {
        return { type: new Set([ `undefined` ]) };
    } else if (node.type === `ObjectExpression`) {
        return { literal: getObjectFromObjectExpression(node) };
    }

    const scopeDeclaratorNode = getScopeForNode(node, context);

    if (!scopeDeclaratorNode) {
        return;
    }

    if (scopeDeclaratorNode.type === `ImportSpecifier`) {
        const externalContext = getExternalContextForImport(
            scopeDeclaratorNode,
            context
        );
        const externalExportDeclaration = getExternalDeclarationForImportSpecifier(
            scopeDeclaratorNode,
            externalContext
        );

        return determineType(externalExportDeclaration, externalContext);
    }
    const comment = getJsdocAtNode(scopeDeclaratorNode, context);

    return sniffType(comment, context, defs);
}

/**
 * @param {ProgramNode} programNode
 * @param {Context} context
 * @mutates
 */
function buildMetadataForAST(programNode, context) {
    scan.createScope(programNode, []); // todo: any global variables here?
    scan.crawl(programNode);

    const comments = getComments(programNode)
        .filter((c) => c.value.startsWith(`*`))
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
  * @param {Context}
  * @return {function(Node):void}
  */
function visitProgramNode(context) {
    return function _visitProgramNode(programNode) {
        buildMetadataForAST(programNode, context);
    }
}

function getExternalDefinition(typeString, context, defs) {
    const {
        path: importPath,
        typedef
    } = getInfoFromJsdocImport(typeString);
    const typedefKey = `${resolve(importPath, context)}:${typedef}`;

    if (defs[typedefKey]) {
        return typedefKey;
    }

    const externalContext = getExternalContextForJsdocImport(typeString, context);
    const externalComment = findComment(
        externalContext,
        (c) => c.tags.find(
            (t) => t.tag === `typedef` && t.name === typedef
        )
    );

    /* put a placeholder entry into the scanned-typedefs hash to avoid infinite recursion
     * while we build the real thing */
    defs[typedefKey] = typedef;

    const type = getTypedef(externalComment, externalContext, defs);

    Object.assign(defs, { [typedefKey]: type });

    return typedefKey;
}
function getDefinition(typeString, context, defs) {
    const comment = findComment(
        context,
        (c) => c.tags.find(
            (t) => t.tag === `typedef` && t.name === typeString
        )
    );

    if (!comment) {
        return;
    }

    const typedefKey = `${context.getFilename()}:${typeString}`;

    if (defs[typedefKey]) {
        return typedefKey;
    }

    Object.assign(defs, { [typedefKey]: getTypedef(comment, context, defs) });

    return typedefKey;
}

function setMatchesObject(type, typedef, obj) {
    const objKeys = Object.keys(obj);

    return objKeys.length === Object.keys(typedef).length
        && objKeys.every(
            (k) => typeof obj[k] === `string`
                ? typedef[k].has(obj[k])
                : [ ...typedef[k] ].some(
                    (t) => setMatchesObject(type, type.defs[t], obj[k])
                )
        );
}

function typeMatchesLiteral(type, obj) {
    if (!type || !obj) {
        return;
    }

    return [ ...type.type ].some(
        (t) => setMatchesObject(type, type.defs[t], obj)
    );
}

function typeAllowsType(leftType, rightType) {
    if (!rightType) {
        return;
    }

    if (!leftType || !leftType.type) {
        return false;
    } else if (leftType === rightType || leftType.type === rightType.type) {
        return true;
    } else if (rightType.literal) {
        return typeMatchesLiteral(leftType, rightType.literal);
    } else {
        return [ ...rightType.type ].some(
            (t) => leftType.type.has(t)
        );
    }
}

module.exports = {
    determineType,
    typeAllowsType,
    typeToString,
    visitProgramNode
};
