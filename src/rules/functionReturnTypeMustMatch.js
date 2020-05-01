const {
    Primitives,
    getCommentNodeFor,
    getExpressionForObjectNode,
    getExpressionForType,
    getFunctionDeclarationNodeFor,
    getReturnTypeForCommentNode,
    getReturnTypeForContainingFunction,
    getTypeForNode,
    objectIsOfType,
    typeIncludesType,
    typeToString,
    valueMatchesTypeExpression,
    visitProgram
} = require('../common');

const defaults = {
    allowImplicitUndefineds: false
};

function functionReturnTypeMustMatch(context) {
    // todo: lodash.clone or similar?
    const {
        allowImplicitUndefineds
    } = Object.assign({}, defaults, context.options[0]);

    return {
        "Program": visitProgram(context),
        ReturnStatement(node) {
            const declaredReturnType = getReturnTypeForContainingFunction(node, context);
            const actualReturnType = getTypeForNode(node.argument, context);

            if (!declaredReturnType) {
                /* ¯\_(ツ)_/¯ */
                return;
            }

            if (actualReturnType) {
                if (!typeIncludesType(declaredReturnType, actualReturnType)) {
                    context.report({
                        message: `${typeToString(declaredReturnType)} specified but ${typeToString(actualReturnType)} returned`,
                        node
                    });
                }

                return;
            }

            if (!node.argument) {
                /* a bare `return;` statement */
                if (!allowImplicitUndefineds
                    || !typeIncludesType(declaredReturnType, Primitives.undefined)) {
                    context.report({
                        message: `${typeToString(declaredReturnType)} specified but undefined implicitly returned`,
                        node
                    });
                }

                return;
            }

            /* node.argument exists but is untyped, booo */

            // todo: add an ignore option here?

            const typeExpression = getExpressionForType(declaredReturnType, context);
            const returnValueExpression = getExpressionForObjectNode(node.argument);

            if (!objectIsOfType(returnValueExpression, typeExpression, context)) {
                context.report({
                    message: `${typeToString(declaredReturnType)} expected but a non-matching untyped value returned`,
                    node
                });
            }
        }
    };
}

module.exports = {
    create: functionReturnTypeMustMatch
};
