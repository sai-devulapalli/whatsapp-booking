import { describe, expect, it } from "vitest";
import { htmlToWhatsAppMarkup } from "./htmlToWhatsAppMarkup";

describe("htmlToWhatsAppMarkup", () => {
  it("converts bold to WhatsApp's *asterisk* markup", () => {
    expect(htmlToWhatsAppMarkup("<b>hello</b>")).toBe("*hello*");
    expect(htmlToWhatsAppMarkup("<strong>hello</strong>")).toBe("*hello*");
  });

  it("converts italic to WhatsApp's _underscore_ markup", () => {
    expect(htmlToWhatsAppMarkup("<i>hello</i>")).toBe("_hello_");
    expect(htmlToWhatsAppMarkup("<em>hello</em>")).toBe("_hello_");
  });

  it("converts strikethrough to WhatsApp's ~tilde~ markup", () => {
    expect(htmlToWhatsAppMarkup("<s>old price</s>")).toBe("~old price~");
    expect(htmlToWhatsAppMarkup("<strike>old price</strike>")).toBe("~old price~");
    expect(htmlToWhatsAppMarkup("<del>old price</del>")).toBe("~old price~");
  });

  it("converts inline code to WhatsApp's `backtick` markup", () => {
    expect(htmlToWhatsAppMarkup("<code>CODE123</code>")).toBe("`CODE123`");
  });

  it("handles nested formatting (bold+italic combined)", () => {
    expect(htmlToWhatsAppMarkup("<b><i>urgent</i></b>")).toBe("*_urgent_*");
  });

  it("passes plain text and {{n}} placeholders straight through", () => {
    expect(htmlToWhatsAppMarkup("Hi {{1}}, you're booked for {{2}}.")).toBe(
      "Hi {{1}}, you're booked for {{2}}.",
    );
  });

  it("preserves formatting around a placeholder", () => {
    expect(htmlToWhatsAppMarkup("Hi <b>{{1}}</b>, reminder!")).toBe("Hi *{{1}}*, reminder!");
  });

  it("converts a bulleted list to hyphen-prefixed lines", () => {
    expect(htmlToWhatsAppMarkup("<ul><li>One</li><li>Two</li></ul>")).toBe("- One\n- Two");
  });

  it("treats consecutive divs (Chrome's line-break style) as newlines", () => {
    expect(htmlToWhatsAppMarkup("<div>Line one</div><div>Line two</div>")).toBe("Line one\nLine two");
  });

  it("treats <br> as a newline", () => {
    expect(htmlToWhatsAppMarkup("Line one<br>Line two")).toBe("Line one\nLine two");
  });

  it("does not wrap empty/whitespace-only formatted spans", () => {
    expect(htmlToWhatsAppMarkup("<b></b>")).toBe("");
    expect(htmlToWhatsAppMarkup("<b>   </b>")).toBe(""); // whole-output trim collapses pure whitespace
    expect(htmlToWhatsAppMarkup("<b>   </b>ok")).toBe("ok");
  });

  it("collapses &nbsp; from empty contentEditable lines into a plain space", () => {
    expect(htmlToWhatsAppMarkup("Hi&nbsp;there")).toBe("Hi there");
  });

  it("collapses runs of blank lines and trims the result", () => {
    expect(htmlToWhatsAppMarkup("<div>Hi</div><div><br></div><div><br></div><div>Bye</div>")).toBe(
      "Hi\n\nBye",
    );
  });

  it("strips unrecognized tags but keeps their text content", () => {
    expect(htmlToWhatsAppMarkup('<span style="color:red">hello</span>')).toBe("hello");
  });
});
