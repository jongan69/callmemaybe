import "@shopify/ui-extensions/preact";
import { render } from "preact";

export default async () => {
  render(<OrderStatusBlock />, document.body);
};

function OrderStatusBlock() {
  const order = shopify.order.value;
  if (!order) return null;
  return (
    <s-banner
      tone="info"
      heading={shopify.i18n.translate("orderSupportHeading")}
    >
      <s-text>
        {shopify.i18n.translate("orderSupportBody", { order: order.name })}
      </s-text>
    </s-banner>
  );
}
