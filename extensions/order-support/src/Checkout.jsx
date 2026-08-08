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
        <s-text>
          Open this order in your customer account and choose Get support whenever you need us.
        </s-text>
      </s-stack>
    </s-banner>
  );
}
