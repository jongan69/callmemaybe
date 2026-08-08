import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useOrder } from "@shopify/ui-extensions/preact";

export default async () => {
  render(<OrderStatusBlock />, document.body);
};

function OrderStatusBlock() {
  const order = useOrder();

  // The order status block shows ResolveLine case status inline.
  // Since we can't use hooks for async state, we use the attributes
  // already available from the order context.

  if (!order) return null;

  return (
    <s-banner tone="info">
      <s-text>
        Need help with this order? Select &quot;Get support&quot; to request an AI phone callback from our support team.
      </s-text>
    </s-banner>
  );
}
