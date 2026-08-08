import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useOrder } from "@shopify/ui-extensions/preact";

export default async () => {
  render(<GetSupportAction />, document.body);
};

function GetSupportAction() {
  const order = useOrder();

  return (
    <s-stack direction="inline" gap="base">
      <s-text>
        Get AI phone support for order {order?.name || `#${order?.number}`}
      </s-text>
    </s-stack>
  );
}
