const fileInfoCache = require('./fileInfoCache');
const doctrine = require('doctrine');

class TypeContext {
  constructor ({ typedefs = {}, types = {}, scope = { kind: 'global' }, resolveTypeForIdentifier, filename } = {}) {
    this.typedefs = typedefs;
    this.types = types;
    this.scope = scope;
    this.filename = filename;
    this.resolveTypeForIdentifier = resolveTypeForIdentifier;
  }

  getTypedef(name) {
    return this.typedefs[name];
  }

  setTypedef(name, type) {
    return this.typedefs[name] = type;
  }

  getScope() {
    return this.scope;
  }

  setScope({ kind, name }) {
    this.scope = { kind, name };
  }

  setTypeDeclaration(line, type) {
    this.types[line] = type;
  }

  getTypeDeclaration(line) {
    return this.types[line] || Type.any;
  }

  getTypeForIdentifierNode(node) {
    return this.resolveTypeForIdentifier(node, this.filename);
  }
}

function strip(string) {
  return string.replace(/\s/g, '');
}

const ignore = (consumed, type) => type;

// A base type accepts nothing.
class Type {
    isOfType(otherType) {
        return false;
    }

    isSupertypeOf(otherType) {
      return false;
    }

    getPropertyNames() {
      return [];
    }

    getProperty(name) {
      return Type.any;
    }

    getReturn() {
      return Type.any;
    }

    getArgumentCount() {
      return undefined;
    }

    getArgument(index) {
      return Type.any;
    }

    getParameter(name) {
      return Type.any;
    }

    hasParameter(name) {
      return false;
    }

    toString() {
      return '<invalid>';
    }

    instanceOf(kind) {
      return this instanceof kind;
    }

    is(otherType) {
      return this === otherType;
    }

    getPrimitive() {
      return undefined;
    }

    getElement() {
      return Type.any;
    }
}

class AnyType extends Type {
    // * can violate any type other than *.
    isOfType(otherType) {
      return otherType === Type.any;
    }

    toString() {
      return '*';
    }

    isSupertypeOf(otherType) {
      return true;
    }

    // It might be an object with properties.
    getProperty(name) {
      return Type.any;
    }

    // It might be a function that returns something.
    getReturn() {
      return Type.any;
    }

    // But we don't know how many arguments it wants.
    getArgumentCount() {
      return undefined;
    }

    // We can't tell what it may expect.
    getArgument(index) {
      return Type.any;
    }
}

class SimpleType extends Type {};

// A primitive type accepts only itself.
class PrimitiveType extends SimpleType {
    constructor(primitive) {
      super();
      // Remove spaces to normalize.
      this.primitive = strip(primitive);
    }

    toString() {
      return this.primitive;
    }

    isOfType(otherType) {
      if (otherType.instanceOf(PrimitiveType)) {
        return this.getPrimitive() === otherType.getPrimitive();
      } else {
        // We don't understand this relationship. Invert it.
        return otherType.isSupertypeOf(this);
      }
    }

    isSupertypeOf(otherType) {
      if (otherType.instanceOf(PrimitiveType)) {
        return this.getPrimitive() === otherType.getPrimitive();
      } else {
        // We don't understand this relationship. Invert it.
        return otherType.isOfType(this);
      }
    }

    getPrimitive() {
      return this.primitive;
    }
}

PrimitiveType.fromDoctrineType = (type, rec, typeContext) => {
  switch (type.type) {
    case 'NameExpression':
      // TODO: Whitelist?
      const typedef = typeContext.getTypedef(type.name);
      if (typedef) {
        if (typedef.instanceOf(AliasType) && typedef.getAliasName() === type.name) {
          // Reuse the existing alias.
          return typedef;
        } else {
          // Establish a new alias.
          return new AliasType(type.name, typedef);
        }
      } else {
        return new PrimitiveType(type.name);
      }
    case 'UndefinedLiteral':
      return Type.undefined;
    default:
      throw Error('Unexpected type: ${type.type}');
  }
}

// An alias is a reference to another type, ala typedef.
class AliasType extends Type {
    constructor(name, type) {
      super();
      this.name = name;
      this.type = type;
    }

    getAliasName() {
      return this.name;
    }

    // Rebinding aliases is used internally for recursive type definition.
    rebindAliasType(type) {
      this.type = type;
    }

    toString() {
      return this.name;
    }

    isOfType(otherType) {
      return this.type.isOfType(otherType);
    }

    isSupertypeOf(otherType) {
      return this.type.isSupertypeOf(otherType);
    }

    getPropertyNames() {
      return this.type.getPropertyNames();
    }

    getProperty(name) {
      return this.type.getProperty(name);
    }

    getElement() {
      return this.type.getElement();
    }

    getReturn() {
      return this.type.getReturn();
    }

    getArgumentCount() {
      return this.type.getArgumentCount();
    }

    getArgument(index) {
      return this.type.getArgument(index);
    }

    getParameter(name) {
      return this.type.getParameter(name);
    }

    hasParameter(name) {
      return this.type.hasParameter(name);
    }

    instanceOf(kind) {
      return this.type instanceof kind;
    }

    is(otherType) {
      return this.type.is(otherType);
    }
}

// A union type accepts any type in its set.
class UnionType extends Type {
    constructor(...union) {
      super();
      this.union = union;
    }

    /**
     * @description returns true if this Type describes an allowed value for 'otherType'
     * @param {Type} otherType
     * @return {boolean}
     */
    isOfType(otherType) {
        if (otherType.is(this)) { return true; }
        for (const type of this.union) {
          if (!type.isOfType(otherType)) {
            return false;
          }
        }
        return true;
    }

    isSupertypeOf(otherType) {
        if (otherType.is(this)) { return true; }
        for (const type of this.union) {
          if (type.isSupertypeOf(otherType)) {
            return true;
          }
        }
        return false;
    }

    toString() {
        return `(${this.union.map(type => type.toString()).join('|')})`;
    }
}

UnionType.fromDoctrineType = (type, rec, typeContext) =>
  new UnionType(...type.elements.map(element => Type.fromDoctrineType(element, {}, typeContext)));

// A record type accepts any record type whose properties are accepted by all of its properties.
class RecordType extends SimpleType {
    constructor(record) {
      super();
      this.record = record;
    }

    getPropertyNames() {
      return Object.keys(this.record);
    }

    getProperty(name) {
      if (this.record.hasOwnProperty(name)) {
        return this.record[name];
      } else {
        return Type.any;
      }
    }

    /**
     * @description returns true if this Type describes an allowed value for 'otherType'
     * @param {Type} otherType
     * @return {boolean}
     */
    isOfType(otherType) {
        if (otherType.is(this)) { return true; }
        if (otherType.instanceOf(PrimitiveType)) {
          return false;
        }
        if (!otherType.instanceOf(RecordType)) {
          // We don't understand this relationship, so invert it.
          return otherType.isSupertypeOf(this);
        }
        for (const name of otherType.getPropertyNames()) {
            if (!this.getProperty(name).isOfType(otherType.getProperty(name))) {
                return false;
            }
        }
        return true;
    }

    isSupertypeOf(otherType) {
        if (otherType.is(this)) { return true; }
        if (otherType.instanceOf(PrimitiveType)) {
          return false;
        }
        if (!otherType.instanceOf(RecordType)) {
          // We don't understand this relationship, so invert it.
          return otherType.isOfType(this);
        }
        for (const name of this.getPropertyNames()) {
            if (!this.getProperty(name).isSupertypeOf(otherType.getProperty(name))) {
                return false;
            }
        }
        return true;
    }

    toString() {
        return `{${this.getPropertyNames().map(name => `${name}:${this.getProperty(name)}`).join(', ')}}`;
    }
}

RecordType.fromDoctrineType = (type, rec, typeContext) => {
  if (type.type === 'NameExpression' && type.name === 'object') {
    const record = {};
    for (let i = 0; i < rec.tags.length; i++) {
      const tag = rec.tags[i];
      if (tag.title === 'property') {
        record[tag.name] = Type.fromDoctrineType(tag.type, rec, typeContext);
      }
    }
    return new RecordType(record);
  }
  return Type.invalid;
}

// FIX: Handle index constraints?
class ArrayType extends SimpleType {
    constructor(element) {
      super();
      this.element = element;
    }

    getProperty(name) {
      switch (name) {
        case 'length':
          return Type.number;
        default:
          return Type.any;
      }
    }

    getElement() {
      return this.element;
    }

    /**
     * @description returns true if this Type describes an allowed value for 'otherType'
     * @param {Type} otherType
     * @return {boolean}
     */
    isOfType(otherType) {
        if (otherType.is(this)) { return true; }
        if (!otherType.instanceOf(ArrayType)) {
          if (otherType.instanceOf(SimpleType)) {
            return false;
          } else {
            // We don't understand this relationship, so invert it.
            return otherType.isSupertypeOf(this);
          }
        }
        return otherType.getElement().isOfType(this.getElement());
    }

    isSupertypeOf(otherType) {
        if (otherType.is(this)) { return true; }
        if (!otherType.instanceOf(ArrayType)) {
          if (otherType.instanceOf(SimpleType)) {
            return false;
          } else {
            // We don't understand this relationship, so invert it.
            return otherType.isOfType(this);
          }
        }
        return otherType.getElement().isSupertypeOf(this.getElement());
    }

    toString() {
        return `${this.element}[]`;
    }
}

ArrayType.fromDoctrineType = (type, rec, typeContext) => {
  // Not very clear on how TypeApplications are supposed to work, but we can start with the simple case of Foo[].
  if (type.expression.type === 'NameExpression' && type.expression.name === 'Array') {
    if (type.applications.length === 1 && type.applications[0].type === 'NameExpression') {
      const elementType = type.applications[0];
      return new ArrayType(Type.fromDoctrineType(elementType, {}, typeContext));
    }
  }
  return Type.invalid;
}

// A function type accepts a function whose return and parameters are accepted.
class FunctionType extends SimpleType {
    constructor(returnType, argumentTypes = [], parameterTypes = {}) {
      super();
      this.returnType = returnType;
      this.argumentTypes = argumentTypes;
      this.parameterTypes = parameterTypes;
    }

    getReturn() {
      return this.returnType;
    }

    getArgumentCount() {
      return this.argumentTypes.length;
    }

    // Arguments are indexed and include undefined for optionals.
    // These are used for calls.
    getArgument(index) {
      return this.argumentTypes[index] || Type.invalid;
    }

    // Parameters are named and include the default value type.
    // These are used to resolve identifier bindings.
    getParameter(name) {
      return this.parameterTypes[name] || Type.any;
    }

    hasParameter(name) {
      return this.parameterTypes.hasOwnProperty(name);
    }

    isOfType(otherType) {
        if (otherType.is(this)) { return true; }
        if (!otherType.instanceOf(FunctionType)) {
          if (otherType.instanceOf(SimpleType)) {
            if (otherType.getPrimitive() === 'function') {
              // The function primitive is a special case.
              return true;
            }
            return false;
          } else {
            // We don't understand this relationship, so invert it.
            return otherType.isSupertypeOf(this);
          }
        }
        if (!this.getReturn().isOfType(otherType.getReturn())) {
          return false;
        }
        const argumentCount = otherType.getArgumentCount();
        // The type relationship is upon the external argument interface.
        for (let index = 0; index < argumentCount; index++) {
          if (!otherType.getArgument(index).isOfType(this.getArgument(index))) {
            return false;
          }
        }
        return true;
    }

    isSupertypeOf(otherType) {
        if (otherType.is(this)) { return true; }
        if (!otherType.instanceOf(FunctionType)) {
          if (otherType.instanceOf(SimpleType)) {
            return false;
          } else {
            // We don't understand this relationship, so invert it.
            return otherType.isOfType(this);
          }
        }
        if (!this.getReturn().isSupertypeOf(otherType.getReturn())) {
          return false;
        }
        // The type relationship is upon the external argument interface.
        for (let index = 0; index < this.argumentTypes.length; index++) {
          if (!this.getArgument(index).isSupertypeOf(otherType.getArgument(index))) {
            return false;
          }
        }
        return true;
    }

    toString() {
      return `function(${this.argumentTypes.join(',')}):${this.getReturn()}`;
    }
}

FunctionType.fromDoctrineType = (type, rec, typeContext) => {
  const returnType = type.result ? Type.fromDoctrineType(type.result, rec, typeContext) : Type.any;
  const argumentTypes = [];
  const parameterTypes = {};
  for (const param of type.params) {
    switch (param.type) {
      case 'ParameterType': {
        const argumentType = Type.fromDoctrineType(param.expression, {}, typeContext);
        argumentTypes.push(argumentType);
        parameterTypes[param.name] = argumentType;
        break;
      }
      default: {
        const argumentType = Type.fromDoctrineType(param, {}, typeContext);
        argumentTypes.push(argumentType);
        break;
      }
    }
  }
  return new FunctionType(returnType, argumentTypes, parameterTypes);
}

FunctionType.fromDoctrine = (rec, typeContext) => {
  let returnType = Type.any;
  const argumentTypes = [];
  const parameterTypes = {};
  // FIX: Handle undeclared arguments?
  for (const tag of rec.tags) {
    switch (tag.title) {
      case 'return':
      case 'returns':
        returnType = Type.fromDoctrineType(tag.type, rec, typeContext);
        break;
      case 'param':
        const argumentType = tag.type ? Type.fromDoctrineType(tag.type, rec, typeContext) : Type.any;
        argumentTypes.push(argumentType);
        if (tag.name) {
          parameterTypes[tag.name] = argumentType;
        }
    }
  }
  const type = new FunctionType(returnType, argumentTypes, parameterTypes);
  return type;
}

Type.any = new AnyType();
Type.undefined = new PrimitiveType('undefined');
Type.invalid = new Type();
Type.string = new PrimitiveType('string');
Type.number = new PrimitiveType('number');
Type.boolean = new PrimitiveType('boolean');
Type.object = new RecordType({});
Type.null = new PrimitiveType('null');
Type.RegExp = new PrimitiveType('RegExp');

Type.fromDoctrine = (rec, typeContext) => {
  let scope = typeContext.getScope();
  let type;
  for (const tag of rec.tags) {
    switch (tag.title) {
      case 'module': {
        scope = { module: tag.name };
        typeContext.setScope(scope);
        break;
      }
      case 'global': {
        typeContext.setScope({ kind: 'global' });
        break;
      }
      case 'typedef': {
        const typedef = new AliasType(tag.name);
        typeContext.setTypedef(tag.name, typedef);
        type = Type.fromDoctrineType(tag.type, rec, typeContext);
        typedef.rebindAliasType(type);
        break;
      }
      case 'type':
        type = Type.fromDoctrineType(tag.type, rec, typeContext);
        break;
      case 'return':
      case 'returns':
      case 'param':
        type = FunctionType.fromDoctrine(rec, typeContext);
        break;
    }
    if (type) {
      break;
    }
  }
  typeContext.setScope(scope);
  return type || Type.any;
};

Type.fromDoctrineType = (type, rec, typeContext) => {
   switch (type.type) {
     case 'FunctionType':
       return FunctionType.fromDoctrineType(type, rec, typeContext)
     case 'RecordType':
       return RecordType.fromDoctrineType(type, rec, typeContext)
     case 'UnionType':
       return UnionType.fromDoctrineType(type, rec, typeContext)
     case 'NameExpression':
       if (type.name === 'object') {
         return RecordType.fromDoctrineType(type, rec, typeContext);
       } else {
         return PrimitiveType.fromDoctrineType(type, rec, typeContext)
       }
     case 'UndefinedLiteral':
       return PrimitiveType.fromDoctrineType(type, rec, typeContext)
     case 'TypeApplication':
       if (type.expression && type.expression.type === 'NameExpression' && type.expression.name === 'Array') {
         return ArrayType.fromDoctrineType(type, rec, typeContext);
       } else {
         throw Error(`Unknown TypeApplication ${JSON.stringify(type)}`);
       }
     case 'OptionalType':
       // This may require some refinement for arguments vs parameters.
       return new UnionType(Type.fromDoctrineType(type.expression, rec, typeContext),
                            Type.undefined);
     default:
       throw Error(`Unknown type ${JSON.stringify(type)}`);
  }
}

Type.parseComment = (line, comment, typeContext) => {
    const parse = doctrine.parse(comment, { unwrap: true });
    const type = Type.fromDoctrine(parse, typeContext);
    typeContext.setTypeDeclaration(line, type);
    return type;
}

Type.fromString = (string, typeContext) =>
  Type.fromDoctrineType(doctrine.parseType(string), {}, typeContext);

Type.fromNode = (node, typeContext) => {
  const startLine = (node) => node.loc.start.line;

  const resolveTypeFromNode = (node, typeContext) =>
    typeContext.getTypeDeclaration(startLine(node));

  const resolveTypeForBinaryExpression = (node, typeContext) => {
    const { left, operator, right } = node;
    switch (operator) {
      // Equality
      case '==':
      case '!=':
      case '===':
      case '!==':
        return Type.boolean;
      // Inequality
      case '<':
      case '<=':
      case '>':
      case '>=':
        return Type.boolean;
      // Shift
      case '<<':
      case '>>':
      case '>>>':
        return Type.number;
      // Arithmetic
      case '+':
        return (left === 'string' || right === 'string') ? Type.string : Type.number;
      case '-':
      case '*':
      case '/':
      case '%':
        return Type.number;
      // Bitwise
      case '|':
      case '^':
      case '&':
        return Type.number;
      // Membership
      case 'in':
        return Type.boolean;
      case 'instanceof':
      // EX4, for some reason ...
      case '..':
        return Type.any;
      default:
        throw Error(`Unknown binary operator: ${operator}`);
    }
  };

  const resolveTypeForUpdateExpression = (node, typeContext) => {
    // ++ and -- always yield number, I hope.
    return Type.number;
  }

  const resolveTypeForLogicalExpression = (node, typeContext) => {
    const { left, operator, right } = node;
    // These are the short-cut operators.
    const leftType = resolveType(left, typeContext);
    const rightType = resolveType(right, typeContext);
    // FIX: We can do better if we can prove the leftType cannot be inhabited by a non-false value.
    const type = new UnionType(leftType, rightType);
    return type;
  }

  const resolveTypeForAssignmentExpression = (node, typeContext) => {
    const { left, operator, right } = node;
    return resolveType(right, typeContext);
  }

  const resolveTypeForConditionalExpression = (node, typeContext) => {
    const { alternate, consequent } = node;
    const leftType = resolveType(consequent, typeContext);
    const rightType = resolveType(alternate, typeContext);
    const type = new UnionType(leftType, rightType);
    return type;
  }

  const resolveTypeForMemberExpression = (node, typeContext) => {
    const memberType = resolveType(node.object, typeContext);
    const propertyType = memberType.getProperty(node.property.name);
    return propertyType;
  }

  const resolveTypeForArrowFunctionExpression = (node, typeContext) =>
    resolveTypeFromNode(node, typeContext);

  const resolveTypeForFunctionExpression = (node, typeContext) =>
    resolveTypeFromNode(node, typeContext);

  const resolveTypeForCallExpression = (node, typeContext) =>
    resolveType(node.callee, typeContext).getReturn();

  const resolveTypeForArrayExpression = (node, typeContext) =>
    resolveTypeFromNode(node, typeContext);

  const resolveTypeForObjectExpression = (node, typeContext) => {
    const record = {};
    for (const property of node.properties) {
      // FIX: Handle other combinations
      if (property.key.type === 'Literal' && property.kind === 'init') {
        record[property.key.value] = resolveType(property.value, typeContext);
      } else if (property.key.type === 'Identifier' && property.kind === 'init') {
        record[property.key.name] = resolveType(property.value, typeContext);
      }
    }
    return new RecordType(record);
  }

  const resolveTypeForLiteral = (node, typeContext) => {
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
  const resolveTypeForUnaryExpression = (node, typeContext) => {
    switch (node.operator) {
      case '-':
        return Type.number;
      case '+':
        return Type.number;
      case '!':
        return Type.boolean;
      case '~':
        return Type.number;
      case 'typeof':
        return Type.string;
      case 'void':
        return Type.undefined;
      case 'delete':
        return Type.boolean;
      default:
        throw Error('Unknown unary operator: ${node.operator}');
    }
  };

  const resolveTypeForVariableDeclarator = (node, typeContext) => {
    const type = resolveTypeFromNode(node, typeContext);
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
    return resolveType(node.init, typeContext);
  }

  const resolveType = (node, typeContext) => {
    switch (node.type) {
      case 'ArrayExpression':
        return resolveTypeForArrayExpression(node, typeContext);
      case 'ArrowFunctionExpression':
        return resolveTypeForArrowFunctionExpression(node, typeContext);
      case 'AssignmentExpression':
        return resolveTypeForAssignmentExpression(node, typeContext);
      case 'BinaryExpression':
        return resolveTypeForBinaryExpression(node, typeContext);
      case 'CallExpression':
        return resolveTypeForCallExpression(node, typeContext);
      case 'ConditionalExpression':
        return resolveTypeForConditionalExpression(node, typeContext);
      case 'FunctionDeclaration':
        return resolveTypeForFunctionExpression(node, typeContext);
      case 'FunctionExpression':
        return resolveTypeForFunctionExpression(node, typeContext);
      case 'Identifier':
        return typeContext.getTypeForIdentifierNode(node);
      case 'JSXElement':
        return Type.fromString('JSXElement', typeContext);
      case 'Literal':
        return resolveTypeForLiteral(node, typeContext);
      case 'LogicalExpression':
        return resolveTypeForLogicalExpression(node, typeContext);
      case 'MemberExpression':
        return resolveTypeForMemberExpression(node, typeContext);
      case 'NewExpression':
        return Type.fromString(node.callee.name, typeContext);
      case 'ObjectExpression':
        return resolveTypeForObjectExpression(node, typeContext);
      case 'SpreadElement':
        // This needs to be understood in the context of a CallExpression.
        return Type.any;
      case 'TemplateLiteral':
        return Type.string;
      case 'UpdateExpression':
        return resolveTypeForUpdateExpression(node, typeContext);
      case 'UnaryExpression':
        return resolveTypeForUnaryExpression(node, typeContext);
      case 'VariableDeclarator':
        return resolveTypeForVariableDeclarator(node, typeContext);
      default:
        throw Error(`Unexpected node type: ${node.type}`);
    }
  };

  const type = resolveType(node, typeContext);
  if (type === undefined) throw Error('die');
  return type;
}

module.exports.Type = Type;
module.exports.TypeContext = TypeContext;
module.exports.PrimitiveType = PrimitiveType;
module.exports.UnionType = UnionType;
module.exports.RecordType = RecordType;
module.exports.FunctionType = FunctionType;
