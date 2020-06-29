const fs = require('fs');

const {
    default: parseFile
} = require('eslint-module-utils/parse');
const {
    default: resolve
} = require('eslint-module-utils/resolve');
const scan = require('scope-analyzer');

const fileInfoCache = require('./fileInfoCache.js');
const typedefCache = require('./typedefCache.js');
const { RecordType, Type, TypeContext, UnionType } = require('./Type');

function parseJsdocComments(programNode, context) {
    for (const statement of programNode.body) {
      if (statement.type === 'ImportDeclaration') {
        getContextForFile(statement.source.value, context);
      }
    }
    for (const comment of programNode.comments) {
      if (comment.type !== `Block` || comment.value[0] !== '*') {
        continue;
      }
      Type.parseComment(comment.loc.end.line + 1, `/*${comment.value}*/`, getTypeContext(context));
    }
}

function getTypedefs(context) {
  return typedefCache;
}

function getTypeContext(context) {
    const fileInfo = getFileInfo(context);
    if (!fileInfo.typeContext) {
      fileInfo.typeContext = new TypeContext({ typedefs: getTypedefs(context) });
    }
    return fileInfo.typeContext;
}

function getFileInfo(context) {
    const filename = context.getFilename();

    if (!fileInfoCache[filename]) {
      try {
        console.log(`import ${filename}.`);
        const fileContents = fs.readFileSync(filename).toString();
        const programNode = parseFile(filename, fileContents, context);
        // Adds fileInfoCache entry.
        storeProgram(programNode, context);
      } catch (e) {
        fileInfoCache[filename] = {};
        console.log(`import ${filename} failed.`);
      }
    }

    return fileInfoCache[filename];
}

function getContextForFile(fsPath, currentContext) {
    if (!fsPath.endsWith('.js')) {
      fsPath = `${fsPath}.js`;
    }

    const resolvedPath = resolve(fsPath, currentContext);
    const newContext = {};

    // Copy own and inherited properties.
    for (let i in currentContext) {
        newContext[i] = currentContext[i];
    }

    newContext.getFilename = () => resolvedPath;

    // Prime the cache eagerly so that typedefs are in place.
    getFileInfo(newContext);

    return newContext;
}

function getNamedExportNodeIdentifier(symbolName, context) {
    const { programNode } = getFileInfo(context);

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
    const { programNode } = getFileInfo(context);

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
    return resolveTypeForValue(node.init, context);
}

function acquireBinding(node) {
    switch (node.type) {
        case `Identifier`:
            return scan.getBinding(node);

        case `MemberExpression`:
            return acquireBinding(node.property);

        default:
            throw Error(`Unexpected type for acquireBinding: ${node.type}`);
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

    const { name } = node;
    const { definition } = idBinding;

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
            return resolveTypeFromNode(binding.definition, context);
    }

    return Type.any;
}

function resolveTypeFromNode(node, context) {
    return getTypeContext(context).getTypeDeclaration(node.loc.start.line);
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
    fileInfoCache[context.getFilename()] = {
        context,
        programNode
    };
    parseJsdocComments(programNode, context);
}

function resolveTypeForDeclaration(node, context) {
    return resolveTypeFromNode(node, context);
}

function resolveTypeForBinaryExpression(node, context) {
    if (!node) {
        return;
    }

    const { left, operator, right } = node;

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
            return Type.fromString(`JSXElement`, getTypeContext(context));

        case `Literal`:
            return resolveTypeForLiteral(node, context);

        case `MemberExpression`:
            return resolveTypeForMemberExpression(node, context);

        case `NewExpression`:
            return Type.fromString(node.callee.name, getTypeContext(context));

        case `ObjectExpression`:
            return resolveTypeForObjectExpression(node, context);

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
    return node.arguments.map(arg => resolveTypeForValue(arg, context));
}

function getNameOfCalledFunction(node, context) {
    if (node.type !== `CallExpression`) {
        throw Error(`Unexpected type for getNameOfCalledFunction: ${node.type}`);
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
    resolveTypeForCallExpression,
    resolveTypeForDeclaration,
    resolveTypeForNodeIdentifier,
    resolveTypeForValue,
    resolveTypeForVariableDeclarator,
    storeProgram
};
