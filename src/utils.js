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

function createUtils() {
// State

const fileInfoCache = {};
const typedefs = {};

function getTypedefs() {
  return typedefs;
}

class TypeClass extends Array {
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
            return arr.some(function(typeName) {
                if (arr.includes(o)) {
                    return true;
                }

                if (!typeName) {
                    // No expectation?
                    // Implicit any?
                    return true;
                }

                const typedef = getTypedefs()[typeName];

                if (!typedef) {
                    // Unsatisfiable type.
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
        // Note: Discarding the qualifier leads to messages like 'string does not match string'.
        return this._objectLiteral
            ? `(object literal)`
            : this.join(`|`);
    }
}

function Type(...types) {
      const normalizedTypes = types.map(type => type.replace(/\s/g, ''));
      return new TypeClass(...normalizedTypes);
}


// Functions

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

function getTag(tagName, comment) {
  return comment.tags.find(({ tag }) => tag === tagName);
}

function getTags(tagName, comment) {
  return comment.tags.filter((t) => t.tag === tagName);
}

function getFunctionTypeTag(comment) {
  return comment.tags.find((t) => t.tag === `type` && t.type.startsWith(`function(`));
}

function getTypeFromComment(comment) {
    const typeTag = getTag(`type`, comment);
    if (typeTag) {
        return new Type(...typeTag.type.split(`|`));
    }
}

function getReturnTypeFromComment(comment, context) {
    const returnTag = getTag(`return`, comment) || getTag(`returns`, comment);

    if (getTag(`return`, comment) || getTag(`returns`, comment)) {
        return new Type(...returnTag.type.split(`|`));
    }

    const typeTag = getFunctionTypeTag(comment);

    if (typeTag) {
        return getReturnTypeFromFunctionTypeString(typeTag.type, context);
    }
}

/**
 * @param {string} str `foo|import('./types').bar|baz`
 * @param {Context} context
 * @return {string} `foo|/path/to/types:bar|/this/file:baz`
 */
function rawStringToTypeString(str, context) {
    if (!str) {
        return;
    }

    // FIX: This needs to handle scope settings, like @global, @module, etc.
    return str;
}

/**
 * @param {Node} commentNode
 * @param {Context} context
 * @return {Comment}
 */
function parseJsdocComment(commentNode, context) {
    const comment = parseComment(`/*${commentNode.value}*/`)[0];

    if (!comment) {
        return;
    }

    return {
        loc: commentNode.loc,
        tags: comment.tags.map(
            (t) => Object.assign(t, { type: rawStringToTypeString(t.type, context) })
        )
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
    ).filter(
        (c) => c !== undefined);
}

function parseJsdocFunctionTypeString(functionTypeString, context) {
    const match = /function\((.*)\)\s*:\s*(.*)/.exec(functionTypeString);

    if (!match) {
        return;
    }

    const argTypes = match[1].split(/\s*,\s*/).map(
        (a) => rawStringToTypeString(a, context)
    );

    return `function(${argTypes.join(',')}):${match[2]}`;
}

/**
 * @param {string} functionTypeString - `function(foo,bar):baz`
 * @param {Context} context
 * @return {Type}
 */
function getReturnTypeFromFunctionTypeString(functionTypeString, context) {
    const normalizedString = parseJsdocFunctionTypeString(functionTypeString, context);

    return normalizedString
        ? new Type(normalizedString.substring(1 + normalizedString.lastIndexOf(`:`)))
        : undefined;
}

/**
 * @param {string} functionTypeString - `function(foo,bar):baz`
 * @param {Context} context
 * @return {Type[]}
 */
function getParamTypesFromFunctionTypeString(functionTypeString, context) {
    const normalizedString = parseJsdocFunctionTypeString(functionTypeString, context);

    return normalizedString
        ? /\((.*)\)/.exec(normalizedString)[1].split(`,`).map(
            (t) => new Type(...rawStringToTypeString(t, context).split(`|`))
        )
        : undefined;
}

/**
 * @param {object} tag
 * @param {Context} context
 * @return {Type}
 */
function extractTypeFieldFromTag(tag, context) {
    const types = new Type(
        ...rawStringToTypeString(tag.type, context).split(`|`)
    );

    if (tag.optional) {
        types.push(`undefined`);
    }

    return types;
}

/**
 * I think this has to return an object, and not a list of params, since there's no guarantee that `@param` tags are written in the same order as the params in the function signature.  what sucks is that this doesn't really work when a function is doc'd with a `@type {function(foo, bar):baz}` tag; there's no useful map key other than index
 * @param {Comment} comment
 * @param {Context} context
 * @return {object|undefined}
 */
function extractParams(comment, context) {
    const paramTags = comment.tags.filter(
        (t) => t.tag === `param`
    );

    if (paramTags.length) {
        return paramTags.reduce(function(p, t) {
            return Object.assign(p, {
                [t.name]: extractTypeFieldFromTag(t, context)
            });
        }, {});
    }

    const functionTypeTag = getFunctionTypeTag(comment);

    if (functionTypeTag) {
        const functionParams =
              getParamTypesFromFunctionTypeString(functionTypeTag.type, context);

        return functionParams.reduce(
            (o, p, idx) => Object.assign(o, { [idx]: p }),
            {}
        );
    }
}

/**
 * @param {Comment[]} comments
 * @param {Context} context
 * @return {object}
 */
function extractTypedefs(comments, context) {
    const typedefs = {};
    for (const comment of comments) {
      const typedef = getTag(`typedef`, comment);
      if (!typedef || !typedef.name) {
        // FIX: Handle the case of the name coming from a following identifier.
        continue;
      }
      const properties = {};
      for (const propertyTag of getTags(`property`, comment)) {
        const type = extractTypeFieldFromTag(propertyTag, context);
        if (!type) {
          continue;
        }
        properties[propertyTag.name] = type;
      }
      typedefs[typedef.name] = properties;
    }
    return typedefs;
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

    const namedExports = programNode.body.filter(
        (n) => n.type === `ExportNamedDeclaration`
    );
    const localName = namedExports.flatMap(
        (n) => n.specifiers
    ).find(
        (n) => n.exported.name === symbolName
    );

    if (localName) {
        return localName;
    }

    const exportedVariableDeclaration = namedExports.filter(
        (n) => !!n.declaration
    ).flatMap(
        (n) => n.declaration.declarations
    ).find(
        (d) => d.id.name === symbolName
    );

    if (exportedVariableDeclaration) {
        return exportedVariableDeclaration.id;
    }
}

function resolveTypeForVariableDeclarator(node, context) {
    if (!node.init) {
        return resolveTypeForDeclaration(node.id, context);
    }

    switch (node.init.type) {
        case `CallExpression`:
            return resolveTypeForCallExpression(node.init, context);

        default:
            return resolveTypeForValue(node.init, context);
    }
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
    if (!definition) {
        return;
    }

    const comment = getCommentForNode(definition, context);

    if (comment) {
        const type = getTypeFromComment(comment);

        if (type) {
            return type;
        }
    }

    const {parent} = definition;

    switch (parent.type) {
        case `FunctionDeclaration`: {
            const comment = getCommentForNode(parent, context);

            if (!comment) {
                return;
            }

            // The binding found is a function parameter.
            const params = extractParams(comment, context);

            if (params) {
                return new Type(...(params[name] || []));
            }
        }
        case `ArrowFunctionExpression`: {
            const comment = getCommentForNode(parent, context);

            if (!comment) {
                return;
            }

            const params = extractParams(comment, context);

            // The binding found is a function parameter.
            if (params) {
                return new Type(...(params[name] || []));
            }

            return;
        }
        case `ImportDefaultSpecifier`: {
            const externalSymbol = parent.imported.name;
            const fsPath = resolve(parent.source.value, context);
            const externalContext = getContextForFile(fsPath, context);
            const externalExportIdentifier = getDefaultExportIdentifierForSymbolName(externalSymbol, externalContext);

            return resolveTypeForNodeIdentifier(externalExportIdentifier, externalContext);
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

function getLineForNode(node, context) {
    return node.loc.start.line;
}

function getCommentForNode(node, context) {
    const nodeLocation = getLineForNode(node, context);
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

    const typeTag = getTag(`type`, comment);

    if (typeTag) {
        return new Type(...typeTag.type.split(`|`));
    }

    // If we didn't find an @type, look for @param and @return,
    // and see if we can construct a function type.

    const functionTag = getTag(`function`, comment);
    const callbackTag = getTag(`callback`, comment);

    // Only consider contiguous indexes for now ...
    const params = extractParams(comment, context);
    const paramTypes = [];
    for (let idx = 0; params[idx] !== undefined; idx++) {
      types.push(params[idx]);
    }
    const returnType = getReturnTypeFromComment(comment, context);
    if (!functionTag && !callbackTag && paramTypes.length === 0 && returnType === undefined) {
      // We didn't find anything to construct a function type from.
      // FIX: I guess finding an @function or @callback would justify producing
      // function() as a type.
      return;
    }
    if (returnType === undefined) {
      // Is this how we represent a function with no expectation upon its return type?
      return new Type(`function(${paramTypes.join(',')})`);
    } else {
      return new Type(`function(${paramTypes.join(',')}):${returnType}`);
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
    const filename = context.getFilename();

    addAST(programNode);

    const comments = parseJsdocComments(programNode, context);
    const typedefs = extractTypedefs(comments, context);

    fileInfoCache[context.getFilename()] = {
        comments,
        context,
        programNode,
        typedefs
    };

    const typedefCache = getTypedefs(context);
    for (const typedefName of Object.keys(typedefs)) {
      // Last typedef wins.
      // FIX: This should be reportable by a rule.
      typedefCache[typedefName] = typedefs[typedefName];
    }
}

function resolveTypeForDeclaration(node, context) {
    const identifierComment = getCommentForNode(node, context);

    return resolveTypeFromComment(identifierComment, context);
}

function resolveTypeForFunctionDeclaration(node, context) {
    if (!node) {
        return;
    }

    const comment = getCommentForNode(node, context);

    if (comment) {
        return resolveTypeFromComment(comment, context);
    }

    return new Type(`function`);
}

function resolveReturnTypeForFunctionDeclaration(node, context) {
    if (!node) {
        return;
    }

    const comment = getCommentForNode(node, context);

    if (comment) {
        return getReturnTypeFromComment(comment, context);
    }

    return new Type(`function`);
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

    const expansion = objectType
            .flatMap(type => {
                         const typedef = getTypedefs()[type];
                         if (typedef) {
                             const propertyTypes = typedef[node.property.name];
                             if (propertyTypes) {
                                 return propertyTypes;
                             }
                         }
                         return `any`;
                     });
    const result = new Type(...expansion);

    return result;
}

function resolveTypeForArrowFunctionExpression(node, context) {
    const comment = getCommentForNode(node, context);

    if (comment) {
        return resolveTypeFromComment(comment, context);
    }

    return new Type(`function`);
}

function resolveTypeForCallExpression(node, context) {
    if (node.callee.type === 'MemberExpression') {
      // FIX: Figure out how to type member expressions.
      return;
    }

    const binding = scan.getBinding(node.callee);

    if (!binding) {
        return;
    }

    if (!binding.definition) {
      // No definition means no expectations.
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
        (s, e) => s.add((resolveTypeForValue(e, context) || []).join(`|`)),
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
            return resolveTypeForCallExpression(node, context);

        case `ConditionalExpression`:
            return resolveTypeForConditionalExpression(node, context);

        case `FunctionDeclaration`:
            return resolveTypeForFunctionDeclaration(node, context);

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
                    // We can't figure this out, so it might be anything.
                    return new Type(`any`);
            }
        }

        case `VariableDeclarator`:
            return resolveTypeForVariableDeclarator(node, context);
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

    return node.arguments.map(function(a, idx) {
        switch (a.type) {
            case `Identifier`: {
                const idBinding = scan.getBinding(a);

                if (!idBinding.definition) {
                    // We have no definition, so no expectations.
                    return;
                }

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
        return node.params.map(function(p, idx) {
            switch (p.type) {
                case `AssignmentPattern`:
                    // In the case of calling a function with a defaulting parameter, params[p.left.name] can be undefined.
                    return params[p.left.name] || params[idx] || [];
                default:
                    return params[p.name] || params[idx] || [];
            }
        });
    }

    const typeTag = getTag(`type`, comment);

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

    if (!binding.definition) {
        // Some things seem to have bindings, but no definition.
        // e.g., Error
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

return {
    Type,
    getArgumentsForCalledFunction,
    getArgumentsForFunctionCall,
    getContainingFunctionDeclaration,
    getNameOfCalledFunction,
    resolveTypeForDeclaration,
    resolveTypeForFunctionDeclaration,
    resolveReturnTypeForFunctionDeclaration,
    resolveTypeForNodeIdentifier,
    resolveTypeForValue,
    storeProgram
};
}

module.exports = {
  createUtils
}
