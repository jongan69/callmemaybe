import "@shopify/ui-extensions/preact";
import { render } from "preact";

export default async () => {
  render(<GetSupportAction />, document.body);
};

function GetSupportAction() {
  return <s-button>{shopify.i18n.translate("getSupport")}</s-button>;
}
