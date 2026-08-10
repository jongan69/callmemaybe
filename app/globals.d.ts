declare module "*.css";

// Polaris web components that may not be in @shopify/polaris-types
declare namespace JSX {
  interface IntrinsicElements {
    "s-app-nav": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      children?: React.ReactNode;
    };
    "s-page": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      heading?: string;
      breadcrumbs?: Array<{ label: string; href?: string }>;
      children?: React.ReactNode;
    };
    "s-section": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      heading?: string;
      slot?: string;
      children?: React.ReactNode;
    };
    "s-paragraph": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      children?: React.ReactNode;
    };
    "s-heading": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      children?: React.ReactNode;
    };
    "s-link": React.DetailedHTMLProps<
      React.AnchorHTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      href?: string;
      target?: string;
      children?: React.ReactNode;
    };
    "s-button": React.DetailedHTMLProps<
      React.ButtonHTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      variant?: "primary" | "secondary" | "tertiary";
      href?: string;
      submit?: boolean;
      slot?: string;
      children?: React.ReactNode;
    };
    "s-badge": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      tone?:
        | "success"
        | "critical"
        | "info"
        | "neutral"
        | "caution"
        | "warning"
        | "auto";
      children?: React.ReactNode;
    };
    "s-text": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      tone?:
        | "success"
        | "critical"
        | "info"
        | "neutral"
        | "caution"
        | "warning"
        | "auto";
      children?: React.ReactNode;
    };
    "s-stack": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      direction?: "inline" | "block";
      gap?: "base" | "none";
      children?: React.ReactNode;
    };
    "s-box": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      padding?: "base";
      borderWidth?: "base";
      borderRadius?: "base";
      background?: "subdued" | "surface-neutral";
      children?: React.ReactNode;
    };
    "s-table": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      children?: React.ReactNode;
    };
    "s-unordered-list": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      children?: React.ReactNode;
    };
    "s-list-item": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      children?: React.ReactNode;
    };
    "s-banner": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      tone?:
        "success" | "critical" | "info" | "neutral" | "caution" | "warning";
      children?: React.ReactNode;
    };
    "s-text-field": React.DetailedHTMLProps<
      React.InputHTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      name?: string;
      label?: string;
      defaultValue?: string;
      helpText?: string;
    };
    "s-select": React.DetailedHTMLProps<
      React.SelectHTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      name?: string;
      label?: string;
      defaultValue?: string;
    };
  }
}
