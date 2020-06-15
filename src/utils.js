const fs = require('fs');

const parseComment = require('comment-parser');
const {
    default: parseFile
} = require('eslint-module-utils/parse');
const {
    default: resolve
} = require('eslint-module-utils/resolve');
const scan = require('scope-analyzer');

const fileInfoCache = require('./fileInfoCache.js');
const Type = require('./Type');

const PRIMITIVES = [
    `boolean`,
    `boolean[]`,
    `function`,
    `function[]`,
    `number`,
    `number[]`,
    `object`,
    `object[]`,
    `string`,
    `string[]`,
    `undefined` /* cheating a little bit with this one */
];


function acquireBinding(node) {
    if (!node) {
        return;
    }

    switch (node.type) {
        case `Identifier`:
            return scan.getBinding(node);

        case `MemberExpression`:
            return scan.getBinding(node.property);
    }
}

/**
 * @param {string} importString
 * @param {Context} context
 * @return {{ importPath: string, type: string }}
 */
function parseJsdocImportString(importString, context) {
    const match = /^import\(['"](.*)['"]\)\.(.*)$/.exec(importString);

    return match
        ? { importPath: resolve(match[1], context), type: match[2] }
        : {};
}

function getReturnTypeFromComment(comment, context) {
    const returnTag = comment.tags.find(
        (t) => t.tag === `return` || t.tag === `returns`
    );

    if (returnTag) {
        return new Type(...returnTag.type.split(`|`));
    }

    const typeTag = comment.tags.find(
        (t) => t.tag === `type` && t.type.startsWith(`function(`)
    );

    if (typeTag) {
        return getReturnTypeFromFunctionTypeString(typeTag.type);
    }
}

/**
 * @param {Node} commentNode
 * @param {Context} context
 * @return {Comment}
 */
function parseJsdocComment(commentNode, context) {
    return {
        loc: commentNode.loc,
        tags: parseComment(`/*${commentNode.value}*/`)[0].tags
            .map(function(t) {
                let newType = t.type.split(`|`)
                    .reduce(
                        function(nt, st) {
                            if (PRIMITIVES.includes(st.toLowerCase())) {
                                return nt.concat(st);
                            } else if (st.startsWith(`import(`)) {
                                const { importPath, type } = parseJsdocImportString(
                                    st, context
                                );

                                return nt.concat(
                                    importPath
                                        ? `${importPath}:${type}`
                                        : st
                                );
                            } else if (st.startsWith(`function(`)) {
                                return nt.concat(parseJsdocFunctionTypeString(st));
                            } else {
                                return nt.concat(`${context.getFilename()}:${st}`);
                            }
                        }, []
                    ).join(`|`);


                return Object.assign(t, { type: newType });
            })
    };
}

/**
 * @param {ProgramNode} programNode
 * @return {JsdocComment[]}
 */
function parseJsdocComments(programNode, context) {
    return programNode.comments.filter(
        (c) => c.type === `Block`
    ).map(
        (c) => parseJsdocComment(c, context)
    );
}

function parseJsdocFunctionTypeString(functionTypeString) {
    const match = /function\((.*)\)\s*:\s*(.*)/.exec(functionTypeString);

    return match
        ? `function(${match[1].split(/\s*,\s*/).join(',')}):${match[2]}`
        : undefined;
}

function getReturnTypeFromFunctionTypeString(functionTypeString) {
    const normalizedString = parseJsdocFunctionTypeString(functionTypeString);

    return normalizedString
        ? new Type(normalizedString.substring(1 + normalizedString.lastIndexOf(`:`)))
        : undefined;
}

function getParamTypesFromFunctionTypeString(functionTypeString) {
    const normalizedString = parseJsdocFunctionTypeString(functionTypeString);

    return normalizedString
        ? /\((.*)\)/.exec(normalizedString)[1].split(`,`).map(
            (t) => new Type(t)
        )
        : undefined;
}

function extractTypeFieldFromTag(tag, context) {
    const types = new Type(...tag.type.split(`|`));

    if (tag.optional) {
        types.push(`undefined`);
    }

    return types;
}

/**
 * @param {Comment} comment
 * @param {Context} context
 * @return {object|undefined}
 */
function extractParams(comment, context) {
    const paramTags = comment.tags.filter(
        (c) => c.tag === `param`
    );

    if (!paramTags.length) {
        return;
    }

    return paramTags.reduce(function(p, t) {
        return Object.assign(p, {
            [t.name]: extractTypeFieldFromTag(t, context)
        });
    }, {});
}

/**
 * @param {Comment[]} comments
 * @param {Context} context
 * @return {object}
 */
function extractTypedefs(comments, context) {
    return comments.filter(
        (c) => c.tags.some(
            (t) => t.tag === `typedef`
        )
    ).reduce(function(a, c) {
        const typedef = c.tags.find(
            (t) => t.tag === `typedef`
        );
        const {
            name
        } = typedef;
        const properties = c.tags.filter(
            (t) => t.tag === `property`
        ).reduce(function(a, t) {
            return Object.assign(a, {
                [t.name]: extractTypeFieldFromTag(t, context)
            });
        }, {});
        return Object.assign(a, {
            [name]: properties
        });
    }, {});
}

function visitFile(context) {
    const filename = context.getFilename();

    if (fileInfoCache[filename]) {
        return;
    }

    const fileContents = fs.readFileSync(filename).toString();
    const programNode = parseFile(filename, fileContents, context);

    storeProgram(programNode, context);

    return programNode;
}

function getContextForFile(fsPath, currentContext) {
    const newContext = {};

    for (let i in currentContext) {
        newContext[i] = currentContext[i];
    }

    newContext.getFilename = () => fsPath;

    visitFile(newContext);

    return newContext;
}

function getNamedExportIdentifierForSymbolName(symbolName, context) {
    const {
        programNode
    } = fileInfoCache[context.getFilename()];

    const namedExport = programNode.body.filter(
        (n) => n.type === `ExportNamedDeclaration`
    ).flatMap(
        (n) => n.specifiers
    ).find(
        (s) => s.exported.name === symbolName
    );

    return namedExport
        ? namedExport.local
        : undefined;
}

function resolveTypeForVariableDeclarator(node, context) {
    if (!node.init) {
        return resolveTypeForDeclaration(node.id, context);
    }

    switch (node.init.type) {
        case `CallExpression`:
        case `ArrowFunctionExpression`:
            return resolveTypeForCallExpression(node.init, context);

        default:
            return resolveTypeForValue(node.init);
    }
    if (parent.init && parent.init.type === 'ArrowFunctionExpression') {
        if (comment) {
            // The binding may be an argument of the arrow expression.
            const params = extractParams(comment, context);
            if (params[name] !== undefined) {
                // The binding found may be a parameter.
                return new Type(...(params[name] || []));
            } else if (name === parent.id.name) {
                // CHECK: This should be the type of the expression, not the type of a call to it.
                return getReturnTypeFromComment(comment);
            }
        }
    }

    return resolveTypeForDeclaration(parent.id, context);
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type}
 */
function resolveTypeForNodeIdentifier(node, context) {
    if (!node) {
        return;
    } else if (node.name === `undefined`) {
        /* turns out 'undefined' is a perfectly valid identifier for a variable.  so
         * this won't work as expected with the statement 'const undefined = 3;' for
         * instance, but that's a rare (and extremely weird) case */
        return new Type(`undefined`);
    }

    const idBinding = acquireBinding(node);

    if (!idBinding) {
        return;
    }

    const {name} = node;
    const {definition} = idBinding;
    const {parent} = definition;

    switch (parent.type) {
        case `FunctionDeclaration`: {
            const comment = getCommentForNode(definition, context);

            if (!comment) {
                return;
            }

            if (parent.id.name === name) {
                // The binding found is the function name.
                // CHECK: shouldn't this be the type of the function, not the return type?
                return getReturnTypeFromComment(comment);
            } else {
                // The binding found is a function parameter.
                const params = extractParams(comment, context);
                return new Type(...(params[name] || []));
            }
        }
        case `ArrowFunctionExpression`: {
            const comment = getCommentForNode(definition, context);
            console.log(`af comment:`, comment);

            if (!comment) {
                return;
            }

            const params = extractParams(comment, context);

            if (params) {
                return new Type(...params[name]);
            }

            const typeTag = comment.tags.find(
                (t) => t.tag === `type`
            );

            if (!typeTag) {
                return;
            }

            const paramTypes = getParamTypesFromFunctionTypeString(
                typeTag.type, context
            );

            console.log(`pts:`, paramTypes);
        }
        case `ImportDefaultSpecifier`: {
            const externalSymbol = parent.imported.name;
            const fsPath = resolve(parent.source.value, context);
            const externalContext = getContextForFile(fsPath, context);
            const externalExportIdentifier = getDefaultExportIdentifierForSymbolName(externalSymbol, externalContext);

            return new Type(`${fsPath}:${externalSymbol}`);
        }
        case `ImportSpecifier`: {
            const externalSymbol = parent.imported.name;
            const fsPath = resolve(parent.parent.source.value, context);
            const externalContext = getContextForFile(fsPath, context);
            const externalExportIdentifier = getNamedExportIdentifierForSymbolName(externalSymbol, externalContext);

            return resolveTypeForNodeIdentifier(externalExportIdentifier, externalContext);
        }

        default:
            return resolveTypeForValue(idBinding.definition.parent, context);
    }
}

function getCommentForNode(node, context) {
    const nodeLocation = node.loc.start.line;
    const comments = fileInfoCache[context.getFilename()].comments
          || [];

    return comments.find(
        (c) => c.loc.end.line === nodeLocation - 1
    );
}

function resolveTypeFromComment(comment, context) {
    if (!comment) {
        return;
    }

    const typeTag = comment.tags.find(
        (t) => t.tag === `type`
    );

    if (typeTag) {
        return new Type(...typeTag.type.split(`|`));
    }
}

/**
 * @mutates
 */
function addAST(programNode) {
    scan.createScope(programNode, []);
    scan.crawl(programNode);

    return programNode;
}

function storeProgram(programNode, context) {
    addAST(programNode);

    const comments = parseJsdocComments(programNode, context);
    const typedefs = extractTypedefs(comments, context);

    fileInfoCache[context.getFilename()] = {
        comments,
        context,
        programNode,
        typedefs
    };
}

function resolveTypeForDeclaration(node, context) {
    const identifierComment = getCommentForNode(node, context);

    return resolveTypeFromComment(identifierComment, context);
}

function resolveTypeForFunctionDeclaration(node, context) {
    if (!node) {
        return;
    }

    const identifierComment = getCommentForNode(node, context);

    if (identifierComment) {
        return getReturnTypeFromComment(identifierComment, context);
    }
}

function resolveTypeForBinaryExpression(node, context) {
    if (!node) {
        return;
    }

    const {
        left,
        operator,
        right
    } = node;

    switch (operator) {
        case `+`:
            return (left === `string` || right === `string`)
                ? new Type(`string`)
                : new Type(`number`);

        default:
            return new Type(`number`);
    }
}

function resolveTypeForConditionalExpression(node, context) {
    const leftTypes = resolveTypeForValue(node.consequent, context);
    const rightTypes = resolveTypeForValue(node.alternate, context);

    return new Type(...(new Set([].concat(leftTypes).concat(rightTypes))));
}

function resolveTypeForMemberExpression(node, context) {
    if (!node || node.type !== `MemberExpression`) {
        return;
    }

    const objectType = resolveTypeForNodeIdentifier(node.object, context);

    if (!objectType) {
        return;
    }

    const [
        fsPath,
        typedefName
    ] = objectType[0].split(`:`);

    if (!typedefName) {
        return;
    }

    const typedef = fileInfoCache[fsPath]
        ? fileInfoCache[fsPath].typedefs[typedefName]
        : undefined;

    if (!typedef) {
        return;
    }

    return typedef[node.property.name];
}

function resolveTypeForArrowFunctionExpression(node, context) {
    const comment = getCommentForNode(node, context);

    if (comment) {
        return resolveTypeFromComment(comment, context);
    }
}

function resolveTypeForCallExpression(node, context) {
    const binding = scan.getBinding(node.callee);

    if (!binding) {
        return;
    }

    const comment = getCommentForNode(binding.definition, context);

    if (comment) {
        return getReturnTypeFromComment(comment, context);
    }
}

function resolveTypeForArrayExpression(node, context) {
    if (!node) {
        return;
    }

    const elementTypes = Array.from(node.elements.reduce(
        (s, e) => s.add(resolveTypeForValue(e, context).join(`|`)),
        new Set()
    ));

    return elementTypes.length === 1
        ? new Type(`${elementTypes[0]}[]`)
        : new Type(`Array`);
}

/**
 * @description returns the type for the right-hand side of an expression
 * @param {Node} node
 * @param {Context} context
 * @return {Type}
 */
function resolveTypeForValue(node, context) {
    switch (node.type) {
        case `ArrayExpression`:
            return resolveTypeForArrayExpression(node, context);

        case `ArrowFunctionExpression`:
            return resolveTypeForArrowFunctionExpression(node, context);

        case `BinaryExpression`:
            return resolveTypeForBinaryExpression(node, context);

        case `CallExpression`:
            return resolveTypeForCallExpression(node.callee, context);

        case `ConditionalExpression`:
            return resolveTypeForConditionalExpression(node, context);

        case `FunctionDeclaration`:
            return new Type(`function`);

        case `Identifier`:
            return resolveTypeForNodeIdentifier(node, context);

        case `JSXElement`:
            return new Type(`JSXElement`);

        case `Literal`:
            return new Type(typeof node.value);

        case `MemberExpression`:
            return resolveTypeForMemberExpression(node, context);

        case `NewExpression`:
            return new Type(node.callee.name);

        case `ObjectExpression`: {
            const newType = new Type();

            function getPropertiesOfObjectLiteral(node) {
                return node.properties.reduce(function(o, n) {
                    const value = n.value.type === `ObjectExpression`
                        ? getPropertiesOfObjectLiteral(n.value)
                        : typeof n.value.value;

                    return Object.assign(o, {
                        [n.key.name]: value
                    });
                }, {});

                return node;
            }

            newType.objectLiteral = getPropertiesOfObjectLiteral(node);

            return newType;
        }

        case `TemplateLiteral`:
            return new Type(`string`);

        case `UnaryExpression`: {
            switch (node.operator) {
                case `!`:
                    return new Type(`boolean`);

                case `+`:
                    return new Type(`number`);

                default:
                    /* ? */
                    return new Type(`object`);
            }
        }

        case `VariableDeclarator`:
            return resolveTypeForVariableDeclarator(node, context);
    }
}

function getParamsForFunctionExpression(node, context) {
    if (!node
        || (node.type !== `FunctionExpression`
            && node.type !== `FunctionDeclaration`
            && node.type !== `ArrowFunctionExpression`)) {
        return;
    }

    const comment = getCommentForNode(node);

    if (!comment) {
        return;
    }

    const params = extractParams(comment, context);

    if (params) {
        return node.params.map(function(p) {
            switch (p.type) {
                case `AssignmentPattern`:
                    return new Type(...params[p.left.name]);

                default:
                    return new Type(...(params[p.name] || []));
            }
        });
    }

    const typeTag = comment.tags.find(
        (t) => t.tag === `type`
    );

    return typeTag
        ? getParamTypesFromFunctionTypeString(typeTag.type, context)
        : undefined;
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type[]}
 */
function getArgumentsForFunctionCall(node, context) {
    if (!node || node.type !== `CallExpression`) {
        return;
    }

    return node.arguments.map(function(a, idx) {
        switch (a.type) {
            case `Identifier`: {
                const idBinding = scan.getBinding(a);

                switch (idBinding.definition.parent.type) {
                    case `ArrowFunctionExpression`:
                    case `FunctionDeclaration`:
                    case `FunctionExpression`: {
                        const fnArgs = getArgumentsForFunctionDefinition(
                            idBinding.definition.parent,
                            context
                        );

                        return fnArgs[idx];
                    }

                    default:
                        return resolveTypeForValue(
                            idBinding.definition.parent,
                            context
                        );
                }
            }

            default:
                return resolveTypeForValue(a, context);
        }
    });
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type[]}
 */
function getArgumentsForFunctionDefinition(node, context) {
    if (!node) {
        return;
    }

    // Arrow function definitions are in a slightly different place.
    if (node.type === `VariableDeclarator`) {
        if (node.init.type === `ArrowFunctionExpression`) {
            node = node.init;
        }
    }

    if (!node.params) {
        return [];
    }

    const comment = getCommentForNode(node, context);

    if (!comment) {
        if (node.type !== `FunctionDeclaration` && node.type !== `ArrowFunctionExpression`) {
            return;
        }

        return node.params.map(
            (p) => new Type()
        );
    }

    const params = extractParams(comment, context);

    if (params) {
        return node.params.map(function(p) {
            switch (p.type) {
                case `AssignmentPattern`:
                    return new Type(...params[p.left.name]);

                default:
                    return new Type(...(params[p.name] || []));
            }
        });
    }

    const typeTag = comment.tags.find(
        (t) => t.tag === `type`
    );

    return typeTag
        ? getParamTypesFromFunctionTypeString(typeTag.type, context)
        : undefined;
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type[]}
 */
function getArgumentsForCalledFunction(node, context) {
    if (!node || node.type !== `CallExpression`) {
        return;
    }

    if (node.callee.type !== `Identifier`) {
        // TODO
        return;
    }

    const binding = scan.getBinding(node.callee);

    if (!binding) {
        return;
    }

    return getArgumentsForFunctionDefinition(binding.definition.parent, context);
}

function getNameOfCalledFunction(node, context) {
    if (!node || node.type !== `CallExpression`) {
        return;
    }

    switch (node.callee.type) {
        case `MemberExpression`:
            return node.callee.property.name;

        default:
            return node.callee.name;
    }
}

function getContainingFunctionDeclaration(node, context) {
    if (!node) {
        return;
    }

    let funcDecl = node;

    while (funcDecl
           && funcDecl.type !== `FunctionDeclaration`
           && funcDecl.type !== 'ArrowFunctionExpression') {
        funcDecl = funcDecl.parent;
    }

    return funcDecl;
}

module.exports = {
    getArgumentsForCalledFunction,
    getArgumentsForFunctionCall,
    getContainingFunctionDeclaration,
    getNameOfCalledFunction,
    resolveTypeForDeclaration,
    resolveTypeForFunctionDeclaration,
    resolveTypeForNodeIdentifier,
    resolveTypeForValue,
    storeProgram
};
