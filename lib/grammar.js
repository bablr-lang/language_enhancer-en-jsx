import { spam as m } from '@bablr/helpers/shorthand';
import { r, o, eat, eatMatch, defineAttribute, shiftMatch, fail } from '@bablr/helpers/grammar';
import { triviaEnhancer } from '@bablr/helpers/trivia';
import { get } from '@bablr/agast-helpers/path';

export const atrivialJSXGrammar = class JSXGrammar {
  constructor() {
    this.literals = new Set(['Punctuator', 'Literal']);
    this.attributes = new Map(
      Object.entries({
        OpenTag: { balanced: undefined, balancedSpan: undefined },
        CloseTag: { balancer: true },
      }),
    );
  }

  *Node({ ctx }) {
    let open = yield eat(m`open*: <OpenTag />`);
    let openType = open.node.get('type');

    if (open.node.get('selfClosingToken')) {
      yield eat(m`close*: null`);
      return;
    }

    yield eat(m`children[]$: <__Children />`, o({}), o({ allowEmpty: true }));

    let close = yield eat(m`close*: <CloseTag />`);

    let closeType = close.node.get('type');

    if (!closeType) yield fail();

    while (openType.type === closeType.type) {
      if (openType.type === 'MemberExpression') {
        if (
          ctx.sourceTextFor(openType.get('property')) !==
          ctx.sourceTextFor(closeType.get('property'))
        ) {
          break;
        }
        openType = openType.get('object');
        closeType = closeType.get('object');
      } else {
        if (
          closeType.type === openType.type &&
          ctx.sourceTextFor(openType.get('value')) === ctx.sourceTextFor(closeType.get('value'))
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
    yield eat(m`openToken*: <*Punctuator '{' { balanced: '}', balancedSpan: 'Interpolation' } />`);
    yield eatMatch(m`value+$: :JS: <_Expression />`);
    yield eat(m`closeToken*: <*Punctuator '}' { balancer: true } />`);
  }

  *OpenTag({ s, props: { fragment } }) {
    const outerSpan = s.span;

    yield eat(m`openToken*: <*Punctuator '<' { balancedSpan: 'Tag', balanced: '>' } />`);

    let type;

    type = !fragment && (yield eatMatch(m`type+$: <_NodeType />`));

    if (type) {
      while (yield eatMatch(m`attributes[]$: <Attribute />`)) {}
    } else {
      yield eat(m`attributes$: null`);
    }

    let sc;
    if (type) {
      sc = yield eatMatch(m`selfClosingToken*: <*Punctuator '/' />`);
    } else {
      sc = yield eat(m`selfClosingToken*: null`);
    }

    const balanced = !sc && (s.depths.path > 0 || outerSpan !== 'Bare');

    yield defineAttribute('balanced', balanced);
    yield defineAttribute('balancedSpan', balanced ? 'NodeChildren' : null);

    yield eat(m`closeToken*: <*Punctuator '>' { balancer: true } />`);
  }

  *NodeType({ s }) {
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
    yield eat(m`openToken*: <*Punctuator '</' { balanced: '>', balancedSpan: 'Tag' } />`);
    yield eatMatch(m`type+$: <_NodeType />`);
    yield eat(m`closeToken*: <*Punctuator '>' { balancer: true } />`);
  }

  *Text() {
    yield eat(m`value*: <*Literal /[^{<>}\g]+/ />`);
  }

  *Attribute() {
    yield eat(m`name$: <Identifier />`, o({ scoped: false }));
    yield eat(m`sigilToken*: <*Punctuator '=' />`);
    yield eat(m`value$: <_AttributeValue />`);
  }

  *AttributeValue() {
    if (yield eatMatch(m`:JS: <String /['"]/ />`)) {
    } else if (yield eatMatch(m`<Interpolation '{' />`)) {
    }
  }

  *Identifier({ s, props: { scoped = true } }) {
    yield eat(m`:JS: <__Identifier />`, o({ scoped }));
  }

  *MemberExpression() {
    yield eat(m`:JS: <__MemberExpression /\./ />`);
  }
};

export const JSXGrammar = triviaEnhancer(
  {
    triviaIsAllowed: (s) => ['Tag', 'Interpolation'].includes(s.span),
    triviaMatcher: m`#: :JS: <__Trivia /[ \n\r\t]|\/\/|\/\*/ />`,
  },
  atrivialJSXGrammar,
);

export const enhanceLanguageWithJSX = (language) => {
  if (language.dependencies.JSX) throw new Error();

  let jsxLanguage = Object.freeze({
    canonicalURL: 'https://bablr.org/languages/universe/jsx',
    dependencies: Object.freeze({
      JS: language.canonicalURL,
    }),
    grammar: JSXGrammar,
  });

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
            s,
            props: { power },
          } = args;
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
