const fs = require('fs');

const parseComment = require('comment-parser');
const {
    default: parseFile
} = require('eslint-module-utils/parse');
const {
    default: resolve
} = require('eslint-module-utils/resolve');
const scan = require('scope-analyzer');

const PRIMITIVES = [
    `boolean`,
    `function`,
    `number`,
    `object`,
    `string`,
    `undefined` /* cheating a little bit with this one */
];

const fileInfoCache = {};

class Type extends Array {
    get objectLiteral() {
        return this._objectLiteral;
    }

    set objectLiteral(obj) {
        this._objectLiteral = obj;
    }

    /**
     * @description returns true if this Type describes an allowed value for `otherType`
     * @param {Type} otherType
     * @return {boolean}
     */
    isOfType(otherType) {
        if (!otherType) {
            return false;
        }

        return this._objectLiteral
            ? otherType.matchesObjectLiteral(this._objectLiteral)
            : this.every(
                (t) => otherType.includes(t)
            );
    }

    matchesObjectLiteral(obj) {
        function matcher(arr, o) {
            return arr.some(function(t) {
                if (arr.includes(o)) {
                    return true;
                }

                const [
                    fsPath,
                    typedefName
                ] = t.split(`:`);

                if (!typedefName) {
                    return false;
                }

                const typedef = fileInfoCache[fsPath]
                    ? fileInfoCache[fsPath].typedefs[typedefName]
                    : undefined;

                if (!typedef) {
                    return false;
                }

                return Object.keys(o).length === Object.keys(typedef).length
                    && Object.keys(o).every(
                        (k) => typedef[k] && matcher(typedef[k], o[k])
                    );
            });
        }

        return matcher(this, obj);
    }

    toString() {
        return this._objectLiteral
            ? `(object literal)`
            : this.map(
                (t) => t.split(`:`)[1] || t
            ).join(`|`);
    }
}

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

    if (!returnTag) {
        return;
    }

    return new Type(...returnTag.type.split(`|`));
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

                                return nt.concat(importPath
                                    ? `${importPath}:${type}`
                                    : st
                                );
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

function extractTypeFieldFromTag(tag, context) {
    const types = new Type(...tag.type.split(`|`));

    if (tag.optional) {
        types.push(`undefined`);
    }

    return types;
}

function extractParams(comment, context) {
    return comment.tags.filter(
        (c) => c.tag === `param`
    ).reduce(function(p, t) {
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

    //    console.log(`getting type for scope definition:`, idBinding.definition.parent.type);
    switch (idBinding.definition.parent.type) {
        case `FunctionDeclaration`: {
            const comment = getCommentForNode(idBinding.definition, context);

            if (!comment) {
                return;
            }

            return getReturnTypeFromComment(comment);
        }
        case `ImportDefaultSpecifier`: {
            const externalSymbol = idBinding.definition.parent.imported.name;
            const fsPath = resolve(idBinding.definition.parent.parent.source.value, context);
            const externalContext = getContextForFile(fsPath, context);
            const externalExportIdentifier = getDefaultExportIdentifierForSymbolName(externalSymbol, externalContext);

            return new Type(`${fsPath}:${externalSymbol}`);
        }
        case `ImportSpecifier`: {
            const externalSymbol = idBinding.definition.parent.imported.name;
            const fsPath = resolve(idBinding.definition.parent.parent.source.value, context);
            const externalContext = getContextForFile(fsPath, context);
            const externalExportIdentifier = getNamedExportIdentifierForSymbolName(externalSymbol, externalContext);

            return resolveTypeForNodeIdentifier(externalExportIdentifier, externalContext);
        }
        case `VariableDeclarator`: {
            return resolveTypeForDeclaration(idBinding.definition.parent.id, context);
        }
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
    if (node.type !== `Identifier`) {
        return;
    }

    const identifierComment = getCommentForNode(node, context);

    return resolveTypeFromComment(identifierComment, context);
}

function resolveTypeForFunctionDeclaration(node, context) {
    if (!node || node.type !== `FunctionDeclaration`) {
        return;
    }

    const identifierComment = getCommentForNode(node, context);

    return getReturnTypeFromComment(identifierComment, context);
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

/**
 * @description returns the type for the right-hand side of an assignment expression
 * @param {Node} node
 * @param {Context} context
 * @return {Type}
 */
function resolveTypeForValue(node, context) {
    switch (node.type) {
        case `BinaryExpression`:
            return resolveTypeForBinaryExpression(node, context);

        case `CallExpression`:
            return resolveTypeForNodeIdentifier(node.callee, context);

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
    }
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

    return node.arguments.map(
        (a) => resolveTypeForValue(a, context)
    );
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type[]}
 */
function getArgumentsForFunction(node, context) {
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
    } else if (!binding.definition.parent.params) {
        return [];
    }

    const comment = getCommentForNode(binding.definition.parent, context);

    if (!comment) {
        if (binding.definition.parent.type !== `FunctionDeclaration`) {
            return;
        }

        return binding.definition.parent.params.map(
            (p) => new Type()
        );
    }

    const params = extractParams(comment, context);

    //    console.log(`binding:`, binding);
    //    console.log(`params:`, params);
    return binding.definition.parent.params.map(function(p) {
        switch (p.type) {
            case `AssignmentPattern`:
                return new Type(...params[p.left.name]);

            default:
                return new Type(...params[p.name]);
        }
    });
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

    while (funcDecl && funcDecl.type !== `FunctionDeclaration`) {
        funcDecl = funcDecl.parent;
    }

    return funcDecl;
}

module.exports = {
    getArgumentsForFunction,
    getArgumentsForFunctionCall,
    getContainingFunctionDeclaration,
    getNameOfCalledFunction,
    resolveTypeForDeclaration,
    resolveTypeForFunctionDeclaration,
    resolveTypeForNodeIdentifier,
    resolveTypeForValue,
    storeProgram
};
