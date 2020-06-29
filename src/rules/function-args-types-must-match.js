const { Type } = require('../Type');
const {
    getArgumentsForCalledFunction,
    getArgumentsForFunctionCall,
    getNameOfCalledFunction,
    resolveTypeForValue,
    storeProgram
} = require('../utils');

module.exports = {
    create: function(context) {
        const {
            ignoreTrailingUndefineds = false
        } = context.options[0] || {};

        return {
            CallExpression(node) {
                const functionName = getNameOfCalledFunction(node, context);
                const functionType = resolveTypeForValue(node.callee, context);
                const argumentCount = functionType.getArgumentCount();
                const callTypes = getArgumentsForFunctionCall(node, context);

                for (let index = 0; index < argumentCount; index++) {
                  const argumentType = functionType.getArgument(index);
                  const callType = callTypes[index];
                  if (callType !== undefined && !callType.isOfType(argumentType)) {
                      context.report({
                          message: `type ${argumentType} expected for argument ${index} in call to ${functionName} but ${callType} provided`,
                          node
                      });
                  } else if (callType === undefined && !Type.undefined.isOfType(argumentType)) {
                      if (!ignoreTrailingUndefineds) {
                          context.report({
                              message: `type ${argumentType} expected for argument ${index} in call to ${functionName} but undefined implicitly provided`,
                              node
                          });
                      }
                  }
                }
            },

            Program(node) {
                storeProgram(node, context);
            }
        };
    }
};
