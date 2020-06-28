const fs = require('fs');

const parseComment = require('comment-parser');
const {
    default: parseFile
} = require('eslint-module-utils/parse');
const {
    default: resolve
} = require('eslint-module-utils/resolve');
const scan = require('scope-analyzer');

const doctrine = require('doctrine');

const fileInfoCache = require('./fileInfoCache.js');
const { RecordType, Type, UnionType } = require('./Type');

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
            return acquireBinding(node.property);
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

/**
 * @param {string} str `foo|import('./types').bar|baz`
 * @param {Context} context
 * @return {string} `foo|/path/to/types:bar|/this/file:baz`
 */
function rawStringToTypeString(str, context) {
    if (!str) {
        return;
    }

    return str.split(`|`)
        .reduce(function(nt, st) {
            if (st.includes(`:`)) {
                return nt.concat(st);
            } else if (PRIMITIVES.includes(st.toLowerCase())) {
                return nt.concat(st);
            } else if (st.startsWith(`import(`)) {
                const { importPath, type } = parseJsdocImportString(st, context);

                return nt.concat(
                    importPath
                        ? `${importPath}:${type}`
                        : st
                );
            } else if (st.startsWith(`function(`)) {
                return nt.concat(parseJsdocFunctionTypeString(st, context));
            } else {
                return nt.concat(`${context.getFilename()}:${st}`);
            }
        }, [])
        .join(`|`);
}

/**
 * @param {Node} commentNode
 * @param {Context} context
 * @return {Comment}
 */
function parseJsdocComment(commentNode, context) {
    if (commentNode.value[0] !== '*') {
      return;
    }
    const parse = doctrine.parse(`/*${commentNode.value}*/`, { unwrap: true });
    const { tags } = parse;

    if (tags.length > 0) {
        const record = {
            loc: commentNode.loc,
            tags,
        };
        return record;
    }
}

/**
 * @param {ProgramNode} programNode
 * @return {JsdocComment[]}
 */
function parseJsdocComments(programNode, context) {
    const entries = [];
    for (const comment of programNode.comments) {
      if (comment.type !== `Block`) {
        continue;
      }
      const entry = parseJsdocComment(comment, context);
      if (!entry) {
        continue;
      }
      entries.push(entry);
    }
    return entries;
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
 * @param {Comment[]} comments
 * @param {Context} context
 * @return {object}
 */
function extractTypedefs(comments, context) {
    const typedefs = {};
    // FIX: Extract symbol from code following comment.
    for (const rec of comments) {
      if (rec.title !== 'typedef') {
        continue;
      }
      typedefs[rec.name] = rec.type;
    }
    return typedefs;
}

function getTypedefs(context) {
    const { typedefs } = fileInfoCache[context.getFilename()];
    return typedefs;
}

function extractTypes(comments, context) {
    const types = {};
    const typedefs = {};
    for (const rec of comments) {
      const line = rec.loc.end.line;
      types[line] = Type.fromDoctrine(rec, typedefs);
    }
    return { types, typedefs };
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

// FIX: Do these when constructing typedefs, etc.
function getNamedExportNodeIdentifier(symbolName, context) {
    const {
        programNode
    } = fileInfoCache[context.getFilename()];

    for (const node of programNode.body) {
      if (node.type !== 'ExportNamedDeclaration') {
        continue;
      }
      for (const specifier of node.specifiers) {
        if (specifier.exported.name === symbolName) {
          return specifier.local.name;
        }
      }
      if (node.declaration) {
        for (const declaration of node.declaration.declarations) {
          if (declaration.id.name === symbolName) {
            return symbolName;
          }
        }
      }
    }
}

function getDefaultExportDeclaration(context) {
    const {
        programNode
    } = fileInfoCache[context.getFilename()];

    for (const node of programNode.body) {
      if (node.type === 'ExportDefaultDeclaration') {
        return node.declaration;
      }
    }
}

function resolveTypeForVariableDeclarator(node, context) {
    const type = resolveTypeForDeclaration(node.id, context);
    if (type !== Type.any) {
      return type;
    }
    if (!node.init) {
      return type;
    }
    if (node.parent.kind !== 'const') {
      return type;
    }
    // Infer const variable type from initializer.
    if (node.init.type === 'CallExpression') {
        return resolveTypeForCallExpression(node.init, context).getReturn();
    } else {
        const type = resolveTypeForValue(node.init, context);
        return type;
    }
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type}
 */
function resolveTypeForNodeIdentifier(node, context) {
    const idBinding = acquireBinding(node);

    if (!idBinding) {
        return Type.any;
    }

    const {name} = node;
    const {definition} = idBinding;

    if (!definition) {
        // Look for global definitions.
        switch (node.name) {
          case 'undefined':
            return Type.undefined;
          default:
            // No idea what this is.
            return Type.any;
      }
    }

    const { parent } = definition;

    // If it is defined in a parameter, the declaration is for the function.

    switch (parent.type) {
        case `FunctionDeclaration`: {
            const parentType = resolveTypeFromNode(parent, context);
            // CHECK: How do we handle the case where the function has a parmeter with the same name as the function?
            // The correct binding would depend on if we were originally inside or not, so we can trace the parent down.
            if (parentType.hasParameter(name)) {
              return parentType.getParameter(name);
            } else {
              return parentType;
            }
        }
        case `ArrowFunctionExpression`: {
            // This should only happen for parameters.
            return resolveTypeFromNode(parent, context).getParameter(name);
        }
        case `ImportDefaultSpecifier`: {
            const fsPath = resolve(parent.parent.source.value, context);
            const externalContext = getContextForFile(fsPath, context);
            const declaration = getDefaultExportDeclaration(externalContext);
            if (!declaration) {
              return Type.invalid;
            }
            const type = resolveTypeForValue(declaration, externalContext);
            return type;
        }
        case `ImportSpecifier`: {
            const externalSymbol = parent.imported.name;
            const fsPath = resolve(parent.parent.source.value, context);
            const externalContext = getContextForFile(fsPath, context);
            const identifier = getNamedExportNodeIdentifier(externalSymbol, externalContext);
            if (!identifier) {
              return Type.invalid;
            }
            return resolveTypeForNodeIdentifier(identifier, externalContext);
        }
        case `VariableDeclarator`: {
            // FIX: This should be at the Declaration level so that we can see if it is const.
            // We can infer the type of const variables from their initialization, but others might be mutated.
            // So we require an explicit declaration, which is detected above.
            return resolveTypeForVariableDeclarator(parent, context);
        }
        default:
            return resolveTypeForBinding(node, context);
    }

    return Type.any;
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
    if (!comment || !comment.type) {
        return Type.any;
    }

    return comment.type;
}

function resolveTypeFromNode(node, context) {
    const types = fileInfoCache[context.getFilename()].types || {};
    const line = node.loc.start.line - 1;
    return types[line] || Type.any;
}

function resolveTypeForBinding(node, context) {
    const binding = scan.getBinding(node);

    if (!binding) {
      return Type.any;
    }

    if (!binding.definition) {
      // No definition means no expectations.
      return Type.any;
    }

    return resolveTypeFromNode(binding.definition, context);
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
    const { types, typedefs } = extractTypes(comments, context);

    fileInfoCache[context.getFilename()] = {
        comments,
        context,
        programNode,
        typedefs,
        types
    };
}

function resolveTypeForDeclaration(node, context) {
    return resolveTypeFromNode(node, context);
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
                ? Type.string
                : Type.number

        default:
            return Type.number;
    }
}

function resolveTypeForConditionalExpression(node, context) {
    const leftType = resolveTypeForValue(node.consequent, context);
    const rightType = resolveTypeForValue(node.alternate, context);
    const type = new UnionType(leftType, rightType);
    return type;
}

function resolveTypeForMemberExpression(node, context) {
    const memberType = resolveTypeForNodeIdentifier(node.object, context);
    const propertyType = memberType.getProperty(node.property.name);
    return propertyType;
}

function resolveTypeForArrowFunctionExpression(node, context) {
    return resolveTypeFromNode(node, context);
}

function resolveTypeForFunctionExpression(node, context) {
    return resolveTypeFromNode(node, context);
}

function resolveTypeForCallExpression(node, context) {
    return resolveTypeForValue(node.callee, context).getReturn();
}

function resolveTypeForArrayExpression(node, context) {
    return resolveTypeFromNode(node, context);
}

function resolveTypeForObjectExpression(node, context) {
  const typedefs = getTypedefs(context);
  const record = {};
  for (const property of node.properties) {
    // FIX: Handle other combinations
    if (property.key.type === 'Literal' && property.kind === 'init') {
      record[property.key.value] = resolveTypeForValue(property.value, context);
    } else if (property.key.type === 'Identifier' && property.kind === 'init') {
      record[property.key.name] = resolveTypeForValue(property.value, context);
    }
  }
  return new RecordType(record);
}

function resolveTypeForLiteral(node, context) {
  // These can be: string | boolean | null | number | RegExp;
  const value = node.value;
  if (value.constructor === RegExp) {
    return Type.RegExp;
  } else if (value === null) {
    return Type.null;
  } else if (typeof value === 'string') {
    return Type.string;
  } else if (typeof value === 'boolean') {
    return Type.boolean;
  } else if (typeof value === 'number') {
    return Type.number;
  } else {
    return Type.invalid;
  }
}

/**
 * @description returns the type for the right-hand side of an expression
 * @param {Node} node
 * @param {Context} context
 * @return {Type}
 */
function resolveTypeForValue(node, context) {
    if (!node) {
      return Type.any;
    }
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
            return resolveTypeForFunctionExpression(node, context);

        case `Identifier`:
            return resolveTypeForNodeIdentifier(node, context);

        case `JSXElement`:
            return Type.fromString(`JSXElement`, getTypedefs(context));

        case `Literal`:
            return resolveTypeForLiteral(node, context);

        case `MemberExpression`:
            return resolveTypeForMemberExpression(node, context);

        case `NewExpression`:
            return Type.fromString(node.callee.name, getTypedefs(context));

        case `ObjectExpression`: {
            return resolveTypeForObjectExpression(node, context);
        }

        case `TemplateLiteral`:
            return Type.string;

        case `UnaryExpression`: {
            switch (node.operator) {
                case `!`:
                    return Type.boolean;

                case `+`:
                    return Type.number;

                default:
                    /* ? */
                    return Type.any;
            }
        }

        case `VariableDeclarator`:
            return resolveTypeForVariableDeclarator(node, context);

        default:
            return Type.any;
    }
}

/**
 * @param {Node} node
 * @param {Context} context
 * @return {Type[]}
 */
function getArgumentsForFunctionCall(node, context) {
    if (!node || node.type !== `CallExpression`) {
        return [];
    }

    return node.arguments.map(function(a, index) {
        switch (a.type) {
            case `Identifier`:
                return resolveTypeForBinding(a, context);
            default:
                return resolveTypeForValue(a, context);
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

    while (funcDecl
           && funcDecl.type !== `FunctionDeclaration`
           && funcDecl.type !== 'ArrowFunctionExpression') {
        funcDecl = funcDecl.parent;
    }

    return funcDecl;
}

module.exports = {
    getArgumentsForFunctionCall,
    getContainingFunctionDeclaration,
    getNameOfCalledFunction,
    resolveTypeForBinding,
    resolveTypeForCallExpression,
    resolveTypeForDeclaration,
    resolveTypeForNodeIdentifier,
    resolveTypeForValue,
    resolveTypeForVariableDeclarator,
    storeProgram
};
