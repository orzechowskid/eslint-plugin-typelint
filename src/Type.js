const typedefCache = require('./typedefCache.js');

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
            return arr.some(function(typeName) {
                if (arr.includes(o)) {
                    return true;
                }

                if (!typeName) {
                    // No expectation?
                    // Implicit any?
                    return true;
                }

                const typedef = typedefCache[typeName];

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

module.exports = Type;
