import "@shopify/ui-extensions/preact";
import { render } from "preact";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  return (
    <s-banner heading="Problem with your order?" tone="info">
      <s-stack gap="base">
        <s-text>
          Missing delivery? Wrong address? Damaged item? Get a call back from an AI support assistant in under a minute.
        </s-text>
        <s-button
          href="https://chevy-board-tradition-suzuki.trycloudflare.com/demo/customer"
          target="_blank"
          kind="primary"
        >
          Get phone support
        </s-button>
      </s-stack>
    </s-banner>
  );
}
