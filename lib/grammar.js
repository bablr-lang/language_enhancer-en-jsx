import { spam as m } from '@bablr/helpers/shorthand';
import { r, o, eat, eatMatch, defineAttribute, shiftMatch, fail } from '@bablr/helpers/grammar';
import { triviaEnhancer } from '@bablr/helpers/trivia';
import { get } from '@bablr/agast-helpers/path';
import { printSource } from '@bablr/agast-helpers/tree';

const atrivial = class JSXGrammar {
  constructor() {
    this.literals = new Set(['Literal']);
    this.attributes = new Map(
      Object.entries({
        OpenTag: { balanced: undefined, balancedSpan: undefined },
        CloseTag: { balancer: true },
      }),
    );
  }

  *Node() {
    let open = yield eat(m`open*: <OpenTag />`);
    let openType = get('type', open.node);

    if (get('selfClosingToken', open.node)) {
      yield eat(m`close*: null`);
      return;
    }

    yield eat(m`children[]$: <__Children />`, o({}), o({ allowEmpty: true }));

    let close = yield eat(m`close*: <CloseTag />`);

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
      (yield eat(m`<Text />`));
  }

  *Interpolation() {
    yield eat(m`openToken*: <* '{' { balanced: '}', balancedSpan: 'Interpolation' } />`);
    yield eatMatch(m`value+$: :..: <_Expression />`);
    yield eat(m`closeToken*: <* '}' { balancer: true } />`);
  }

  *OpenTag({ getState, props: { fragment } }) {
    let s = getState();
    let outerSpan = s.span;

    yield eat(m`openToken*: <* '<' { balancedSpan: 'Tag', balanced: '>' } />`);

    let type;

    type = !fragment && (yield eatMatch(m`type+$: <_NodeType />`));

    if (type) {
      while (yield eatMatch(m`attributes[]$: <Attribute />`)) {}
    } else {
      yield eat(m`attributes$: null`);
    }

    let sc;
    if (type) {
      sc = yield eatMatch(m`selfClosingToken*: <* '/' />`);
    } else {
      sc = yield eat(m`selfClosingToken*: null`);
    }

    s = getState();

    let balanced = !sc && (s.depths.path > 0 || outerSpan !== 'Bare');

    yield defineAttribute('balanced', balanced);
    yield defineAttribute('balancedSpan', balanced ? 'NodeChildren' : null);

    yield eat(m`closeToken*: <* '>' { balancer: true } />`);
  }

  *NodeType({ getState }) {
    let s = getState();
    let res;
    if (!s.holding) {
      res = yield eat(m`<Identifier />`);
    } else {
      res = yield shiftMatch(m`<MemberExpression /\./ />`);
    }

    if (res) {
      return r(shiftMatch(m`<_NodeType  />`));
    }
  }

  *CloseTag() {
    yield eat(m`openToken*: <* '</' { balanced: '>', balancedSpan: 'Tag' } />`);
    yield eatMatch(m`type+$: <_NodeType />`);
    yield eat(m`closeToken*: <* '>' { balancer: true } />`);
  }

  *Text() {
    yield eat(m`value*: <*Literal /[^{<>}\g]+/ />`);
  }

  *Attribute() {
    yield eat(m`name$: <Identifier />`, o({ scoped: false }));
    yield eat(m`sigilToken*: <* '=' />`);
    yield eat(m`value$: <_AttributeValue />`);
  }

  *AttributeValue() {
    if (yield eatMatch(m`:JS: <String /['"]/ />`)) {
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
    triviaIsAllowed: (s) => ['Tag', 'Interpolation'].includes(s.span),
    triviaMatcher: m`#: :JS: <__Trivia /[ \n\r\t]|\/\/|\/\*/ />`,
  },
  atrivial,
);

let jsxLanguage = Object.freeze({
  canonicalURL: 'https://bablr.org/languages/universe/jsx',
  dependencies: Object.freeze({}),
  grammar: JSXGrammar,
});

export const enhanceLanguageWithJSX = (language) => {
  if (language.dependencies.JSX) throw new Error();

  return Object.freeze({
    ...language,
    dependencies: Object.freeze({ ...language.dependencies, JSX: jsxLanguage }),
    grammar: triviaEnhancer(
      {
        triviaIsAllowed: (s) => s.span === 'Bare',
        triviaMatcher: m`#: <__Trivia /[ \n\r\t]|\/\/|\/\*/ />`,
      },
      class extends language.grammar.atrivial {
        *Expression(args) {
          let {
            getState,
            props: { power },
          } = args;
          let s = getState();
          if (!s.held) {
            if (yield eatMatch(m`:JSX: <Node '<' />`)) {
              return r(shiftMatch(m`<_Expression />`, o({ power })));
            } else {
              return yield* super.Expression(args);
            }
          } else {
            return yield* super.Expression(args);
          }
        }
      },
    ),
  });
};

export default enhanceLanguageWithJSX;
