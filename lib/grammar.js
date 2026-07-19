import {
  m,
  r,
  o,
  eat,
  eatMatch,
  defineAttribute,
  shiftMatch,
  fail,
  startSpan,
  endSpan,
  match,
} from '@bablr/helpers/grammar';
import * as BMap from '@bablr/agast-helpers/b-map';
import * as BSet from '@bablr/agast-helpers/b-set';
import * as BListKeyed from '@bablr/agast-helpers/b-list-keyed';
import { triviaEnhancer } from '@bablr/helpers/trivia';
import { get } from '@bablr/agast-helpers/path';
import { printSource } from '@bablr/agast-helpers/tree';
import { parseObject } from '@bablr/agast-helpers/parsers';
import { freeze, freezeClass, freezeRecord } from '@bablr/agast-helpers/object';

let { entry } = BMap;

const atrivial = class JSXGrammar {
  constructor() {
    this.attributes = BMap.from(entry('OpenTag', freezeRecord({ selfClosing: undefined })));
  }

  *Node() {
    let open = yield eat(m`open*: <OpenTag />`);
    let openType = get('type', open.node);

    if (get('selfClosingToken', open.node)) {
      yield eat(m`close*: null`);
      return;
    }

    yield eat(m`children[]$: <__Children />`, o({}), o({ allowEmpty: true }));

    let close = yield eat(m`close*: <CloseNodeTag />`);

    let closeType = get('type', close.node);

    if (!closeType) yield fail();

    while (openType.type === closeType.type) {
      if (openType.type === 'MemberExpression') {
        if (printSource(get('property', openType)) !== printSource(get('property', closeType))) {
          break;
        }
        openType = get('object', openType);
        closeType = get('object', closeType);
      } else {
        if (
          closeType.type === openType.type &&
          printSource(get('value', openType)) === printSource(get('value', closeType))
        ) {
          return;
        } else {
          break;
        }
      }
    }

    yield fail();
  }

  *Children({ matcher }) {
    while (yield eatMatch(m`${get('refMatcher', matcher)} <_NodeChild />`)) {}
  }

  *NodeChild() {
    (yield eatMatch(m`<Interpolation '{' />`)) ||
      (yield eatMatch(m`<Node '<' />`)) ||
      (yield eat(m`<*Text />`));
  }

  *Interpolation() {
    yield eat(m`openToken*: <* '{' />`);
    yield eatMatch(m`value+: :..: <_Expression />`);
    yield eat(m`closeToken*: <* '}' />`);
  }

  *OpenTag({ getState, props: { fragment } }) {
    let s = getState();

    yield eat(m`openToken*: <* '<' />`);

    let type;

    type = !fragment && (yield eatMatch(m`type+$: <_NodeType />`));

    while (yield eatMatch(m`attributes[]$: <Attribute />`)) {}

    let sc = null;
    if (type) {
      sc = yield eatMatch(m`selfClosingToken*: <* '/' />`);
    }

    s = getState();

    yield defineAttribute('selfClosing', !!sc);

    yield eat(m`closeToken*: <* '>' />`);
  }

  *NodeType({ getState }) {
    let s = getState();
    let res;
    if (!s.shifted) {
      res = yield eat(m`<Identifier />`);
    } else {
      res = yield shiftMatch(m`<MemberExpression /\./ />`);
    }

    if (res) {
      return r(shiftMatch(m`<_NodeType  />`));
    }
  }

  *CloseNodeTag() {
    yield eat(m`openToken*: <* '</' />`);
    yield eatMatch(m`type+$: <_NodeType />`);
    yield eat(m`closeToken*: <* '>' />`);
  }

  *Text() {
    yield eat(m`/[^{<>}\g]+/`);
  }

  *Attribute() {
    yield eat(m`name$: <Identifier />`, o({ scoped: false }));
    yield eat(m`sigilToken*: <* '=' />`);
    yield eat(m`value$: <_AttributeValue />`);
  }

  *AttributeValue() {
    if (yield eatMatch(m`:..: <String /['"]/ />`)) {
    } else if (yield eatMatch(m`<Interpolation '{' />`)) {
    }
  }

  *Identifier({ props: { scoped = true } }) {
    yield eat(m`:..: <__Identifier />`, o({ scoped }));
  }

  *MemberExpression() {
    yield eat(m`:..: <__MemberExpression /\./ />`);
  }
};

export const JSXGrammar = triviaEnhancer(
  {
    triviaIsAllowed: (s) => s.span.name === 'Bare',

    *Trivia({ s }) {
      let span = BListKeyed.get('Trivia', s().spans);

      let spaces = (span && parseObject(span.props).spaces) ?? Infinity;

      yield startSpan('Trivia', null, span?.props);
      let res = yield match(m`/\/\/|\/\*|[ \t][^ \t\r\n\g/]|[ \n\r\t]/`);

      if (res) {
        res = printSource(res);
      }

      if (res && ' \t'.includes(res[0]) && res.length === 2 && spaces > 1) {
        yield eat(m`#: <* ' ' />`, o({}), o({ hold: true }));
      } else {
        yield eat(m`#: <Trivia />`, o({}), o({ hold: true }));
      }
      yield endSpan();
    },
  },
  atrivial,
);

let jsxLanguage = freeze({
  canonicalURL: 'https://bablr.org/languages/universe/jsx',
  dependencies: freeze({}),
  grammar: JSXGrammar,
});

export const enhanceLanguageWithJSX = (language) => {
  if (language.dependencies.JSX) throw new Error();

  let enhanced = class extends language.atrivial {
    static dependencies = freeze({ ...language.dependencies, JSX: jsxLanguage });

    *Expression(args) {
      let {
        getState,
        props: { power },
      } = args;
      let s = getState();
      if (!s.shifted) {
        if (yield eatMatch(m`:JSX: <Node '<' />`)) {
          return r(shiftMatch(m`<_Expression />`, o({ power })));
        } else {
          return yield* super.Expression(args);
        }
      } else {
        return yield* super.Expression(args);
      }
    }
  };

  freezeClass(enhanced);

  return triviaEnhancer(
    {
      triviaIsAllowed: (s) => s.span.name === 'Bare',
      *Trivia({ s }) {
        let span = BListKeyed.get('Trivia', s().spans);

        let spaces = (span && parseObject(span.props).spaces) ?? Infinity;

        yield startSpan('Trivia', null, span?.props);
        let res = yield match(m`/\/\/|\/\*|[ \t][^ \t\r\n\g/]|[ \n\r\t]/`);

        if (res) {
          res = printSource(res);
        }

        if (res && ' \t'.includes(res[0]) && res.length === 2 && spaces > 1) {
          yield eat(m`#: <* ' ' />`, o({}), o({ hold: true }));
        } else {
          yield eat(m`#: <Trivia />`, o({}), o({ hold: true }));
        }
        yield endSpan();
      },
    },
    enhanced,
  );
};

export default enhanceLanguageWithJSX;
